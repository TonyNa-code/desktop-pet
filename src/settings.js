const subtitleEl = document.querySelector("#settings-subtitle");
const languageEl = document.querySelector("#language");
const characterStatusEl = document.querySelector("#character-status");
const characterGridEl = document.querySelector("#character-grid");
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
const llmPresetButtons = [...document.querySelectorAll(".llm-preset")];
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
const affectionMinutesPerPointEl = document.querySelector("#affection-minutes-per-point");
const affectionActiveWindowEl = document.querySelector("#affection-active-window");
const affectionHappyThresholdEl = document.querySelector("#affection-happy-threshold");
const affectionCloseThresholdEl = document.querySelector("#affection-close-threshold");
const affectionLowToneEl = document.querySelector("#affection-low-tone");
const affectionMediumToneEl = document.querySelector("#affection-medium-tone");
const affectionHighToneEl = document.querySelector("#affection-high-tone");
const affectionRuleStatusEl = document.querySelector("#affection-rule-status");
const rateEl = document.querySelector("#tts-rate");
const pitchEl = document.querySelector("#tts-pitch");
const rateLabelEl = document.querySelector("#rate-label");
const pitchLabelEl = document.querySelector("#pitch-label");
const rateValueEl = document.querySelector("#rate-value");
const pitchValueEl = document.querySelector("#pitch-value");
const saveStatusEl = document.querySelector("#save-status");
const saveSettingsButton = document.querySelector("#save-settings");
const clearKeyButton = document.querySelector("#clear-key");
const backToChatButton = document.querySelector("#back-to-chat");

const DEFAULT_CUSTOM_BODY = "{\"text\":\"{{text}}\"}";
const ZH_AFFECTION_DEFAULTS = {
  label: "好感",
  lowTone: "保持礼貌但有一点距离感，回复简洁，不要过分亲昵。",
  mediumTone: "自然友好，带一点熟悉感，可以适度关心对方。",
  highTone: "更亲近、更信任，语气可以更温柔主动，但不要失去角色边界。",
};
const LLM_PRESETS = {
  ollama: {
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.1",
    needsKey: false,
  },
  lmstudio: {
    baseUrl: "http://localhost:1234/v1",
    model: "local-model",
    needsKey: false,
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    needsKey: true,
  },
  custom: {
    baseUrl: "",
    model: "",
    needsKey: true,
  },
};
const i18n = window.DesktopPetI18n;

let config = {
  language: "system",
  resolvedLanguage: "zh-CN",
  characterId: "default",
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
    enabled: false,
    label: "好感",
    minutesPerPoint: 10,
    activeWindowMinutes: 15,
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
    chatDurationMs: 0,
  },
};
let selectedVoiceName = "";
let activeLanguage = "zh-CN";
let characters = [];
let selectedCharacterId = "default";

function text(key, variables = {}) {
  return i18n.t(key, variables, activeLanguage);
}

function refreshLanguageOptions(selectedValue = "system") {
  languageEl.textContent = "";
  for (const option of i18n.LANGUAGE_OPTIONS) {
    const item = document.createElement("option");
    item.value = option.value;
    item.textContent = i18n.languageLabel(option.value, activeLanguage);
    languageEl.append(item);
  }
  languageEl.value = selectedValue;
  if (languageEl.value !== selectedValue) languageEl.value = "system";
}

