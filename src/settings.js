const subtitleEl = document.querySelector("#settings-subtitle");
const llmStatusEl = document.querySelector("#llm-status");
const ttsStatusEl = document.querySelector("#tts-status");
const baseUrlEl = document.querySelector("#base-url");
const modelEl = document.querySelector("#model");
const apiKeyEl = document.querySelector("#api-key");
const keyStatusEl = document.querySelector("#key-status");
const temperatureEl = document.querySelector("#temperature");
const maxHistoryEl = document.querySelector("#max-history");
const ttsModeEl = document.querySelector("#tts-mode");
const rateEl = document.querySelector("#tts-rate");
const pitchEl = document.querySelector("#tts-pitch");
const rateValueEl = document.querySelector("#rate-value");
const pitchValueEl = document.querySelector("#pitch-value");
const saveStatusEl = document.querySelector("#save-status");
const saveSettingsButton = document.querySelector("#save-settings");
const clearKeyButton = document.querySelector("#clear-key");
const backToChatButton = document.querySelector("#back-to-chat");

const TTS_OFF = "__off__";
const TTS_SYSTEM = "__system__";

let config = {
  assistant: {
    baseUrl: "",
    model: "",
    temperature: 0.7,
    maxHistory: 12,
    hasApiKey: false,
    canPersistApiKey: true,
  },
  tts: {
    enabled: false,
    voiceName: "",
    rate: 1,
    pitch: 1,
  },
};
let selectedVoiceName = "";

function getVoices() {
  if (!("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices();
}

function ttsModeValue(tts = config.tts || {}) {
  if (!tts.enabled) return TTS_OFF;
  return tts.voiceName ? tts.voiceName : TTS_SYSTEM;
}

function updateRangeLabels() {
  rateValueEl.textContent = Number(rateEl.value || 1).toFixed(1);
  pitchValueEl.textContent = Number(pitchEl.value || 1).toFixed(1);
}

function updateVoiceOptions(value = selectedVoiceName) {
  const voices = getVoices();
  ttsModeEl.textContent = "";

  const offOption = document.createElement("option");
  offOption.value = TTS_OFF;
  offOption.textContent = "关闭朗读";
  ttsModeEl.append(offOption);

  const systemOption = document.createElement("option");
  systemOption.value = TTS_SYSTEM;
  systemOption.textContent = "系统默认语音";
  ttsModeEl.append(systemOption);

  for (const voice of voices) {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    ttsModeEl.append(option);
  }

  ttsModeEl.value = value;
  if (ttsModeEl.value !== value) {
    ttsModeEl.value = TTS_OFF;
  }
}

function renderConfig() {
  const assistant = config.assistant || {};
  const tts = config.tts || {};
  baseUrlEl.value = assistant.baseUrl || "";
  modelEl.value = assistant.model || "";
  apiKeyEl.value = "";
  temperatureEl.value = Number(assistant.temperature ?? 0.7).toFixed(1);
  maxHistoryEl.value = String(assistant.maxHistory || 12);
  rateEl.value = String(tts.rate || 1);
  pitchEl.value = String(tts.pitch || 1);
  selectedVoiceName = ttsModeValue(tts);
  updateVoiceOptions(selectedVoiceName);
  updateRangeLabels();

  const llmReady = Boolean(assistant.baseUrl && assistant.model);
  llmStatusEl.textContent = llmReady ? "已配置" : "未配置";
  ttsStatusEl.textContent = tts.enabled ? "已开启" : "关闭";
  keyStatusEl.textContent = assistant.hasApiKey
    ? "已有 API key。留空保存会保留原 key。"
    : "没有 API key；本地模型服务一般可以留空。";
  if (assistant.hasApiKey && assistant.canPersistApiKey === false) {
    keyStatusEl.textContent = "已有 API key，但当前系统不支持安全持久化，重启后需要重新填写。";
  }
}

function readConfigForm(includeEmptyKey = false) {
  const mode = ttsModeEl.value;
  const ttsEnabled = mode !== TTS_OFF;
  const voiceName = mode === TTS_SYSTEM || mode === TTS_OFF ? "" : mode;
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
      enabled: ttsEnabled,
      voiceName,
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
    saveStatusEl.textContent = "设置已保存。";
  } finally {
    saveSettingsButton.disabled = false;
  }
}

function applyChatState(state = {}) {
  config = state.config || config;
  subtitleEl.textContent = `当前角色：${state.character?.name || "桌宠"}`;
  renderConfig();
}

async function initialize() {
  applyChatState(await window.desktopPet.getChatState());
}

saveSettingsButton.addEventListener("click", () => saveConfig(false));
clearKeyButton.addEventListener("click", () => {
  apiKeyEl.value = "";
  saveConfig(true);
});
backToChatButton.addEventListener("click", () => {
  window.desktopPet.openChatWindow();
  window.close();
});
rateEl.addEventListener("input", updateRangeLabels);
pitchEl.addEventListener("input", updateRangeLabels);
ttsModeEl.addEventListener("change", () => {
  ttsStatusEl.textContent = ttsModeEl.value === TTS_OFF ? "关闭" : "保存后开启";
});

if ("speechSynthesis" in window) {
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    updateVoiceOptions(ttsModeEl.value || selectedVoiceName);
  });
}

window.desktopPet.onChatStateUpdated(applyChatState);

initialize().catch(() => {
  saveStatusEl.textContent = "设置窗口启动失败。";
});
