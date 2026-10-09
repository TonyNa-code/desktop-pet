const test = require("node:test");
const assert = require("node:assert/strict");
const { readChatResponse } = require("../src/chat-response");
const { validate } = require("../src/config-validation");
const { loadMain, loadRenderer } = require("./helpers");
const { loadPet } = require("./pet-helpers");

function streamResponse(text) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
    controller.close();
  } }), { headers: { "content-type": "text/event-stream" } });
}

test("SSE preserves split UTF-8, CRLF, comments and multiline data", async () => {
  const updates = [];
  const response = streamResponse(': keepalive\r\n\r\ndata: {"choices":\r\ndata: [{"index":0,"delta":{"content":"你好\\n"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"第二段"},"finish_reason":"stop"}]}\r\n\r\ndata: [DONE]\r\n\r\n');
  assert.equal(await readChatResponse(response, (text) => updates.push(text)), "你好\n第二段");
  assert.deepEqual(updates, ["你好\n", "你好\n第二段"]);
});

test("broken and error streams never become successful replies", async () => {
  await assert.rejects(readChatResponse(streamResponse('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n')), /incomplete_stream/);
  await assert.rejects(readChatResponse(streamResponse('data: {"error":{"message":"failed"}}\n\n')), /stream_error/);
});

test("JSON compatibility keeps complete long replies and paragraph breaks", async () => {
  const content = `First paragraph\n\n${"b".repeat(2200)}`;
  assert.equal(await readChatResponse(Response.json({ choices: [{ message: { content } }] })), content);
});

test("invalid URLs and templates have actionable field validation", () => {
  assert.equal(validate({ assistant: { baseUrl: "not a URL", model: "test" } }).field, "base-url");
  assert.equal(validate({ assistant: { baseUrl: "https://user:pass@example.com", model: "test" } }).field, "base-url");
  assert.equal(validate({ assistant: { baseUrl: "http://localhost:1234/v1" } }).field, "model");
  assert.equal(validate({ tts: { provider: "gptsovits" } }).field, "tts-reference-audio");
  assert.equal(validate({ tts: { provider: "custom", endpoint: "https://example.com", customBodyTemplate: "no" } }).field, "tts-custom-body");
  assert.equal(validate({ tts: { provider: "custom", endpoint: "https://example.com", requestMode: "query", customBodyTemplate: '{"nested":{"text":"{{text}}"}}' } }).key, "validation.query");
  assert.equal(validate({ tts: { provider: "none", endpoint: "draft" } }), null);
});

test("invalid saved URL is rejected without clearing the previous service", () => {
  const app = loadMain();
  app.run('settings = normalizeSettings({assistant:{baseUrl:"https://example.com",model:"test"}})');
  assert.throws(() => app.run('applyChatConfigPatch({assistant:{baseUrl:"invalid"}})'), /validation.url/);
  assert.equal(app.run("settings.assistant.baseUrl"), "https://example.com");
});

test("custom TTS GET sends the JSON template as query parameters, including control characters", async () => {
  let request;
  const app = loadMain({ fetch: async (url, options) => { request = { url, options }; return new Response("audio"); } });
  const result = await app.run('synthesizeSpeechWithSettings("line\\nquote\\\"\\t", {tts:{enabled:true,provider:"custom",endpoint:"https://example.com/tts",requestMode:"query",customBodyTemplate:"{\\"text\\":\\"{{text}}\\",\\"speaker\\":2}"}})');
  assert.equal(result.ok, true);
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.body, undefined);
  assert.equal(new URL(request.url).searchParams.get("text"), "line\nquote\"");
  assert.equal(new URL(request.url).searchParams.get("speaker"), "2");
});

test("API errors show their nested message instead of object coercion", async () => {
  const app = loadMain();
  app.context.response = Response.json({ error: { message: "Unknown model" } });
  assert.equal(await app.run("responseErrorText(response)"), "Unknown model");
  assert.equal(app.run('normalizeTtsSettings({mediaType:"raw"}).mediaType'), "wav");
});

