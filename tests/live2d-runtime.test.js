const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { loadMain } = require("./helpers");
const { loadPet } = require("./pet-helpers");

test("vendored display bundles match the pinned upstream releases and omit Core/models", () => {
  for (const [name, hash] of Object.entries({
    "pixi.min.js": "403f2f2ee8145fa17f60c5c89403056efe2680e5096ec2762036486914ed19c5",
    "cubism4.min.js": "af1267e6d52759b245766c578d905bfa025b532d5c3cc727c370957c4409e21b",
  })) {
    assert.equal(createHash("sha256").update(fs.readFileSync(path.join(__dirname, "../src/live2d/vendor", name))).digest("hex"), hash);
  }
  assert.equal(fs.readdirSync(path.join(__dirname, "../src/live2d/vendor")).some((name) => /core|\.moc3$|\.png$/i.test(name)), false);
});

test("model expression mappings and gaze normalize without enabling affection or voice", () => {
  const app = loadMain();
  const state = app.run('normalizeSettings({persona:{live2dGaze:false,live2dExpressions:{happy:0,shy:63,review:64,failed:"1"}}})');
  assert.equal(state.persona.live2dGaze, false);
  assert.deepEqual(JSON.parse(JSON.stringify(state.persona.live2dExpressions)), { happy: 0, shy: 63, review: -1, failed: -1 });
  assert.equal(state.affection.enabled, false);
  assert.equal(state.tts.enabled, false);
});

test("Live2D click-only advances once without scheduling sprite actions or network calls", () => {
  const pet = loadPet();
  pet.run(`globalThis.modelCalls=[]; window.DesktopPetModel={apply(){},expression(){},stopMouth(){},busy(){},cycle(){modelCalls.push("cycle")}};
    applyAppState({settings:{expressionMode:"clickOnly"},activeCharacter:{id:"imported-fixture",type:"live2d",states:{idle:{row:0,frames:1,interval:1000}}}});
    handleClick(); handleDoubleClick(); handleLongPress(); scheduleIdleBehavior();`);
  assert.deepEqual(JSON.parse(pet.run('JSON.stringify(modelCalls)')), ["cycle"]);
});

test("partner touch phrases are opt-in, local and leave affection unchanged", () => {
  const pet = loadPet();
  pet.run('settings.persona = {relationship:"partner"}; settings.userName="Alex"; respondToInteraction("head")');
  assert.match(pet.run('speechBubble.textContent'), /Alex/);
  assert.equal(pet.run('speechBubble.textContent.includes("pet.interaction.")'), false);
});
