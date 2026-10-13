const test = require("node:test");
const assert = require("node:assert/strict");
const { readResponseBytes, readResponseJson, returnedAudioUrl, audioDataUrl, redactServiceText } = require("../src/network-safety");
const { loadMain } = require("./helpers");
const { readChatResponse } = require("../src/chat-response");

test("network readers reject both declared and streamed oversized bodies and cancel the source", async () => {
  let cancelled = 0;
  const response = () => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(16)); },
    cancel() { cancelled++; },
  }));
  await assert.rejects(readResponseBytes(response(), 8), /response_too_large/);
  const declared = response(); declared.headers.set("content-length", "99999");
  await assert.rejects(readResponseBytes(declared, 8), /response_too_large/);
  assert.equal(cancelled, 2);
  assert.deepEqual(await readResponseJson(Response.json({ ok: true }), 100), { ok: true });
});

test("external TTS cannot request a loopback destination or follow a redirect", async () => {
  const requests = [];
  const app = loadMain({ fetch: async (url, options) => {
    requests.push({ url, options });
    return Response.json({ audio_url: "http://127.0.0.1:9880/private" });
  } });
  const result = await app.run('synthesizeSpeechWithSettings("hello", {tts:{enabled:true,provider:"custom",endpoint:"https://voice.example/tts",customBodyTemplate:"{}"}})');
  assert.equal(result.ok, false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.redirect, "error");
});

test("chat JSON and SSE enforce a byte budget before accepting model output", async () => {
  await assert.rejects(readChatResponse(new Response("{}", { headers: { "content-type": "application/json", "content-length": "999999999" } })), /response_too_large/);
  const comment = ":" + "x".repeat(2100000) + "\n\n";
  await assert.rejects(readChatResponse(new Response(comment, { headers: { "content-type": "text/event-stream" } })), /response_too_large/);
});

test("provider diagnostics cannot echo saved or unsaved test credentials into chat history", async () => {
  const app = loadMain({ fetch: async () => Response.json({ error: { message: "Denied candidate-test-token and saved-test-token" } }, { status: 401 }) });
  app.run('settings = normalizeSettings({assistant:{baseUrl:"https://llm.example/v1",model:"fixture",apiKey:"saved-test-token"}})');
  const result = await app.run('testAssistantConnection(null,{assistant:{apiKey:"candidate-test-token"}})');
  assert.equal(JSON.stringify(result).includes("candidate-test-token"), false);
  await app.run('sendChatMessage(null,"Test")');
  assert.equal(app.run('JSON.stringify(chatHistory)').includes("saved-test-token"), false);
});

test("returned TTS URLs stay on the exact user-configured origin", () => {
  assert.equal(returnedAudioUrl("https://voice.example/audio/1.wav", "https://voice.example/tts"), "https://voice.example/audio/1.wav");
  assert.equal(returnedAudioUrl("http://127.0.0.1:9880/audio.wav", "http://127.0.0.1:9880/tts"), "http://127.0.0.1:9880/audio.wav");
  for (const target of ["http://127.0.0.1:9880/audio.wav", "http://169.254.169.254/latest", "https://cdn.example/audio.wav",
    "https://voice.example:8443/audio.wav", "http://voice.example/audio.wav", "https://user:pass@voice.example/audio.wav", "file:///secret"]) {
    assert.throws(() => returnedAudioUrl(target, "https://voice.example/tts"), /audio_origin_not_allowed/);
  }
});

test("TTS data responses accept audio only", () => {
  assert.equal(audioDataUrl("data:audio/wav;base64,AQID"), "data:audio/wav;base64,AQID");
  for (const value of ["data:text/html;base64,AQID", "data:audio/wav,hello", "https://example.invalid/audio.wav", "data:audio/wav;base64,?"]) {
    assert.throws(() => audioDataUrl(value), /invalid_audio/);
  }
});

test("service diagnostics redact current, candidate and URL-encoded credentials before display", () => {
  const token = "test-only-token/with+symbols";
  const result = redactServiceText(`Denied ${token}; ${encodeURIComponent(token)}; Bearer example-secret`, [token]);
  assert.equal(result.includes(token), false);
  assert.equal(result.includes(encodeURIComponent(token)), false);
  assert.equal(result.includes("example-secret"), false);
  assert.equal(redactServiceText("Unknown model"), "Unknown model");
});
