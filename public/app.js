const loginForm = document.querySelector("#login-form");
const organizerForm = document.querySelector("#organizer-form");
const result = document.querySelector("#result");
const credentialPanel = document.querySelector("#credentials-panel");
const credentialList = document.querySelector("#credential-list");
let drawComplete = false;
let participantSession = false;

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.message || "Não foi possível concluir a operação.");
  return data;
}

function setMessage(element, message, isError = false, isWaiting = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
  element.classList.toggle("waiting", isWaiting);
}

function updateStatus(status) {
  drawComplete = status.drawComplete;
  document.querySelector("#event-status").textContent = status.drawComplete
    ? "Sorteio realizado — entre para ver seu resultado"
    : `${status.participantCount} de ${status.totalParticipants} pessoas confirmaram presença`;
  const waitingNotice = document.querySelector("#waiting-notice");
  waitingNotice.hidden = status.drawComplete;
  document.querySelector("#waiting-notice-text").textContent = status.drawComplete
    ? ""
    : status.credentialsGenerated
      ? `Estamos aguardando as outras participantes: ${status.participantCount} de ${status.totalParticipants} já entraram. O sorteio acontece quando todas confirmarem presença.`
      : "A organizadora ainda precisa gerar as senhas e entregar uma para cada participante.";
}

function showCredentials(credentials) {
  credentialList.replaceChildren();
  for (const credential of credentials) {
    const item = document.createElement("li");
    const identity = document.createElement("span");
    identity.className = "credential-identity";
    identity.textContent = credential.name;
    const password = document.createElement("code");
    password.textContent = credential.password;
    const copyButton = document.createElement("button");
    copyButton.className = "copy-button";
    copyButton.type = "button";
    copyButton.textContent = "Copiar";
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(`${credential.name}: ${credential.password}`);
        setMessage(document.querySelector("#organizer-message"), `A senha de ${credential.name} foi copiada. Envie-a somente para essa pessoa.`);
      } catch {
        setMessage(document.querySelector("#organizer-message"), "Não foi possível copiar. Selecione e copie a senha manualmente.", true);
      }
    });
    item.append(identity, password, copyButton);
    credentialList.append(item);
  }
  credentialPanel.hidden = false;
}

async function refreshStatus() {
  const status = await request("/api/status");
  updateStatus(status);
  if (participantSession && !status.drawComplete) {
    try {
      const data = await request("/api/draw");
      document.querySelector("#recipient-name").textContent = data.recipientName;
      result.hidden = false;
      loginForm.hidden = true;
      participantSession = false;
    } catch (error) {
      if (!error.message.includes("aguardando as outras participantes")) throw error;
    }
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector("button");
  button.disabled = true;
  setMessage(document.querySelector("#login-message"), "");
  try {
    const formData = new FormData(loginForm);
    const status = await request("/api/login", {
      method: "POST",
      body: JSON.stringify({ name: formData.get("name"), password: formData.get("password") }),
    });
    updateStatus(status);
    participantSession = !status.drawComplete;
    if (status.drawComplete) {
      const data = await request("/api/draw");
      document.querySelector("#recipient-name").textContent = data.recipientName;
      result.hidden = false;
      loginForm.hidden = true;
    } else {
      setMessage(document.querySelector("#login-message"), status.message, false, true);
    }
  } catch (error) {
    setMessage(document.querySelector("#login-message"), error.message, true);
  } finally {
    button.disabled = false;
  }
});

organizerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#load-credentials");
  button.disabled = true;
  setMessage(document.querySelector("#organizer-message"), "");
  try {
    const data = await request("/api/organizer/credentials", {
      method: "POST",
      headers: { "X-Admin-Key": document.querySelector("#admin-key").value },
      body: "{}",
    });
    showCredentials(data.credentials);
    updateStatus(data);
    setMessage(document.querySelector("#organizer-message"), "Senhas prontas. Copie e envie cada uma em particular.");
  } catch (error) {
    credentialPanel.hidden = true;
    setMessage(document.querySelector("#organizer-message"), error.message, true);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  await request("/api/logout", { method: "POST" });
  result.hidden = true;
  loginForm.hidden = false;
  loginForm.reset();
  participantSession = false;
});

refreshStatus().catch((error) => {
  document.querySelector("#event-status").textContent = error.message;
});

window.setInterval(() => {
  refreshStatus().catch((error) => {
    document.querySelector("#event-status").textContent = error.message;
  });
}, 15_000);
