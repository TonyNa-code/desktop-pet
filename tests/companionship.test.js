const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPet } = require("./pet-helpers");
const { loadMain, loadRenderer } = require("./helpers");

test("thinking and reply gestures hold through streaming instead of reverting to idle", () => {
  const pet = loadPet();
  pet.run('playTemporary("waving")');
  const staleGesture = [...pet.timeouts.values()][0];
  pet.run('handlePetMessage({source:"chat",text:"Thinking",action:"review",streaming:true,speak:false})');
  staleGesture();
  pet.events.pointerenter();
  assert.equal(pet.run("state"), "review");
  assert.equal(pet.run("conversationActive"), true);
  for (let i = 0; i < 20; i++) [...pet.intervals.values()][0]();
  assert.equal(pet.run("frameIndex"), 5);
  pet.run('handlePetMessage({source:"chat",text:"Hello",action:"waving",streaming:true,speak:false})');
  pet.run('handlePetMessage({source:"chat",text:"Hello there",streaming:true,speak:false})');
  assert.equal(pet.run("state"), "waving");
  assert.equal(pet.timeouts.has(pet.run("bubbleTimer")), false);
  pet.run('handlePetMessage({source:"chat",text:"Hello there",action:"waving",speak:false})');
  assert.equal(pet.run("state"), "waving");
  pet.fireTimer(pet.run("bubbleTimer"));
  assert.equal(pet.run("state"), "idle");
  assert.equal(pet.run("conversationActive"), false);
});

test("reminders wait for the conversation, coalesce and only then show a native notice", () => {
  const notices = [];
  const pet = loadPet({ presentNotification: (notice) => notices.push(notice) });
  pet.run('handlePetMessage({source:"chat",text:"Still answering",action:"review",streaming:true,speak:false})');
  for (const text of ["First reminder", "Latest reminder"]) {
    pet.run(`handlePetMessage({text:${JSON.stringify(text)},action:"waving",speak:false,notification:{title:"Reminder"}})`);
  }
  assert.equal(pet.bubble.textContent, "Still answering");
  assert.equal(pet.run("bubbleStreaming"), true);
  assert.equal(notices.length, 0);
  pet.run('handlePetMessage({source:"chat",text:"Finished",action:"review",speak:false})');
  pet.fireTimer(pet.run("bubbleTimer"));
  assert.equal(pet.bubble.textContent, "Latest reminder");
  assert.equal(notices.length, 1);
});

test("outdated reminders and reminders from a cleared conversation are discarded", () => {
  const notices = [];
  const pet = loadPet({ presentNotification: (notice) => notices.push(notice) });
  for (const clear of [false, true]) {
    pet.run('handlePetMessage({source:"chat",text:"Reply",action:"review",speak:false})');
    pet.run('handlePetMessage({text:"Reminder",notification:{title:"Reminder"},speak:false})');
    if (clear) pet.run('handlePetMessage({clear:true})');
    else { pet.run("queuedNotice.expiresAt = 0"); pet.fireTimer(pet.run("bubbleTimer")); }
    assert.equal(pet.run("queuedNotice"), null);
    assert.equal(notices.length, 0);
  }
});

test("synthesis and playback both hold the bubble until audio ends", async () => {
  let resolve;
  const pet = loadPet({ synthesizeSpeech: () => new Promise((done) => { resolve = done; }) });
  pet.run('settings.tts = {enabled:true,provider:"custom"}; handlePetMessage({source:"chat",text:"Reply",action:"review"})');
  pet.card.events.mouseleave();
  assert.equal(pet.run("speechActive"), true);
  assert.equal(pet.timeouts.has(pet.run("bubbleTimer")), false);
  await new Promise((done) => setImmediate(done));
  resolve({ ok: true, audioDataUrl: "audio" });
  await new Promise((done) => setImmediate(done));
  assert.equal(pet.audio[0].played, true);
  assert.equal(pet.timeouts.has(pet.run("bubbleTimer")), false);
  assert.equal(pet.run("state"), "review");
  pet.audio[0].onended();
  assert.equal(pet.run("speechActive"), false);
  assert.equal(pet.run("bubbleVisible"), true);
  assert.equal(pet.timeouts.has(pet.run("bubbleTimer")), true);
  pet.fireTimer(pet.run("bubbleTimer"));
  assert.equal(pet.run("bubbleVisible"), false);
});

