const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPet } = require("./pet-helpers");

test("startup and character changes draw idle immediately and keep animating", async () => {
  const pet = loadPet();
  for (const id of ["first", "second"]) {
    pet.run(`applyAppState({activeCharacter:{...FALLBACK_CHARACTER,id:"${id}",spritePath:"${id}.png"},settings:{expressionMode:"automatic"}})`);
    pet.images.at(-1).events.load();
    await Promise.resolve();
    assert.equal(pet.draws.at(-1), `${id}.png`);
    assert.equal(pet.intervals.size, 1);
    [...pet.intervals.values()][0]();
    assert.equal(pet.run("frameIndex"), 1);
  }
});

test("a stale sprite load cannot overwrite the selected character", async () => {
  const pet = loadPet();
  for (const id of ["first", "second"]) pet.run(`applyAppState({activeCharacter:{...FALLBACK_CHARACTER,id:"${id}",spritePath:"${id}.png"},settings:{expressionMode:"automatic"}})`);
  pet.images[1].events.load();
  await Promise.resolve();
  pet.images[0].events.load();
  await Promise.resolve();
  assert.equal(pet.run("spriteImage.src"), "second.png");
  assert.equal(pet.draws.at(-1), "second.png");
  assert.equal(pet.intervals.size, 1);
});

test("click-only mode advances on the first click and ignores automatic reactions", () => {
  const pet = loadPet();
  pet.run('settings.expressionMode = "clickOnly"; resetAfterSettingsChange()');
  pet.run("handleClick()");
  assert.equal(pet.run("frameIndex"), 1);
  pet.run('handlePetMessage({text:"Time",action:"waving",speak:false})');
  for (const fn of [...pet.timeouts.values(), ...pet.intervals.values()]) fn();
  assert.equal(pet.run("state"), "idle");
  assert.equal(pet.run("frameIndex"), 1);
  pet.run('dragStart = {time:performance.now()-1000}; endDrag({detail:1})');
  assert.equal(pet.run("frameIndex"), 1);
  pet.run("handleDoubleClick()");
  assert.equal(pet.run("frameIndex"), 1);
});

test("switching expression modes invalidates temporary animation callbacks", () => {
  const pet = loadPet();
  pet.run('playTemporary("waving")');
  const oldCallback = [...pet.timeouts.values()][0];
  pet.run('settings.expressionMode = "clickOnly"; resetAfterSettingsChange(); handleClick()');
  oldCallback();
  assert.equal(pet.run("frameIndex"), 1);
});

test("turning voice off ignores late synthesis and stops current audio", async () => {
  let resolve;
  const pet = loadPet({ synthesizeSpeech: () => new Promise((done) => { resolve = done; }) });
  pet.run('settings.tts = {enabled:true,provider:"custom"}');
  const pending = pet.run('speakText("Reply")');
  pet.run('applyAppState({settings:{tts:{enabled:false,provider:"none"}}})');
  resolve({ ok: true, audioDataUrl: "first" });
  await pending;
  assert.equal(pet.audio.length, 0);
  pet.run('settings.tts = {enabled:true,provider:"custom"}');
  const playing = pet.run('speakText("Reply")');
  resolve({ ok: true, audioDataUrl: "second" });
  await playing;
  assert.equal(pet.audio[0].played, true);
  pet.run('applyAppState({settings:{tts:{enabled:false,provider:"none"}}})');
  assert.equal(pet.audio[0].paused, true);
});

test("newer speech wins and clearing chat stops audio", async () => {
  const pending = [];
  const pet = loadPet({ synthesizeSpeech: () => new Promise((resolve) => pending.push(resolve)) });
  pet.run('settings.tts = {enabled:true,provider:"custom"}');
  const first = pet.run('speakText("First")');
  const second = pet.run('speakText("Second")');
  pending[1]({ ok: true, audioDataUrl: "second" });
  await second;
  pending[0]({ ok: true, audioDataUrl: "first" });
  await first;
  assert.equal(pet.audio.length, 1);
  assert.equal(pet.audio[0].src, "second");
  pet.run("handlePetMessage({clear:true})");
  assert.equal(pet.audio[0].paused, true);
});

test("voice IPC failures do not reject the pet message handler", async () => {
  const pet = loadPet({ synthesizeSpeech: async () => { throw new Error("Service stopped"); } });
  pet.run('settings.tts = {enabled:true,provider:"custom"}');
  await pet.run('speakText("Reply")');
  assert.equal(pet.audio.length, 0);
});

test("late drag responses cannot restart movement after pointer release", async () => {
  let finish;
  const pet = loadPet({ dragMove: () => new Promise((resolve) => { finish = resolve; }) });
  pet.run('settings.expressionMode = "clickOnly"; resetAfterSettingsChange(); beginDrag({button:0,screenX:0,screenY:0})');
  const pending = [...pet.intervals.values()].at(-1)();
  pet.run("endDrag({detail:1})");
  finish({ dx: 30, dy: 0 });
  await pending;
  assert.equal(pet.run("state"), "idle");
  assert.equal(pet.run("frameIndex"), 1);
});
