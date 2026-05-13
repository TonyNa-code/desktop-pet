const subtitleEl = document.querySelector("#settings-subtitle");
const personaStatusEl = document.querySelector("#persona-status");
const llmStatusEl = document.querySelector("#llm-status");
const ttsStatusEl = document.querySelector("#tts-status");
const affectionStatusEl = document.querySelector("#affection-status");
const personaNameEl = document.querySelector("#persona-name");
const personaPersonalityEl = document.querySelector("#persona-personality");
const personaSpeakingStyleEl = document.querySelector("#persona-speaking-style");
const personaBackgroundEl = document.querySelector("#persona-background");
const personaExtraRulesEl = document.querySelector("#persona-extra-rules");
const baseUrlEl = document.querySelector("#base-url");
const modelEl = document.querySelector("#model");
const apiKeyEl = document.querySelector("#api-key");
const keyStatusEl = document.querySelector("#key-status");
const temperatureEl = document.querySelector("#temperature");
const maxHistoryEl = document.querySelector("#max-history");
const testLlmButton = document.querySelector("#test-llm");
const llmTestStatusEl = document.querySelector("#llm-test-status");
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
const ttsTextSplitMethodEl = document.querySelector("#tts-text-split-method");
const ttsCustomBodyEl = document.querySelector("#tts-custom-body");
const testTtsButton = document.querySelector("#test-tts");
const ttsTestStatusEl = document.querySelector("#tts-test-status");
const affectionEnabledEl = document.querySelector("#affection-enabled");
const affectionLabelEl = document.querySelector("#affection-label");
const affectionCurrentEl = document.querySelector("#affection-current");
const affectionHappyThresholdEl = document.querySelector("#affection-happy-threshold");
const affectionCloseThresholdEl = document.querySelector("#affection-close-threshold");
const affectionClickGainEl = document.querySelector("#affection-click-gain");
const affectionChatGainEl = document.querySelector("#affection-chat-gain");
const affectionDoubleClickGainEl = document.querySelector("#affection-double-click-gain");
const affectionLongPressGainEl = document.querySelector("#affection-long-press-gain");
const affectionGrowthCooldownEl = document.querySelector("#affection-growth-cooldown");
const affectionDailyLimitEl = document.querySelector("#affection-daily-limit");
const rapidClickEnergyCostEl = document.querySelector("#rapid-click-energy-cost");
const affectionLowToneEl = document.querySelector("#affection-low-tone");
const affectionMediumToneEl = document.querySelector("#affection-medium-tone");
const affectionHighToneEl = document.querySelector("#affection-high-tone");
const affectionRuleStatusEl = document.querySelector("#affection-rule-status");
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
    textSplitMethod: "cut5",
    mediaType: "wav",
    customBodyTemplate: DEFAULT_CUSTOM_BODY,
    hasApiKey: false,
    canPersistApiKey: true,
  },
  persona: {
    setupDone: false,
    name: "",
    personality: "",
    speakingStyle: "",
    background: "",
    extraRules: "",
  },
  affection: {
    enabled: true,
    label: "好感",
    clickGain: 1,
    doubleClickGain: 3,
    longPressGain: 2,
    chatGain: 1,
    growthCooldownSeconds: 30,
    dailyGainLimit: 30,
    rapidClickEnergyCost: 7,
    happyThreshold: 50,
    closeThreshold: 75,
    lowTone: "保持礼貌但有一点距离感，回复简洁，不要过分亲昵。",
    mediumTone: "自然友好，带一点熟悉感，可以适度关心对方。",
    highTone: "更亲近、更信任，语气可以更温柔主动，但不要失去角色边界。",
  },
  profile: {
    affection: 10,
    energy: 80,
    mood: "calm",
    affectionGainToday: 0,
    affectionGainDate: "",
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
  const persona = config.persona || {};
  const affection = config.affection || {};
  const profile = config.profile || {};

  personaNameEl.value = persona.name || "";
  personaPersonalityEl.value = persona.personality || "";
  personaSpeakingStyleEl.value = persona.speakingStyle || "";
  personaBackgroundEl.value = persona.background || "";
  personaExtraRulesEl.value = persona.extraRules || "";

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
  ttsTextSplitMethodEl.value = tts.textSplitMethod || "cut5";
  ttsCustomBodyEl.value = tts.customBodyTemplate || DEFAULT_CUSTOM_BODY;
  rateEl.value = String(tts.rate || 1);
  pitchEl.value = String(tts.pitch || 1);

  affectionEnabledEl.checked = affection.enabled !== false;
  affectionLabelEl.value = affection.label || "好感";
  affectionCurrentEl.value = String(profile.affection ?? 10);
  affectionHappyThresholdEl.value = String(affection.happyThreshold || 50);
  affectionCloseThresholdEl.value = String(affection.closeThreshold || 75);
  affectionClickGainEl.value = String(affection.clickGain ?? 1);
  affectionChatGainEl.value = String(affection.chatGain ?? 1);
  affectionDoubleClickGainEl.value = String(affection.doubleClickGain ?? 3);
  affectionLongPressGainEl.value = String(affection.longPressGain ?? 2);
  affectionGrowthCooldownEl.value = String(affection.growthCooldownSeconds ?? 30);
  affectionDailyLimitEl.value = String(affection.dailyGainLimit ?? 30);
  rapidClickEnergyCostEl.value = String(affection.rapidClickEnergyCost ?? 7);
  affectionLowToneEl.value = affection.lowTone || "";
  affectionMediumToneEl.value = affection.mediumTone || "";
  affectionHighToneEl.value = affection.highTone || "";

  updateRangeLabels();
  updateProviderVisibility();

  const hasPersona = Boolean(
    persona.name
    || persona.personality
    || persona.speakingStyle
    || persona.background
    || persona.extraRules,
  );
  personaStatusEl.textContent = hasPersona ? "已填写" : "待填写";
  const llmReady = Boolean(assistant.baseUrl && assistant.model);
  llmStatusEl.textContent = llmReady ? "已配置" : "未配置";
  ttsStatusEl.textContent = tts.enabled ? "已开启" : "关闭";
  affectionStatusEl.textContent = affection.enabled === false ? "关闭" : "开启";
  affectionRuleStatusEl.textContent = affection.enabled === false
    ? "关闭后，大模型不会收到好感度阶段，也不会按好感度调整语气。"
    : `今日已增长 ${profile.affectionGainToday || 0}，当前 ${affection.label || "好感"} ${profile.affection ?? 0}/100。`;
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
    textSplitMethod: ttsTextSplitMethodEl.value.trim() || "cut5",
    mediaType: ttsMediaTypeEl.value,
    customBodyTemplate: ttsCustomBodyEl.value.trim() || DEFAULT_CUSTOM_BODY,
  };
  const ttsKey = ttsApiKeyEl.value.trim();
  if (ttsKey || includeEmptyKey) tts.apiKey = ttsKey;

  const persona = {
    setupDone: true,
    name: personaNameEl.value.trim(),
    personality: personaPersonalityEl.value.trim(),
    speakingStyle: personaSpeakingStyleEl.value.trim(),
    background: personaBackgroundEl.value.trim(),
    extraRules: personaExtraRulesEl.value.trim(),
  };
  const affection = {
    enabled: affectionEnabledEl.checked,
    label: affectionLabelEl.value.trim() || "好感",
    happyThreshold: Number(affectionHappyThresholdEl.value || 50),
    closeThreshold: Number(affectionCloseThresholdEl.value || 75),
    clickGain: Number(affectionClickGainEl.value || 0),
    chatGain: Number(affectionChatGainEl.value || 0),
    doubleClickGain: Number(affectionDoubleClickGainEl.value || 0),
    longPressGain: Number(affectionLongPressGainEl.value || 0),
    growthCooldownSeconds: Number(affectionGrowthCooldownEl.value || 0),
    dailyGainLimit: Number(affectionDailyLimitEl.value || 0),
    rapidClickEnergyCost: Number(rapidClickEnergyCostEl.value || 0),
    lowTone: affectionLowToneEl.value.trim(),
    mediumTone: affectionMediumToneEl.value.trim(),
    highTone: affectionHighToneEl.value.trim(),
  };

  const profile = {
    affection: Number(affectionCurrentEl.value || 0),
  };

  return { assistant, tts, persona, affection, profile };
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

