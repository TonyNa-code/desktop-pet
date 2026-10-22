const test = require("node:test");
const assert = require("node:assert/strict");
const { loadMain, loadRenderer } = require("./helpers");

const files = ["chat.js", "quick-chat.js"];
const inputFor = (ui, file) => ui.nodes.get(file === "chat.js" ? "#message-input" : "#quick-input");
const state = (text, characterId = "default", revision = 0) => ({
  revision, draft: { text, characterId, revision, version: 0 }, history: [], character: { id: characterId },
});

test("drafts survive window recreation and character switching but never enter stored state or model context", () => {
  const app = loadMain();
  app.run('setChatDraft(null,{characterId:"default",revision:0,text:"Unsent private draft\\nSecond line"})');
  assert.equal(app.run("chatState().draft.text"), "Unsent private draft\nSecond line");
  app.run('updateSettings({characterId:"luna"})');
  assert.equal(app.run("chatState().draft.text"), "");
  app.run('setChatDraft(null,{characterId:"luna",revision:chatRevision,text:"Other draft"})');
  app.run('updateSettings({characterId:"default",rememberHistory:true})');
  assert.equal(app.run("chatState().draft.text"), "Unsent private draft\nSecond line");
  assert.doesNotMatch([...app.writes.values()].join("\n"), /Unsent private draft|Other draft/);
  assert.doesNotMatch(app.run('JSON.stringify(llmMessagesFor("Actual message"))'), /Unsent private draft|Other draft/);
});

test("stale drafts and submissions are rejected before any model request", async () => {
  const app = loadMain();
  app.run('setChatDraft(null,null); setChatDraft(null,"invalid"); setChatDraft(null,{text:42})');
  app.run('updateSettings({characterId:"luna"})');
  app.run('setChatDraft(null,{characterId:"default",revision:0,text:"Wrong character"})');
  assert.equal(app.run("chatDrafts.size"), 0);
  assert.equal((await app.run('sendChatMessage(null,"Wrong character",{characterId:"default",revision:0})')).error, "stale_chat");
  assert.equal((await app.run('sendChatMessage(null,"Old revision",{characterId:"luna",revision:0})')).error, "stale_chat");
  assert.equal(app.run("chatHistory.length"), 0);
});

test("draft edit broadcasts are bounded and acknowledge the originating composer only", () => {
  const app = loadMain();
  app.run(`globalThis.sent = []; globalThis.sender = {send:(topic,state)=>sent.push({topic,state})};
    chatWindow = {isDestroyed:()=>false,webContents:sender};
    quickChatWindow = {isDestroyed:()=>false,webContents:{send:(topic,state)=>sent.push({topic,state})}};
    mainWindow = {isDestroyed:()=>false,webContents:{send:(topic,state)=>sent.push({topic,state})}};
    setChatDraft({sender},{characterId:"default",revision:0,text:"x".repeat(1500),edit:1});`);
  assert.equal(app.run("sent.length"), 3);
  assert.equal(app.run("sent[0].state.text.length"), 1200);
  assert.equal(app.run("sent[0].topic"), "chat-draft-updated");
  assert.equal(app.run("sent[0].state.acknowledgedEdit"), undefined);
  assert.equal(app.run("sent[1].state.acknowledgedEdit"), 1);
  assert.equal(app.run("sent[2].state.acknowledgedEdit"), undefined);
});

