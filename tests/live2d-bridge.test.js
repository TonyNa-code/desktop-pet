const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup() {
  const events = {};
  const sent = [];
  const stage = { replaceChildren() {} };
  const status = { addEventListener() {} };
  const frame = { setAttribute() {}, remove() {}, contentWindow: { postMessage: message => sent.push(message) } };
  let resume;
  let connections = 0;
  const context = vm.createContext({
    document: { querySelector: selector => selector === "#model-stage" ? stage : status, createElement: () => frame },
    window: { DesktopPetI18n: { t: key => key }, addEventListener: (event, callback) => { events[event] = callback; },
      desktopPet: { getLive2DRuntime: async () => ({ ready: true }), onModelAction: callback => { events.action = callback; } } },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    AudioContext: class {
      resume() { return new Promise(resolve => { resume = resolve; }); }
      createMediaElementSource() { connections++; return { connect() {}, disconnect() {} }; }
      createAnalyser() { return { connect() {}, disconnect() {} }; }
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/live2d-bridge.js"), "utf8"), context);
  return { api: context.window.DesktopPetModel, sent, events, connections: () => connections,
    resume: () => resume(),
    message: (type, extra = {}) => events.message({ source: frame.contentWindow, origin: "pet-live2d://viewer", data: { channel: "desktop-pet-model", type, ...extra } }) };
}

test("model readiness replays only the latest expression and current attention", async () => {
  const ui = setup();
  await ui.api.apply({ id: "sample", type: "live2d" }, { expressionMode: "automatic" });
  ui.api.expression(1); ui.api.expression(4); ui.api.presence("thinking"); ui.api.cycle();
  assert.equal(ui.sent.length, 0);
  ui.message("boot"); ui.message("loaded");
  assert.deepEqual(ui.sent.map(message => message.type), ["load", "options", "expression", "presence"]);
  assert.equal(ui.sent.find(message => message.type === "expression").index, 4);
  assert.equal(ui.sent.at(-1).state, "thinking");
});

test("hit queries accept only known regions and are cancelled on replacement or character switch", async () => {
  const ui = setup();
  await ui.api.apply({ id: "sample", type: "live2d" }, { expressionMode: "automatic" });
  ui.message("boot"); ui.message("loaded");
  let first = ui.api.locate(0.5, 0.2);
  ui.message("location", { request: ui.sent.at(-1).request, kind: "head" });
  assert.equal(await first, "head");
  first = ui.api.locate(0.5, 0.2);
  const second = ui.api.locate(0.5, 0.8);
  assert.equal(await first, null);
  ui.message("location", { request: ui.sent.at(-1).request, kind: "unknown" });
  assert.equal(await second, null);
  const pending = ui.api.locate(0.5, 0.2);
  await ui.api.apply({ id: "sprite" }, {});
  assert.equal(await pending, null);
});

test("drag interruption and quiet-idle settings survive ordinary state broadcasts", async () => {
  const ui = setup();
  const character = { id: "sample", type: "live2d" };
  const settings = { expressionMode: "automatic", persona: { live2dIdle: false, live2dTouches: { head: { expression: 1 } } } };
  await ui.api.apply(character, settings); ui.message("boot"); ui.message("loaded");
  ui.api.dragging(true);
  await ui.api.apply(character, settings);
  assert.equal(ui.sent.at(-1).dragging, true);
  assert.equal(ui.sent.at(-1).idle, false);
  assert.equal(ui.sent.at(-1).touches.head.expression, 1);
  ui.api.dragging(false);
  assert.equal(ui.sent.at(-1).dragging, false);
});

test("stopping or switching characters during audio resume cannot reconnect old speech", async () => {
  for (const switchCharacter of [false, true]) {
    const ui = setup();
    await ui.api.apply({ id: "sample", type: "live2d" }, { expressionMode: "automatic" });
    const pending = ui.api.attachAudio({ paused: false });
    if (switchCharacter) await ui.api.apply({ id: "sprite" }, {});
    else ui.api.stopMouth();
    ui.resume(); await pending;
    assert.equal(ui.connections(), 0);
  }
});
