const { app, BrowserWindow, Menu, ipcMain, screen, nativeImage, Notification } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const BASE_SIZE = { width: 192, height: 208 };
const BUBBLE_HEIGHT = 46;
const DEFAULT_CHARACTER_ID = "default";
const CHARACTERS_DIR = path.join(__dirname, "..", "assets", "characters");
const SIZE_PRESETS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const DEFAULT_SETTINGS = {
  characterId: DEFAULT_CHARACTER_ID,
  expressionMode: "automatic",
  scale: 1,
  alwaysOnTop: true,
  restReminderMinutes: 0,
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
let settings = { ...DEFAULT_SETTINGS };
let profile = { ...DEFAULT_PROFILE };
let dragSnapshot = null;
let restReminderTimer = null;
let focusTimer = null;

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

function appState() {
  return {
    settings,
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
    settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...parsed });
  } catch {
    settings = { ...DEFAULT_SETTINGS };
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
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}

function writeProfile() {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(profilePath(), JSON.stringify(profile, null, 2));
}

function normalizeSettings(nextSettings) {
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
  return { characterId, expressionMode, scale, alwaysOnTop, restReminderMinutes };
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
    width: Math.round(BASE_SIZE.width * scale),
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

function updateSettings(patch) {
  settings = normalizeSettings({ ...settings, ...patch });
  writeSettings();
  scheduleRestReminder();
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(settings.alwaysOnTop);
    applyWindowSize();
    mainWindow.webContents.send("app-state-updated", appState());
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

function sendPetMessage(text, action = "waving") {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("pet-message", { text, action });
}

function notify(title, body, action) {
  sendPetMessage(body || title, action);
  if (!Notification.isSupported()) return;
  new Notification({ title, body, silent: true }).show();
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
  ipcMain.on("set-settings", (_event, patch) => updateSettings(patch));
  ipcMain.on("record-interaction", (_event, kind) => updateMoodFromInteraction(kind));
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
