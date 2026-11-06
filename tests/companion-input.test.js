const test = require("node:test");
const assert = require("node:assert/strict");
const { loadRenderer, loadMain } = require("./helpers");
const flush = () => new Promise(resolve => setImmediate(resolve));
const state = (text = "", characterId = "default", revision = 0) => ({
  config: { assistant: { baseUrl: "https://service.example/v1", model: "test" } },
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

const failed = [
  { role: "user", content: "My earlier message", failed: true, createdAt: 10 },
  { role: "assistant", content: "Stopped", failed: true, createdAt: 11 },
];

test("an unconfigured inline composer opens chat setup without clearing, recording or sending the draft", async () => {
  const opened = [];
  const ui = setup({ openCompanionSettings: tab => opened.push(tab), sendChatMessage: assert.fail });
  ui.receive({ ...state("Keep my words"), config: { assistant: {} } });
  await ui.run("window.DesktopPetCompanionInput.open()");
  ui.submit();
  assert.deepEqual(opened, ["chat"]);
  assert.equal(ui.input.value, "Keep my words");
  assert.equal(ui.nodes.get("#companion-input").hidden, false);
  assert.equal(ui.nodes.get("#companion-feedback").hidden, false);
  assert.equal(ui.nodes.get("#companion-send").dataset.setup, "true");
  ui.receive(state("Keep my words"));
  assert.equal(ui.nodes.get("#companion-send").dataset.setup, "false");
  assert.equal(ui.nodes.get("#companion-feedback").hidden, true);
});

test("inline retry resends only the failed turn once and leaves a different draft open", async () => {
  let finish;
  const sent = [];
  const ui = setup({ sendChatMessage: (text, context) => { sent.push({ text, ...context }); return new Promise(r => { finish = r; }); } });
  ui.receive({ ...state("My next thought"), history: failed });
  await ui.run("window.DesktopPetCompanionInput.open()");
  const button = ui.nodes.get("#companion-retry");
  assert.equal(button.hidden, false);
  button.events.click(); button.events.click();
  assert.deepEqual(sent, [{ text: "My earlier message", characterId: "default", revision: 0, retryOf: 11 }]);
  assert.equal(button.hidden, true);
  assert.equal(ui.nodes.get("#companion-input").hidden, false);
  assert.equal(ui.input.value, "My next thought");
  ui.receive(state("My next thought"));
  finish({ ok: true, revision: 0 }); await flush();
  assert.equal(button.hidden, true);
  assert.equal(ui.input.value, "My next thought");
});

test("a stale retry restores a matching draft but cannot erase typing or follow a character switch", async () => {
  let finish;
  const ui = setup({ sendChatMessage: () => new Promise(r => { finish = r; }) });
  ui.receive({ ...state(failed[0].content), history: failed });
  const retry = ui.nodes.get("#companion-retry");
  retry.events.click();
  assert.equal(ui.input.value, "");
  finish({ cancelled: true, revision: 0 }); await flush();
  assert.equal(ui.input.value, failed[0].content);
  retry.events.click();
  ui.input.value = "Typed while waiting";
  finish({ ok: false, revision: 0 }); await flush();
  assert.equal(ui.input.value, "Typed while waiting");
  retry.events.click();
  ui.receive(state("Another character", "luna", 1));
  finish({ ok: false, revision: 0 }); await flush();
  assert.equal(retry.hidden, true);
  assert.equal(ui.input.value, "Another character");
  assert.equal(ui.nodes.get("#companion-feedback").hidden, true);
});

test("the main process rejects superseded retries before contacting a provider", async () => {
  const app = loadMain({ fetch: assert.fail });
  app.context.failed = failed;
  app.run("chatHistory = [...failed]");
  const resend = (replyAt) => app.run(`sendChatMessage(null,"My earlier message",{characterId:"default",revision:0,retryOf:${replyAt}})`);
  assert.equal((await resend(12)).error, "stale_retry");
  app.run('addChatMessage("assistant", "New reply")');
  assert.equal((await resend(11)).error, "stale_retry");
  assert.equal(app.run("chatHistory.length"), 3);
});
