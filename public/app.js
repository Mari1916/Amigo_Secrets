const registerForm = document.querySelector("#register-form");
const loginForm = document.querySelector("#login-form");
const resendForm = document.querySelector("#resend-form");
const result = document.querySelector("#result");
const EMAIL_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
let drawComplete = false;
let emailJsConfig = null;
let pendingRegistrationEmail = null;
let pendingResendEmail = null;

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || data.message || "Não foi possível concluir a operação.");
    error.details = data;
    throw error;
  }
  return data;
}

function setMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
  element.classList.remove("waiting");
}

function generatePassword() {
  let password = "";
  const maxValidByte = 256 - (256 % EMAIL_PASSWORD_ALPHABET.length);
  while (password.length < 16) {
    const randomBytes = new Uint8Array(16);
    window.crypto.getRandomValues(randomBytes);
    for (const byte of randomBytes) {
      if (byte < maxValidByte) {
        password += EMAIL_PASSWORD_ALPHABET[byte % EMAIL_PASSWORD_ALPHABET.length];
        if (password.length === 16) break;
      }
    }
  }
  return password;
}

async function sendPasswordEmail({ name, email, password }) {
  if (!emailJsConfig || !window.emailjs) {
    throw new Error("O serviço de e-mail ainda não está pronto. Atualize a página e tente novamente.");
  }
  await window.emailjs.send(emailJsConfig.serviceId, emailJsConfig.templateId, {
    to_email: email,
    to_name: name,
    password,
    site_url: window.location.origin,
  }, {
    publicKey: emailJsConfig.publicKey,
  });
}

function emailErrorMessage(error) {
  return error?.text || error?.message || "O EmailJS não conseguiu enviar a mensagem. Tente novamente.";
}

function updateStatus(status) {
  drawComplete = status.drawComplete;
  document.querySelector("#event-status").textContent = status.drawComplete
    ? "Sorteio realizado — entre para ver seu resultado"
    : `${status.participantCount} de ${status.totalParticipants} pessoas cadastradas`;
  const waitingNotice = document.querySelector("#waiting-notice");
  waitingNotice.hidden = status.drawComplete && status.emailConfigured;
  document.querySelector("#waiting-notice-text").textContent = status.drawComplete
    ? ""
    : !status.emailConfigured
      ? "O envio de e-mail ainda não está configurado. A organizadora precisa concluir a configuração antes de iniciar as inscrições."
      : status.participantCount === 0
        ? "Estamos aguardando as cinco participantes criarem seu acesso. Assim que todas entrarem, o sorteio acontece automaticamente."
        : `Estamos aguardando as outras participantes: ${status.participantCount} de ${status.totalParticipants} já criaram seu acesso. O sorteio acontece automaticamente quando todas entrarem.`;
  registerForm.querySelectorAll("select, input, button[type='submit']").forEach((element) => {
    element.disabled = status.drawComplete || !status.emailConfigured;
  });
}

async function refreshStatus() {
  const status = await request("/api/status");
  if (status.emailConfigured && !emailJsConfig) {
    emailJsConfig = await request("/api/email-config");
  }
  updateStatus({
    ...status,
    emailConfigured: status.emailConfigured && Boolean(emailJsConfig) && Boolean(window.emailjs),
  });
}

async function deliverRegistrationEmail() {
  if (!pendingRegistrationEmail) return;
  const retryButton = document.querySelector("#retry-register-email");
  retryButton.disabled = true;
  try {
    await sendPasswordEmail(pendingRegistrationEmail);
    pendingRegistrationEmail = null;
    retryButton.hidden = true;
    setMessage(document.querySelector("#register-message"), "Senha enviada! Confira sua caixa de entrada e também o spam.");
  } catch (error) {
    setMessage(document.querySelector("#register-message"), `${emailErrorMessage(error)} Seu cadastro foi salvo; tente enviar a senha novamente.`, true);
    retryButton.hidden = false;
  } finally {
    retryButton.disabled = false;
  }
}

async function deliverResendEmail() {
  if (!pendingResendEmail) return;
  const retryButton = document.querySelector("#retry-resend-email");
  retryButton.disabled = true;
  try {
    await sendPasswordEmail(pendingResendEmail);
    pendingResendEmail = null;
    retryButton.hidden = true;
    setMessage(document.querySelector("#resend-message"), "Nova senha enviada! Confira sua caixa de entrada e também o spam.");
  } catch (error) {
    setMessage(document.querySelector("#resend-message"), `${emailErrorMessage(error)} Tente enviar a mesma senha novamente.`, true);
    retryButton.hidden = false;
  } finally {
    retryButton.disabled = false;
  }
}

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = registerForm.querySelector('button[type="submit"]');
  button.disabled = true;
  setMessage(document.querySelector("#register-message"), "");
  try {
    const formData = new FormData(registerForm);
    const participant = {
      name: formData.get("name"),
      email: formData.get("email"),
      password: generatePassword(),
    };
    const data = await request("/api/register", {
      method: "POST",
      body: JSON.stringify(participant),
    });
    updateStatus(data);
    registerForm.reset();
    pendingRegistrationEmail = participant;
    await deliverRegistrationEmail();
  } catch (error) {
    setMessage(document.querySelector("#register-message"), error.message, true);
  } finally {
    button.disabled = drawComplete || !emailJsConfig || !window.emailjs;
  }
});

document.querySelector("#retry-register-email").addEventListener("click", deliverRegistrationEmail);

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
    const waitingForParticipants = error.message.includes("O sorteio ainda não foi realizado");
    setMessage(document.querySelector("#login-message"), waitingForParticipants
      ? "Seu acesso está pronto! Estamos aguardando as outras participantes para realizar o sorteio. Volte aqui assim que todas se cadastrarem."
      : error.message, !waitingForParticipants);
    document.querySelector("#login-message").classList.toggle("waiting", waitingForParticipants);
  } finally {
    button.disabled = false;
  }
});

resendForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = resendForm.querySelector('button[type="submit"]');
  button.disabled = true;
  setMessage(document.querySelector("#resend-message"), "");
  try {
    const formData = new FormData(resendForm);
    const participant = {
      email: formData.get("email"),
      password: generatePassword(),
    };
    const data = await request("/api/resend-password", {
      method: "POST",
      body: JSON.stringify(participant),
    });
    pendingResendEmail = { ...participant, name: data.name };
    await deliverResendEmail();
  } catch (error) {
    setMessage(document.querySelector("#resend-message"), error.message, true);
  } finally {
    button.disabled = !emailJsConfig || !window.emailjs;
  }
});

document.querySelector("#retry-resend-email").addEventListener("click", deliverResendEmail);

document.querySelector("#logout-button").addEventListener("click", async () => {
  await request("/api/logout", { method: "POST" });
  result.hidden = true;
  loginForm.hidden = false;
  loginForm.reset();
});

refreshStatus().catch((error) => {
  document.querySelector("#event-status").textContent = error.message;
});

window.setInterval(() => {
  refreshStatus().catch((error) => {
    document.querySelector("#event-status").textContent = error.message;
  });
}, 15_000);
