const titleEl = document.querySelector("#chat-title");
const subtitleEl = document.querySelector("#chat-subtitle");
const settingsToggle = document.querySelector("#settings-toggle");
const settingsPanel = document.querySelector("#settings-panel");
const messagesEl = document.querySelector("#messages");
const composer = document.querySelector("#composer");
const inputEl = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-message");
const statusEl = document.querySelector("#status");
const baseUrlEl = document.querySelector("#base-url");
const modelEl = document.querySelector("#model");
const apiKeyEl = document.querySelector("#api-key");
const keyStatusEl = document.querySelector("#key-status");
const temperatureEl = document.querySelector("#temperature");
const maxHistoryEl = document.querySelector("#max-history");
const ttsEnabledEl = document.querySelector("#tts-enabled");
const voiceNameEl = document.querySelector("#voice-name");
const rateEl = document.querySelector("#tts-rate");
const pitchEl = document.querySelector("#tts-pitch");
const rateValueEl = document.querySelector("#rate-value");
const pitchValueEl = document.querySelector("#pitch-value");
const saveSettingsButton = document.querySelector("#save-settings");
const clearKeyButton = document.querySelector("#clear-key");
const clearHistoryButton = document.querySelector("#clear-history");

let config = {
  assistant: {
    baseUrl: "",
    model: "",
    temperature: 0.7,
    maxHistory: 12,
    hasApiKey: false,
  },
  tts: {
    enabled: false,
    voiceName: "",
    rate: 1,
    pitch: 1,
  },
};
let history = [];
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

function renderHistory() {
  messagesEl.textContent = "";
  if (!history.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "还没有消息。";
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
    meta.textContent = `${item.role === "user" ? "你" : "桌宠"} ${timeText(item.createdAt)}`;
    row.append(bubble, meta);
    messagesEl.append(row);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updateRangeLabels() {
  rateValueEl.textContent = Number(rateEl.value || 1).toFixed(1);
  pitchValueEl.textContent = Number(pitchEl.value || 1).toFixed(1);
}

function renderConfig() {
  const assistant = config.assistant || {};
  const tts = config.tts || {};
  baseUrlEl.value = assistant.baseUrl || "";
  modelEl.value = assistant.model || "";
  apiKeyEl.value = "";
  keyStatusEl.textContent = assistant.hasApiKey
    ? "已有 API key。留空保存会保留原 key。"
    : "还没有 API key；本地模型服务可以留空。";
  if (assistant.hasApiKey && assistant.canPersistApiKey === false) {
    keyStatusEl.textContent = "已有 API key，但当前系统不支持安全持久化，重启后需要重新填写。";
  }
  temperatureEl.value = Number(assistant.temperature ?? 0.7).toFixed(1);
  maxHistoryEl.value = String(assistant.maxHistory || 12);
  ttsEnabledEl.checked = tts.enabled === true;
  rateEl.value = String(tts.rate || 1);
  pitchEl.value = String(tts.pitch || 1);
  updateVoiceOptions(tts.voiceName || "");
  updateRangeLabels();
}

function getVoices() {
  if (!("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices();
}

function updateVoiceOptions(selectedName = config.tts?.voiceName || "") {
  const voices = getVoices();
  voiceNameEl.textContent = "";
  const systemOption = document.createElement("option");
  systemOption.value = "";
  systemOption.textContent = "系统默认";
  voiceNameEl.append(systemOption);
  for (const voice of voices) {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceNameEl.append(option);
  }
  voiceNameEl.value = selectedName;
}

function readConfigForm(includeEmptyKey = false) {
  const assistant = {
    baseUrl: baseUrlEl.value.trim(),
    model: modelEl.value.trim(),
    temperature: Number(temperatureEl.value || 0.7),
    maxHistory: Number(maxHistoryEl.value || 12),
  };
  const key = apiKeyEl.value.trim();
  if (key || includeEmptyKey) assistant.apiKey = key;
  return {
    assistant,
    tts: {
      enabled: ttsEnabledEl.checked,
      voiceName: voiceNameEl.value,
      rate: Number(rateEl.value || 1),
      pitch: Number(pitchEl.value || 1),
    },
  };
}

async function saveConfig(includeEmptyKey = false) {
  saveSettingsButton.disabled = true;
  try {
    config = await window.desktopPet.saveChatConfig(readConfigForm(includeEmptyKey));
    renderConfig();
    setStatus("设置已保存。");
  } finally {
    saveSettingsButton.disabled = false;
  }
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
    setStatus(result.ok ? "已回复。" : "回复失败，请检查设置。");
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
  const state = await window.desktopPet.getChatState();
  config = state.config || config;
  history = Array.isArray(state.history) ? state.history : [];
  if (state.character?.name) {
    titleEl.textContent = `${state.character.name} Chat`;
    subtitleEl.textContent = state.character.description || "和桌宠实时对话";
  }
  renderConfig();
  renderHistory();
}

settingsToggle.addEventListener("click", () => {
  const expanded = settingsToggle.getAttribute("aria-expanded") === "true";
  settingsToggle.setAttribute("aria-expanded", String(!expanded));
  settingsPanel.hidden = expanded;
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

saveSettingsButton.addEventListener("click", () => saveConfig(false));
clearKeyButton.addEventListener("click", () => {
  apiKeyEl.value = "";
  saveConfig(true);
});
clearHistoryButton.addEventListener("click", async () => {
  history = await window.desktopPet.clearChatHistory();
  renderHistory();
  setStatus("聊天已清空。");
});
rateEl.addEventListener("input", updateRangeLabels);
pitchEl.addEventListener("input", updateRangeLabels);

if ("speechSynthesis" in window) {
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    updateVoiceOptions(config.tts?.voiceName || "");
  });
}

initialize().catch(() => {
  setStatus("聊天窗口启动失败。");
});
