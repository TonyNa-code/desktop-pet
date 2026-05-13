const subtitleEl = document.querySelector("#settings-subtitle");
const llmStatusEl = document.querySelector("#llm-status");
const ttsStatusEl = document.querySelector("#tts-status");
const baseUrlEl = document.querySelector("#base-url");
const modelEl = document.querySelector("#model");
const apiKeyEl = document.querySelector("#api-key");
const keyStatusEl = document.querySelector("#key-status");
const temperatureEl = document.querySelector("#temperature");
const maxHistoryEl = document.querySelector("#max-history");
const ttsProviderEl = document.querySelector("#tts-provider");
const systemVoiceRow = document.querySelector("#system-voice-row");
const voiceNameEl = document.querySelector("#voice-name");
const externalFields = document.querySelector("#external-tts-fields");
const gptSovitsFields = document.querySelector("#gptsovits-fields");
const customBodyRow = document.querySelector("#custom-body-row");
const ttsEndpointEl = document.querySelector("#tts-endpoint");
const ttsApiKeyEl = document.querySelector("#tts-api-key");
const ttsKeyStatusEl = document.querySelector("#tts-key-status");
const ttsRequestModeEl = document.querySelector("#tts-request-mode");
const ttsMediaTypeEl = document.querySelector("#tts-media-type");
const ttsTextLanguageEl = document.querySelector("#tts-text-language");
const ttsPromptLanguageEl = document.querySelector("#tts-prompt-language");
const ttsReferenceAudioEl = document.querySelector("#tts-reference-audio");
const ttsPromptTextEl = document.querySelector("#tts-prompt-text");
const ttsCustomBodyEl = document.querySelector("#tts-custom-body");
const rateEl = document.querySelector("#tts-rate");
const pitchEl = document.querySelector("#tts-pitch");
const rateValueEl = document.querySelector("#rate-value");
const pitchValueEl = document.querySelector("#pitch-value");
const saveStatusEl = document.querySelector("#save-status");
const saveSettingsButton = document.querySelector("#save-settings");
const clearKeyButton = document.querySelector("#clear-key");
const backToChatButton = document.querySelector("#back-to-chat");

const DEFAULT_CUSTOM_BODY = "{\"text\":\"{{text}}\"}";

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
    provider: "none",
    voiceName: "",
    rate: 1,
    pitch: 1,
    endpoint: "",
    requestMode: "json",
    textLanguage: "zh",
    promptLanguage: "zh",
    promptText: "",
    referenceAudioPath: "",
    mediaType: "wav",
    customBodyTemplate: DEFAULT_CUSTOM_BODY,
    hasApiKey: false,
    canPersistApiKey: true,
  },
};
let selectedVoiceName = "";

