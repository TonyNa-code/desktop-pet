const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const i18n = require("../src/i18n");

function loadPet(api = {}) {
  const intervals = new Map();
  const timeouts = new Map();
  const durations = new Map();
  const images = [];
  const draws = [];
  const audio = [];
  const events = {};
  let timerId = 0;
  const nodes = new Map();
  for (const id of ["speech-bubble", "speech-card", "bubble-speaker", "bubble-reply", "bubble-history", "bubble-pin", "bubble-dismiss", "last-reply", "talk", "pet-menu"]) {
    nodes.set(`#${id}`, { textContent: "", events: {}, attributes: {},
      addEventListener(name, fn) { this.events[name] = fn; },
      setAttribute(name, value) { this.attributes[name] = value; },
      contains(node) { return node === this; }, focus() {}, classList: { add() {}, remove() {} } });
  }
  const bubble = nodes.get("#speech-bubble");
  const card = nodes.get("#speech-card");
  const canvas = {
    width: 768, height: 832, classList: { add() {}, remove() {} },
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 192, height: 208 }),
    addEventListener(name, handler) { events[name] = handler; },
    getContext: () => ({ clearRect() {}, drawImage: (image) => draws.push(image.src) }),
  };
  class Image {
    constructor() { this.events = {}; images.push(this); }
    addEventListener(name, handler) { this.events[name] = handler; }
  }
  class Audio {
    constructor(src) { this.src = src; this.played = false; this.paused = false; audio.push(this); }
    play() { this.played = true; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const window = {
    DesktopPetI18n: i18n,
    DesktopPetSpeechText: require("../src/speech-text"),
    desktopPet: { getAppState: () => new Promise(() => {}), onAppStateUpdated() {}, onPetMessage() {},
      getChatState: () => new Promise(() => {}), onChatStateUpdated() {},
      recordInteraction() {}, dragStart() {}, dragEnd() {}, beginSpeech: async () => 1,
      speechStateChanged() {}, onSpeechStopped() {}, openChatWindow() {}, openQuickChatWindow() {},
      stopVoice() {}, showLastReply() {}, showContextMenu() {}, ...api },
    addEventListener(name, handler) { events[name] = handler; },
    setInterval(fn) { intervals.set(++timerId, fn); return timerId; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(fn, duration) { timeouts.set(++timerId, fn); durations.set(timerId, duration); return timerId; },
    clearTimeout(id) { timeouts.delete(id); },
  };
  const context = vm.createContext({
    window, Image, Audio, console, performance,
    document: { querySelector: (selector) => selector === "#pet" ? canvas : nodes.get(selector),
      documentElement: { style: { setProperty() {} } } },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/renderer.js"), "utf8"), context);
  return { context, intervals, timeouts, durations, images, draws, audio, bubble, card, nodes, events,
    fireTimer(id) { const fn = timeouts.get(id); timeouts.delete(id); fn?.(); },
    run: (code) => vm.runInContext(code, context) };
}

module.exports = { loadPet };
