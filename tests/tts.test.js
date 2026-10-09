const test = require("node:test");
const assert = require("node:assert/strict");
const { loadMain } = require("./helpers");

test("voice URL download shares the synthesis timeout without forwarding credentials", async () => {
  let expire;
  const requests = [];
  const app = loadMain({
    setTimeout: (callback) => { expire = callback; return 1; }, clearTimeout() {},
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (requests.length === 1) {
        return new Response(JSON.stringify({ audio_url: "https://audio.example/clip.wav" }), { headers: { "content-type": "application/json" } });
      }
      assert.equal(options.signal, requests[0].options.signal);
      assert.equal(options.headers?.Authorization, undefined);
      const waiting = new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
      expire();
      return waiting;
    },
  });
  const result = await app.run('synthesizeSpeechWithSettings("hello", {tts:{enabled:true,provider:"custom",endpoint:"https://voice.example/tts",apiKey:"voice-key",customBodyTemplate:"{\\"text\\":\\"{{text}}\\"}"}})');
  assert.equal(requests.length, 2);
  assert.equal(result.ok, false);
  assert.equal(result.error, "tts_timeout");
});

test("custom voice API can return audio bytes", async () => {
  const app = loadMain({ fetch: async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/wav" } }) });
  const result = await app.run('synthesizeSpeechWithSettings("hello", {tts:{enabled:true,provider:"custom",endpoint:"https://voice.example/tts",customBodyTemplate:"{\\"text\\":\\"{{text}}\\"}"}})');
  assert.equal(result.ok, true);
  assert.equal(result.audioDataUrl, "data:audio/wav;base64,AQID");
});
