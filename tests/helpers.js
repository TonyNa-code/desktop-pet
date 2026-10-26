const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const i18n = require("../src/i18n");

const sourceDir = path.join(__dirname, "..", "src");

function loadMain(overrides = {}) {
  const writes = new Map();
  const context = vm.createContext({
    require(id) {
      if (id === "electron") return {
        app: {
          whenReady: () => ({ then() {} }), on() {}, getLocale: () => "en-US",
          getPath: () => "test-user-data",
          setName() {}, requestSingleInstanceLock: () => true, quit() {}, ...overrides.app,
        },
        safeStorage: {
          isEncryptionAvailable: () => true,
          getSelectedStorageBackend: () => "gnome_libsecret",
          encryptString: (value) => Buffer.from(value),
          decryptString: (value) => value.toString(),
          ...overrides.safeStorage,
        },
        Menu: { buildFromTemplate: (menu) => menu, setApplicationMenu() {} },
        screen: overrides.screen,
        Tray: overrides.Tray,
        nativeImage: overrides.nativeImage,
      };
      if (id === "./i18n") return i18n;
      if (id === "node:fs") return {
        ...fs, mkdirSync() {}, writeFileSync: (file, data) => writes.set(file, data),
        renameSync: (from, to) => { writes.set(to, writes.get(from)); writes.delete(from); },
        readFileSync: (file, encoding) => writes.has(file) ? writes.get(file) : fs.readFileSync(file, encoding),
        ...overrides.fs,
      };
      if (id.startsWith("./")) return require(path.join(sourceDir, id));
      return require(id);
    },
    __dirname: sourceDir,
    process: { platform: overrides.platform || process.platform },
    Buffer, URL, AbortController, console,
    setTimeout: overrides.setTimeout || setTimeout,
    clearTimeout: overrides.clearTimeout || clearTimeout,
    setInterval, clearInterval,
    fetch: overrides.fetch || (() => { throw new Error("Unexpected network request"); }),
  });
  vm.runInContext(fs.readFileSync(path.join(sourceDir, "main.js"), "utf8"), context);
  return { context, writes, run: (code) => vm.runInContext(code, context) };
}

function loadRenderer(file, api = {}, htmlFile = file.replace(/\.js$/, ".html")) {
  const nodes = new Map();
  const formIds = new Set();
  const html = fs.readFileSync(path.join(sourceDir, htmlFile), "utf8");
  for (const match of html.matchAll(/<(?:input|textarea|select)\b[^>]*\bid="([^"]+)"/g)) {
    formIds.add(`#${match[1]}`);
  }
  function element() {
    return {
      value: "", textContent: "", disabled: false, checked: false, dataset: {}, events: {},
      children: [], append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; },
      focus() {}, blur() {}, remove() {}, setAttribute() {}, classList: { toggle() {}, add() {}, remove() {} },
      querySelector() { return element(); },
      addEventListener(name, callback) {
        const previous = this.events[name];
        this.events[name] = previous ? (...args) => { previous(...args); return callback(...args); } : callback;
      },
    };
  }
  const document = {
    body: element(),
    documentElement: {},
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, element());
      return nodes.get(selector);
    },
    querySelectorAll(selector) {
      return selector === "input, textarea, select"
        ? [...formIds].map((id) => this.querySelector(id)) : [];
    },
    createElement: element,
  };
  const context = vm.createContext({
    document, console, Intl, Date, Event,
    window: {
      DesktopPetI18n: i18n,
      DesktopPetValidation: require("../src/config-validation"),
      DesktopPetLlmPresets: require("../src/llm-presets"),
      addEventListener() {}, dispatchEvent() {}, close() {},
      desktopPet: { getChatState: () => new Promise(() => {}), onChatStateUpdated() {},
        setChatDraft() {}, onChatDraftUpdated() {}, onAppQuitRequested() {}, confirmAppQuit() {}, ...api },
    },
  });
  if (["chat.js", "quick-chat.js", "companion-input.js"].includes(file)) {
    vm.runInContext(fs.readFileSync(path.join(sourceDir, "chat-draft.js"), "utf8"), context);
  }
  vm.runInContext(fs.readFileSync(path.join(sourceDir, file), "utf8"), context);
  return { context, nodes, run: (code) => vm.runInContext(code, context) };
}

module.exports = { loadMain, loadRenderer };
