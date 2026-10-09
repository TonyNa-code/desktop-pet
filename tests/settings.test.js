const test = require("node:test");
const assert = require("node:assert/strict");
const { loadMain, loadRenderer } = require("./helpers");

function configuredApp(overrides = {}) {
  const app = loadMain(overrides);
  app.run(`settings = normalizeSettings({
    assistant: { baseUrl: "https://old.example/v1", model: "test", apiKey: "old-key" },
    tts: { enabled: true, provider: "custom", endpoint: "https://voice.example/tts", apiKey: "voice-key" }
  })`);
  return app;
}

test("save and connection-test paths clear keys when endpoints change", () => {
  for (const section of ["assistant", "tts"]) {
    const urlField = section === "assistant" ? "baseUrl" : "endpoint";
    for (const url of ["https://new.example/v1", "http://old.example/v1", "https://old.example/other", ""]) {
      const app = configuredApp();
      const patch = JSON.stringify({ [section]: { [urlField]: url } });
      assert.equal(app.run(`settingsFromChatConfigPatch(${patch}).${section}.apiKey`), "");
      app.run(`applyChatConfigPatch(${patch})`);
      assert.equal(app.run(`settings.${section}.apiKey`), "");
    }
  }
});

test("same endpoint keeps its key, explicit replacement and removal work", () => {
  const app = configuredApp();
  assert.equal(app.run('settingsFromChatConfigPatch({assistant:{baseUrl:"https://old.example/v1/",model:"other"}}).assistant.apiKey'), "old-key");
  app.run('applyChatConfigPatch({assistant:{baseUrl:"https://new.example/v1",apiKey:"new-key"}})');
  assert.equal(app.run("settings.assistant.apiKey"), "new-key");
  app.run('applyChatConfigPatch({assistant:{apiKey:""}})');
  assert.equal(app.run("settings.assistant.apiKey"), "");
  assert.equal(app.run("settings.tts.apiKey"), "voice-key");
});

test("changing voice provider clears the previous provider key", () => {
  const app = configuredApp();
  const patch = '{tts:{provider:"gptsovits"}}';
  assert.equal(app.run(`settingsFromChatConfigPatch(${patch}).tts.apiKey`), "");
  app.run(`applyChatConfigPatch(${patch})`);
  assert.equal(app.run("settings.tts.apiKey"), "");
});

test("connection tests do not send the old credential to another service", async () => {
  const requests = [];
  const app = configuredApp({ fetch: async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), { headers: { "content-type": "application/json" } });
  } });
  await app.run('testAssistantConnection(null,{assistant:{baseUrl:"https://new.example/v1"}})');
  assert.equal(requests[0].options.headers.Authorization, undefined);
  await app.run('testAssistantConnection(null,{assistant:{baseUrl:"https://old.example/v1"}})');
  assert.equal(requests[1].options.headers.Authorization, "Bearer old-key");
  assert.equal(app.run("settings.assistant.apiKey"), "old-key");
});

test("Linux basic_text does not persist API keys or claim secure storage", () => {
  const app = configuredApp({ platform: "linux", safeStorage: { getSelectedStorageBackend: () => "basic_text" } });
  const stored = app.run("settingsForStorage()");
  assert.equal(stored.assistant.apiKey, undefined);
  assert.equal(stored.assistant.apiKeyEnc, undefined);
  assert.equal(stored.tts.apiKeyEnc, undefined);
  assert.equal(app.run("publicChatConfig().assistant.canPersistApiKey"), false);
});

test("language changes preserve unsaved form values and keys", () => {
  const ui = loadRenderer("settings.js");
  ui.run("renderConfig()");
  const values = {
    "#persona-name": "Draft character", "#persona-personality": "Calm",
    "#base-url": "https://service.example/v1", "#model": "draft-model",
    "#api-key": "draft-key", "#tts-api-key": "draft-voice-key",
    "#tts-provider": "custom", "#tts-endpoint": "https://voice.example/tts", "#tts-rate": "1.3",
  };
  for (const [id, value] of Object.entries(values)) ui.nodes.get(id).value = value;
  ui.nodes.get("#affection-enabled").checked = true;
  for (const language of ["en-US", "ja-JP", "zh-CN"]) {
    ui.nodes.get("#language").value = language;
    ui.nodes.get("#language").events.change();
    for (const [id, value] of Object.entries(values)) assert.equal(ui.nodes.get(id).value, value, id);
    assert.equal(ui.nodes.get("#affection-enabled").checked, true);
    assert.equal(ui.run("document.documentElement.lang"), language);
  }
  const draft = ui.run("readConfigForm()");
  assert.equal(draft.assistant.apiKey, "draft-key");
  assert.equal(draft.persona.name, "Draft character");
});

