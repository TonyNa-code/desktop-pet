const test = require("node:test");
const assert = require("node:assert/strict");
const { loadMain } = require("./helpers");

test("first-run defaults disable voice and experimental affection", () => {
  const app = loadMain();
  const settings = app.run("normalizeSettings({})");
  assert.equal(settings.tts.enabled, false);
  assert.equal(settings.tts.provider, "none");
  assert.equal(settings.affection.enabled, false);
  assert.equal(settings.expressionMode, "automatic");
  assert.equal(settings.scale, 1);
});

test("invalid settings fall back to usable values and supported sizes", () => {
  const app = loadMain();
  const settings = app.run('normalizeSettings({characterId:"missing",scale:100,expressionMode:"invalid",restReminderMinutes:4,assistant:{baseUrl:"file:///invalid",temperature:99,maxHistory:0},tts:{provider:"invalid",rate:99}})');
  assert.equal(settings.characterId, "default");
  assert.equal(settings.scale, 2);
  assert.equal(settings.expressionMode, "automatic");
  assert.equal(settings.restReminderMinutes, 0);
  assert.equal(settings.assistant.baseUrl, "");
  assert.equal(settings.assistant.temperature, 2);
  assert.equal(settings.assistant.maxHistory, 2);
  assert.equal(settings.tts.provider, "none");
  for (const scale of [0.75, 1, 1.25, 1.5, 1.75, 2]) {
    const size = app.run(`displaySize(${scale})`);
    assert.ok(size.width >= 320);
    assert.equal(size.height, 208 * scale + 132);
  }
});

test("clicks, gestures and launches never raise affection", () => {
  const app = loadMain();
  app.run("settings = normalizeSettings({affection:{enabled:true}})");
  for (const kind of ["click", "doubleClick", "longPress"]) {
    app.run(`updateMoodFromInteraction("${kind}")`);
    assert.equal(app.run("profile.affection"), 10);
  }
  app.run("recordLaunch()");
  assert.equal(app.run("profile.affection"), 10);
});

test("only active chat time increases enabled affection", () => {
  const app = loadMain();
  app.run("settings = normalizeSettings({affection:{enabled:true,minutesPerPoint:10,activeWindowMinutes:15}})");
  assert.equal(app.run("recordChatTimeProgress(1000)"), 0);
  assert.equal(app.run("recordChatTimeProgress(601000)"), 1);
  assert.equal(app.run("profile.affection"), 11);
  assert.equal(app.run("recordChatTimeProgress(1801000)"), 0);
  app.run("settings.affection.enabled = false");
  assert.equal(app.run("recordChatTimeProgress(2401000)"), 0);
  assert.equal(app.run("profile.affection"), 11);
});

test("GPT-SoVITS sends configured reference and language fields in both request formats", async () => {
  const requests = [];
  const app = loadMain({ fetch: async (url, options) => {
    requests.push({ url, options });
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/wav" } });
  } });
  app.run('settings = normalizeSettings({tts:{enabled:true,provider:"gptsovits",referenceAudioPath:"reference.wav",promptText:"Reference text",textLanguage:"ja",promptLanguage:"en"}})');
  assert.equal((await app.run('synthesizeSpeech(null,"Reply")')).ok, true);
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.ref_audio_path, "reference.wav");
  assert.equal(body.text_lang, "ja");
  assert.equal(body.prompt_lang, "en");
  assert.equal(body.streaming_mode, false);
  app.run('settings.tts.requestMode = "query"');
  assert.equal((await app.run('synthesizeSpeech(null,"Reply")')).ok, true);
  assert.equal(requests[1].options.method, "GET");
  assert.equal(new URL(requests[1].url).searchParams.get("ref_audio_path"), "reference.wav");
});

test("a timed-out model request releases the shared busy state", async () => {
  let expire;
  const app = loadMain({
    setTimeout: (fn) => { expire = fn; return 1; }, clearTimeout() {},
    fetch: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }),
  });
  app.run('settings = normalizeSettings({assistant:{baseUrl:"https://service.example/v1",model:"test"}})');
  const pending = app.run('sendChatMessage(null,"Hello")');
  expire();
  assert.equal((await pending).ok, false);
  assert.equal(app.run("chatState().busy"), false);
});

test("dragging moves the native window by the cursor delta and stops on release", () => {
  let cursor = { x: 10, y: 20 };
  const app = loadMain({ screen: { getCursorScreenPoint: () => cursor } });
  app.run('globalThis.position = null; mainWindow = {getBounds:()=>({x:100,y:200}),setPosition:(x,y)=>{position={x,y}}}');
  app.run("beginDrag()");
  cursor = { x: 40, y: 10 };
  const movement = app.run("moveDrag()");
  assert.equal(movement.dx, 30);
  assert.equal(movement.dy, -10);
  assert.equal(app.run("position.x"), 130);
  assert.equal(app.run("position.y"), 190);
  app.run("endDrag()");
  assert.equal(app.run("moveDrag().dx"), 0);
});