test("voice errors preserve the text reply and release the presentation hold", async () => {
  let errors = 0;
  const pet = loadPet({ synthesizeSpeech: async () => ({ ok: false }), speechStateChanged: ({ status }) => { if (status === "error") errors++; } });
  pet.run('settings.tts = {enabled:true,provider:"custom"}; handlePetMessage({source:"chat",text:"Keep this reply",action:"review"})');
  await new Promise((done) => setImmediate(done));
  assert.equal(errors, 1);
  assert.equal(pet.bubble.textContent, "Keep this reply");
  assert.equal(pet.run("speechActive"), false);
  assert.equal(pet.timeouts.has(pet.run("bubbleTimer")), true);
});

test("audio from an interrupted answer cannot finish a newer conversation", async () => {
  const pet = loadPet({ synthesizeSpeech: async () => ({ ok: true, audioDataUrl: "audio" }) });
  pet.run('settings.tts = {enabled:true,provider:"custom"}; handlePetMessage({source:"chat",text:"Old reply",action:"waving"})');
  await new Promise((done) => setImmediate(done));
  const oldEnd = pet.audio[0].onended;
  pet.run('handlePetMessage({source:"chat",text:"New reply",action:"review",streaming:true,speak:false})');
  oldEnd();
  assert.equal(pet.audio[0].paused, true);
  assert.equal(pet.bubble.textContent, "New reply");
  assert.equal(pet.run("state"), "review");
  assert.equal(pet.timeouts.has(pet.run("bubbleTimer")), false);
});

test("system speech completion and watchdog release the bubble", async () => {
  for (const useWatchdog of [false, true]) {
    const pet = loadPet();
    let utterance;
    pet.context.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    pet.context.window.speechSynthesis = { cancel() {}, getVoices: () => [], speak: (value) => { utterance = value; } };
    pet.run('settings.tts = {enabled:true,provider:"system"}; handlePetMessage({source:"chat",text:"Spoken reply",action:"review"})');
    assert.equal(pet.run("speechActive"), true);
    await new Promise((done) => setImmediate(done));
    if (useWatchdog) pet.fireTimer(pet.run("speechWatchdog"));
    else utterance.onend();
    assert.equal(pet.run("speechActive"), false);
    assert.equal(pet.timeouts.has(pet.run("bubbleTimer")), true);
  }
});

test("dragging and explicit gestures return to the conversational expression", () => {
  const pet = loadPet();
  pet.run('handlePetMessage({source:"chat",text:"Reply",action:"review",streaming:true,speak:false}); playTemporary("waving")');
  pet.fireTimer([...pet.timeouts.keys()].at(-1));
  assert.equal(pet.run("state"), "review");
  pet.run('dragStart = {time:performance.now()}; didDrag = true; setState("running"); endDrag({detail:1})');
  assert.equal(pet.run("state"), "review");
});

test("chat lifecycle never changes a click-only expression", () => {
  const pet = loadPet();
  pet.run('settings.expressionMode = "clickOnly"; resetAfterSettingsChange(); handleClick()');
  pet.run('handlePetMessage({source:"chat",text:"Reply",action:"review",streaming:true,speak:false})');
  pet.run('handlePetMessage({source:"chat",text:"Reply",action:"review",speak:false})');
  pet.fireTimer(pet.run("bubbleTimer"));
  pet.run('handlePetMessage({clear:true})');
  assert.equal(pet.run("state"), "idle");
  assert.equal(pet.run("frameIndex"), 1);
});

