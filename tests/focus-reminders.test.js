const test = require("node:test");
const assert = require("node:assert/strict");
const { loadMain } = require("./helpers");

function setup() {
  const pending = new Map();
  let id = 0;
  const app = loadMain({
    setTimeout(fn, ms) { pending.set(++id, { fn, ms }); return id; },
    clearTimeout(token) { pending.delete(token); },
  });
  app.run('globalThis.now = 1000000; Date.now = () => now; globalThis.notices = []; notify = (_, body) => notices.push(body)');
  return { ...app, pending };
}

test("focus keeps its deadline on repeated starts; pause and resume preserve the exact remainder", () => {
  const { run, pending } = setup();
  run("startFocusTimer(); now += 72001; startFocusTimer()");
  assert.equal(pending.size, 1);
  assert.equal(run("focusMenuItems()[0].label"), "Focus: 23:48 left");
  const stalePause = run("focusMenuItems()[1].click");
  stalePause();
  assert.equal(pending.size, 0);
  run("now += 3600000; reconcileFocusTimer()");
  assert.equal(run("focusMenuItems()[0].label"), "Paused: 23:48 left");
  stalePause();
  run("focusMenuItems()[1].click()");
  const [timer] = pending.values();
  assert.equal(timer.ms, 25 * 60000 - 72001);
  run("now += 1500000; reconcileFocusTimer()");
  timer.fn();
  assert.equal(run("notices.filter(text => text === t('notify.focusEndBody')).length"), 1);
  assert.equal(run("focusMenuItems()[0].label"), "Start 25-Min Focus");
});

test("ending focus invalidates old callbacks and menu actions without cancelling the next session", () => {
  const { run, pending } = setup();
  run("startFocusTimer()");
  const [oldTimer] = pending.values();
  const oldEnd = run("focusMenuItems()[2].click");
  oldEnd();
  assert.equal(pending.size, 0);
  run("startFocusTimer()");
  oldEnd(); oldTimer.fn();
  assert.equal(pending.size, 1);
  assert.equal(run("focusMenuItems()[0].label"), "Focus: 25:00 left");
  run("focusMenuItems()[1].click(); focusMenuItems()[2].click()");
  assert.equal(run("focusSession"), null);
  assert.equal(run("notices.includes(t('notify.focusEndBody'))"), false);
});

test("a menu left open across a deadline cannot pause an expired session", () => {
  const { run, pending } = setup();
  run("startFocusTimer(); const items = focusMenuItems(); now += 1500001; items[1].click(); items[2].click()");
  assert.equal(run("focusSession"), null);
  assert.equal(pending.size, 0);
  assert.equal(run("notices.length"), 2);
});

test("saving unrelated preferences preserves the scheduled break; changing the interval replaces it", () => {
  const { run } = setup();
  try {
    run("updateSettings({restReminderMinutes:30}); const initial = restReminderTimer");
    assert.ok(run("initial"));
    for (const patch of [{ scale: 1.5 }, { language: "ja-JP" }, { characterId: "luna" }, { restReminderMinutes: 30 }]) {
      run(`updateSettings(${JSON.stringify(patch)})`);
      assert.equal(run("restReminderTimer === initial"), true);
    }
    run("updateSettings({restReminderMinutes:60})");
    assert.equal(run("restReminderTimer === initial"), false);
    run("updateSettings({restReminderMinutes:0})");
    assert.equal(run("restReminderTimer"), null);
  } finally { run("clearInterval(restReminderTimer)"); }
});
