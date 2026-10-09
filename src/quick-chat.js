const form = document.querySelector("#quick-form");
const input = document.querySelector("#quick-input");
const sendButton = document.querySelector("#send");
const closeButton = document.querySelector("#close");
const statusEl = document.querySelector("#status");
const stopButton = document.querySelector("#stop");
const characterNameEl = document.querySelector("#character-name");
const historyButton = document.querySelector("#history");
const settingsButton = document.querySelector("#settings");
const i18n = window.DesktopPetI18n;

let sending = false;
let remoteBusy = false;
let chatRevision = 0;
let sendToken = 0;
let activeLanguage = "zh-CN";
let characterName = "Desktop Pet";
let replyStarted = false;

function text(key, variables = {}) {
  return i18n.t(key, variables, activeLanguage);
}

function applyTranslations() {
  document.documentElement.lang = activeLanguage;
  document.title = text("window.quickChatTitle");
  characterNameEl.textContent = characterName;
  characterNameEl.title = characterName;
  input.placeholder = text("quick.toCharacter", { name: characterName });
  historyButton.textContent = text("quick.history");
  settingsButton.textContent = text("chat.openSettings");
  sendButton.textContent = text("quick.send");
  closeButton.setAttribute("aria-label", text("quick.close"));
  stopButton.textContent = text("chat.stop");
  input.setAttribute("aria-label", text("quick.placeholder"));
  setStatus(sending || remoteBusy ? text(replyStarted ? "quick.responding" : "quick.waiting") : text("quick.idle"));
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
  sendButton.hidden = true;
  stopButton.hidden = false;
  input.value = "";
  setStatus(text("quick.waiting"));
  try {
    const result = await window.desktopPet.sendChatMessage(messageText);
    if (token !== sendToken || result.cancelled || result.revision < chatRevision) return;
    remoteBusy = result.busy === true;
    if (result.error === "chat_busy" && !input.value) input.value = messageText;
    if (!result.ok && !input.value) input.value = messageText;
    setStatus(remoteBusy ? text("quick.waiting") : result.ok ? text("quick.replied") : text("quick.replyFailed"));
  } catch {
    if (!input.value) input.value = messageText;
    if (token === sendToken) setStatus(text("quick.sendFailed"));
  } finally {
    if (token === sendToken) {
      sending = false;
      sendButton.disabled = remoteBusy;
      sendButton.hidden = remoteBusy;
      stopButton.hidden = !remoteBusy;
      input.focus();
    }
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendQuickMessage();
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.isComposing || event.keyCode === 229)) event.preventDefault();
});
historyButton.addEventListener("click", () => { window.desktopPet.openChatWindow(); window.close(); });
settingsButton.addEventListener("click", () => window.desktopPet.openCompanionSettings());

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
  characterName = state.config?.persona?.name || state.character?.name || characterName;
  replyStarted = Boolean(state.pending?.reply);
  sendButton.disabled = sending || remoteBusy;
  sendButton.hidden = sending || remoteBusy;
  stopButton.hidden = !(sending || remoteBusy);
  activeLanguage = state.resolvedLanguage || state.config?.resolvedLanguage || activeLanguage;
  applyTranslations();
  if (state.voiceError) setStatus(text("tts.playbackFailed"));
}

stopButton.addEventListener("click", async () => {
  try { applyChatState(await window.desktopPet.stopChat()); setStatus(text("chat.stopped")); }
  catch { setStatus(text("quick.sendFailed")); }
});

window.desktopPet.onChatStateUpdated(applyChatState);

initialize().catch(applyTranslations);
