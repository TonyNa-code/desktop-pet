const { app, BrowserWindow, Menu, ipcMain, screen, nativeImage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const BASE_SIZE = { width: 192, height: 208 };
const SIZE_PRESETS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const DEFAULT_SETTINGS = {
  expressionMode: "automatic",
  scale: 1,
  alwaysOnTop: true,
};

let mainWindow;
let settings = { ...DEFAULT_SETTINGS };
let dragSnapshot = null;

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
  const expressionMode = nextSettings.expressionMode === "clickOnly" ? "clickOnly" : "automatic";
  const scale = nearestScale(Number(nextSettings.scale) || 1);
  const alwaysOnTop = nextSettings.alwaysOnTop !== false;
  return { expressionMode, scale, alwaysOnTop };
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
    mainWindow.webContents.send("settings-updated", settings);
  }
}

function showContextMenu() {
  const scaleItems = SIZE_PRESETS.map((scale) => ({
    label: `${Math.round(scale * 100)}%`,
    type: "radio",
    checked: Math.abs(settings.scale - scale) < 0.01,
    click: () => updateSettings({ scale }),
  }));

  const menu = Menu.buildFromTemplate([
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
  const sprite = path.join(__dirname, "..", "assets", "sprites", "default-character-sprite.png");
  return nativeImage.createFromPath(sprite).resize({ width: 32, height: 32 });
}

app.whenReady().then(() => {
  app.setName("Desktop Pet");
  createWindow();

  ipcMain.handle("get-settings", () => settings);
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
