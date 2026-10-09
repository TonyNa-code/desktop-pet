const form = document.querySelector("#quick-form");
const input = document.querySelector("#quick-input");
const sendButton = document.querySelector("#send");
const closeButton = document.querySelector("#close");
const statusEl = document.querySelector("#status");
const i18n = window.DesktopPetI18n;

let sending = false;
let remoteBusy = false;
let chatRevision = 0;
let sendToken = 0;
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
  setStatus(sending || remoteBusy ? text("quick.waiting") : text("quick.idle"));
}

function setStatus(text) {
  statusEl.textContent = text;
}

async function sendQuickMessage() {
  if (sending || remoteBusy) return;
  const messageText = input.value.trim();
  if (!messageText) return;
  sending = true;
  const token = ++sendToken;
  sendButton.disabled = true;
  input.value = "";
  setStatus(text("quick.waiting"));
  try {
    const result = await window.desktopPet.sendChatMessage(messageText);
    if (token !== sendToken || result.cancelled || result.revision < chatRevision) return;
    remoteBusy = result.busy === true;
    if (result.error === "chat_busy" && !input.value) input.value = messageText;
    setStatus(remoteBusy ? text("quick.waiting") : result.ok ? text("quick.replied") : text("quick.replyFailed"));
  } catch {
    if (token === sendToken) setStatus(text("quick.sendFailed"));
  } finally {
    if (token === sendToken) {
      sending = false;
      sendButton.disabled = remoteBusy;
      input.focus();
    }
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
  applyChatState(await window.desktopPet.getChatState());
}

function applyChatState(state = {}) {
  if (Number.isFinite(state.revision) && state.revision < chatRevision) return;
  if (Number.isFinite(state.revision) && state.revision > chatRevision) {
    chatRevision = state.revision;
    sendToken += 1;
    sending = false;
  }
  remoteBusy = state.busy === true;
  sendButton.disabled = sending || remoteBusy;
  activeLanguage = state.resolvedLanguage || state.config?.resolvedLanguage || activeLanguage;
  applyTranslations();
}

window.desktopPet.onChatStateUpdated(applyChatState);

initialize().catch(applyTranslations);
