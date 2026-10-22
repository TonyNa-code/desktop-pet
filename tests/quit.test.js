const test = require("node:test");
const assert = require("node:assert/strict");
const { loadMain, loadRenderer } = require("./helpers");

function quitApp() {
  const events = {};
  let quits = 0;
  const app = loadMain({ app: { on:(name,fn)=>{events[name]=fn;}, quit:()=>quits++ } });
  app.run(`globalThis.requests = []; globalThis.aborts = 0;
    speechSession = {controller:{abort:()=>aborts++}};
    companionSettingsWindow = {isDestroyed:()=>false,show(){},focus(){},webContents:{
      isLoading:()=>false,isCrashed:()=>false,send:(name)=>requests.push(name)}};`);
  let prevented = 0;
  const attempt = () => events["before-quit"]({preventDefault:()=>prevented++});
  return { ...app, attempt, quits:()=>quits, prevented:()=>prevented };
}

test("quit waits for settings before closing windows or stopping speech and coalesces repeated requests", () => {
  const app = quitApp();
  app.attempt(); app.attempt();
  assert.equal(app.prevented(), 2);
  assert.equal(app.run("requests.length"), 1);
  assert.equal(app.run("requests[0]"), "app-quit-requested");
  assert.equal(app.run("aborts"), 0);
  assert.equal(app.writes.size, 0);
});

test("cancel leaves the session running and only this settings window can approve a later quit", () => {
  const app = quitApp();
  app.attempt();
  app.run("confirmAppQuit({sender:{}},true)");
  assert.equal(app.quits(), 0);
  assert.equal(app.run("quitPending"), true);
  app.run("confirmAppQuit({sender:companionSettingsWindow.webContents},false)");
  assert.equal(app.run("quitPending"), false);
  assert.equal(app.run("quitApproved"), false);
  assert.equal(app.run("aborts"), 0);
  app.attempt();
  app.run("confirmAppQuit({sender:companionSettingsWindow.webContents},true)");
  assert.equal(app.quits(), 1);
  app.attempt();
  assert.equal(app.prevented(), 2);
  assert.equal(app.run("aborts"), 1);
  app.run("confirmAppQuit({sender:companionSettingsWindow.webContents},true)");
  assert.equal(app.quits(), 1);
});

test("absent, loading and crashed settings renderers do not trap quit", () => {
  for (const state of ["companionSettingsWindow = null",
    "companionSettingsWindow.webContents.isLoading = () => true",
    "companionSettingsWindow.webContents.isCrashed = () => true"]) {
    const app = quitApp(); app.run(state); app.attempt();
    assert.equal(app.prevented(), 0);
    assert.equal(app.run("aborts"), 1);
  }
});

function quitSettings(confirmDiscard) {
  let request;
  const replies = [];
  const ui = loadRenderer("settings.js", {onAppQuitRequested:(fn)=>{request=fn;},
    confirmAppQuit:(value)=>replies.push(value), confirmDiscard});
  ui.run("renderConfig()");
  return { ...ui, request, replies };
}

test("settings preserves unsaved edits after a cancelled or failed quit confirmation", async () => {
  for (const confirm of [async()=>false, async()=>{throw new Error("Dialog closed");}]) {
    const ui = quitSettings(confirm);
    ui.nodes.get("#persona-name").value = "Keep editing";
    await ui.request();
    assert.deepEqual(ui.replies, [false]);
    assert.equal(ui.run("allowClose"), false);
    assert.equal(ui.nodes.get("#persona-name").value, "Keep editing");
  }
});

test("confirmed discard allows closing without saving or prompting a second time", async () => {
  let prompts = 0;
  const ui = quitSettings(async()=>{prompts++; return true;});
  ui.nodes.get("#persona-name").value = "Discard this";
  await ui.request();
  assert.deepEqual(ui.replies, [true]);
  assert.equal(ui.run("allowClose"), true);
  assert.equal(prompts, 1);
  assert.notEqual(ui.run('savedForm.find((field) => field.element === document.querySelector("#persona-name")).value'), "Discard this");
});

test("clean settings approves immediately while an in-progress save prevents quitting", async () => {
  const ui = quitSettings(async()=>{throw new Error("Unexpected prompt");});
  ui.nodes.get("#save-settings").disabled = true;
  await ui.request();
  assert.deepEqual(ui.replies, [false]);
  ui.nodes.get("#save-settings").disabled = false;
  await ui.request();
  assert.deepEqual(ui.replies, [false,true]);
});