test("selecting a service preset clears an unsaved API key", () => {
  const ui = loadRenderer("settings.js");
  ui.nodes.get("#api-key").value = "draft-key";
  ui.run('applyLlmPreset("ollama")');
  assert.equal(ui.nodes.get("#api-key").value, "");
});

test("DeepSeek preset uses the documented endpoint and model without retaining another service key", () => {
  const ui = loadRenderer("settings.js");
  ui.nodes.get("#api-key").value = "draft-key";
  ui.run('applyLlmPreset("deepseek")');
  assert.equal(ui.nodes.get("#base-url").value, "https://api.deepseek.com");
  assert.equal(ui.nodes.get("#model").value, "deepseek-flash");
  assert.equal(ui.nodes.get("#api-key").value, "");
});

test("background updates preserve dirty fields while refreshing untouched settings", () => {
  const ui = loadRenderer("settings.js");
  ui.run("renderConfig()");
  ui.nodes.get("#persona-name").value = "Draft";
  ui.nodes.get("#api-key").value = "draft-key";
  ui.run('applyChatState({config:{...config,assistant:{...config.assistant,model:"remote-model"}}})');
  assert.equal(ui.nodes.get("#persona-name").value, "Draft");
  assert.equal(ui.nodes.get("#api-key").value, "draft-key");
  assert.equal(ui.nodes.get("#model").value, "remote-model");
  ui.run("applyChatState({config:{...config}})");
  assert.equal(ui.nodes.get("#persona-name").value, "Draft");
});

test("a draft language survives repeated background updates", () => {
  const ui = loadRenderer("settings.js");
  ui.run("renderConfig()");
  ui.nodes.get("#language").value = "ja-JP";
  ui.nodes.get("#language").events.change();
  for (let i = 0; i < 2; i++) {
    ui.run('applyChatState({config:{...config,language:"en-US",resolvedLanguage:"en-US"}})');
    assert.equal(ui.nodes.get("#language").value, "ja-JP");
    assert.equal(ui.run("activeLanguage"), "ja-JP");
  }
});

test("save failures preserve inputs and show an error instead of rejecting", async () => {
  const ui = loadRenderer("settings.js", { saveChatConfig: async () => { throw new Error("disk full"); } });
  ui.run("renderConfig()");
  ui.nodes.get("#persona-name").value = "Draft";
  await ui.run("saveConfig()");
  assert.equal(ui.nodes.get("#persona-name").value, "Draft");
  assert.equal(ui.nodes.get("#save-settings").disabled, false);
  assert.equal(ui.nodes.get("#save-status").textContent, ui.run('text("settings.saveFailed")'));
});

test("background endpoint changes never attach unsaved credentials to a different service", () => {
  const ui = loadRenderer("settings.js");
  ui.run('config.assistant.baseUrl="https://first.example/v1"; config.tts={...config.tts,enabled:true,provider:"custom",endpoint:"https://voice-first.example"}; renderConfig()');
  ui.nodes.get("#api-key").value = "first-draft-key";
  ui.nodes.get("#tts-api-key").value = "first-voice-key";
  ui.run('applyChatState({config:{...config,assistant:{...config.assistant,baseUrl:"https://second.example/v1"},tts:{...config.tts,endpoint:"https://voice-second.example"}}})');
  assert.equal(ui.nodes.get("#api-key").value, "");
  assert.equal(ui.nodes.get("#tts-api-key").value, "");
});

test("cached character drafts cannot restore a key onto a newer shared endpoint", () => {
  const ui = loadRenderer("settings.js");
  ui.run('config.assistant.baseUrl="https://first.example/v1"; renderConfig()');
  ui.nodes.get("#api-key").value = "first-draft-key";
  ui.run('applyChatState({config:{...config,characterId:"luna"}})');
  ui.run('applyChatState({config:{...config,characterId:"default",assistant:{...config.assistant,baseUrl:"https://second.example/v1"}}})');
  assert.equal(ui.nodes.get("#api-key").value, "");
});

test("a complete endpoint and credential draft remains paired", () => {
  const ui = loadRenderer("settings.js");
  ui.run('config.assistant.baseUrl="https://first.example/v1"; renderConfig()');
  ui.nodes.get("#base-url").value = "https://draft.example/v1";
  ui.nodes.get("#api-key").value = "draft-key";
  ui.run('applyChatState({config:{...config,assistant:{...config.assistant,baseUrl:"https://second.example/v1"}}})');
  assert.equal(ui.nodes.get("#base-url").value, "https://draft.example/v1");
  assert.equal(ui.nodes.get("#api-key").value, "draft-key");
});
