const titleEl = document.querySelector("#chat-title");
const subtitleEl = document.querySelector("#chat-subtitle");
const openSettingsButton = document.querySelector("#open-settings");
const messagesEl = document.querySelector("#messages");
const composer = document.querySelector("#composer");
const inputEl = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-message");
const statusEl = document.querySelector("#status");
const clearHistoryButton = document.querySelector("#clear-history");

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
let characterName = "桌宠";
let sending = false;

function setStatus(text) {
  statusEl.textContent = text;
}

function timeText(timestamp) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function isLlmReady() {
  return Boolean(config.assistant?.baseUrl && config.assistant?.model);
}

function statusText() {
  if (!isLlmReady()) return "还没有配置 LLM。";
  return config.tts?.enabled ? "已连接，回复会朗读。" : "已连接，朗读关闭。";
}

function renderHeader() {
  titleEl.textContent = "伴侣对话";
  subtitleEl.textContent = `当前角色：${characterName}`;
  setStatus(statusText());
}

function renderHistory() {
  messagesEl.textContent = "";
  if (!history.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = isLlmReady()
      ? "<b>还没有消息</b><span>输入一句话开始聊天。</span>"
      : "<b>需要先配置 LLM</b><span>点右上角设置，填入 Base URL 和模型名。</span>";
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
    meta.textContent = `${item.role === "user" ? "你" : characterName} ${timeText(item.createdAt)}`;
    row.append(bubble, meta);
    messagesEl.append(row);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function applyChatState(state = {}) {
  config = state.config || config;
  history = Array.isArray(state.history) ? state.history : history;
  characterName = state.character?.name || "桌宠";
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
  appendLocalMessage("assistant", "我想一下。");
  setStatus("正在等待回复...");

  try {
    const result = await window.desktopPet.sendChatMessage(cleanText);
    history = Array.isArray(result.history) ? result.history : history;
    renderHistory();
    setStatus(result.ok ? statusText() : "回复失败，请检查设置。");
  } catch {
    history = history.slice(0, -1);
    appendLocalMessage("assistant", "发送失败，稍后再试一下。");
    setStatus("发送失败。");
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
  setStatus("聊天已清空。");
});

window.desktopPet.onChatStateUpdated(applyChatState);

initialize().catch(() => {
  setStatus("聊天窗口启动失败。");
});