function applyStaticTranslations() {
  document.documentElement.lang = activeLanguage;
  document.title = text("window.settingsTitle");
  document.querySelector("h1").textContent = text("settings.title");
  subtitleEl.textContent = text("settings.subtitle");
  backToChatButton.textContent = text("settings.backToChat");
  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = text(element.dataset.i18n);
  }
  personaNameEl.placeholder = text("settings.persona.namePlaceholder");
  personaPersonalityEl.placeholder = text("settings.persona.personalityPlaceholder");
  personaSpeakingStyleEl.placeholder = text("settings.persona.speakingStylePlaceholder");
  personaBackgroundEl.placeholder = text("settings.persona.backgroundPlaceholder");
  personaExtraRulesEl.placeholder = text("settings.persona.extraRulesPlaceholder");
  modelEl.placeholder = text("settings.llm.modelPlaceholder");
  apiKeyEl.placeholder = text("settings.llm.apiKeyPlaceholder");
  ttsApiKeyEl.placeholder = text("settings.llm.apiKeyPlaceholder");
  ttsProviderEl.querySelector("option[value='none']").textContent = text("settings.tts.providerNone");
  ttsProviderEl.querySelector("option[value='system']").textContent = text("settings.tts.providerSystem");
  ttsProviderEl.querySelector("option[value='gptsovits']").textContent = text("settings.tts.providerGptSovits");
  ttsProviderEl.querySelector("option[value='custom']").textContent = text("settings.tts.providerCustom");
  ttsReferenceAudioEl.placeholder = text("settings.tts.referenceAudioPlaceholder");
  ttsPromptTextEl.placeholder = text("settings.tts.promptTextPlaceholder");
  affectionLabelEl.placeholder = text("settings.affection.defaultLabel");
  testLlmButton.textContent = text("settings.llm.test");
  llmTestStatusEl.textContent = text("settings.llm.testHint");
  testTtsButton.textContent = text("settings.tts.test");
  ttsTestStatusEl.textContent = text("settings.tts.testHint");
  clearKeyButton.textContent = text("settings.clearKey");
  saveSettingsButton.textContent = text("settings.save");
  saveStatusEl.textContent = text("settings.saveLocal");
  updateRangeLabels();
}

function localizedDefaultValue(value, zhDefault, translationKey) {
  if (!value || value === zhDefault) return text(translationKey);
  return value;
}

