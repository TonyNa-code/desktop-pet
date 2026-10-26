const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const rig = require("../src/live2d/rig");

async function viewer() {
  const events = {}, updates = {}, messages = [], motions = [], values = {};
  let now = 100, stops = 0;
  const internal = { width: 100, height: 200,
    coreModel: { getModel: () => ({ parameters: { ids: ["PARAM_ANGLE_Z", "PARAM_MOUTH_OPEN_Y"] } }),
      setParameterValueById: (id, value) => { values[id] = value; }, addParameterValueById() {} },
    breath: { getParameters: () => [] },
    motionManager: { groups: {}, stopAllMotions: () => { stops++; } },
    focusController: { focus() {} }, on: (event, callback) => { updates[event] = callback; },
  };
  const model = { internalModel: internal, scale: { set() {} }, anchor: { set() {} }, position: { set() {} },
    destroy() {}, update() {}, motion: async (group, index) => { motions.push({ group, index }); return true; } };
  const parent = { postMessage: message => messages.push(message) };
  const context = vm.createContext({ parent, innerWidth: 200, innerHeight: 400, devicePixelRatio: 1,
    performance: { now: () => now },
    document: { querySelector: () => ({}), addEventListener() {} },
    window: { Live2DCubismCore: {}, DesktopPetRig: { ...rig, measure: () => ({ width: 100, height: 200 }) },
      addEventListener: (name, callback) => { events[name] = callback; } },
    fetch: async () => ({ json: async () => ({ FileReferences: { Motions: { Tap: [{}, {}] } } }) }),
    PIXI: { Application: class {
      constructor() { this.renderer = { resize() {} }; this.stage = { addChild() {} }; this.ticker = { add() {} }; }
    }, live2d: { Live2DModel: { from: async () => model } } },
  });
  context.window.PIXI = context.PIXI;
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/live2d/viewer.js"), "utf8"), context);
  const send = (type, extra = {}) => events.message({ source: parent, origin: "null",
    data: { channel: "desktop-pet-model", id: "imported-123456789012345678901234", type, ...extra } });
  send("load"); await new Promise(resolve => setImmediate(resolve));
  assert.ok(messages.some(message => message.type === "loaded"));
  return { send, motions, values, stops: () => stops, advance: milliseconds => { now += milliseconds; }, tick: () => updates.beforeModelUpdate() };
}

test("reply gestures are bounded and unavailable in click-only mode", async () => {
  const ui = await viewer();
  ui.send("reply-motion", { group: "Missing", index: 0 });
  ui.send("reply-motion", { group: "Tap", index: 0 });
  ui.send("reply-motion", { group: "Tap", index: 1 });
  assert.equal(ui.motions.length, 1);
  ui.advance(12000); ui.send("reply-motion", { group: "Tap", index: 1 });
  assert.equal(ui.motions.length, 2);
  ui.send("options", { automatic: false });
  ui.advance(12000); ui.send("reply-motion", { group: "Tap", index: 0 });
  assert.equal(ui.motions.length, 2);
});

test("speech preserves a reply gesture while the next user request interrupts it", async () => {
  const ui = await viewer();
  ui.send("presence", { state: "thinking" });
  ui.send("reply-motion", { group: "Tap", index: 0 });
  const before = ui.stops();
  ui.send("presence", { state: "speaking" });
  assert.equal(ui.stops(), before);
  ui.send("presence", { state: "thinking" });
  assert.equal(ui.stops(), before + 1);
});

test("legacy mouth IDs animate without a LipSync group and settle after audio stops", async () => {
  const ui = await viewer();
  ui.send("mouth", { value: 1 });
  for (let i = 0; i < 10; i++) ui.tick();
  assert.ok(ui.values.PARAM_MOUTH_OPEN_Y > 0.8);
  ui.advance(400);
  for (let i = 0; i < 30; i++) ui.tick();
  assert.equal(ui.values.PARAM_MOUTH_OPEN_Y, 0);
});
