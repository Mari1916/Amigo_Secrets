const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
require("dotenv").config();

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const PARTICIPANT_NAMES = ["MariMari", "Jujubas", "Isinha", "Aninha", "Nick"];
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const sessions = new Map();
const loginAttempts = new Map();
const DUMMY_PASSWORD_HASH = hashPassword(crypto.randomBytes(32).toString("hex"));

function createEmptyStore() {
  return {
    version: 4,
    participants: PARTICIPANT_NAMES.map((name) => ({
      name,
      password: null,
      passwordPlain: null,
      registered: false,
    })),
    draw: null,
  };
}

function readStore() {
  let store;
  try {
    store = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return createEmptyStore();
    throw error;
  }

  if (store.version === 4) return store;
  if (store.draw) {
    throw new Error("Os dados contêm um sorteio antigo. Preserve o backup antes de iniciar um novo sorteio.");
  }
  return createEmptyStore();
}

function saveStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporaryFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryFile, DATA_FILE);
}

function jsonResponse(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10_000) {
        reject(new Error("A requisição é grande demais."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Envie dados válidos."));
      }
    });
    request.on("error", reject);
  });
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function generatePassword() {
  let password = "";
  const maxValidByte = 256 - (256 % PASSWORD_ALPHABET.length);
  while (password.length < 16) {
    const bytes = crypto.randomBytes(16);
    for (const byte of bytes) {
      if (byte < maxValidByte) {
        password += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
        if (password.length === 16) break;
      }
    }
  }
  return password;
}

function verifyPassword(password, saved) {
  const actual = crypto.scryptSync(password, saved.salt, 64);
  const expected = Buffer.from(saved.hash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function isAdmin(request) {
  const supplied = Buffer.from(String(request.headers["x-admin-key"] || ""));
  const expected = Buffer.from(ADMIN_KEY);
  return expected.length >= 16
    && supplied.length === expected.length
    && crypto.timingSafeEqual(supplied, expected);
}

function getSession(request) {
  const cookie = request.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)amigo_session=([^;]+)/);
  if (!match) return null;
  const session = sessions.get(match[1]);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(match[1]);
    return null;
  }
  return session;
}

function checkLoginLimit(key) {
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter((time) => now - time < 60_000);
  if (recent.length >= 5) {
    loginAttempts.set(key, recent);
    return false;
  }
  recent.push(now);
  loginAttempts.set(key, recent);
  return true;
}

