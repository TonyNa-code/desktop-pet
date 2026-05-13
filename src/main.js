const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  screen,
  nativeImage,
  Notification,
  safeStorage,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const BASE_SIZE = { width: 192, height: 208 };
const BUBBLE_HEIGHT = 132;
const MIN_BUBBLE_WIDTH = 320;
const DEFAULT_CHARACTER_ID = "default";
const CHARACTERS_DIR = path.join(__dirname, "..", "assets", "characters");
const SIZE_PRESETS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const DEFAULT_SETTINGS = {
  characterId: DEFAULT_CHARACTER_ID,
  expressionMode: "automatic",
  scale: 1,
  alwaysOnTop: true,
  restReminderMinutes: 0,
  assistant: {
    baseUrl: "",
    model: "",
    apiKey: "",
    temperature: 0.7,
    maxHistory: 12,
  },
  tts: {
    enabled: false,
    provider: "none",
    voiceName: "",
    rate: 1,
    pitch: 1,
    endpoint: "",
    apiKey: "",
    requestMode: "json",
    textLanguage: "zh",
    promptLanguage: "zh",
    promptText: "",
    referenceAudioPath: "",
    mediaType: "wav",
    customBodyTemplate: "{\"text\":\"{{text}}\"}",
  },
};
const DEFAULT_PROFILE = {
  mood: "calm",
  affection: 10,
  energy: 80,
  totalInteractions: 0,
  lastInteractionAt: 0,
  lastLaunchDate: "",
};

let mainWindow;
let chatWindow;
let quickChatWindow;
let companionSettingsWindow;
let settings = { ...DEFAULT_SETTINGS };
let profile = { ...DEFAULT_PROFILE };
let dragSnapshot = null;
let restReminderTimer = null;
let focusTimer = null;
let chatHistory = [];

function isSafeAssetName(value) {
  return (
    typeof value === "string"
    && value.length > 0
    && !path.isAbsolute(value)
    && !/[\\/]/.test(value)
    && !value.split(/[\\/]/).includes("..")
  );
}

function publicAssetPath(...segments) {
  return ["..", "assets", ...segments].map(encodeURIComponent).join("/");
}

function normalizeCharacterPack(rawPack, folderName) {
  const id = typeof rawPack.id === "string" && rawPack.id.trim() ? rawPack.id.trim() : folderName;
  const name = typeof rawPack.name === "string" && rawPack.name.trim() ? rawPack.name.trim() : id;
  const description = typeof rawPack.description === "string" ? rawPack.description : "";
  const sprite = isSafeAssetName(rawPack.sprite) ? rawPack.sprite : "sprite.png";
  const preview = isSafeAssetName(rawPack.preview) ? rawPack.preview : "preview.png";
  const frame = {
    width: Number(rawPack.frame?.width) || 768,
    height: Number(rawPack.frame?.height) || 832,
  };
  const columns = Number(rawPack.columns) || 8;
  const states = rawPack.states && typeof rawPack.states === "object" ? rawPack.states : {};
  const automaticActions = Array.isArray(rawPack.automaticActions)
    ? rawPack.automaticActions.filter((stateName) => states[stateName])
    : [];
  const clickActions = Array.isArray(rawPack.clickActions)
    ? rawPack.clickActions.filter((stateName) => states[stateName])
    : [];
  const staticExpressions = Array.isArray(rawPack.staticExpressions)
    ? rawPack.staticExpressions.filter((expression) => expression && states[expression.state])
    : [];

  return {
    id,
    name,
    description,
    frame,
    columns,
    states,
    automaticActions,
    clickActions,
    staticExpressions,
    spritePath: publicAssetPath("characters", folderName, sprite),
    previewPath: publicAssetPath("characters", folderName, preview),
    absoluteSpritePath: path.join(CHARACTERS_DIR, folderName, sprite),
  };
}

function readCharacterPack(folderName) {
  if (!isSafeAssetName(folderName)) return null;
  const manifestPath = path.join(CHARACTERS_DIR, folderName, "character.json");
  try {
    const rawPack = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const pack = normalizeCharacterPack(rawPack, folderName);
    if (!pack.states.idle) return null;
    return pack;
  } catch {
    return null;
  }
}

