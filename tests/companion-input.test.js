const test = require("node:test");
const assert = require("node:assert/strict");
const { loadRenderer, loadMain } = require("./helpers");
const flush = () => new Promise(resolve => setImmediate(resolve));
const state = (text = "", characterId = "default", revision = 0) => ({
  revision, draft: { text, characterId, revision, version: 0 }, character: { id: characterId, name: "Character" }, history: [],
});
function setup(api = {}) {
  let receive;
  const ui = loadRenderer("companion-input.js", {
    setCompanionInputOpen: async open => open,
    onChatStateUpdated: callback => { receive = callback; }, ...api,
  }, "index.html");
  return { ...ui, receive, input: ui.nodes.get("#companion-text"),
    submit: () => ui.nodes.get("#companion-input").events.submit({ preventDefault() {} }) };
}

test("inline composer submits once, folds away, and restores failed drafts without stealing focus", async () => {
  let finish, requests = 0;
  const ui = setup({ sendChatMessage: () => { requests++; return new Promise(resolve => { finish = resolve; }); } });
  ui.receive(state("A quiet evening"));
  await ui.run("window.DesktopPetCompanionInput.open()");
  assert.equal(ui.context.document.body.dataset.companionOpen, "true");
  ui.submit(); ui.submit();
  assert.equal(requests, 1);
  assert.equal(ui.nodes.get("#companion-input").hidden, true);
  assert.equal(ui.context.document.body.dataset.companionOpen, "false");
  assert.equal(ui.input.value, "");
  finish({ ok: false, revision: 0 }); await flush();
  assert.equal(ui.input.value, "A quiet evening");
  assert.equal(ui.nodes.get("#companion-input").hidden, true);
});

test("closing keeps a draft, while IME Enter and Shift+Enter never submit", async () => {
  let requests = 0;
  const ui = setup({ sendChatMessage: () => { requests++; } });
  ui.receive(state("Unsent"));
  await ui.run("window.DesktopPetCompanionInput.open()");
  ui.input.events.keydown({ key: "Enter", isComposing: true });
  ui.input.events.keydown({ key: "Enter", keyCode: 229 });
  ui.input.events.keydown({ key: "Enter", shiftKey: true });
  ui.input.events.keydown({ key: "Escape", preventDefault() {} });
  assert.equal(requests, 0);
  assert.equal(ui.input.value, "Unsent");
  assert.equal(ui.nodes.get("#companion-input").hidden, true);
});

test("late request failures cannot replace another character's inline draft", async () => {
  let reject;
  const ui = setup({ sendChatMessage: () => new Promise((_, fail) => { reject = fail; }) });
  ui.receive(state("Old")); ui.submit();
  ui.receive(state("New character draft", "luna", 1));
  reject(new Error("closed")); await flush();
  assert.equal(ui.input.value, "New character draft");
});

test("opening attention and pending speech follow live state without additional requests", async () => {
  const ui = setup();
  ui.receive(state());
  await ui.run("window.DesktopPetCompanionInput.open()");
  assert.equal(ui.context.document.body.dataset.companionState, "attentive");
  ui.receive({ ...state(), busy: true });
  assert.equal(ui.context.document.body.dataset.companionState, "thinking");
  assert.equal(ui.nodes.get("#companion-stop").hidden, false);
  ui.receive({ ...state(), voice: { status: "playing" } });
  assert.equal(ui.context.document.body.dataset.companionState, "speaking");
  ui.receive(state());
  assert.equal(ui.context.document.body.dataset.companionState, "attentive");
});

test("inline layout reserves input space without changing stored pet scale", () => {
  const app = loadMain();
  const before = app.run("displaySize().height");
  app.run("companionInputOpen = true");
  assert.equal(app.run("displaySize().height"), before + 88);
  assert.equal(app.run("settings.scale"), 1);
});