function getVoices() {
  if (!("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices();
}

function updateRangeLabels() {
  rateLabelEl.textContent = text("settings.tts.rate");
  pitchLabelEl.textContent = text("settings.tts.pitch");
  rateValueEl.textContent = Number(rateEl.value || 1).toFixed(1);
  pitchValueEl.textContent = Number(pitchEl.value || 1).toFixed(1);
}

function updateVoiceOptions(selectedName = selectedVoiceName) {
  const voices = getVoices();
  voiceNameEl.textContent = "";
  const systemOption = document.createElement("option");
  systemOption.value = "";
  systemOption.textContent = text("settings.tts.systemDefaultVoice");
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
  ttsStatusEl.textContent = provider === "none" ? text("settings.tts.off") : text("settings.tts.afterSave");
}

function updateLlmDraftStatus() {
  const hasBaseUrl = Boolean(baseUrlEl.value.trim());
  const hasModel = Boolean(modelEl.value.trim());
  if (hasBaseUrl && hasModel) {
    llmStatusEl.textContent = text("settings.llm.readyToTest");
  } else {
    llmStatusEl.textContent = text("settings.llm.notConfigured");
  }
}

function applyLlmPreset(presetName) {
  const preset = LLM_PRESETS[presetName];
  if (!preset) return;
  baseUrlEl.value = preset.baseUrl;
  modelEl.value = preset.model;
  config.assistant = {
    ...(config.assistant || {}),
    baseUrl: preset.baseUrl,
    model: preset.model,
  };
  updateLlmDraftStatus();
  if (presetName === "custom") {
    llmTestStatusEl.textContent = text("settings.llm.customPresetApplied");
    baseUrlEl.focus();
    return;
  }
  llmTestStatusEl.textContent = preset.needsKey
    ? text("settings.llm.presetAppliedNeedsKey")
    : text("settings.llm.presetApplied");
  if (preset.needsKey) apiKeyEl.focus();
}

function renderCharacterCards() {
  characterGridEl.textContent = "";
  if (!characters.length) {
    characterStatusEl.textContent = text("settings.character.empty");
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = text("settings.character.empty");
    characterGridEl.append(empty);
    return;
  }

  const activeCharacter = characters.find((character) => character.id === selectedCharacterId) || characters[0];
  selectedCharacterId = activeCharacter.id;
  characterStatusEl.textContent = text("settings.character.current", { name: activeCharacter.name });

  for (const character of characters) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "character-card";
    card.classList.toggle("selected", character.id === selectedCharacterId);
    card.setAttribute("aria-pressed", character.id === selectedCharacterId ? "true" : "false");

    const image = document.createElement("img");
    image.src = character.previewPath || character.spritePath || "";
    image.alt = character.name;
    image.loading = "lazy";

    const content = document.createElement("span");
    const name = document.createElement("b");
    const description = document.createElement("span");
    const meta = document.createElement("span");
    name.textContent = character.name;
    description.className = "description";
    description.textContent = character.description || text("settings.character.noDescription");
    meta.className = "meta";
    meta.textContent = text("settings.character.meta", {
      actions: character.stateCount || 0,
      click: character.clickActionCount || 0,
    });
    content.append(name, description, meta);
    card.append(image, content);

    card.addEventListener("click", () => {
      selectedCharacterId = character.id;
      config.characterId = character.id;
      saveStatusEl.textContent = text("settings.character.changed");
      renderCharacterCards();
    });
    characterGridEl.append(card);
  }
}

function renderConfig() {
  const assistant = config.assistant || {};
  const tts = config.tts || {};
  const persona = config.persona || {};
  const affection = config.affection || {};
  const profile = config.profile || {};
  activeLanguage = config.resolvedLanguage || i18n.resolveLanguage(config.language, "zh-CN");
  selectedCharacterId = config.characterId || selectedCharacterId || "default";
  refreshLanguageOptions(config.language || "system");
  applyStaticTranslations();
  renderCharacterCards();

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
  affectionLabelEl.value = localizedDefaultValue(
    affection.label,
    ZH_AFFECTION_DEFAULTS.label,
    "settings.affection.defaultLabel",
  );
  affectionCurrentEl.value = String(profile.affection ?? 10);
  affectionMinutesPerPointEl.value = String(affection.minutesPerPoint || 10);
  affectionActiveWindowEl.value = String(affection.activeWindowMinutes || 15);
  affectionHappyThresholdEl.value = String(affection.happyThreshold || 50);
  affectionCloseThresholdEl.value = String(affection.closeThreshold || 75);
  affectionLowToneEl.value = localizedDefaultValue(
    affection.lowTone,
    ZH_AFFECTION_DEFAULTS.lowTone,
    "settings.affection.lowToneDefault",
  );
  affectionMediumToneEl.value = localizedDefaultValue(
    affection.mediumTone,
    ZH_AFFECTION_DEFAULTS.mediumTone,
    "settings.affection.mediumToneDefault",
  );
  affectionHighToneEl.value = localizedDefaultValue(
    affection.highTone,
    ZH_AFFECTION_DEFAULTS.highTone,
    "settings.affection.highToneDefault",
  );

  updateRangeLabels();
  updateProviderVisibility();

  const hasPersona = Boolean(
    persona.name
    || persona.personality
    || persona.speakingStyle
    || persona.background
    || persona.extraRules,
  );
  personaStatusEl.textContent = hasPersona ? text("settings.persona.ready") : text("settings.persona.pending");
  const llmReady = Boolean(assistant.baseUrl && assistant.model);
  llmStatusEl.textContent = llmReady ? text("settings.llm.configured") : text("settings.llm.notConfigured");
  ttsStatusEl.textContent = tts.enabled ? text("settings.tts.on") : text("settings.tts.off");
  affectionStatusEl.textContent = affection.enabled === false ? text("settings.affection.disabled") : text("settings.affection.enabled");
  const chatMinutes = Math.floor(Number(profile.chatDurationMs || 0) / 60000);
  affectionRuleStatusEl.textContent = affection.enabled === false
    ? text("settings.affection.disabledRule")
    : text("settings.affection.enabledRule", {
      label: affection.label || text("settings.affection.defaultLabel"),
      value: profile.affection ?? 0,
      minutes: chatMinutes,
    });
  keyStatusEl.textContent = assistant.hasApiKey
    ? text("settings.key.chatSaved")
    : text("settings.key.chatEmpty");
  ttsKeyStatusEl.textContent = tts.hasApiKey
    ? text("settings.key.ttsSaved")
    : text("settings.key.ttsEmpty");
  if (assistant.hasApiKey && assistant.canPersistApiKey === false) {
    keyStatusEl.textContent = text("settings.key.chatEphemeral");
  }
  if (tts.hasApiKey && tts.canPersistApiKey === false) {
    ttsKeyStatusEl.textContent = text("settings.key.ttsEphemeral");
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
    label: affectionLabelEl.value.trim() || text("settings.affection.defaultLabel"),
    minutesPerPoint: Number(affectionMinutesPerPointEl.value || 10),
    activeWindowMinutes: Number(affectionActiveWindowEl.value || 15),
    happyThreshold: Number(affectionHappyThresholdEl.value || 50),
    closeThreshold: Number(affectionCloseThresholdEl.value || 75),
    lowTone: affectionLowToneEl.value.trim(),
    mediumTone: affectionMediumToneEl.value.trim(),
    highTone: affectionHighToneEl.value.trim(),
  };

  const profile = {
    affection: Number(affectionCurrentEl.value || 0),
  };

  return { language: languageEl.value, characterId: selectedCharacterId, assistant, tts, persona, affection, profile };
}

async function saveConfig(includeEmptyKey = false) {
  saveSettingsButton.disabled = true;
  try {
    config = await window.desktopPet.saveChatConfig(readConfigForm(includeEmptyKey));
    renderConfig();
    saveStatusEl.textContent = text("settings.saved");
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
  const utterance = new SpeechSynthesisUtterance(text("settings.tts.testText"));
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
  llmTestStatusEl.textContent = text("settings.llm.testing");
  try {
    const result = await window.desktopPet.testAssistantConnection(readConfigForm(false));
    llmTestStatusEl.textContent = result.message || (result.ok ? text("settings.llm.success") : text("settings.llm.failed"));
  } catch {
    llmTestStatusEl.textContent = text("settings.llm.testFailed");
  } finally {
    testLlmButton.disabled = false;
  }
}

async function testTts() {
  testTtsButton.disabled = true;
  ttsTestStatusEl.textContent = text("settings.tts.testing");
  try {
    const formConfig = readConfigForm(false);
    const result = await window.desktopPet.testTtsConnection(formConfig);
    ttsTestStatusEl.textContent = result.message || (result.ok ? text("settings.tts.success") : text("settings.tts.failed"));
    if (result.audioDataUrl) {
      new Audio(result.audioDataUrl).play().catch(() => {});
    } else if (formConfig.tts.provider === "system" && result.ok && !playSystemTtsTest()) {
      ttsTestStatusEl.textContent = text("settings.tts.systemUnavailable");
    }
  } catch {
    ttsTestStatusEl.textContent = text("settings.tts.testFailed");
  } finally {
    testTtsButton.disabled = false;
  }
}

function applyChatState(state = {}) {
  config = state.config || config;
  config.language = state.language || config.language || "system";
  config.resolvedLanguage = state.resolvedLanguage || config.resolvedLanguage || "zh-CN";
  characters = Array.isArray(state.characters) ? state.characters : characters;
  selectedCharacterId = config.characterId || state.character?.id || selectedCharacterId;
  renderConfig();
  subtitleEl.textContent = text("chat.subtitle", { name: state.character?.name || text("app.name") });
}

async function initialize() {
  applyChatState(await window.desktopPet.getChatState());
}

saveSettingsButton.addEventListener("click", () => saveConfig(false));
testLlmButton.addEventListener("click", testLlm);
testTtsButton.addEventListener("click", testTts);
for (const button of llmPresetButtons) {
  button.addEventListener("click", () => applyLlmPreset(button.dataset.preset));
}
baseUrlEl.addEventListener("input", updateLlmDraftStatus);
modelEl.addEventListener("input", updateLlmDraftStatus);
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
languageEl.addEventListener("change", () => {
  config.language = languageEl.value;
  config.resolvedLanguage = i18n.resolveLanguage(languageEl.value, config.resolvedLanguage || "zh-CN");
  renderConfig();
});
affectionEnabledEl.addEventListener("change", () => {
  affectionStatusEl.textContent = affectionEnabledEl.checked
    ? text("settings.affection.enabled")
    : text("settings.affection.disabled");
});

if ("speechSynthesis" in window) {
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    updateVoiceOptions(voiceNameEl.value || selectedVoiceName);
  });
}

window.desktopPet.onChatStateUpdated(applyChatState);

initialize().catch(() => {
  saveStatusEl.textContent = text("settings.startFailed");
});
