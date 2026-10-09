const test = require("node:test");
const assert = require("node:assert/strict");
const { loadMain, loadRenderer } = require("./helpers");

test("full chat sends a message and becomes ready for the next one", async () => {
  const sent = [];
  const ui = loadRenderer("chat.js", {
    sendChatMessage: async (message) => {
      sent.push(message);
      return { ok: true, history: [{ role: "assistant", content: "Hello" }] };
    },
  });
  await ui.run('sendMessage(" hello ")');
  await ui.run('sendMessage("again")');
  assert.deepEqual(sent, ["hello", "again"]);
  assert.equal(ui.nodes.get("#send-message").disabled, false);
  assert.equal(ui.run("sending"), false);
  assert.equal(ui.run("history.at(-1).content"), "Hello");
});

test("full chat recovers from a rejected request", async () => {
  const ui = loadRenderer("chat.js", { sendChatMessage: async () => { throw new Error("offline"); } });
  await ui.run('sendMessage("hello")');
  assert.equal(ui.nodes.get("#send-message").disabled, false);
  assert.equal(ui.run("sending"), false);
  assert.equal(ui.run("history.at(-1).content"), ui.run('text("chat.sendFailedReply")'));
});

test("full chat ignores repeated submission while waiting", async () => {
  let finish;
  let calls = 0;
  const ui = loadRenderer("chat.js", { sendChatMessage: () => {
    calls++;
    return new Promise((resolve) => { finish = resolve; });
  } });
  const request = ui.run('sendMessage("hello")');
  await ui.run('sendMessage("duplicate")');
  assert.equal(calls, 1);
  finish({ ok: true, history: [] });
  await request;
  assert.equal(ui.run("sending"), false);
});

test("failed requests remain visible but do not pollute subsequent model context", async () => {
  let succeed = false;
  const requests = [];
  const app = loadMain({ fetch: async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return succeed
      ? new Response(JSON.stringify({ choices: [{ message: { content: "Hello" } }] }), { headers: { "content-type": "application/json" } })
      : new Response("Unauthorized", { status: 401 });
  } });
  app.run('settings.assistant = { ...DEFAULT_SETTINGS.assistant, baseUrl: "https://service.example/v1", model: "test" }');
  const failed = await app.run('sendChatMessage(null, "failed attempt")');
  assert.equal(failed.ok, false);
  assert.equal(failed.history.length, 2);
  assert.ok(failed.history.every((message) => message.failed));
  succeed = true;
  await app.run('sendChatMessage(null, "retry")');
  assert.deepEqual(requests[1].messages.slice(1), [{ role: "user", content: "retry" }]);
  await app.run('sendChatMessage(null, "next")');
  assert.deepEqual(requests[2].messages.slice(1).map((message) => message.content), ["retry", "Hello", "next"]);
});

function deferredApp() {
  const requests = [];
  const app = loadMain({ fetch: (_url, options) => new Promise((resolve) => requests.push({ resolve, options })) });
  app.run('settings = normalizeSettings({assistant:{baseUrl:"https://service.example/v1",model:"test"}})');
  const finish = (index, reply) => requests[index].resolve(new Response(JSON.stringify({ choices: [{ message: { content: reply } }] })));
  return { app, requests, finish };
}

test("the main process prevents simultaneous requests from different windows", async () => {
  const { app, requests, finish } = deferredApp();
  const first = app.run('sendChatMessage(null,"first")');
  const second = await app.run('sendChatMessage(null,"second")');
  assert.equal(second.error, "chat_busy");
  assert.equal(requests.length, 1);
  finish(0, "First reply");
  await first;
  const next = app.run('sendChatMessage(null,"second")');
  assert.deepEqual(JSON.parse(requests[1].options.body).messages.slice(1).map((message) => message.content), ["first", "First reply", "second"]);
  finish(1, "Second reply");
  await next;
  assert.equal(app.run("chatState().busy"), false);
});

test("clear aborts the request and discards late replies without blocking a new conversation", async () => {
  const { app, requests, finish } = deferredApp();
  const old = app.run('sendChatMessage(null,"old")');
  const cleared = app.run("clearChatHistory()");
  assert.equal(cleared.history.length, 0);
  assert.equal(requests[0].options.signal.aborted, true);
  const current = app.run('sendChatMessage(null,"current")');
  finish(0, "Late reply");
  assert.equal((await old).cancelled, true);
  assert.equal(app.run("chatState().busy"), true);
  finish(1, "Current reply");
  await current;
  assert.equal(app.run("chatHistory.length"), 2);
  assert.equal(app.run("chatHistory[0].content"), "current");
});

test("changing persona cancels a reply generated with the previous persona", async () => {
  const { app, requests, finish } = deferredApp();
  const pending = app.run('sendChatMessage(null,"hello")');
  app.run('applyChatConfigPatch({persona:{name:"New character"}})');
  assert.equal(requests[0].options.signal.aborted, true);
  finish(0, "Old character reply");
  assert.equal((await pending).cancelled, true);
  assert.equal(app.run("chatHistory.length"), 0);
});

test("chat completion and clearing are broadcast to both chat windows", async () => {
  const { app, finish } = deferredApp();
  app.run('globalThis.events = []; chatWindow = quickChatWindow = {isDestroyed:()=>false,webContents:{send:(topic,state)=>events.push({topic,state})}}');
  const pending = app.run('sendChatMessage(null,"hello")');
  assert.equal(app.run("events.length"), 2);
  assert.equal(app.run("events[0].state.busy"), true);
  finish(0, "Reply");
  await pending;
  assert.equal(app.run("events.at(-1).state.history.length"), 2);
  assert.equal(app.run("events.at(-1).state.busy"), false);
  app.run("clearChatHistory()");
  assert.equal(app.run("events.at(-1).state.history.length"), 0);
});

test("both chat renderers retain text while the other window is busy", async () => {
  for (const file of ["chat.js", "quick-chat.js"]) {
    let calls = 0;
    const ui = loadRenderer(file, { sendChatMessage: async () => { calls++; } });
    const input = ui.nodes.get(file === "chat.js" ? "#message-input" : "#quick-input");
    input.value = "Draft";
    ui.run('applyChatState({busy:true,revision:0,pending:{content:"Other window"}})');
    await ui.run(file === "chat.js" ? 'sendMessage("Draft")' : "sendQuickMessage()");
    assert.equal(calls, 0);
    assert.equal(input.value, "Draft");
  }
});

test("a cancelled renderer request cannot overwrite cleared history or a new request", async () => {
  let resolve;
  const ui = loadRenderer("chat.js", { sendChatMessage: () => new Promise((done) => { resolve = done; }) });
  const pending = ui.run('sendMessage("Old")');
  ui.run('applyChatState({history:[],busy:false,revision:1})');
  resolve({ ok: false, cancelled: true, revision: 0, history: [{ content: "Old" }] });
  await pending;
  assert.equal(ui.run("history.length"), 0);
  assert.equal(ui.nodes.get("#send-message").disabled, false);
});