function drawAssignments(participants) {
  const shuffled = [...participants];
  do {
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = crypto.randomInt(i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  } while (shuffled.some((participant, index) => participant.name === participants[index].name));

  return participants.map((participant, index) => ({
    name: participant.name,
    recipientName: shuffled[index].name,
  }));
}

function getStatus(store) {
  return {
    participantCount: store.participants.filter((participant) => participant.registered).length,
    totalParticipants: PARTICIPANT_NAMES.length,
    drawComplete: Boolean(store.draw),
    credentialsGenerated: store.participants.every((participant) => Boolean(participant.password)),
  };
}

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const store = readStore();

  if (request.method === "GET" && url.pathname === "/api/status") {
    return jsonResponse(response, 200, getStatus(store));
  }

  if (request.method === "POST" && url.pathname === "/api/organizer/credentials") {
    if (ADMIN_KEY.length < 16) {
      return jsonResponse(response, 503, { error: "A chave da organizadora ainda não foi configurada no servidor." });
    }
    const organizerKey = `organizer:${request.socket.remoteAddress || "unknown"}`;
    if (!checkLoginLimit(organizerKey)) {
      return jsonResponse(response, 429, { error: "Muitas tentativas. Aguarde um minuto e tente novamente." });
    }
    if (!isAdmin(request)) return jsonResponse(response, 403, { error: "Chave da organizadora inválida." });
    if (store.draw) return jsonResponse(response, 409, { error: "O sorteio já foi realizado." });

    if (!store.participants.every((participant) => participant.password)) {
      if (store.participants.some((participant) => participant.registered)) {
        return jsonResponse(response, 409, { error: "Algumas pessoas já entraram. Não é possível trocar as senhas depois do início." });
      }
      for (const participant of store.participants) {
        const password = generatePassword();
        participant.password = hashPassword(password);
        participant.passwordPlain = password;
      }
      saveStore(store);
    }

    return jsonResponse(response, 200, {
      credentials: store.participants.map(({ name, passwordPlain }) => ({ name, password: passwordPlain })),
      ...getStatus(store),
    });
  }

  if (request.method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(request);
    const name = String(body.name || "");
    const password = String(body.password || "");
    const key = request.socket.remoteAddress || "unknown";
    if (!checkLoginLimit(key)) {
      return jsonResponse(response, 429, { error: "Muitas tentativas. Aguarde um minuto e tente novamente." });
    }
    const participant = store.participants.find((entry) => entry.name === name);
    const savedPassword = participant?.password || DUMMY_PASSWORD_HASH;
    const passwordMatches = password.length <= 100 && verifyPassword(password, savedPassword);
    if (!participant?.password || !passwordMatches) {
      return jsonResponse(response, 401, { error: "Nome ou senha incorretos. Confira o acesso recebido da organizadora." });
    }

    participant.registered = true;
    if (store.participants.every((entry) => entry.registered) && !store.draw) {
      store.draw = {
        createdAt: new Date().toISOString(),
        assignments: drawAssignments(store.participants),
      };
    }
    saveStore(store);

    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { name, expiresAt: Date.now() + SESSION_TTL_MS });
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return jsonResponse(response, 200, {
      message: store.draw
        ? "As cinco participantes já entraram. O sorteio foi realizado!"
        : "Acesso confirmado! O resultado aparece quando as cinco participantes entrarem.",
      ...getStatus(store),
    }, {
      "Set-Cookie": `amigo_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`,
    });
  }

  if (request.method === "GET" && url.pathname === "/api/draw") {
    const session = getSession(request);
    if (!session) return jsonResponse(response, 401, { error: "Entre com seu nome e senha para ver o resultado." });
    const assignment = store.draw?.assignments.find((entry) => entry.name === session.name);
    if (!assignment) {
      return jsonResponse(response, 409, { error: "Estamos aguardando as outras participantes. O sorteio acontece quando as cinco entrarem." });
    }
    return jsonResponse(response, 200, { recipientName: assignment.recipientName });
  }

  if (request.method === "POST" && url.pathname === "/api/logout") {
    const cookie = request.headers.cookie || "";
    const match = cookie.match(/(?:^|;\s*)amigo_session=([^;]+)/);
    if (match) sessions.delete(match[1]);
    return jsonResponse(response, 200, { message: "Você saiu." }, {
      "Set-Cookie": "amigo_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    });
  }

  if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
    const requestedPath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const filePath = path.resolve(PUBLIC_DIR, requestedPath);
    if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
      return jsonResponse(response, 404, { error: "Página não encontrada." });
    }
    try {
      const content = fs.readFileSync(filePath);
      const contentType = filePath.endsWith(".css") ? "text/css"
        : filePath.endsWith(".js") ? "text/javascript"
          : filePath.endsWith(".html") ? "text/html" : "application/octet-stream";
      response.writeHead(200, {
        "Content-Type": `${contentType}; charset=utf-8`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'",
      });
      return response.end(content);
    } catch (error) {
      if (error.code === "ENOENT") return jsonResponse(response, 404, { error: "Página não encontrada." });
      throw error;
    }
  }

  return jsonResponse(response, 404, { error: "Rota não encontrada." });
}

http.createServer((request, response) => {
  route(request, response).catch((error) => {
    console.error("Erro na requisição:", error);
    if (!response.headersSent) jsonResponse(response, 500, { error: "Erro interno. Tente novamente." });
    else response.destroy();
  });
}).listen(PORT, () => {
  console.log(`Amigo Secreto rodando em http://localhost:${PORT}`);
});
