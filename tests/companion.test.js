const test = require("node:test");
const assert = require("node:assert/strict");
const { loadMain, loadRenderer } = require("./helpers");
const { loadPet } = require("./pet-helpers");
const { parseCompanionReply, expressionInstruction } = require("../src/companion-response");
const { companionBounds } = require("../src/companion-layout");
const { modelsEndpoint, readModelList } = require("../src/model-list");
const presets = require("../src/llm-presets");

test("expression prefixes never leak into streamed speech and only select available states", () => {
  const states = { idle: {}, happy: {} };
  const raw = "[expression:happy] Hello there!";
  for (let i = 0; i <= raw.indexOf("]"); i++) assert.equal(parseCompanionReply(raw.slice(0, i), states, true).text, "");
  assert.deepEqual(parseCompanionReply(raw, states), { text: "Hello there!", action: "happy" });
  assert.deepEqual(parseCompanionReply("[expression:missing] Hello", states), { text: "Hello", action: "" });
  assert.deepEqual(parseCompanionReply("[a normal aside] Hi", states), { text: "[a normal aside] Hi", action: "" });
  assert.match(expressionInstruction(states), /\[expression:happy\]/);
});

test("conversation parsing strips expression metadata from history and speech", async () => {
  let request;
  const app = loadMain({ fetch: async (_url, options) => {
    request = JSON.parse(options.body);
    return Response.json({ choices: [{ message: { content: "[expression:idle] Glad to see you." } }] });
  } });
  app.run('settings = normalizeSettings({assistant:{baseUrl:"https://chat.example/v1",model:"model",sendTemperature:false}})');
  const result = await app.run('sendChatMessage(null,"Hello")');
  assert.equal(result.ok, true);
  assert.equal(result.message.content, "Glad to see you.");
  assert.equal(result.action, "idle");
  assert.equal(request.temperature, undefined);
  assert.match(request.messages[0].content, /\[expression:idle\]/);
  assert.doesNotMatch(request.messages[0].content, /energy \d+\/100|活力 \d+\/100/i);
});

test("companion input stays on the pet display without covering it when space is available", () => {
  for (const area of [{ x: 0, y: 0, width: 1440, height: 900 }, { x: -1920, y: -300, width: 1920, height: 1080 }, { x: 0, y: 0, width: 600, height: 800 }]) {
    for (const corner of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const pet = { x: area.x + corner[0] * (area.width - 384), y: area.y + corner[1] * (area.height - 548), width: 384, height: 548 };
      const input = companionBounds(pet, area);
      assert.ok(input.x >= area.x && input.y >= area.y);
      assert.ok(input.x + input.width <= area.x + area.width && input.y + input.height <= area.y + area.height);
      assert.ok(input.x + input.width <= pet.x || input.x >= pet.x + pet.width || input.y + input.height <= pet.y || input.y >= pet.y + pet.height);
    }
  }
});

test("model discovery supports preset and full completion URLs without sending conversation data", async () => {
  for (const preset of Object.values(presets).filter((item) => item.baseUrl)) assert.ok(modelsEndpoint(preset.baseUrl).endsWith("/models"));
  assert.equal(modelsEndpoint("https://chat.example/v1/chat/completions/"), "https://chat.example/v1/models");
  const requests = [];
  const app = loadMain({ fetch: async (url, options) => {
    requests.push({ url, options });
    return Response.json({ data: [{ id: "z" }, { id: "a" }, { id: "a" }, { id: null }] });
  } });
  app.run('settings = normalizeSettings({assistant:{baseUrl:"https://old.example/v1",apiKey:"old-key"}})');
  const result = await app.run('listAssistantModels(null,{assistant:{baseUrl:"https://new.example/v1"}})');
  assert.deepEqual(Array.from(result.models), ["a", "z"]);
  assert.equal(requests[0].options.headers.Authorization, undefined);
  assert.equal(requests[0].options.body, undefined);
  assert.equal(requests[0].options.redirect, "error");
  await app.run('listAssistantModels(null,{assistant:{baseUrl:"https://old.example/v1"}})');
  assert.equal(requests[1].options.headers.Authorization, "Bearer old-key");
});

test("invalid model lists fail without exposing provider bodies", async () => {
  await assert.rejects(readModelList(Response.json({ error: "invalid" })));
  await assert.rejects(readModelList(new Response("x".repeat(4 * 1024 * 1024 + 1))));
  const app = loadMain({ fetch: async () => new Response("private upstream error", { status: 401 }) });
  assert.equal(JSON.stringify(await app.run('listAssistantModels(null,{assistant:{baseUrl:"https://chat.example"}})')), '{"ok":false,"status":401}');
});

test("changing service discards a late model list and keeps manual model input", async () => {
  let resolve;
  const ui = loadRenderer("settings.js", { listAssistantModels: () => new Promise((done) => { resolve = done; }) });
  ui.run("renderConfig()");
  ui.nodes.get("#base-url").value = "https://chat.example/v1";
  const pending = ui.run("fetchModels()");
  ui.run('applyLlmPreset("deepseek")');
  resolve({ ok: true, models: ["old-model"] });
  await pending;
  assert.equal(ui.nodes.get("#model-options").hidden, true);
  assert.equal(ui.nodes.get("#model").value, "deepseek-flash");
  assert.equal(ui.nodes.get("#fetch-models").disabled, false);
});

test("thinking and streaming bubbles do not time out; complete replies restore dismissal", () => {
  const pet = loadPet();
  pet.run('handlePetMessage({text:"Thinking",streaming:true,speak:false})');
  assert.equal(pet.timeouts.size, 0);
  pet.run('handlePetMessage({text:"A complete reply",speak:false})');
  assert.equal(pet.timeouts.size, 1);
  assert.equal(pet.bubble.textContent, "A complete reply");
});

test("quick conversation uses the configured character name and ignores IME confirmation Enter", () => {
  const ui = loadRenderer("quick-chat.js");
  ui.run('applyChatState({config:{persona:{name:"Custom"}},character:{name:"Pack"},resolvedLanguage:"en-US"})');
  assert.equal(ui.nodes.get("#character-name").textContent, "Custom");
  let prevented = false;
  ui.nodes.get("#quick-input").events.keydown({ key: "Enter", isComposing: true, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
});
