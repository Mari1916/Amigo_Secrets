const registerForm = document.querySelector("#register-form");
const loginForm = document.querySelector("#login-form");
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
  element.classList.remove("waiting");
}

function updateStatus(status) {
  drawComplete = status.drawComplete;
  document.querySelector("#event-status").textContent = status.drawComplete
    ? "Sorteio realizado — entre para ver seu resultado"
    : `${status.participantCount} de ${status.totalParticipants} pessoas cadastradas`;
  const waitingNotice = document.querySelector("#waiting-notice");
  waitingNotice.hidden = status.drawComplete;
  document.querySelector("#waiting-notice-text").textContent = status.drawComplete
    ? ""
    : status.participantCount === 0
      ? "Estamos aguardando as cinco participantes criarem seu acesso. Assim que todas entrarem, o sorteio acontece automaticamente."
      : `Estamos aguardando as outras participantes: ${status.participantCount} de ${status.totalParticipants} já criaram seu acesso. O sorteio acontece automaticamente quando todas entrarem.`;
  registerForm.querySelectorAll("select, input, button").forEach((element) => {
    element.disabled = status.drawComplete;
  });
}

async function refreshStatus() {
  const status = await request("/api/status");
  updateStatus(status);
}

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = registerForm.querySelector("button");
  button.disabled = true;
  try {
    const formData = new FormData(registerForm);
    const data = await request("/api/register", {
      method: "POST",
      body: JSON.stringify({ name: formData.get("name"), password: formData.get("password") }),
    });
    setMessage(document.querySelector("#register-message"), data.message);
    registerForm.reset();
    updateStatus(data);
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
      body: JSON.stringify({ name: formData.get("name"), password: formData.get("password") }),
    });
    const data = await request("/api/draw");
    document.querySelector("#recipient-name").textContent = data.recipientName;
    result.hidden = false;
    loginForm.hidden = true;
  } catch (error) {
    const waitingForParticipants = error.message.includes("O sorteio ainda não foi realizado");
    setMessage(document.querySelector("#login-message"), waitingForParticipants
      ? "Seu acesso está pronto! Estamos aguardando as outras participantes para realizar o sorteio. Volte aqui assim que todas se cadastrarem."
      : error.message, !waitingForParticipants);
    document.querySelector("#login-message").classList.toggle("waiting", waitingForParticipants);
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

refreshStatus().catch((error) => {
  document.querySelector("#event-status").textContent = error.message;
});