test("character switching isolates persona, affection and conversation context", () => {
  const app = loadMain();
  app.run('settings=normalizeSettings({persona:{name:"First"},affection:{enabled:true}}); profile.affection=75; addChatMessage("user","First secret"); updateSettings({characterId:"luna"})');
  assert.equal(app.run("settings.persona.name"), "");
  assert.equal(app.run("settings.affection.enabled"), false);
  assert.equal(app.run("profile.affection"), 10);
  assert.equal(app.run("chatHistory.length"), 0);
  app.run('applyChatConfigPatch({persona:{name:"Second"}}); addChatMessage("user","Second secret"); updateSettings({characterId:"default"})');
  assert.equal(app.run("settings.persona.name"), "First");
  assert.equal(app.run("profile.affection"), 75);
  assert.equal(app.run("chatHistory[0].content"), "First secret");
  assert.equal(app.run('JSON.stringify(llmMessagesFor("next")).includes("Second secret")'), false);
});

test("history persistence is opt-in and turning it off deletes only disk history", () => {
  const app = loadMain();
  app.run('settings=normalizeSettings({}); addChatMessage("user","Session only"); writeCharacterSessions()');
  const stored = () => JSON.parse([...app.writes.entries()].find(([name]) => name.endsWith("characters-state.json"))[1]);
  assert.equal(stored().characters.default.history.length, 0);
  app.run('applyChatConfigPatch({rememberHistory:true}); readCharacterSessions()');
  assert.equal(app.run("chatHistory[0].content"), "Session only");
  app.run('applyChatConfigPatch({rememberHistory:false})');
  assert.equal(stored().characters.default.history.length, 0);
  assert.equal(app.run("chatHistory.length"), 1);
  app.run('readCharacterSessions()');
  assert.equal(app.run("chatHistory.length"), 0);
});

test("legacy persona migrates only to its selected character", () => {
  const app = loadMain();
  app.run('settings=normalizeSettings({characterId:"luna",persona:{name:"Legacy"}}); profile.affection=64; readCharacterSessions(); writeCharacterSessions(); updateSettings({characterId:"default"})');
  assert.equal(app.run("settings.persona.name"), "");
  app.run('updateSettings({characterId:"luna"}); readCharacterSessions()');
  assert.equal(app.run("settings.persona.name"), "Legacy");
  assert.equal(app.run("profile.affection"), 64);
});

test("stop preserves partial text, excludes it from context, and ignores late completion", async () => {
  let controller;
  const app = loadMain({ fetch: async () => new Response(new ReadableStream({ start(c) { controller = c; } }), { headers: { "content-type": "text/event-stream" } }) });
  app.run('settings=normalizeSettings({assistant:{baseUrl:"https://example.com",model:"test"}})');
  const pending = app.run('sendChatMessage(null,"question")');
  await new Promise((resolve) => setImmediate(resolve));
  controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Partial reply"}}]}\n\n'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.run("chatState().pending.reply"), "Partial reply");
  const stopped = app.run("stopChat()");
  assert.equal(stopped.busy, false);
  assert.equal(stopped.history.at(-1).content, "Partial reply");
  assert.equal(app.run('llmMessagesFor("next").length'), 2);
  controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
  controller.close();
  assert.equal((await pending).cancelled, true);
});

test("configured chat does not falsely claim a connection", () => {
  const ui = loadRenderer("chat.js");
  ui.run('config.assistant={baseUrl:"http://127.0.0.1:9",model:"test"}');
  assert.equal(ui.run("statusText()"), ui.run('text("chat.configured")'));
});

test("connection testing uses the selected streaming mode", async () => {
  const modes = [];
  const app = loadMain({ fetch: async (_url, options) => {
    const mode = JSON.parse(options.body).stream; modes.push(mode);
    return mode ? streamResponse('data: {"choices":[{"delta":{"content":"Ready"},"finish_reason":"stop"}]}\n\n')
      : Response.json({ choices: [{ message: { content: "Ready" } }] });
  } });
  for (const stream of [true, false]) {
    const result = await app.run(`testAssistantConnection(null,{assistant:{baseUrl:"https://example.com",model:"test",stream:${stream}}})`);
    assert.equal(result.ok, true);
  }
  assert.deepEqual(modes, [true, false]);
});

test("long bubbles remain longer, pause on hover, and open chat", () => {
  let opened = false;
  const pet = loadPet({ openChatWindow: () => { opened = true; } });
  pet.run('showBubble("a".repeat(180))');
  assert.equal(pet.run("bubbleRemaining"), 19800);
  pet.bubble.events.mouseenter();
  assert.equal(pet.timeouts.size, 0);
  pet.bubble.events.mouseleave();
  assert.equal(pet.timeouts.size, 1);
  pet.bubble.events.click();
  assert.equal(opened, true);
});
