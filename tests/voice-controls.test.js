const test = require("node:test");
const assert = require("node:assert/strict");
const { loadMain, loadRenderer } = require("./helpers");
const { loadPet } = require("./pet-helpers");
const { splitSpeechText } = require("../src/speech-text");
const settle = () => new Promise((resolve) => setImmediate(resolve));

function voiceApp(overrides = {}) {
  const app = loadMain(overrides);
  app.run(`
    settings = normalizeSettings({tts:{enabled:true,provider:"custom",endpoint:"https://voice.example/tts"}});
    globalThis.events = [];
    mainWindow = {isDestroyed:()=>false,webContents:{send:(topic,state)=>events.push({topic,state})}};
    globalThis.petEvent = {sender:mainWindow.webContents};
  `);
  return app;
}

test("speech chunks retain every character, punctuation and astral code point in long multilingual replies", () => {
  for (const text of ["Hello there. ".repeat(260), "今日は静かですね。\n".repeat(120), "一起听首歌吧！".repeat(300), "\u{1F600}".repeat(1700), "a".repeat(2100)]) {
    for (const limit of [400, 800]) {
      const chunks = splitSpeechText(text, limit);
      assert.ok(chunks.length > 1);
      assert.equal(chunks.join(""), text.trim());
      assert.ok(chunks.every((chunk) => Array.from(chunk).length <= limit));
      assert.ok(chunks.every((chunk) => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u.test(chunk)));
    }
  }
  assert.deepEqual(splitSpeechText("  "), []);
});

test("only the current pet playback can begin, report state and request synthesis", async () => {
  const app = voiceApp();
  assert.equal(app.run('beginSpeech({sender:{}},speechGeneration)'), null);
  assert.equal(app.run('beginSpeech(petEvent,speechGeneration - 1)'), null);
  const id = app.run('beginSpeech(petEvent,speechGeneration)');
  assert.equal(app.run('chatState().voice.status'), "preparing");
  app.run(`speechStateChanged({sender:{}},{id:${id},status:"playing"})`);
  assert.equal(app.run('chatState().voice.status'), "preparing");
  app.run(`speechStateChanged(petEvent,{id:${id},status:"playing"})`);
  assert.equal(app.run('chatState().voice.status'), "playing");
  assert.equal((await app.run(`synthesizeSpeech({sender:{}},{id:${id},text:"hello"})`)).cancelled, true);
  assert.equal((await app.run(`synthesizeSpeech(petEvent,{id:${id + 1},text:"hello"})`)).cancelled, true);
  assert.equal((await app.run(`synthesizeSpeech(petEvent,{id:${id},text:"x".repeat(801)})`)).cancelled, true);
  app.run('stopVoice()');
  assert.equal(app.run('beginSpeech(petEvent,0)'), null);
});

test("stopping voice aborts an in-flight request and late callbacks cannot mark a newer session failed", async () => {
  let signal;
  const app = voiceApp({ fetch: (_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
  } });
  app.run('beginSpeech(petEvent,speechGeneration)');
  const request = app.run('synthesizeSpeech(petEvent,{id:speechSession.id,text:"hello"})');
  app.run('stopVoice(); beginSpeech(petEvent,speechGeneration); speechStateChanged(petEvent,{id:1,status:"error"})');
  assert.equal(signal.aborted, true);
  assert.equal((await request).cancelled, true);
  assert.equal(app.run('chatState().voice.status'), "preparing");
  assert.equal(app.run('chatState().voiceError'), false);
});

test("a cancelled audio URL download also aborts without leaking the voice credential", async () => {
  const requests = [];
  const app = voiceApp({ fetch: async (url, options) => {
    requests.push({ url, options });
    if (requests.length === 1) return Response.json({ audio_url: "https://voice.example/file.wav" });
    return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
  } });
  app.run('settings.tts.apiKey = "test-only-key"; beginSpeech(petEvent,speechGeneration)');
  const pending = app.run('synthesizeSpeech(petEvent,{id:speechSession.id,text:"hello"})');
  await settle();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.headers, undefined);
  app.run('stopVoice()');
  assert.equal(requests[1].options.signal.aborted, true);
  assert.equal((await pending).cancelled, true);
});

