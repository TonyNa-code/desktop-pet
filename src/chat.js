const titleEl = document.querySelector("#chat-title");
const subtitleEl = document.querySelector("#chat-subtitle");
const openSettingsButton = document.querySelector("#open-settings");
const messagesEl = document.querySelector("#messages");
const composer = document.querySelector("#composer");
const inputEl = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-message");
const statusEl = document.querySelector("#status");
const clearHistoryButton = document.querySelector("#clear-history");
const i18n = window.DesktopPetI18n;

let config = {
  assistant: {
    baseUrl: "",
    model: "",
    hasApiKey: false,
  },
  tts: {
    enabled: false,
  },
};
let history = [];
let characterName = "Desktop Pet";
let sending = false;
let activeLanguage = "zh-CN";

function text(key, variables = {}) {
  return i18n.t(key, variables, activeLanguage);
}

function applyStaticTranslations() {
  document.documentElement.lang = activeLanguage;
  document.title = text("window.chatTitle");
  openSettingsButton.textContent = text("chat.openSettings");
  inputEl.placeholder = text("chat.placeholder");
  sendButton.textContent = text("chat.send");
  clearHistoryButton.textContent = text("chat.clear");
}

function setStatus(text) {
  statusEl.textContent = text;
}

function timeText(timestamp) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat(activeLanguage, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function isLlmReady() {
  return Boolean(config.assistant?.baseUrl && config.assistant?.model);
}

function statusText() {
  if (!isLlmReady()) return text("chat.notConfigured");
  return config.tts?.enabled ? text("chat.connectedTts") : text("chat.connectedNoTts");
}

function renderHeader() {
  applyStaticTranslations();
  titleEl.textContent = text("chat.title");
  subtitleEl.textContent = text("chat.subtitle", { name: characterName });
  setStatus(statusText());
}

function renderHistory() {
  messagesEl.textContent = "";
  if (!history.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const title = document.createElement("b");
    const body = document.createElement("span");
    title.textContent = isLlmReady() ? text("chat.emptyReadyTitle") : text("chat.emptyConfigTitle");
    body.textContent = isLlmReady() ? text("chat.emptyReadyBody") : text("chat.emptyConfigBody");
    empty.append(title, body);
    messagesEl.append(empty);
    return;
  }

  for (const item of history) {
    const row = document.createElement("article");
    row.className = `message ${item.role === "user" ? "user" : "assistant"}`;
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = item.content;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${item.role === "user" ? text("chat.you") : characterName} ${timeText(item.createdAt)}`;
    row.append(bubble, meta);
    messagesEl.append(row);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function applyChatState(state = {}) {
  config = state.config || config;
  activeLanguage = state.resolvedLanguage || config.resolvedLanguage || activeLanguage;
  history = Array.isArray(state.history) ? state.history : history;
  characterName = state.character?.name || text("app.name");
  renderHeader();
  renderHistory();
}

function appendLocalMessage(role, content) {
  history = [
    ...history,
    {
      role,
      content,
      createdAt: Date.now(),
    },
  ];
  renderHistory();
}

async function sendMessage(text) {
  if (sending) return;
  const cleanText = text.trim();
  if (!cleanText) return;
  sending = true;
  sendButton.disabled = true;
  inputEl.value = "";
  appendLocalMessage("user", cleanText);
  appendLocalMessage("assistant", text("chat.thinking"));
  setStatus(text("chat.waiting"));

  try {
    const result = await window.desktopPet.sendChatMessage(cleanText);
    history = Array.isArray(result.history) ? result.history : history;
    renderHistory();
    setStatus(result.ok ? statusText() : text("chat.replyFailed"));
  } catch {
    history = history.slice(0, -1);
    appendLocalMessage("assistant", text("chat.sendFailedReply"));
    setStatus(text("chat.sendFailed"));
  } finally {
    sending = false;
    sendButton.disabled = false;
    inputEl.focus();
  }
}

async function initialize() {
  applyChatState(await window.desktopPet.getChatState());
}

openSettingsButton.addEventListener("click", () => {
  window.desktopPet.openCompanionSettings();
});

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(inputEl.value);
});

inputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    sendMessage(inputEl.value);
  }
});

clearHistoryButton.addEventListener("click", async () => {
  history = await window.desktopPet.clearChatHistory();
  renderHistory();
  setStatus(text("chat.cleared"));
});

window.desktopPet.onChatStateUpdated(applyChatState);

initialize().catch(() => {
  setStatus(text("chat.startFailed"));
});