for (const file of files) {
  test(`${file}: draft sync preserves new typing, switches characters, and ignores stale events`, () => {
    const changes = [];
    let receive;
    const ui = loadRenderer(file, {
      setChatDraft: (draft) => changes.push(draft),
      onChatDraftUpdated: (callback) => { receive = callback; },
    });
    ui.context.initial = state("Saved draft");
    assert.equal(inputFor(ui, file).disabled, true);
    ui.run("applyChatState(initial)");
    const input = inputFor(ui, file);
    assert.equal(input.value, "Saved draft");
    assert.equal(input.disabled, false);
    input.value = "New typing";
    input.events.input();
    assert.equal(changes.at(-1).text, "New typing");
    ui.run("applyChatState(initial)");
    assert.equal(input.value, "New typing");
    receive({ ...state("New typing").draft, version: 1, acknowledgedEdit: 1 });
    receive({ ...state("Other window").draft, version: 2 });
    assert.equal(input.value, "Other window");
    ui.context.next = state("Luna draft", "luna", 1);
    ui.run("applyChatState(next)");
    receive(state("Late old draft").draft);
    assert.equal(input.value, "Luna draft");
  });

  test(`${file}: failed sends restore the original draft without replacing newer text`, async () => {
    let finish;
    const ui = loadRenderer(file, { sendChatMessage: () => new Promise((resolve) => { finish = resolve; }) });
    ui.context.initial = state("Original");
    ui.run("applyChatState(initial)");
    const input = inputFor(ui, file);
    const send = file === "chat.js" ? 'sendMessage("Original")' : "sendQuickMessage()";
    const first = ui.run(send);
    assert.equal(input.value, "");
    finish({ ok: false, history: [], revision: 0 });
    await first;
    assert.equal(input.value, "Original");
    const second = ui.run(send);
    input.value = "Next thought";
    input.events.input();
    finish({ ok: false, history: [], revision: 0 });
    await second;
    assert.equal(input.value, "Next thought");
  });

  test(`${file}: late IPC failures cannot restore another character's draft`, async () => {
    let reject;
    const ui = loadRenderer(file, { sendChatMessage: () => new Promise((_, fail) => { reject = fail; }) });
    ui.context.initial = state("Old draft");
    ui.run("applyChatState(initial)");
    const pending = ui.run(file === "chat.js" ? 'sendMessage("Old draft")' : "sendQuickMessage()");
    ui.context.next = state("", "luna", 1);
    ui.run("applyChatState(next)");
    reject(new Error("Connection closed"));
    await pending;
    assert.equal(inputFor(ui, file).value, "");
  });

  test(`${file}: delayed startup snapshots cannot replace a newer broadcast`, async () => {
    let initial;
    let update;
    const ui = loadRenderer(file, {
      getChatState: () => new Promise((resolve) => { initial = resolve; }),
      onChatStateUpdated: (callback) => { update = callback; },
    });
    update(state("Current draft"));
    initial(state("Stale draft"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(inputFor(ui, file).value, "Current draft");
  });
}

test("IME text is not sent or mirrored mid-composition; quick Shift+Enter stays in the editor", () => {
  let requests = 0;
  const changes = [];
  const ui = loadRenderer("quick-chat.js", {
    setChatDraft: (draft) => changes.push(draft),
    sendChatMessage: () => { requests++; },
  });
  ui.context.initial = state("");
  ui.run("applyChatState(initial)");
  const input = inputFor(ui, "quick-chat.js");
  input.events.compositionstart();
  input.value = "nihao";
  input.events.input();
  input.events.keydown({ key: "Enter", isComposing: true });
  assert.equal(changes.length, 0);
  input.value = "你好";
  input.events.compositionend();
  assert.equal(changes.at(-1).text, "你好");
  input.events.keydown({ key: "Enter", shiftKey: true });
  assert.equal(requests, 0);
});

test("concurrent composer edits converge without an older remote edit replacing queued local text", () => {
  const app = loadMain();
  const queue = [];
  const windows = [];
  for (const file of files) {
    let receive;
    let sender;
    const ui = loadRenderer(file, {
      onChatDraftUpdated: (callback) => { receive = callback; },
      setChatDraft: (draft) => { app.context.event = { sender }; app.context.draft = draft; app.run("setChatDraft(event,draft)"); },
    });
    sender = { send: (_topic, draft) => queue.push(() => receive(draft)) };
    windows.push({ ui, file, sender });
    ui.context.initial = state("");
    ui.run("applyChatState(initial)");
  }
  app.context.windows = windows.map(({ sender }) => ({ isDestroyed: () => false, webContents: sender }));
  app.run("[chatWindow,quickChatWindow]=windows");
  for (const [index, { ui, file }] of windows.entries()) {
    const input = inputFor(ui, file);
    input.value = index === 0 ? "Earlier edit" : "Latest edit";
    input.events.input();
  }
  for (const deliver of queue) deliver();
  for (const { ui, file } of windows) assert.equal(inputFor(ui, file).value, "Latest edit");
  assert.equal(app.run("chatState().draft.text"), "Latest edit");
});

test("a draft update received during initialization wins over an older initial snapshot", async () => {
  let receive;
  const ui = loadRenderer("quick-chat.js", { onChatDraftUpdated: (callback) => { receive = callback; } });
  receive({ ...state("Newer text").draft, version: 3 });
  ui.context.initial = state("Old snapshot");
  ui.run("applyChatState(initial)");
  assert.equal(inputFor(ui, "quick-chat.js").value, "Newer text");
});

test("streaming preserves existing message nodes, scroll, and a focused history control", () => {
  const ui = loadRenderer("chat.js");
  ui.run('applyChatState({history:[{role:"assistant",content:"Earlier reply"}],pending:{content:"New question",reply:"First"},busy:true})');
  const messages = ui.nodes.get("#messages");
  messages.scrollHeight = 500;
  messages.clientHeight = 100;
  messages.scrollTop = 24;
  const first = ui.run("renderedRows[0].bubble");
  ui.run('applyChatState({history:[{role:"assistant",content:"Earlier reply"}],pending:{content:"New question",reply:"First second"},busy:true})');
  assert.equal(ui.run("renderedRows[0].bubble"), first);
  assert.equal(messages.scrollTop, 24);
  assert.equal(ui.nodes.get("#latest-message").hidden, false);
});

test("quick retry stays visible on background voice updates and sends only once", async () => {
  let calls = 0;
  const ui = loadRenderer("quick-chat.js", { sendChatMessage: () => { calls++; return new Promise(() => {}); } });
  ui.run('applyChatState({history:[{role:"user",content:"Retry"},{role:"assistant",content:"Failed",failed:true}]})');
  assert.equal(ui.nodes.get("#retry-message").hidden, false);
  assert.equal(ui.nodes.get("#status").textContent, ui.run('text("quick.replyFailed")'));
  ui.nodes.get("#retry-message").events.click();
  ui.nodes.get("#retry-message").events.click();
  assert.equal(calls, 1);
});
