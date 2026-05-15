const form = document.querySelector("#quick-form");
const input = document.querySelector("#quick-input");
const sendButton = document.querySelector("#send");
const closeButton = document.querySelector("#close");
const statusEl = document.querySelector("#status");
const i18n = window.DesktopPetI18n;

let sending = false;
let activeLanguage = "zh-CN";

function text(key, variables = {}) {
  return i18n.t(key, variables, activeLanguage);
}

function applyTranslations() {
  document.documentElement.lang = activeLanguage;
  document.title = text("window.quickChatTitle");
  input.placeholder = text("quick.placeholder");
  sendButton.textContent = text("quick.send");
  closeButton.setAttribute("aria-label", text("quick.close"));
  if (!sending) setStatus(text("quick.idle"));
}

function setStatus(text) {
  statusEl.textContent = text;
}

async function sendQuickMessage() {
  if (sending) return;
  const messageText = input.value.trim();
  if (!messageText) return;
  sending = true;
  sendButton.disabled = true;
  input.value = "";
  setStatus(text("quick.waiting"));
  try {
    const result = await window.desktopPet.sendChatMessage(messageText);
    setStatus(result.ok ? text("quick.replied") : text("quick.replyFailed"));
  } catch {
    setStatus(text("quick.sendFailed"));
  } finally {
    sending = false;
    sendButton.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendQuickMessage();
});

closeButton.addEventListener("click", () => window.close());

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.close();
});

input.focus();

async function initialize() {
  const state = await window.desktopPet.getChatState();
  activeLanguage = state.resolvedLanguage || state.config?.resolvedLanguage || activeLanguage;
  applyTranslations();
}

window.desktopPet.onChatStateUpdated((state = {}) => {
  activeLanguage = state.resolvedLanguage || state.config?.resolvedLanguage || activeLanguage;
  applyTranslations();
});

initialize().catch(applyTranslations);
