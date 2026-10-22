const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePlacement, capturePlacement, restorePlacement, fitBounds, defaultBounds } = require("../src/window-placement");
const { loadMain } = require("./helpers");
const { loadPet } = require("./pet-helpers");

const primary = { x: 0, y: 24, width: 1440, height: 876 };
const secondary = { x: -1920, y: -160, width: 1920, height: 1080 };
const size = { width: 320, height: 472 };
function inside(bounds, area) {
  assert.ok(bounds.x >= area.x && bounds.y >= area.y);
  assert.ok(bounds.x + bounds.width <= area.x + area.width);
  assert.ok(bounds.y + bounds.height <= area.y + area.height);
}

test("placement round-trips in DIP coordinates on offset and negative-coordinate displays", () => {
  for (const area of [primary, secondary]) {
    for (let i = 0; i <= 10; i++) {
      const bounds = fitBounds({ ...size, x: area.x + i * 110, y: area.y + i * 45 }, area);
      assert.deepEqual(restorePlacement(capturePlacement(bounds, area), size, [primary, secondary], primary), bounds);
    }
  }
});

test("missing displays fall back to the primary display and work-area changes retain relative placement", () => {
  const saved = capturePlacement({ ...size, x: -700, y: 260 }, secondary);
  inside(restorePlacement(saved, size, [primary], primary), primary);
  const smaller = { x: 0, y: 40, width: 1000, height: 700 };
  const current = capturePlacement({ ...size, x: 800, y: 300 }, primary);
  const restored = restorePlacement(current, size, [smaller], smaller);
  inside(restored, smaller);
  assert.ok(Math.abs(restored.y + restored.height - (smaller.y + current.bottom * smaller.height)) <= 1);
});

test("malformed positions fall back safely and persisted fields exclude display identifiers", () => {
  for (const value of [null, {}, {version:2}, {version:1,area:primary,center:Infinity,bottom:1},
    {version:1,area:{...primary,width:0.2},center:0.5,bottom:1}, {version:1,area:{...primary,x:1e9},center:0.5,bottom:1}]) {
    assert.equal(normalizePlacement(value), null);
    assert.deepEqual(restorePlacement(value, size, [primary], primary), defaultBounds(size, primary));
  }
  const saved = capturePlacement({...size,x:0,y:0}, {...primary,id:123,label:"Private display",serial:"private"});
  assert.deepEqual(Object.keys(saved).sort(), ["area", "bottom", "center", "version"]);
  assert.deepEqual(Object.keys(saved.area).sort(), ["height", "width", "x", "y"]);
});

test("small work areas constrain native bounds without losing the top controls", () => {
  for (const area of [{x:0,y:0,width:280,height:340}, {x:-500,y:20,width:500,height:400}]) {
    inside(defaultBounds({width:384,height:576}, area), area);
    inside(restorePlacement(capturePlacement({...size,x:400,y:300}, primary), {width:384,height:576}, [area], area), area);
  }
  const pet = loadPet();
  const styles = {};
  pet.context.document.documentElement.style.setProperty = (key, value) => { styles[key] = value; };
  pet.context.window.innerWidth = 280;
  pet.context.window.innerHeight = 340;
  pet.run("settings.scale = 2; applyPetLayout()");
  assert.equal(styles["--pet-height"], "180px");
  assert.equal(pet.run("settings.scale"), 2);
  pet.context.window.innerWidth = 384;
  pet.context.window.innerHeight = 576;
  pet.events.resize();
  assert.equal(styles["--pet-height"], "416px");
});

function placementApp(overrides = {}) {
  const app = loadMain({ screen: { getPrimaryDisplay: () => ({workArea:primary}),
    getAllDisplays: () => [{workArea:primary}], getDisplayMatching: () => ({workArea:primary}) }, ...overrides });
  app.run(`settings.scale = 1.5; globalThis.bounds = {x:100,y:200,width:320,height:472};
    mainWindow = {isDestroyed:()=>false, getBounds:()=>({...bounds}), setBounds:(value)=>{bounds=value},
      isMinimized:()=>false,show(){},focus(){}};`);
  return app;
}

test("placement saves are isolated, coalesced and survive a restart", () => {
  const app = placementApp();
  app.run("savePlacement()");
  const first = app.writes.get("test-user-data/window-placement.json");
  assert.equal(app.writes.size, 1);
  app.writes.clear();
  app.run("savePlacement()");
  assert.equal(app.writes.size, 0);
  app.writes.set("test-user-data/window-placement.json", first);
  app.run("petPlacement = null; readPlacement(); bounds = {...bounds,x:9999}; restorePetPlacement()");
  assert.equal(app.run("bounds.x"), 100);
  assert.equal(app.run("bounds.y"), 200);
});