function listCharacterPacks() {
  try {
    return fs.readdirSync(CHARACTERS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => readCharacterPack(entry.name))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function getCharacterPack(characterId = settings.characterId) {
  const packs = listCharacterPacks();
  return packs.find((pack) => pack.id === characterId) || packs[0] || null;
}

function publicSettings() {
  const { apiKey, ...assistant } = settings.assistant || DEFAULT_SETTINGS.assistant;
  const { apiKey: ttsApiKey, ...tts } = settings.tts || DEFAULT_SETTINGS.tts;
  return {
    ...settings,
    assistant: {
      ...assistant,
      hasApiKey: Boolean(apiKey),
    },
    tts: {
      ...tts,
      hasApiKey: Boolean(ttsApiKey),
    },
  };
}

function appState() {
  return {
    settings: publicSettings(),
    profile,
    characters: listCharacterPacks().map(({ absoluteSpritePath, ...pack }) => pack),
    activeCharacter: (() => {
      const pack = getCharacterPack();
      if (!pack) return null;
      const { absoluteSpritePath, ...publicPack } = pack;
      return publicPack;
    })(),
  };
}

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function profilePath() {
  return path.join(app.getPath("userData"), "profile.json");
}

function readSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    parsed.assistant = {
      ...(parsed.assistant || {}),
      apiKey: readStoredApiKey(parsed.assistant || {}),
    };
    parsed.tts = {
      ...(parsed.tts || {}),
      apiKey: readStoredApiKey(parsed.tts || {}),
    };
    settings = normalizeSettings(parsed);
  } catch {
    settings = normalizeSettings(DEFAULT_SETTINGS);
  }
}

function readProfile() {
  try {
    const parsed = JSON.parse(fs.readFileSync(profilePath(), "utf8"));
    profile = normalizeProfile({ ...DEFAULT_PROFILE, ...parsed });
  } catch {
    profile = { ...DEFAULT_PROFILE };
  }
}

function writeSettings() {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settingsForStorage(), null, 2));
}

function writeProfile() {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(profilePath(), JSON.stringify(profile, null, 2));
}

function readStoredApiKey(rawAssistant) {
  if (typeof rawAssistant.apiKeyEnc === "string" && rawAssistant.apiKeyEnc) {
    try {
      return safeStorage.decryptString(Buffer.from(rawAssistant.apiKeyEnc, "base64")).trim();
    } catch {
      return "";
    }
  }
  return typeof rawAssistant.apiKey === "string" ? rawAssistant.apiKey.trim() : "";
}

function settingsForStorage() {
  const stored = JSON.parse(JSON.stringify(settings));
  encryptStoredApiKey(stored.assistant);
  encryptStoredApiKey(stored.tts);
  return stored;
}

function encryptStoredApiKey(section) {
  if (!section) return;
  const apiKey = section.apiKey;
  delete section.apiKey;
  delete section.apiKeyEnc;
  if (apiKey && safeStorage.isEncryptionAvailable()) {
    section.apiKeyEnc = safeStorage.encryptString(apiKey).toString("base64");
  }
}

function normalizeSettings(nextSettings) {
  nextSettings = nextSettings || {};
  const assistant = normalizeAssistantSettings(nextSettings?.assistant);
  const tts = normalizeTtsSettings(nextSettings?.tts);
  const requestedCharacterId = (
    typeof nextSettings.characterId === "string" && nextSettings.characterId.trim()
      ? nextSettings.characterId.trim()
      : DEFAULT_CHARACTER_ID
  );
  const characterId = getCharacterPack(requestedCharacterId)?.id || DEFAULT_CHARACTER_ID;
  const expressionMode = nextSettings.expressionMode === "clickOnly" ? "clickOnly" : "automatic";
  const scale = nearestScale(Number(nextSettings.scale) || 1);
  const alwaysOnTop = nextSettings.alwaysOnTop !== false;
  const restReminderMinutes = [0, 30, 60].includes(Number(nextSettings.restReminderMinutes))
    ? Number(nextSettings.restReminderMinutes)
    : 0;
  return { characterId, expressionMode, scale, alwaysOnTop, restReminderMinutes, assistant, tts };
}

function normalizeAssistantSettings(rawAssistant = {}) {
  const raw = { ...DEFAULT_SETTINGS.assistant, ...(rawAssistant || {}) };
  const baseUrl = normalizeBaseUrl(raw.baseUrl);
  const model = normalizeCompactText(raw.model, 100);
  const apiKey = typeof raw.apiKey === "string" ? raw.apiKey.trim() : "";
  const temperature = clampNumber(raw.temperature, 0, 2, DEFAULT_SETTINGS.assistant.temperature);
  const maxHistory = Math.round(clampNumber(raw.maxHistory, 2, 30, DEFAULT_SETTINGS.assistant.maxHistory));
  return { baseUrl, model, apiKey, temperature, maxHistory };
}

