const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPet } = require("./pet-helpers");
const { loadMain } = require("./helpers");
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("pin persists through chunks and completion but not a new reply or cleared conversation", () => {
  const pet = loadPet();
  pet.run('handlePetMessage({source:"chat",presentationId:1,text:"First",streaming:true,speak:false})');
  pet.nodes.get("#bubble-pin").events.click();
  pet.run('handlePetMessage({source:"chat",presentationId:1,text:"First reply",speak:false})');
  assert.equal(pet.run("bubblePinned"), true);
  assert.equal(pet.timeouts.has(pet.run("bubbleTimer")), false);
  assert.equal(pet.nodes.get("#bubble-pin").attributes["aria-pressed"], "true");
  pet.run('handlePetMessage({text:"Reminder",speak:false})');
  assert.equal(pet.bubble.textContent, "First reply");
  pet.run('handlePetMessage({source:"chat",presentationId:2,text:"Next reply",speak:false})');
  assert.equal(pet.run("bubblePinned"), false);
  assert.equal(pet.timeouts.has(pet.run("bubbleTimer")), true);
  pet.nodes.get("#bubble-pin").events.click();
  pet.run('clearPresentation()');
  assert.equal(pet.run("bubblePinned"), false);
  assert.equal(pet.card.hidden, true);
  assert.equal(pet.bubble.textContent, "");
});

test("closing a stream suppresses later chunks and speech without hiding the next reply", () => {
  let stops = 0;
  const pet = loadPet({ stopVoice: () => stops++ });
  pet.run('handlePetMessage({source:"chat",presentationId:10,text:"Thinking",streaming:true,speak:false})');
  pet.run('handlePetMessage({text:"Queued notice",speak:false})');
  pet.nodes.get("#bubble-dismiss").events.click();
  assert.equal(pet.card.hidden, true);
  assert.equal(pet.run("queuedNotice"), null);
  assert.equal(stops, 1);
  for (const streaming of [true, false]) {
    pet.run(`handlePetMessage({source:"chat",presentationId:10,text:"Finished",streaming:${streaming}})`);
    assert.equal(pet.card.hidden, true);
    assert.equal(pet.run("speechActive"), false);
  }
  pet.run('handlePetMessage({source:"chat",presentationId:11,text:"New reply",speak:false})');
  assert.equal(pet.card.hidden, false);
  assert.equal(pet.bubble.textContent, "New reply");
});