function getVoices() {
  if (!("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices();
}

function updateRangeLabels() {
  rateValueEl.textContent = Number(rateEl.value || 1).toFixed(1);
  pitchValueEl.textContent = Number(pitchEl.value || 1).toFixed(1);
}

function updateVoiceOptions(selectedName = selectedVoiceName) {
  const voices = getVoices();
  voiceNameEl.textContent = "";
  const systemOption = document.createElement("option");
  systemOption.value = "";
  systemOption.textContent = "系统默认语音";
  voiceNameEl.append(systemOption);
  for (const voice of voices) {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceNameEl.append(option);
  }
  voiceNameEl.value = selectedName;
  if (voiceNameEl.value !== selectedName) voiceNameEl.value = "";
}

function updateProviderVisibility() {
  const provider = ttsProviderEl.value;
  const isSystem = provider === "system";
  const isExternal = provider === "gptsovits" || provider === "custom";
  systemVoiceRow.hidden = !isSystem;
  externalFields.hidden = !isExternal;
  gptSovitsFields.hidden = provider !== "gptsovits";
  customBodyRow.hidden = provider !== "custom";
  ttsStatusEl.textContent = provider === "none" ? "关闭" : "保存后开启";
}

function renderConfig() {
  const assistant = config.assistant || {};
  const tts = config.tts || {};
  baseUrlEl.value = assistant.baseUrl || "";
  modelEl.value = assistant.model || "";
  apiKeyEl.value = "";
  temperatureEl.value = Number(assistant.temperature ?? 0.7).toFixed(1);
  maxHistoryEl.value = String(assistant.maxHistory || 12);
  ttsProviderEl.value = tts.enabled ? (tts.provider || "system") : "none";
  selectedVoiceName = tts.voiceName || "";
  updateVoiceOptions(selectedVoiceName);
  ttsEndpointEl.value = tts.endpoint || "";
  ttsApiKeyEl.value = "";
  ttsRequestModeEl.value = tts.requestMode || "json";
  ttsMediaTypeEl.value = tts.mediaType || "wav";
  ttsTextLanguageEl.value = tts.textLanguage || "zh";
  ttsPromptLanguageEl.value = tts.promptLanguage || "zh";
  ttsReferenceAudioEl.value = tts.referenceAudioPath || "";
  ttsPromptTextEl.value = tts.promptText || "";
  ttsCustomBodyEl.value = tts.customBodyTemplate || DEFAULT_CUSTOM_BODY;
  rateEl.value = String(tts.rate || 1);
  pitchEl.value = String(tts.pitch || 1);
  updateRangeLabels();
  updateProviderVisibility();

  const llmReady = Boolean(assistant.baseUrl && assistant.model);
  llmStatusEl.textContent = llmReady ? "已配置" : "未配置";
  ttsStatusEl.textContent = tts.enabled ? "已开启" : "关闭";
  keyStatusEl.textContent = assistant.hasApiKey
    ? "已有 LLM API key。留空保存会保留原 key。"
    : "没有 LLM API key；本地模型服务一般可以留空。";
  ttsKeyStatusEl.textContent = tts.hasApiKey
    ? "已有 TTS API key。留空保存会保留原 key。"
    : "没有 TTS API key；本地服务一般可以留空。";
  if (assistant.hasApiKey && assistant.canPersistApiKey === false) {
    keyStatusEl.textContent = "已有 LLM API key，但当前系统不支持安全持久化，重启后需要重新填写。";
  }
  if (tts.hasApiKey && tts.canPersistApiKey === false) {
    ttsKeyStatusEl.textContent = "已有 TTS API key，但当前系统不支持安全持久化，重启后需要重新填写。";
  }
}

function readConfigForm(includeEmptyKey = false) {
  const provider = ttsProviderEl.value;
  const ttsEndpoint = ttsEndpointEl.value.trim();
  const assistant = {
    baseUrl: baseUrlEl.value.trim(),
    model: modelEl.value.trim(),
    temperature: Number(temperatureEl.value || 0.7),
    maxHistory: Number(maxHistoryEl.value || 12),
  };
  const llmKey = apiKeyEl.value.trim();
  if (llmKey || includeEmptyKey) assistant.apiKey = llmKey;

  const tts = {
    enabled: provider !== "none",
    provider,
    voiceName: provider === "system" ? voiceNameEl.value : "",
    rate: Number(rateEl.value || 1),
    pitch: Number(pitchEl.value || 1),
    endpoint: provider === "gptsovits"
      ? (ttsEndpoint || "http://127.0.0.1:9880/tts")
      : ttsEndpoint,
    requestMode: ttsRequestModeEl.value,
    textLanguage: ttsTextLanguageEl.value.trim() || "zh",
    promptLanguage: ttsPromptLanguageEl.value.trim() || "zh",
    promptText: ttsPromptTextEl.value,
    referenceAudioPath: ttsReferenceAudioEl.value,
    mediaType: ttsMediaTypeEl.value,
    customBodyTemplate: ttsCustomBodyEl.value.trim() || DEFAULT_CUSTOM_BODY,
  };
  const ttsKey = ttsApiKeyEl.value.trim();
  if (ttsKey || includeEmptyKey) tts.apiKey = ttsKey;

  return { assistant, tts };
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
  ttsApiKeyEl.value = "";
  saveConfig(true);
});
backToChatButton.addEventListener("click", () => {
  window.desktopPet.openChatWindow();
  window.close();
});
rateEl.addEventListener("input", updateRangeLabels);
pitchEl.addEventListener("input", updateRangeLabels);
ttsProviderEl.addEventListener("change", updateProviderVisibility);

if ("speechSynthesis" in window) {
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    updateVoiceOptions(voiceNameEl.value || selectedVoiceName);
  });
}

window.desktopPet.onChatStateUpdated(applyChatState);

initialize().catch(() => {
  saveStatusEl.textContent = "设置窗口启动失败。";
});