function normalizeTtsSettings(rawTts = {}) {
  const raw = { ...DEFAULT_SETTINGS.tts, ...(rawTts || {}) };
  const provider = ["none", "system", "gptsovits", "custom"].includes(raw.provider)
    ? raw.provider
    : (raw.enabled === true ? "system" : "none");
  const endpoint = normalizeOptionalUrl(raw.endpoint);
  const apiKey = typeof raw.apiKey === "string" ? raw.apiKey.trim() : "";
  const requestMode = raw.requestMode === "query" ? "query" : "json";
  const textLanguage = normalizeCompactText(raw.textLanguage, 16) || DEFAULT_SETTINGS.tts.textLanguage;
  const promptLanguage = normalizeCompactText(raw.promptLanguage, 16) || DEFAULT_SETTINGS.tts.promptLanguage;
  const promptText = normalizeLongText(raw.promptText, 1000);
  const referenceAudioPath = normalizeLongText(raw.referenceAudioPath, 1000);
  const mediaType = ["wav", "mp3", "ogg"].includes(raw.mediaType) ? raw.mediaType : DEFAULT_SETTINGS.tts.mediaType;
  const customBodyTemplate = normalizeLongText(
    raw.customBodyTemplate,
    4000,
  ) || DEFAULT_SETTINGS.tts.customBodyTemplate;
  return {
    enabled: provider !== "none" && raw.enabled !== false,
    provider,
    voiceName: normalizeCompactText(raw.voiceName, 160),
    rate: clampNumber(raw.rate, 0.5, 1.8, DEFAULT_SETTINGS.tts.rate),
    pitch: clampNumber(raw.pitch, 0.5, 1.8, DEFAULT_SETTINGS.tts.pitch),
    endpoint,
    apiKey,
    requestMode,
    textLanguage,
    promptLanguage,
    promptText,
    referenceAudioPath,
    mediaType,
    customBodyTemplate,
  };
}

function normalizeBaseUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function normalizeOptionalUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeCompactText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeLongText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return clamp(numeric, min, max);
}

function normalizeProfile(nextProfile) {
  const mood = ["calm", "happy", "tired", "annoyed"].includes(nextProfile.mood)
    ? nextProfile.mood
    : "calm";
  const affection = Number(nextProfile.affection);
  const energy = Number(nextProfile.energy);
  return {
    mood,
    affection: clamp(Number.isFinite(affection) ? affection : DEFAULT_PROFILE.affection, 0, 100),
    energy: clamp(Number.isFinite(energy) ? energy : DEFAULT_PROFILE.energy, 0, 100),
    totalInteractions: Math.max(0, Number(nextProfile.totalInteractions) || 0),
    lastInteractionAt: Math.max(0, Number(nextProfile.lastInteractionAt) || 0),
    lastLaunchDate: typeof nextProfile.lastLaunchDate === "string" ? nextProfile.lastLaunchDate : "",
  };
}

function nearestScale(scale) {
  return SIZE_PRESETS.reduce((best, value) => (
    Math.abs(value - scale) < Math.abs(best - scale) ? value : best
  ), 1);
}

function displaySize(scale = settings.scale) {
  return {
    width: Math.max(MIN_BUBBLE_WIDTH, Math.round(BASE_SIZE.width * scale)),
    height: Math.round(BASE_SIZE.height * scale) + BUBBLE_HEIGHT,
  };
}

function applyWindowSize(keepCenter = true) {
  if (!mainWindow) return;
  const nextSize = displaySize();
  const bounds = mainWindow.getBounds();
  const x = keepCenter ? Math.round(bounds.x + bounds.width / 2 - nextSize.width / 2) : bounds.x;
  const y = bounds.y;
  mainWindow.setBounds({ x, y, ...nextSize }, true);
}

function createWindow() {
  readSettings();
  readProfile();
  recordLaunch();
  const size = displaySize();
  const primary = screen.getPrimaryDisplay().workArea;
  mainWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    x: Math.round(primary.x + primary.width - size.width - 72),
    y: Math.round(primary.y + primary.height - size.height - 72),
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#00000000",
    alwaysOnTop: settings.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow.showInactive());
}

