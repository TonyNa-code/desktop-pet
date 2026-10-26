const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const rig = require("../src/live2d/rig");

async function viewer() {
  const events = {}, updates = {}, messages = [], motions = [], values = {}, expressions = [];
  let now = 100, stops = 0;
  let alpha = 255;
  const internal = { width: 100, height: 200,
    coreModel: { getModel: () => ({ parameters: { ids: ["PARAM_ANGLE_Z", "PARAM_MOUTH_OPEN_Y"] } }),
      setParameterValueById: (id, value) => { values[id] = value; }, addParameterValueById: (id, value) => { values[id] = value; } },
    breath: { getParameters: () => [] },
    motionManager: { groups: {}, stopAllMotions: () => { stops++; }, on: (name, callback) => { events[name] = callback; },
      expressionManager: { defaultExpression: {}, resetExpression: () => expressions.push(-1),
        setExpression: async index => { expressions.push(index); return true; } } },
    hitAreas: { Head: {}, Body: {} },
    focusController: { focus() {} }, on: (event, callback) => { updates[event] = callback; },
  };
  const model = { internalModel: internal, scale: { set() {} }, anchor: { set() {} }, position: { set() {} },
    destroy() {}, update() {}, motion: async (group, index) => { motions.push({ group, index }); return true; },
    hitTest: (x, y) => x < 10 ? [] : y < 150 ? ["Head", "Body"] : ["Body"] };
  const parent = { postMessage: message => messages.push(message) };
  const context = vm.createContext({ parent, innerWidth: 200, innerHeight: 400, devicePixelRatio: 1,
    performance: { now: () => now },
    document: { hidden: false, querySelector: () => ({ width: 200, height: 400 }), addEventListener: (name, callback) => { events[name] = callback; } },
    window: { Live2DCubismCore: {}, DesktopPetRig: { ...rig, measure: () => ({ width: 100, height: 200 }) },
      addEventListener: (name, callback) => { events[name] = callback; } },
    fetch: async () => ({ json: async () => ({ FileReferences: { Expressions: [{ Name: "Smile" }, { Name: "Blush" }], Motions: { Tap: [{}, {}], Idle: [{}] } } }) }),
    PIXI: { Application: class {
      constructor() {
        this.renderer = { resize() {}, gl: { readPixels: (x, y, w, h, format, type, pixel) => { pixel[3] = alpha; } } };
        this.stage = { addChild() {} }; this.ticker = { add() {}, stop() {}, start() {} };
      }
    }, live2d: { Live2DModel: { from: async () => model } } },
  });
  context.window.PIXI = context.PIXI;
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/live2d/viewer.js"), "utf8"), context);
  const send = (type, extra = {}) => events.message({ source: parent, origin: "null",
    data: { channel: "desktop-pet-model", id: "imported-123456789012345678901234", type, ...extra } });
  send("load"); await new Promise(resolve => setImmediate(resolve));
  assert.ok(messages.some(message => message.type === "loaded"));
  return { send, motions, values, messages, expressions, events, context, stops: () => stops,
    setAlpha: value => { alpha = value; }, internal, model,
    advance: milliseconds => { now += milliseconds; }, tick: () => updates.beforeModelUpdate() };
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

const flush = () => new Promise(resolve => setImmediate(resolve));

test("head pats ease in and out, do not stack, and restore the previous expression", async () => {
  const ui = await viewer();
  ui.send("expression", { index: 0 }); await flush();
  ui.send("options", { touches: { head: { expression: 1 } } });
  ui.send("touch", { kind: "head" }); await flush();
  assert.equal(ui.expressions.at(-1), 1);
  ui.tick(); assert.ok(Math.abs(ui.values.PARAM_ANGLE_Z) < 0.001);
  ui.advance(1100); ui.tick(); assert.equal(ui.values.PARAM_ANGLE_Z, -5);
  ui.send("touch", { kind: "head" });
  assert.equal(ui.messages.filter(message => message.type === "touch").length, 1);
  ui.advance(1100); ui.tick(); await flush();
  assert.equal(ui.expressions.at(-1), 0);
  assert.ok(Math.abs(ui.values.PARAM_ANGLE_Z) < 0.001);
});

test("touch expressions cannot overwrite a newer reply, drag or manual selection", async () => {
  for (const interrupt of ["expression", "drag", "manual", "presence"]) {
    const ui = await viewer();
    ui.send("options", { touches: { head: { expression: 1 } } });
    ui.send("touch", { kind: "head" }); await flush();
    if (interrupt === "expression") ui.send("expression", { index: 0 });
    if (interrupt === "drag") ui.send("options", { dragging: true });
    if (interrupt === "manual") ui.send("options", { automatic: false });
    if (interrupt === "presence") ui.send("presence", { state: "attentive" });
    await flush();
    const count = ui.expressions.length;
    ui.advance(5000); ui.tick(); await flush();
    assert.equal(ui.expressions.length, count);
    assert.equal(ui.expressions.at(-1), interrupt === "expression" ? 0 : -1);
  }
});

test("body touches use their own motion, while quiet idle never suppresses requested gestures", async () => {
  const ui = await viewer();
  ui.send("options", { idle: false, touches: { greet: { motion: { group: "Tap", index: 1 } } } });
  ui.advance(90000); ui.tick(); assert.equal(ui.motions.length, 0);
  ui.send("touch", { kind: "greet" }); ui.tick();
  assert.deepEqual(ui.motions, [{ group: "Tap", index: 1 }]);
  assert.equal(ui.values.PARAM_ANGLE_Z, undefined, "native gestures have no additional artificial tilt");
  ui.send("options", { idle: true }); ui.advance(60000); ui.tick();
  assert.equal(ui.motions.at(-1).group, "Idle");
});

test("hit tests prefer native head areas and reject blank or malformed coordinates", async () => {
  const ui = await viewer();
  for (const [x, y, kind] of [[0.5, 0.2, "head"], [0.5, 0.8, "greet"], [0, 0, null], [NaN, 0, null], [1, 1, null]]) {
    ui.send("locate", { x, y, request: 1 });
    assert.equal(ui.messages.at(-1).kind, kind);
  }
  ui.setAlpha(0); ui.send("locate", { x: 0.5, y: 0.2, request: 2 });
  assert.equal(ui.messages.at(-1).kind, null, "transparent pixels inside native bounds do not react");
  ui.setAlpha(255);
  ui.internal.hitAreas = { localized: { id: "HitAreaHead" } };
  ui.model.hitTest = () => ["localized"];
  ui.send("locate", { x: 0.5, y: 0.2, request: 3 });
  assert.equal(ui.messages.at(-1).kind, "head", "drawable IDs resolve non-English names");
  ui.internal.hitAreas = {};
  ui.send("locate", { x: 0.5, y: 0.8, request: 4 });
  assert.equal(ui.messages.at(-1).kind, "greet", "models without native areas use visible fallback regions");
});

test("hiding cancels transient gestures and resuming never launches a queued idle motion", async () => {
  const ui = await viewer();
  ui.send("options", { touches: { head: { expression: 1 } } });
  ui.send("touch", { kind: "head" }); await flush();
  ui.context.document.hidden = true; ui.events.visibilitychange(); await flush();
  assert.equal(ui.expressions.at(-1), -1);
  ui.advance(120000);
  ui.context.document.hidden = false; ui.events.visibilitychange(); ui.tick();
  assert.equal(ui.motions.length, 0);
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