test("unmarked or invalid expressions fall back to neutral even with emotional keywords", async () => {
  for (const reply of ["I'm not happy either.", "[expression:unknown] 我今天不开心", "嬉しくないです"]) {
    const app = loadMain({ fetch: async () => Response.json({ choices: [{ message: { content: reply } }] }) });
    app.run('settings = normalizeSettings({characterId:"luna",assistant:{baseUrl:"https://example.test/v1",model:"test"}})');
    const result = await app.run('sendChatMessage(null,"我今天不开心")');
    assert.equal(result.action, "idle");
  }
});

test("preferred names and relationships normalize safely and migrate without opting in", () => {
  const app = loadMain();
  const original = app.run('normalizePersonaSettings({name:"Original",background:"Keep me"})');
  assert.equal(original.relationship, "default");
  assert.equal(original.userName, "");
  assert.equal(original.background, "Keep me");
  const normalized = app.run('normalizePersonaSettings({userName:" a\\n b ",relationship:"unknown",customRelationship:"x".repeat(900)})');
  assert.equal(normalized.userName, "a b");
  assert.equal(normalized.relationship, "default");
  assert.equal(normalized.customRelationship.length, 600);
});

test("relationship settings enter the prompt in all languages, independently of affection", () => {
  const app = loadMain();
  for (const language of ["en-US", "zh-CN", "ja-JP"]) {
    app.run(`settings = normalizeSettings({language:${JSON.stringify(language)},persona:{userName:"Alex",relationship:"partner"}})`);
    const prompt = app.run("personaInstruction()");
    assert.match(prompt, /Alex/);
    assert.doesNotMatch(prompt, /prompt\.relationship|undefined/);
    assert.equal(app.run("settings.affection.enabled"), false);
    app.run('settings.persona.relationship = "custom"; settings.persona.customRelationship = "Old school friends"');
    assert.match(app.run("personaInstruction()"), /Old school friends/);
    app.run('settings.persona.relationship = "friend"');
    assert.doesNotMatch(app.run("personaInstruction()"), /Old school friends/);
  }
});

test("preferred names and relationships remain isolated between characters", () => {
  const app = loadMain();
  app.run('settings = normalizeSettings({}); updateSettings({persona:{userName:"Alex",relationship:"partner"}}); updateSettings({characterId:"luna"})');
  assert.equal(app.run("settings.persona.userName"), "");
  assert.equal(app.run("settings.persona.relationship"), "default");
  app.run('updateSettings({persona:{userName:"Friend",relationship:"friend"}}); updateSettings({characterId:"default"})');
  assert.equal(app.run("settings.persona.userName"), "Alex");
  assert.equal(app.run("settings.persona.relationship"), "partner");
});

test("relationship form and unsaved custom details survive background updates", () => {
  const ui = loadRenderer("settings.js");
  ui.run('applyChatState({config:{characterId:"default",persona:{userName:"Alex",relationship:"partner"}}})');
  assert.equal(ui.nodes.get("#persona-user-name").value, "Alex");
  assert.equal(ui.nodes.get("#custom-relationship-row").hidden, true);
  ui.nodes.get("#persona-relationship").value = "custom";
  ui.nodes.get("#persona-custom-relationship").value = "Childhood friends";
  ui.nodes.get("#persona-relationship").events.change();
  assert.equal(ui.nodes.get("#custom-relationship-row").hidden, false);
  ui.run('applyChatState({config:{characterId:"default",persona:{userName:"Alex",relationship:"partner"}},busy:true})');
  assert.equal(ui.nodes.get("#custom-relationship-row").hidden, false);
  assert.equal(ui.run("readConfigForm().persona.customRelationship"), "Childhood friends");
  assert.equal(ui.run("readConfigForm().persona.relationship"), "custom");
});