function createChatWindow() {
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.show();
    chatWindow.focus();
    return;
  }

  const primary = screen.getPrimaryDisplay().workArea;
  chatWindow = new BrowserWindow({
    width: 360,
    height: 460,
    minWidth: 320,
    minHeight: 360,
    x: Math.round(primary.x + primary.width - 420),
    y: Math.round(primary.y + primary.height - 560),
    title: "Companion Chat",
    show: false,
    backgroundColor: "#f6f7f9",
    alwaysOnTop: settings.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  chatWindow.loadFile(path.join(__dirname, "chat.html"));
  chatWindow.once("ready-to-show", () => chatWindow.show());
  chatWindow.on("closed", () => {
    chatWindow = null;
  });
}

function createQuickChatWindow() {
  if (quickChatWindow && !quickChatWindow.isDestroyed()) {
    quickChatWindow.show();
    quickChatWindow.focus();
    return;
  }

  const primary = screen.getPrimaryDisplay().workArea;
  quickChatWindow = new BrowserWindow({
    width: 380,
    height: 86,
    minWidth: 320,
    minHeight: 76,
    x: Math.round(primary.x + primary.width - 452),
    y: Math.round(primary.y + primary.height - 186),
    title: "Quick Companion Input",
    frame: false,
    resizable: false,
    show: false,
    backgroundColor: "#00000000",
    transparent: true,
    alwaysOnTop: settings.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  quickChatWindow.loadFile(path.join(__dirname, "quick-chat.html"));
  quickChatWindow.once("ready-to-show", () => quickChatWindow.show());
  quickChatWindow.on("closed", () => {
    quickChatWindow = null;
  });
}

function createCompanionSettingsWindow() {
  if (companionSettingsWindow && !companionSettingsWindow.isDestroyed()) {
    companionSettingsWindow.show();
    companionSettingsWindow.focus();
    return;
  }

  companionSettingsWindow = new BrowserWindow({
    width: 620,
    height: 720,
    minWidth: 560,
    minHeight: 620,
    title: "Companion Settings",
    show: false,
    backgroundColor: "#f6f7f9",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  companionSettingsWindow.loadFile(path.join(__dirname, "settings.html"));
  companionSettingsWindow.once("ready-to-show", () => companionSettingsWindow.show());
  companionSettingsWindow.on("closed", () => {
    companionSettingsWindow = null;
  });
}

function updateSettings(patch) {
  const nextSettings = {
    ...settings,
    ...(patch || {}),
    assistant: {
      ...(settings.assistant || DEFAULT_SETTINGS.assistant),
      ...((patch && patch.assistant) || {}),
    },
    tts: {
      ...(settings.tts || DEFAULT_SETTINGS.tts),
      ...((patch && patch.tts) || {}),
    },
  };
  settings = normalizeSettings(nextSettings);
  writeSettings();
  scheduleRestReminder();
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(settings.alwaysOnTop);
    applyWindowSize();
    mainWindow.webContents.send("app-state-updated", appState());
  }
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.setAlwaysOnTop(settings.alwaysOnTop);
    chatWindow.webContents.send("chat-state-updated", chatState());
  }
  if (quickChatWindow && !quickChatWindow.isDestroyed()) {
    quickChatWindow.setAlwaysOnTop(settings.alwaysOnTop);
    quickChatWindow.webContents.send("chat-state-updated", chatState());
  }
  if (companionSettingsWindow && !companionSettingsWindow.isDestroyed()) {
    companionSettingsWindow.webContents.send("chat-state-updated", chatState());
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function recordLaunch() {
  const today = todayKey();
  if (profile.lastLaunchDate !== today) {
    profile.energy = clamp(profile.energy + 15, 0, 100);
    profile.mood = profile.affection >= 45 ? "happy" : "calm";
    profile.lastLaunchDate = today;
    writeProfile();
  }
}

function moodText() {
  const labels = {
    calm: "平静",
    happy: "开心",
    tired: "累了",
    annoyed: "有点烦",
  };
  return labels[profile.mood] || labels.calm;
}

function updateMoodFromInteraction(kind) {
  const now = Date.now();
  const rapid = now - profile.lastInteractionAt < 700;
  profile.totalInteractions += 1;
  profile.lastInteractionAt = now;

  if (kind === "doubleClick") {
    profile.affection = clamp(profile.affection + 3, 0, 100);
    profile.energy = clamp(profile.energy - 4, 0, 100);
    profile.mood = profile.energy < 20 ? "tired" : "happy";
  } else if (kind === "chat") {
    profile.affection = clamp(profile.affection + 1, 0, 100);
    profile.energy = clamp(profile.energy - 1, 0, 100);
    profile.mood = profile.energy < 20 ? "tired" : "happy";
  } else if (kind === "longPress") {
    profile.affection = clamp(profile.affection + 2, 0, 100);
    profile.energy = clamp(profile.energy + 1, 0, 100);
    profile.mood = profile.energy < 20 ? "tired" : "calm";
  } else {
    profile.affection = clamp(profile.affection + (rapid ? 0 : 1), 0, 100);
    profile.energy = clamp(profile.energy - (rapid ? 7 : 2), 0, 100);
    if (rapid) profile.mood = "annoyed";
    else if (profile.energy < 20) profile.mood = "tired";
    else if (profile.affection >= 50) profile.mood = "happy";
    else profile.mood = "calm";
  }

  writeProfile();
  if (mainWindow) {
    mainWindow.webContents.send("app-state-updated", appState());
  }
}

function sendPetMessage(text, action = "waving", options = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("pet-message", { text, action, ...options });
}

function notify(title, body, action) {
  sendPetMessage(body || title, action);
  if (!Notification.isSupported()) return;
  new Notification({ title, body, silent: true }).show();
}

function publicChatConfig() {
  const { apiKey, ...assistant } = settings.assistant || DEFAULT_SETTINGS.assistant;
  const { apiKey: ttsApiKey, ...tts } = settings.tts || DEFAULT_SETTINGS.tts;
  return {
    assistant: {
      ...assistant,
      hasApiKey: Boolean(apiKey),
      canPersistApiKey: safeStorage.isEncryptionAvailable(),
    },
    tts: {
      ...tts,
      hasApiKey: Boolean(ttsApiKey),
      canPersistApiKey: safeStorage.isEncryptionAvailable(),
    },
  };
}

function publicChatHistory() {
  return chatHistory.map((message) => ({ ...message }));
}

function applyChatConfigPatch(patch = {}) {
  const assistantPatch = { ...(patch.assistant || {}) };
  if (assistantPatch.apiKey === undefined) {
    delete assistantPatch.apiKey;
  }
  const ttsPatch = { ...(patch.tts || {}) };
  if (ttsPatch.apiKey === undefined) {
    delete ttsPatch.apiKey;
  }
  if (ttsPatch.provider && ttsPatch.enabled === undefined) {
    ttsPatch.enabled = ttsPatch.provider !== "none";
  }
  const settingsPatch = {
    assistant: assistantPatch,
    tts: ttsPatch,
  };
  updateSettings(settingsPatch);
  return publicChatConfig();
}

function addChatMessage(role, content) {
  const message = {
    role,
    content,
    createdAt: Date.now(),
  };
  chatHistory.push(message);
  if (chatHistory.length > 80) {
    chatHistory = chatHistory.slice(-80);
  }
  return message;
}

function chatState() {
  return {
    config: publicChatConfig(),
    history: publicChatHistory(),
    character: (() => {
      const pack = getCharacterPack();
      return pack ? { id: pack.id, name: pack.name, description: pack.description } : null;
    })(),
  };
}

function cleanUserMessage(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 1200);
}

function compactAssistantReply(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 1600);
}

function llmEndpoint(baseUrl) {
  const cleanBaseUrl = baseUrl.replace(/\/+$/, "");
  return cleanBaseUrl.endsWith("/chat/completions")
    ? cleanBaseUrl
    : `${cleanBaseUrl}/chat/completions`;
}

function activeCharacterStyle() {
  const pack = getCharacterPack();
  if (!pack) return "友好、简洁、适合陪伴工作的桌面伙伴。";
  if (pack.id === "luna") {
    return "礼貌、聪明、稍微傲娇，但不要刻薄；回复自然短句，适合桌宠陪伴。";
  }
  return "友好、轻松、简洁，像一个陪伴工作的桌面伙伴。";
}

function personaInstruction() {
  const pack = getCharacterPack();
  const characterName = pack?.name || "Desktop Pet";
  return [
    `你是 ${characterName}，一个会在桌面上陪人聊天的小角色。`,
    `角色风格：${activeCharacterStyle()}`,
    "默认用中文回答。回复要自然、简短、有陪伴感。",
    "不要主动索要隐私信息。除非对方明确要求，不要输出长篇列表、表格或代码块。",
  ].join("\n");
}

function llmMessagesFor(userText) {
  const maxHistory = settings.assistant.maxHistory || DEFAULT_SETTINGS.assistant.maxHistory;
  const history = chatHistory
    .slice(-maxHistory)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
  return [
    { role: "system", content: personaInstruction() },
    ...history,
    { role: "user", content: userText },
  ];
}

function pickAvailableAction(candidates, fallback = "waving") {
  const states = getCharacterPack()?.states || {};
  return candidates.find((stateName) => states[stateName]) || (states[fallback] ? fallback : "idle");
}

function inferPetAction(userText, replyText) {
  const text = `${userText} ${replyText}`;
  if (/谢谢|感谢|开心|哈哈|喜欢|太好|可爱|棒|好耶|nice/i.test(text)) {
    return pickAvailableAction(["happy", "waving", "jumping"]);
  }
  if (/害羞|脸红|不好意思|嘴硬|傲娇|哼|才不是/i.test(text)) {
    return pickAvailableAction(["tsundereEmbarrassed", "shy", "happy", "waving"]);
  }
  if (/生气|烦|不满|讨厌|笨|错了|失败|坏了|报错/i.test(text)) {
    return pickAvailableAction(["tsundereAnnoyed", "failed", "review"]);
  }
  if (/想一想|为什么|怎么|如何|问题|代码|修|做|分析|解释|\?|\？/i.test(text)) {
    return pickAvailableAction(["review", "tsundereProud", "waving"]);
  }
  return pickAvailableAction(["tsundereProud", "waving", "idle"]);
}

function bubblePreview(text) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();
  return cleanText.length > 180 ? `${cleanText.slice(0, 178)}...` : cleanText;
}

async function requestAssistantReply(userText) {
  const assistant = settings.assistant || DEFAULT_SETTINGS.assistant;
  if (!assistant.baseUrl || !assistant.model) {
    return {
      reply: "还没有配置 LLM。打开聊天窗口里的设置，填入 Base URL 和模型名后就能聊天啦。",
      action: "review",
      ok: false,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const headers = { "Content-Type": "application/json" };
    if (assistant.apiKey) {
      headers.Authorization = `Bearer ${assistant.apiKey}`;
    }
    const response = await fetch(llmEndpoint(assistant.baseUrl), {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: assistant.model,
        messages: llmMessagesFor(userText),
        temperature: assistant.temperature,
        stream: false,
      }),
    });

    if (!response.ok) {
      return {
        reply: `LLM 请求失败了，状态码 ${response.status}。检查一下 Base URL、模型名和 API key。`,
        action: pickAvailableAction(["failed", "review"]),
        ok: false,
      };
    }

    const data = await response.json();
    const reply = compactAssistantReply(data?.choices?.[0]?.message?.content);
    if (!reply) {
      return {
        reply: "服务返回了空回复，换个模型或稍后再试一下。",
        action: pickAvailableAction(["failed", "review"]),
        ok: false,
      };
    }

    return {
      reply,
      action: inferPetAction(userText, reply),
      ok: true,
    };
  } catch (error) {
    const timeoutMessage = error?.name === "AbortError" ? "LLM 请求超时了。" : "LLM 暂时连不上。";
    return {
      reply: `${timeoutMessage} 检查网络、Base URL 或本地模型服务是否启动。`,
      action: pickAvailableAction(["failed", "review"]),
      ok: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendChatMessage(_event, rawText) {
  const text = cleanUserMessage(rawText);
  if (!text) {
    return { ok: false, error: "empty_message", history: publicChatHistory() };
  }

  sendPetMessage("我想一下。", pickAvailableAction(["review", "tsundereProud", "waving"]), { speak: false });
  const result = await requestAssistantReply(text);
  addChatMessage("user", text);
  const assistantMessage = addChatMessage("assistant", result.reply);
  sendPetMessage(result.reply, result.action, {
    speak: true,
    bubbleText: bubblePreview(result.reply),
  });
  updateMoodFromInteraction("chat");
  return {
    ok: result.ok,
    action: result.action,
    message: assistantMessage,
    history: publicChatHistory(),
  };
}

function clearChatHistory() {
  chatHistory = [];
  return publicChatHistory();
}

function ttsEndpoint() {
  const tts = settings.tts || DEFAULT_SETTINGS.tts;
  if (tts.provider === "gptsovits") {
    return tts.endpoint || "http://127.0.0.1:9880/tts";
  }
  return tts.endpoint;
}

function interpolateTemplate(template, text) {
  const escapedText = text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
  return template.replaceAll("{{text}}", escapedText);
}

function gptSovitsPayload(text) {
  const tts = settings.tts || DEFAULT_SETTINGS.tts;
  return {
    text,
    text_lang: tts.textLanguage || "zh",
    ref_audio_path: tts.referenceAudioPath || "",
    prompt_text: tts.promptText || "",
    prompt_lang: tts.promptLanguage || "zh",
    media_type: tts.mediaType || "wav",
    speed_factor: tts.rate || 1,
    streaming_mode: false,
  };
}

function appendQuery(url, params) {
  const nextUrl = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      nextUrl.searchParams.set(key, String(value));
    }
  }
  return nextUrl.toString();
}

function audioContentType(response, provider) {
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("audio/")) return contentType.split(";")[0];
  if (provider === "gptsovits") return `audio/${settings.tts.mediaType || "wav"}`;
  return contentType || "audio/mpeg";
}

async function audioDataFromResponse(response, provider) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json();
    const audioValue = data.audioDataUrl || data.audio_url || data.url || data.audio || data.audio_base64;
    if (!audioValue) return null;
    if (typeof audioValue === "string" && audioValue.startsWith("data:")) {
      return audioValue;
    }
    if (typeof audioValue === "string" && /^https?:\/\//.test(audioValue)) {
      const audioResponse = await fetch(audioValue);
      if (!audioResponse.ok) return null;
      const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
      return `data:${audioContentType(audioResponse, provider)};base64,${audioBuffer.toString("base64")}`;
    }
    if (typeof audioValue === "string") {
      const mediaType = provider === "gptsovits" ? settings.tts.mediaType : "mpeg";
      return `data:audio/${mediaType || "mpeg"};base64,${audioValue}`;
    }
    return null;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) return null;
  return `data:${audioContentType(response, provider)};base64,${buffer.toString("base64")}`;
}