test("keyboard focus keeps a bubble open even after the pointer leaves; Escape closes it", () => {
  const pet = loadPet();
  pet.run('showBubble("Read me")');
  pet.card.events.mouseenter();
  pet.card.events.focusin({ target: { matches: () => true } });
  pet.card.events.mouseleave();
  assert.equal(pet.timeouts.has(pet.run("bubbleTimer")), false);
  pet.card.events.focusout({ relatedTarget: null });
  assert.equal(pet.timeouts.has(pet.run("bubbleTimer")), true);
  let prevented = false;
  pet.card.events.keydown({ key: "Escape", preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(pet.card.hidden, true);
});

test("mouse focus does not keep an unpinned reply open after the pointer leaves", () => {
  const pet = loadPet();
  pet.run('handlePetMessage({source:"chat",presentationId:1,text:"Reply",speak:false,pinned:true})');
  pet.card.events.mouseenter();
  pet.card.events.focusin({ target: { matches: () => true } });
  pet.card.events.pointerdown();
  pet.card.events.focusin({ target: { matches: () => false } });
  pet.nodes.get("#bubble-pin").events.click();
  pet.card.events.mouseleave();
  assert.equal(pet.run("bubblePinned || bubbleFocused"), false);
  assert.equal(pet.timeouts.has(pet.run("bubbleTimer")), true);
  pet.fireTimer(pet.run("bubbleTimer"));
  assert.equal(pet.card.hidden, true);
});

test("reply, history and recall controls are separate and labels are translated", () => {
  const calls = [];
  const pet = loadPet({ openQuickChatWindow: () => calls.push("quick"), openChatWindow: () => calls.push("history"), showLastReply: () => calls.push("recall") });
  assert.equal(pet.bubble.events.click, undefined);
  for (const language of ["en-US", "zh-CN", "ja-JP"]) {
    pet.run(`activeLanguage = ${JSON.stringify(language)}; updateBubbleControls()`);
    for (const id of ["bubble-reply", "bubble-history", "bubble-pin", "bubble-dismiss", "last-reply"]) {
      const node = pet.nodes.get(`#${id}`);
      assert.ok(node.title);
      assert.doesNotMatch(node.title, /pet\./);
      assert.equal(node.attributes["aria-label"], node.title);
    }
  }
  for (const id of ["bubble-reply", "bubble-history", "last-reply"]) pet.nodes.get(`#${id}`).events.click();
  assert.deepEqual(calls, ["quick", "history", "recall"]);
});

test("an old initial state cannot reenable recall during a newer request", async () => {
  let initial;
  let update;
  const pet = loadPet({ getChatState: () => new Promise((resolve) => { initial = resolve; }), onChatStateUpdated: (fn) => { update = fn; } });
  update({ canShowLastReply: false });
  initial({ canShowLastReply: true });
  await settle();
  assert.equal(pet.nodes.get("#last-reply").disabled, true);
  update({ canShowLastReply: true });
  assert.equal(pet.nodes.get("#last-reply").disabled, false);
});

test("recall reads only completed replies without network calls, speech, history or profile changes", () => {
  const app = loadMain({ fetch: () => { throw new Error("Unexpected network request"); } });
  app.run(`
    settings = normalizeSettings({});
    globalThis.events = [];
    mainWindow = {isDestroyed:()=>false,webContents:{send:(topic,state)=>events.push({topic,state})}};
    chatHistory = [{role:"assistant",content:"Last reply"},{role:"assistant",content:"Failed",failed:true}];
  `);
  const before = JSON.stringify(app.run("({chatHistory, profile, settings})"));
  assert.equal(app.run("chatState().canShowLastReply"), true);
  app.run("showLastReply()");
  const message = app.run('events.find((event)=>event.topic === "pet-message").state');
  assert.equal(message.text, "Last reply");
  assert.equal(message.speak, false);
  assert.equal(message.pinned, true);
  assert.equal(message.presentationId, 1);
  assert.equal(JSON.stringify(app.run("({chatHistory, profile, settings})")), before);
  app.run('chatRequest = {}; showLastReply(); chatRequest = null; speechSession = {}; showLastReply(); speechSession = null');
  assert.equal(app.run("events.length"), 1);
  app.run('mainWindow = null; updateSettings({characterId:"luna"})');
  assert.equal(app.run("chatState().canShowLastReply"), false);
});

test("thinking, stream and final messages share an id while successive requests have distinct ids", async () => {
  const app = loadMain();
  app.run(`
    settings = normalizeSettings({});
    globalThis.events = [];
    mainWindow = {isDestroyed:()=>false,webContents:{send:(topic,state)=>events.push({topic,state})}};
    requestAssistantReply = async (_text, _controller, progress) => {
      progress("Partial", "idle");
      return {ok:true,reply:"Complete",action:"idle"};
    };
  `);
  await app.run('sendChatMessage(null,"First")');
  await app.run('sendChatMessage(null,"Second")');
  assert.deepEqual(Array.from(app.run('events.filter((event)=>event.topic === "pet-message").map((event)=>event.state.presentationId)')), [1, 1, 1, 2, 2, 2]);
});

test("bubble controls never change a manually selected expression", () => {
  const pet = loadPet();
  pet.run('settings.expressionMode = "clickOnly"; resetAfterSettingsChange(); handleClick()');
  pet.run('handlePetMessage({source:"chat",presentationId:1,text:"Reply",action:"review",speak:false,pinned:true})');
  pet.nodes.get("#bubble-pin").events.click();
  pet.nodes.get("#bubble-dismiss").events.click();
  assert.equal(pet.run("state"), "idle");
  assert.equal(pet.run("frameIndex"), 1);
});

test("bubble speaker follows the configured character name and safely renders it as text", () => {
  const pet = loadPet();
  pet.run('applyAppState({settings:{persona:{name:"<b>Custom name</b>"}}})');
  assert.equal(pet.nodes.get("#bubble-speaker").textContent, "<b>Custom name</b>");
  assert.equal(pet.bubble.attributes["aria-label"], "<b>Custom name</b>");
});
