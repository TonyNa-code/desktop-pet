const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const i18n = require("../src/i18n");

function loadPet(api = {}) {
  const intervals = new Map();
  const timeouts = new Map();
  const images = [];
  const draws = [];
  const audio = [];
  const events = {};
  let timerId = 0;
  const bubble = { textContent: "", classList: { add() {}, remove() {} } };
  const canvas = {
    width: 768, height: 832, classList: { add() {}, remove() {} },
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
    desktopPet: { getAppState: () => new Promise(() => {}), onAppStateUpdated() {}, onPetMessage() {},
      recordInteraction() {}, dragStart() {}, dragEnd() {}, ...api },
    addEventListener(name, handler) { events[name] = handler; },
    setInterval(fn) { intervals.set(++timerId, fn); return timerId; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(fn) { timeouts.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timeouts.delete(id); },
  };
  const context = vm.createContext({
    window, Image, Audio, console, performance,
    document: { querySelector: (selector) => selector === "#pet" ? canvas : bubble,
      documentElement: { style: { setProperty() {} } } },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/renderer.js"), "utf8"), context);
  return { context, intervals, timeouts, images, draws, audio, bubble, events,
    run: (code) => vm.runInContext(code, context) };
}

module.exports = { loadPet };
