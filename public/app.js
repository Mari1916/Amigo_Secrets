const registerForm = document.querySelector("#register-form");
const loginForm = document.querySelector("#login-form");
const adminMessage = document.querySelector("#admin-message");
const participantList = document.querySelector("#participant-list");
const result = document.querySelector("#result");
let drawComplete = false;

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.message || "Não foi possível concluir a operação.");
  return data;
}

function setMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function adminHeaders() {
  return { "X-Admin-Key": document.querySelector("#admin-key").value };
}

async function refreshStatus() {
  const status = await request("/api/status");
  const label = document.querySelector("#event-status");
  drawComplete = status.drawComplete;
  label.textContent = status.drawComplete
    ? "Sorteio realizado — confira seu e-mail"
    : `${status.participantCount} ${status.participantCount === 1 ? "pessoa cadastrada" : "pessoas cadastradas"} • inscrições abertas`;
  if (status.drawComplete) {
    registerForm.querySelectorAll("input, button").forEach((element) => { element.disabled = true; });
  }
  document.querySelector("#draw-button").disabled = status.drawComplete;
}

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = registerForm.querySelector("button");
  button.disabled = true;
  try {
    const formData = new FormData(registerForm);
    const data = await request("/api/participants", {
      method: "POST",
      body: JSON.stringify({ name: formData.get("name"), email: formData.get("email") }),
    });
    setMessage(document.querySelector("#register-message"), data.message);
    registerForm.reset();
    await refreshStatus();
  } catch (error) {
    setMessage(document.querySelector("#register-message"), error.message, true);
  } finally {
    button.disabled = drawComplete;
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector("button");
  button.disabled = true;
  setMessage(document.querySelector("#login-message"), "");
  try {
    const formData = new FormData(loginForm);
    await request("/api/login", {
      method: "POST",
      body: JSON.stringify({ email: formData.get("email"), password: formData.get("password") }),
    });
    const data = await request("/api/draw");
    document.querySelector("#recipient-name").textContent = data.recipientName;
    result.hidden = false;
    loginForm.hidden = true;
  } catch (error) {
    setMessage(document.querySelector("#login-message"), error.message, true);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  await request("/api/logout", { method: "POST" });
  result.hidden = true;
  loginForm.hidden = false;
  loginForm.reset();
});

document.querySelector("#load-participants").addEventListener("click", async () => {
  setMessage(adminMessage, "");
  try {
    const data = await request("/api/participants", { headers: adminHeaders() });
    participantList.replaceChildren();
    for (const participant of data.participants) {
      const item = document.createElement("li");
      item.append(document.createTextNode(`${participant.name} — ${participant.email}`));
      if (participant.emailSent) {
        item.append(document.createTextNode(" • senha enviada"));
      } else if (document.querySelector("#event-status").textContent.startsWith("Sorteio realizado")) {
        const resendButton = document.createElement("button");
        resendButton.type = "button";
        resendButton.dataset.email = participant.email;
        resendButton.textContent = "Reenviar senha";
        item.append(resendButton);
      }
      participantList.append(item);
    }
    if (!data.participants.length) setMessage(adminMessage, "Ainda não há participantes.");
  } catch (error) {
    setMessage(adminMessage, error.message, true);
  }
});

document.querySelector("#draw-button").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  if (!window.confirm("Depois de sortear, não será possível alterar os participantes. Confirmar?")) return;
  button.disabled = true;
  setMessage(adminMessage, "Sorteando e enviando as senhas...");
  try {
    const data = await request("/api/draw", { method: "POST", headers: adminHeaders(), body: "{}" });
    setMessage(adminMessage, data.message);
    await refreshStatus();
  } catch (error) {
    setMessage(adminMessage, error.message, true);
    if (error.message.includes("não foi possível enviar")) await refreshStatus();
  } finally {
    button.disabled = drawComplete;
  }
});

participantList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-email]");
  if (!button) return;
  button.disabled = true;
  try {
    const data = await request("/api/resend", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ email: button.dataset.email }),
    });
    setMessage(adminMessage, data.message);
    button.replaceWith(document.createTextNode(" • senha enviada"));
  } catch (error) {
    setMessage(adminMessage, error.message, true);
    button.disabled = false;
  }
});

refreshStatus().catch((error) => {
  document.querySelector("#event-status").textContent = error.message;
});