function chooseSystemVoice() {
  const voices = getVoices();
  if (!voices.length) return null;
  return voices.find((voice) => voice.name === voiceNameEl.value) || voices[0];
}

function playSystemTtsTest() {
  if (!("speechSynthesis" in window)) return false;
  const utterance = new SpeechSynthesisUtterance("语音连接测试。");
  const voice = chooseSystemVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = Number(rateEl.value || 1);
  utterance.pitch = Number(pitchEl.value || 1);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

async function testLlm() {
  testLlmButton.disabled = true;
  llmTestStatusEl.textContent = "正在测试 LLM...";
  try {
    const result = await window.desktopPet.testAssistantConnection(readConfigForm(false));
    llmTestStatusEl.textContent = result.message || (result.ok ? "LLM 连接成功。" : "LLM 连接失败。");
  } catch {
    llmTestStatusEl.textContent = "LLM 测试请求失败。";
  } finally {
    testLlmButton.disabled = false;
  }
}

async function testTts() {
  testTtsButton.disabled = true;
  ttsTestStatusEl.textContent = "正在测试 TTS...";
  try {
    const formConfig = readConfigForm(false);
    const result = await window.desktopPet.testTtsConnection(formConfig);
    ttsTestStatusEl.textContent = result.message || (result.ok ? "TTS 连接成功。" : "TTS 连接失败。");
    if (result.audioDataUrl) {
      new Audio(result.audioDataUrl).play().catch(() => {});
    } else if (formConfig.tts.provider === "system" && result.ok && !playSystemTtsTest()) {
      ttsTestStatusEl.textContent = "系统语音不可用。";
    }
  } catch {
    ttsTestStatusEl.textContent = "TTS 测试请求失败。";
  } finally {
    testTtsButton.disabled = false;
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
testLlmButton.addEventListener("click", testLlm);
testTtsButton.addEventListener("click", testTts);
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
affectionEnabledEl.addEventListener("change", () => {
  affectionStatusEl.textContent = affectionEnabledEl.checked ? "开启" : "关闭";
});

if ("speechSynthesis" in window) {
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    updateVoiceOptions(voiceNameEl.value || selectedVoiceName);
  });
}

window.desktopPet.onChatStateUpdated(applyChatState);

initialize().catch(() => {
  saveStatusEl.textContent = "设置窗口启动失败。";
});