test("a synthesis timeout remains an error, not a user cancellation", async () => {
  let expire;
  const app = voiceApp({ setTimeout: (fn) => { expire = fn; }, clearTimeout() {}, fetch: (_url, { signal }) =>
    new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))) });
  app.run('beginSpeech(petEvent,speechGeneration)');
  const pending = app.run('synthesizeSpeech(petEvent,{id:speechSession.id,text:"hello"})');
  expire();
  assert.equal((await pending).error, "tts_timeout");
});

test("a new message cancels previous speech before requesting its reply", async () => {
  let voiceSignal;
  const app = voiceApp({ fetch: async (url, { signal }) => {
    if (url.includes("voice.example")) {
      voiceSignal = signal;
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
    }
    assert.equal(voiceSignal.aborted, true);
    return Response.json({ choices: [{ message: { content: "Next answer" } }] });
  } });
  app.run('settings.assistant = {baseUrl:"https://llm.example/v1",model:"test"}; beginSpeech(petEvent,speechGeneration)');
  const pending = app.run('synthesizeSpeech(petEvent,{id:speechSession.id,text:"hello"})');
  assert.equal((await app.run('sendChatMessage(null,"Next message")')).ok, true);
  assert.equal((await pending).cancelled, true);
});

test("character changes, clearing history and voice configuration changes cancel pending synthesis", async () => {
  for (const change of ['updateSettings({characterId:"luna"})', 'clearChatHistory()', 'updateSettings({tts:{enabled:false}})', 'updateSettings({tts:{endpoint:"https://next.example/tts"}})']) {
    let signal;
    const app = voiceApp({ fetch: (_url, options) => {
      signal = options.signal;
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
    } });
    app.run('chatHistory = [{role:"assistant",content:"Old reply"}]; beginSpeech(petEvent,speechGeneration)');
    const request = app.run('synthesizeSpeech(petEvent,{id:speechSession.id,text:"hello"})');
    app.run(`mainWindow = null; ${change}`);
    assert.equal(signal.aborted, true);
    assert.equal((await request).cancelled, true);
    assert.equal(app.run('chatState().voice.status'), "idle");
    assert.equal(app.run('chatState().voice.canReplay'), change.includes("next.example"));
  }
});

test("replay uses only this character's successful reply, without another model request or affection change", () => {
  const app = voiceApp();
  assert.equal(app.run('chatState().voice.canReplay'), false);
  app.run('chatHistory = [{role:"assistant",content:"Successful reply"},{role:"assistant",content:"Failure",failed:true}]');
  const profile = JSON.stringify(app.run("profile"));
  app.run('replaySpeech(); replaySpeech()');
  assert.equal(app.run('events.filter((event)=>event.topic === "pet-message").length'), 1);
  assert.equal(app.run('events.find((event)=>event.topic === "pet-message").state.text'), "Successful reply");
  assert.equal(JSON.stringify(app.run("profile")), profile);
  app.run('stopVoice(); clearChatHistory()');
  assert.equal(app.run('chatState().voice.canReplay'), false);
  app.run('chatHistory = [{role:"assistant",content:"Old character"}]; settings.tts.enabled = false');
  assert.equal(app.run('chatState().voice.canReplay'), false);
});

test("external speech plays every segment and stopping prevents all remaining segments", async () => {
  for (const stop of [false, true]) {
    const chunks = [];
    const pet = loadPet({ synthesizeSpeech: async ({ text }) => { chunks.push(text); return { ok: true, audioDataUrl: "audio" }; } });
    pet.run('settings.tts = {enabled:true,provider:"custom"}; settings.expressionMode = "clickOnly"; frameIndex = 2');
    await pet.run('speakText("a".repeat(1700))');
    assert.equal(chunks.length, 1);
    const end = pet.audio[0].onended;
    if (stop) pet.run('stopSpeech()');
    end();
    await settle();
    if (stop) assert.equal(chunks.length, 1);
    else {
      pet.audio[1].onended();
      await settle();
      pet.audio[2].onended();
      assert.equal(chunks.join(""), "a".repeat(1700));
      assert.equal(pet.run("speechActive"), false);
    }
    assert.equal(pet.run("frameIndex"), 2);
  }
});

