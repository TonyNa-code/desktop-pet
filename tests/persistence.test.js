const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { loadMain } = require("./helpers");

test("failed state replacement preserves settings, character profile, history and credentials", () => {
  let fail = false;
  const app = loadMain({ fs: { renameSync(from, to) {
    if (fail && to.endsWith("characters-state.json")) throw new Error("disk failure");
    app.writes.set(to, app.writes.get(from)); app.writes.delete(from);
  } } });
  app.run('applyChatConfigPatch({persona:{name:"Previous"},profile:{affection:37},rememberHistory:true,assistant:{baseUrl:"https://first.example",model:"test",apiKey:"private-test-key"}}); addChatMessage("user","Saved message"); writeCharacterSessions()');
  const snapshot = app.writes.get(app.run("characterStatePath()"));
  fail = true;
  assert.throws(() => app.run('applyChatConfigPatch({characterId:"luna",persona:{name:"Next"},profile:{affection:90},assistant:{baseUrl:"https://second.example"}})'), /disk failure/);
  assert.equal(app.writes.get(app.run("characterStatePath()")), snapshot);
  assert.equal(app.run("settings.characterId"), "default");
  assert.equal(app.run("profile.affection"), 37);
  fail = false;
  app.run("readSettings(); readProfile(); readCharacterSessions()");
  assert.equal(app.run("settings.persona.name"), "Previous");
  assert.equal(app.run("settings.assistant.apiKey"), "private-test-key");
  assert.equal(app.run("chatHistory[0].content"), "Saved message");
  assert.equal(snapshot.includes("private-test-key"), false);
});

test("an outdated legacy mirror cannot override a committed unified snapshot", () => {
  let failMirror = false;
  const app = loadMain({ fs: { writeFileSync(file, value) {
    if (failMirror && file.endsWith(`${path.sep}settings.json.tmp`)) throw new Error("mirror failure");
    app.writes.set(file, value);
  } } });
  app.run('applyChatConfigPatch({persona:{name:"Before"}})');
  failMirror = true;
  app.run('applyChatConfigPatch({persona:{name:"Committed"},profile:{affection:42},assistant:{baseUrl:"https://new.example",model:"test"}})');
  assert.equal(JSON.parse(app.writes.get(app.run("settingsPath()"))).persona.name, "Before");
  app.run("readSettings(); readProfile(); readCharacterSessions()");
  assert.equal(app.run("settings.persona.name"), "Committed");
  assert.equal(app.run("profile.affection"), 42);
  assert.equal(app.run("settings.assistant.baseUrl"), "https://new.example");
});

test("the previous per-character storage format migrates without losing opted-in history", () => {
  const app = loadMain();
  app.writes.set(app.run("settingsPath()"), JSON.stringify({ characterId: "luna", assistant: { baseUrl: "https://example.com", model: "test" } }));
  app.writes.set(app.run("characterStatePath()"), JSON.stringify({ version: 1, characters: {
    luna: { persona: { name: "Existing" }, rememberHistory: true, profile: { affection: 51 }, history: [{ role: "user", content: "Previous message" }] },
  } }));
  app.run("readSettings(); readProfile(); readCharacterSessions(); writeSettings()");
  assert.equal(app.run("settings.persona.name"), "Existing");
  assert.equal(app.run("profile.affection"), 51);
  assert.equal(app.run("chatHistory[0].content"), "Previous message");
  assert.equal(JSON.parse(app.writes.get(app.run("characterStatePath()"))).version, 2);
});

test("failed history deletion keeps messages and broadcasts an idle state", () => {
  let fail = false;
  const app = loadMain({ fs: { renameSync(from, to) {
    if (fail && to.endsWith("characters-state.json")) throw new Error("disk failure");
    app.writes.set(to, app.writes.get(from)); app.writes.delete(from);
  } } });
  app.run('addChatMessage("user","Keep this"); writeCharacterSessions(); globalThis.events=[]; chatWindow={isDestroyed:()=>false,webContents:{send:(_topic,state)=>events.push(state)}}');
  fail = true;
  assert.throws(() => app.run("clearChatHistory()"), /disk failure/);
  assert.equal(app.run("chatHistory[0].content"), "Keep this");
  assert.equal(app.run("events.at(-1).busy"), false);
});