async function synthesizeSpeech(_event, rawText) {
  const text = compactAssistantReply(rawText).slice(0, 800);
  const tts = settings.tts || DEFAULT_SETTINGS.tts;
  if (!text || !tts.enabled || ["none", "system"].includes(tts.provider)) {
    return { ok: false, skipped: true };
  }

  const endpoint = ttsEndpoint();
  if (!endpoint) {
    return { ok: false, error: "missing_tts_endpoint" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const headers = {};
    if (tts.apiKey) headers.Authorization = `Bearer ${tts.apiKey}`;
    let url = endpoint;
    let requestOptions = {
      method: "POST",
      headers,
      signal: controller.signal,
    };

    if (tts.provider === "gptsovits") {
      const payload = gptSovitsPayload(text);
      if (tts.requestMode === "query") {
        url = appendQuery(endpoint, payload);
        requestOptions = { method: "GET", headers, signal: controller.signal };
      } else {
        requestOptions.headers = { ...headers, "Content-Type": "application/json" };
        requestOptions.body = JSON.stringify(payload);
      }
    } else {
      requestOptions.headers = { ...headers, "Content-Type": "application/json" };
      requestOptions.body = interpolateTemplate(tts.customBodyTemplate, text);
    }

    const response = await fetch(url, requestOptions);
    if (!response.ok) return { ok: false, error: `tts_status_${response.status}` };
    const audioDataUrl = await audioDataFromResponse(response, tts.provider);
    if (!audioDataUrl) return { ok: false, error: "empty_audio" };
    return { ok: true, audioDataUrl };
  } catch (error) {
    return { ok: false, error: error?.name === "AbortError" ? "tts_timeout" : "tts_request_failed" };
  } finally {
    clearTimeout(timeout);
  }
}

function showCurrentTime() {
  const time = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  notify("Desktop Pet", `现在是 ${time}`, "waving");
}

function startFocusTimer() {
  clearTimeout(focusTimer);
  notify("专注开始", "25 分钟后提醒你休息。", "review");
  focusTimer = setTimeout(() => {
    notify("专注结束", "可以休息一下了。", "waving");
  }, 25 * 60 * 1000);
}

function scheduleRestReminder() {
  clearInterval(restReminderTimer);
  restReminderTimer = null;
  if (!settings.restReminderMinutes) return;
  restReminderTimer = setInterval(() => {
    notify("休息提醒", "起来走动一下，放松眼睛。", "waving");
  }, settings.restReminderMinutes * 60 * 1000);
}

function showContextMenu() {
  const characterItems = listCharacterPacks().map((character) => ({
    label: character.name,
    type: "radio",
    checked: settings.characterId === character.id,
    click: () => updateSettings({ characterId: character.id }),
  }));

  const scaleItems = SIZE_PRESETS.map((scale) => ({
    label: `${Math.round(scale * 100)}%`,
    type: "radio",
    checked: Math.abs(settings.scale - scale) < 0.01,
    click: () => updateSettings({ scale }),
  }));

  const restReminderItems = [
    { label: "关闭", value: 0 },
    { label: "每 30 分钟", value: 30 },
    { label: "每 60 分钟", value: 60 },
  ].map((item) => ({
    label: item.label,
    type: "radio",
    checked: settings.restReminderMinutes === item.value,
    click: () => updateSettings({ restReminderMinutes: item.value }),
  }));

  const menu = Menu.buildFromTemplate([
    {
      label: "状态",
      submenu: [
        { label: `心情：${moodText()}`, enabled: false },
        { label: `好感：${profile.affection}`, enabled: false },
        { label: `活力：${profile.energy}`, enabled: false },
      ],
    },
    {
      label: "角色",
      enabled: characterItems.length > 0,
      submenu: characterItems,
    },
    {
      label: "表情模式",
      submenu: [
        {
          label: "自动表情",
          type: "radio",
          checked: settings.expressionMode === "automatic",
          click: () => updateSettings({ expressionMode: "automatic" }),
        },
        {
          label: "点击表情",
          type: "radio",
          checked: settings.expressionMode === "clickOnly",
          click: () => updateSettings({ expressionMode: "clickOnly" }),
        },
      ],
    },
    {
      label: "大小",
      submenu: scaleItems,
    },
    {
      label: "总在最前",
      type: "checkbox",
      checked: settings.alwaysOnTop,
      click: (item) => updateSettings({ alwaysOnTop: item.checked }),
    },
    {
      label: "实用",
      submenu: [
        { label: "显示当前时间", click: showCurrentTime },
        { label: "开始 25 分钟专注", click: startFocusTimer },
        {
          label: "休息提醒",
          submenu: restReminderItems,
        },
      ],
    },
    {
      label: "对话",
      submenu: [
        { label: "快速输入", click: createQuickChatWindow },
        { label: "完整聊天", click: createChatWindow },
        { label: "对话设置", click: createCompanionSettingsWindow },
      ],
    },
    { type: "separator" },
    { label: "回到屏幕右下角", click: resetPosition },
    { label: "退出", accelerator: "CommandOrControl+Q", click: () => app.quit() },
  ]);

  menu.popup({ window: mainWindow });
}

function resetPosition() {
  if (!mainWindow) return;
  const size = displaySize();
  const primary = screen.getPrimaryDisplay().workArea;
  mainWindow.setBounds({
    width: size.width,
    height: size.height,
    x: Math.round(primary.x + primary.width - size.width - 72),
    y: Math.round(primary.y + primary.height - size.height - 72),
  }, true);
}

function beginDrag() {
  if (!mainWindow) return;
  dragSnapshot = {
    pointer: screen.getCursorScreenPoint(),
    bounds: mainWindow.getBounds(),
  };
}

function moveDrag() {
  if (!mainWindow || !dragSnapshot) return { dx: 0, dy: 0 };
  const pointer = screen.getCursorScreenPoint();
  const dx = pointer.x - dragSnapshot.pointer.x;
  const dy = pointer.y - dragSnapshot.pointer.y;
  mainWindow.setPosition(
    Math.round(dragSnapshot.bounds.x + dx),
    Math.round(dragSnapshot.bounds.y + dy),
    false,
  );
  return { dx, dy };
}

function endDrag() {
  dragSnapshot = null;
}

function iconImage() {
  const sprite = getCharacterPack()?.absoluteSpritePath || "";
  return nativeImage.createFromPath(sprite).resize({ width: 32, height: 32 });
}

app.whenReady().then(() => {
  app.setName("Desktop Pet");
  createWindow();

  ipcMain.handle("get-app-state", () => appState());
  ipcMain.handle("get-chat-state", () => chatState());
  ipcMain.handle("save-chat-config", (_event, patch) => applyChatConfigPatch(patch));
  ipcMain.handle("send-chat-message", sendChatMessage);
  ipcMain.handle("clear-chat-history", clearChatHistory);
  ipcMain.handle("synthesize-speech", synthesizeSpeech);
  ipcMain.on("set-settings", (_event, patch) => updateSettings(patch));
  ipcMain.on("record-interaction", (_event, kind) => updateMoodFromInteraction(kind));
  ipcMain.on("open-chat-window", createChatWindow);
  ipcMain.on("open-quick-chat-window", createQuickChatWindow);
  ipcMain.on("open-companion-settings", createCompanionSettingsWindow);
  ipcMain.on("show-context-menu", showContextMenu);
  ipcMain.on("drag-start", beginDrag);
  ipcMain.handle("drag-move", moveDrag);
  ipcMain.on("drag-end", endDrag);

  if (process.platform === "darwin") {
    app.dock.hide();
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "Desktop Pet",
      submenu: [
        { label: "快速输入", accelerator: "CommandOrControl+Shift+Space", click: createQuickChatWindow },
        { label: "完整聊天", accelerator: "CommandOrControl+Shift+C", click: createChatWindow },
        { label: "对话设置", click: createCompanionSettingsWindow },
        { type: "separator" },
        { label: "退出", accelerator: "CommandOrControl+Q", click: () => app.quit() },
      ],
    },
  ]));

  try {
    mainWindow.setIcon?.(iconImage());
  } catch {
    // Window icons are platform-dependent; failing to set one should not block the pet.
  }

  scheduleRestReminder();
});

app.on("window-all-closed", () => app.quit());
