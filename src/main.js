const { app, BrowserWindow, Menu, ipcMain, screen, nativeImage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const BASE_SIZE = { width: 192, height: 208 };
const DEFAULT_CHARACTER_ID = "default";
const CHARACTERS_DIR = path.join(__dirname, "..", "assets", "characters");
const SIZE_PRESETS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const DEFAULT_SETTINGS = {
  characterId: DEFAULT_CHARACTER_ID,
  expressionMode: "automatic",
  scale: 1,
  alwaysOnTop: true,
};

let mainWindow;
let settings = { ...DEFAULT_SETTINGS };
let dragSnapshot = null;

function isSafeAssetName(value) {
  return (
    typeof value === "string"
    && value.length > 0
    && !path.isAbsolute(value)
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
  const automaticActions = Array.isArray(rawPack.automaticActions) ? rawPack.automaticActions : [];
  const clickActions = Array.isArray(rawPack.clickActions) ? rawPack.clickActions : [];
  const staticExpressions = Array.isArray(rawPack.staticExpressions) ? rawPack.staticExpressions : [];

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

function readSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...parsed });
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
}

function writeSettings() {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
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
  return { characterId, expressionMode, scale, alwaysOnTop };
}

function nearestScale(scale) {
  return SIZE_PRESETS.reduce((best, value) => (
    Math.abs(value - scale) < Math.abs(best - scale) ? value : best
  ), 1);
}

function displaySize(scale = settings.scale) {
  return {
    width: Math.round(BASE_SIZE.width * scale),
    height: Math.round(BASE_SIZE.height * scale),
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
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(settings.alwaysOnTop);
    applyWindowSize();
    mainWindow.webContents.send("app-state-updated", appState());
  }
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

  const menu = Menu.buildFromTemplate([
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
});

app.on("window-all-closed", () => app.quit());
