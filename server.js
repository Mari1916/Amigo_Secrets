const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
require("dotenv").config();
const nodemailer = require("nodemailer");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_KEY = process.env.ADMIN_KEY;
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const sessions = new Map();
const loginAttempts = new Map();
const passwordAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const DUMMY_PASSWORD_HASH = hashPassword(crypto.randomBytes(32).toString("hex"));

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { participants: [], draw: null };
    throw error;
  }
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

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function generatePassword() {
  let password = "";
  for (let i = 0; i < 12; i += 1) {
    password += passwordAlphabet[crypto.randomInt(passwordAlphabet.length)];
  }
  return password;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, saved) {
  const actual = crypto.scryptSync(password, saved.salt, 64);
  const expected = Buffer.from(saved.hash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function makeTransporter() {
  const required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Configure as variáveis SMTP antes de sortear: ${missing.join(", ")}.`);
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendPasswordEmail(transporter, participant, password) {
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: participant.email,
    subject: "Sua senha do Amigo Secreto",
    text: [
      `Oi, ${participant.name}!`,
      "",
      "O sorteio foi feito. Acesse o site e use o e-mail cadastrado junto com esta senha para descobrir quem você tirou:",
      "",
      ...(process.env.SITE_URL ? [`Acesse: ${process.env.SITE_URL.replace(/\/+$/, "")}`] : []),
      "",
      `Senha: ${password}`,
      "",
      "Não compartilhe esta senha com outras pessoas.",
    ].join("\n"),
  });
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

function isAdmin(request) {
  const supplied = request.headers["x-admin-key"] || "";
  const expected = Buffer.from(ADMIN_KEY || "");
  const actual = Buffer.from(String(supplied));
  return expected.length > 0 && expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
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
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  if (shuffled.some((participant, index) => participant.email === participants[index].email)) {
    return drawAssignments(participants);
  }
  return participants.map((participant, index) => ({
    email: participant.email,
    recipientName: shuffled[index].name,
    password: hashPassword(""),
    emailSent: false,
  }));
}

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const store = readStore();

  if (request.method === "GET" && url.pathname === "/api/status") {
    return jsonResponse(response, 200, {
      participantCount: store.participants.length,
      drawComplete: Boolean(store.draw),
      emailConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_FROM),
    });
  }

  if (request.method === "GET" && url.pathname === "/api/participants") {
    if (!isAdmin(request)) return jsonResponse(response, 403, { error: "Chave de organizador inválida." });
    return jsonResponse(response, 200, {
      participants: store.participants.map(({ name, email }) => ({
        name,
        email,
        emailSent: store.draw?.assignments.find((entry) => entry.email === email)?.emailSent || false,
      })),
    });
  }

  if (request.method === "POST" && url.pathname === "/api/participants") {
    if (store.draw) return jsonResponse(response, 409, { error: "O sorteio já foi realizado; não é possível alterar os participantes." });
    const body = await readBody(request);
    const name = String(body.name || "").trim();
    const email = normalizeEmail(body.email);
    const latestStore = readStore();
    if (latestStore.draw) return jsonResponse(response, 409, { error: "O sorteio já foi realizado; não é possível alterar os participantes." });
    if (name.length < 2 || name.length > 80) {
      return jsonResponse(response, 400, { error: "O nome deve ter entre 2 e 80 caracteres." });
    }
    if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(email)) {
      return jsonResponse(response, 400, { error: "Informe um e-mail válido." });
    }
    if (latestStore.participants.some((participant) => participant.email === email)) {
      return jsonResponse(response, 409, { error: "Esse e-mail já está cadastrado." });
    }
    latestStore.participants.push({ name, email });
    saveStore(latestStore);
    return jsonResponse(response, 201, { message: "Participante cadastrado!" });
  }

  if (request.method === "POST" && url.pathname === "/api/draw") {
    if (!isAdmin(request)) return jsonResponse(response, 403, { error: "Chave de organizador inválida." });
    if (store.draw) return jsonResponse(response, 409, { error: "O sorteio já foi realizado." });
    if (store.participants.length < 2) {
      return jsonResponse(response, 400, { error: "Cadastre pelo menos duas pessoas antes de sortear." });
    }

    let transporter;
    try {
      transporter = makeTransporter();
    } catch (error) {
      return jsonResponse(response, 503, { error: error.message });
    }
    const assignments = drawAssignments(store.participants);
    const passwords = new Map();
    for (const assignment of assignments) {
      const password = generatePassword();
      assignment.password = hashPassword(password);
      passwords.set(assignment.email, password);
    }
    store.draw = { createdAt: new Date().toISOString(), assignments };
    saveStore(store);
    const failures = [];
    for (const assignment of assignments) {
      const participant = store.participants.find((entry) => entry.email === assignment.email);
      try {
        await sendPasswordEmail(transporter, participant, passwords.get(assignment.email));
        assignment.emailSent = true;
        saveStore(store);
      } catch (error) {
        failures.push(participant.email);
        console.error(`Falha ao enviar e-mail para ${participant.email}:`, error.message);
      }
    }
    return jsonResponse(response, failures.length ? 502 : 200, {
      message: failures.length
        ? `Sorteio realizado, mas não foi possível enviar e-mail para: ${failures.join(", ")}. Use a opção de reenviar.`
        : "Sorteio realizado! As senhas foram enviadas por e-mail.",
      failedEmails: failures,
    });
  }

  if (request.method === "POST" && url.pathname === "/api/resend") {
    if (!isAdmin(request)) return jsonResponse(response, 403, { error: "Chave de organizador inválida." });
    if (!store.draw) return jsonResponse(response, 409, { error: "O sorteio ainda não foi realizado." });
    const body = await readBody(request);
    const email = normalizeEmail(body.email);
    const assignment = store.draw.assignments.find((entry) => entry.email === email);
    const participant = store.participants.find((entry) => entry.email === email);
    if (!assignment || !participant) return jsonResponse(response, 404, { error: "Participante não encontrado." });
    if (assignment.emailSent) return jsonResponse(response, 409, { error: "O e-mail já foi enviado para essa pessoa." });
    let transporter;
    try {
      transporter = makeTransporter();
    } catch (error) {
      return jsonResponse(response, 503, { error: error.message });
    }
    const password = generatePassword();
    assignment.password = hashPassword(password);
    saveStore(store);
    try {
      await sendPasswordEmail(transporter, participant, password);
      assignment.emailSent = true;
      saveStore(store);
      return jsonResponse(response, 200, { message: "Senha reenviada com sucesso." });
    } catch (error) {
      console.error(`Falha ao reenviar e-mail para ${email}:`, error.message);
      return jsonResponse(response, 502, { error: "Não foi possível enviar o e-mail. Tente novamente." });
    }
  }

  if (request.method === "GET" && url.pathname === "/api/draw") {
    const session = getSession(request);
    if (!session) return jsonResponse(response, 401, { error: "Entre com seu e-mail e senha para ver o resultado." });
    const assignment = store.draw?.assignments.find((entry) => entry.email === session.email);
    if (!assignment) return jsonResponse(response, 404, { error: "Resultado não encontrado." });
    return jsonResponse(response, 200, { recipientName: assignment.recipientName });
  }

  if (request.method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(request);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const key = request.socket.remoteAddress || "unknown";
    if (!checkLoginLimit(key)) return jsonResponse(response, 429, { error: "Muitas tentativas. Aguarde um minuto e tente novamente." });
    const assignment = store.draw?.assignments.find((entry) => entry.email === email);
    const passwordMatches = password.length <= 100
      && verifyPassword(password, assignment ? assignment.password : DUMMY_PASSWORD_HASH);
    const valid = Boolean(assignment) && passwordMatches;
    if (!valid) return jsonResponse(response, 401, { error: "E-mail ou senha incorretos." });
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { email, expiresAt: Date.now() + SESSION_TTL_MS });
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return jsonResponse(response, 200, { message: "Acesso autorizado!" }, {
      "Set-Cookie": `amigo_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`,
    });
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

if (!ADMIN_KEY || ADMIN_KEY.length < 16) {
  console.error("Configure ADMIN_KEY com pelo menos 16 caracteres antes de iniciar.");
  process.exit(1);
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
