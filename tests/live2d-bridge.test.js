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
    message: type => events.message({ source: frame.contentWindow, origin: "pet-live2d://viewer", data: { channel: "desktop-pet-model", type } }) };
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