test("failed placement saves leave other files intact and can be retried", () => {
  let fail = false;
  const app = placementApp({ fs: { renameSync: (from, to) => {
    if (fail) throw new Error("disk unavailable");
    app.writes.set(to, app.writes.get(from)); app.writes.delete(from);
  } } });
  app.run("savePlacement()");
  const saved = app.writes.get("test-user-data/window-placement.json");
  fail = true;
  app.run("bounds.x = 250; savePlacement()");
  assert.equal(app.writes.get("test-user-data/window-placement.json"), saved);
  fail = false;
  app.run("savePlacement()");
  assert.notEqual(app.writes.get("test-user-data/window-placement.json"), saved);
});

test("display event bursts cancel pending position saves and recover once from the settled position", () => {
  const timers = new Map();
  let id = 0;
  const app = placementApp({ setTimeout: (fn) => { timers.set(++id,fn); return id; }, clearTimeout: (id) => timers.delete(id) });
  app.run("savePlacement(); windowMoved(); bounds.x = 9000; scheduleDisplayRecovery(); windowMoved(); scheduleDisplayRecovery()");
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  assert.equal(app.run("bounds.x"), 100);
});

test("ending a drag and recovery actions keep the pet reachable and do not touch conversation state", () => {
  const app = placementApp();
  app.run('chatHistory = [{role:"user",content:"Keep this"}]; settings.assistant.apiKey = "test-only-secret"');
  app.run("bounds.x = 9000; bounds.y = -9000; dragSnapshot = {}; endDrag()");
  inside(app.run("bounds"), primary);
  app.run("bounds.x = -9000; showPet(); resetPosition()");
  inside(app.run("bounds"), primary);
  assert.equal(app.run("chatHistory[0].content"), "Keep this");
  assert.equal(app.run("settings.assistant.apiKey"), "test-only-secret");
  assert.doesNotMatch([...app.writes.values()].join(""), /Keep this|test-only-secret/);
});

test("tray recovery is translated and tray creation failures do not block the app", () => {
  const app = placementApp({ nativeImage: { createFromPath: () => {throw new Error("No tray support");} } });
  assert.doesNotThrow(() => app.run("createTray()"));
  assert.equal(app.run("tray"), null);
  for (const language of ["en-US","zh-CN","ja-JP"]) {
    app.run(`settings.language = ${JSON.stringify(language)}`);
    const items = app.run("recoveryMenuItems()");
    assert.doesNotMatch(items[0].label, /menu\./);
    assert.equal(items[0].id, "show-pet");
    assert.equal(items[1].id, "reset-position");
  }
});

test("a second instance exits without loading or modifying the owner profile", () => {
  let quit = false;
  let initialized = false;
  const app = loadMain({ app: {requestSingleInstanceLock:()=>false, quit:()=>{quit=true;},
    whenReady:()=>{initialized=true; return {then(){}};} } });
  assert.equal(quit, true);
  assert.equal(initialized, false);
  assert.equal(app.writes.size, 0);
});

test("reopening the application reveals the current pet without replacing its conversation", () => {
  const events = {};
  const app = placementApp({ app: { on:(name,fn)=>{events[name]=fn;} } });
  app.run('globalThis.revealed = 0; mainWindow.show = () => revealed++; chatHistory = [{role:"user",content:"Still here"}]');
  events.activate();
  events["second-instance"]();
  assert.equal(app.run("revealed"), 2);
  assert.equal(app.run("chatHistory[0].content"), "Still here");
});

test("tray actions survive language changes and icon files are included in the app package", () => {
  let instance;
  const app = placementApp({ nativeImage: { createFromPath: () => ({isEmpty:()=>false,resize(){return this;}}) },
    Tray: function () { instance = this; this.isDestroyed=()=>false; this.on=()=>{};
      this.setToolTip=(value)=>{this.title=value;}; this.setContextMenu=(value)=>{this.menu=value;}; } });
  app.run("createTray()");
  assert.equal(instance.menu[0].id, "show-pet");
  app.run('settings.language = "ja-JP"; updateTrayMenu()');
  assert.equal(instance.menu[0].label, "ペットを表示");
  const { build } = require("../package.json");
  for (const file of ["build/icon.png", "build/icon.ico"]) assert.ok(build.files.includes(file));
});

test("quitting flushes a recent move even before the debounce timer fires", () => {
  const events = {};
  const timers = new Map();
  const app = placementApp({ app: { on:(name,fn)=>{events[name]=fn;} },
    setTimeout:(fn)=>{timers.set(1,fn);return 1;}, clearTimeout:(id)=>timers.delete(id) });
  app.run("windowMoved(); bounds.x = 230");
  events["before-quit"]();
  assert.equal(timers.size, 0);
  const saved = JSON.parse(app.writes.get("test-user-data/window-placement.json"));
  assert.equal(restorePlacement(saved, size, [primary], primary).x, 230);
  // A cancelled quit must not disable later position saves.
  app.run("bounds.x = 280; windowMoved()");
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  assert.equal(restorePlacement(JSON.parse(app.writes.get("test-user-data/window-placement.json")), size, [primary], primary).x, 280);
});