test("system voice reads past the former 500-character limit", async () => {
  const pet = loadPet();
  const utterances = [];
  pet.context.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  pet.context.window.speechSynthesis = { cancel() {}, getVoices: () => [], speak: (item) => utterances.push(item) };
  pet.run('settings.tts = {enabled:true,provider:"system"}');
  await pet.run('speakText("a".repeat(1700))');
  for (let i = 0; i < utterances.length; i++) utterances[i].onend();
  assert.equal(utterances.map((item) => item.text).join(""), "a".repeat(1700));
  assert.equal(utterances.length, 5);
  assert.equal(pet.run("speechActive"), false);
});

test("stopping while begin-speech is pending releases the late session without synthesizing", async () => {
  let begin;
  const changes = [];
  const pet = loadPet({ beginSpeech: () => new Promise((resolve) => { begin = resolve; }),
    speechStateChanged: (state) => changes.push(state), synthesizeSpeech: () => { throw new Error("Must not synthesize"); } });
  pet.run('settings.tts = {enabled:true,provider:"custom"}');
  const pending = pet.run('speakText("Late reply")');
  pet.run('stopSpeech()');
  begin(42);
  await pending;
  assert.equal(changes.length, 1);
  assert.equal(changes[0].id, 42);
  assert.equal(changes[0].status, "idle");
});

test("shared controls follow preparing, playing, replay and disabled states in all three languages", async () => {
  let update;
  let stops = 0;
  let replays = 0;
  const ui = loadRenderer("voice-controls.js", {
    onChatStateUpdated: (fn) => { update = fn; }, stopVoice: async () => stops++, replaySpeech: async () => replays++,
  }, "chat.html");
  for (const language of ["en-US", "zh-CN", "ja-JP"]) {
    for (const status of ["preparing", "playing"]) {
      update({ resolvedLanguage: language, voice: { enabled: true, status } });
      assert.equal(ui.nodes.get("#voice-controls").hidden, false);
      assert.equal(ui.nodes.get("#voice-toggle").disabled, false);
      assert.doesNotMatch(ui.nodes.get("#voice-status").textContent, /voice\./);
      await ui.nodes.get("#voice-toggle").events.click();
    }
    update({ resolvedLanguage: language, voice: { enabled: true, status: "idle", canReplay: true } });
    await ui.nodes.get("#voice-toggle").events.click();
    update({ voice: { enabled: false, status: "idle", canReplay: false } });
    assert.equal(ui.nodes.get("#voice-controls").hidden, true);
  }
  assert.equal(stops, 6);
  assert.equal(replays, 3);
});

test("an older initial state cannot overwrite a newer playback broadcast", async () => {
  let initial;
  let update;
  const ui = loadRenderer("voice-controls.js", {
    getChatState: () => new Promise((resolve) => { initial = resolve; }), onChatStateUpdated: (fn) => { update = fn; },
  }, "quick-chat.html");
  update({ voice: { enabled: true, status: "playing" } });
  initial({ voice: { enabled: false, status: "idle" } });
  await settle();
  assert.equal(ui.nodes.get("#voice-controls").hidden, false);
});

test("voice-only updates preserve message nodes and a reader's scroll position", () => {
  const ui = loadRenderer("chat.js");
  ui.run('applyChatState({history:[{role:"assistant",content:"Keep selected text"}],voice:{status:"preparing"}})');
  const messages = ui.nodes.get("#messages");
  const first = messages.children[0];
  messages.scrollTop = 42;
  ui.run('applyChatState({history:[{role:"assistant",content:"Keep selected text"}],voice:{status:"playing"}})');
  assert.equal(messages.children.length, 1);
  assert.equal(messages.children[0], first);
  assert.equal(messages.scrollTop, 42);
});
