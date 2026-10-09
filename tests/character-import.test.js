const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { zipSync } = require("fflate");
const { readPack, installPack } = require("../src/character-import");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64");
test("both bundled character formats can be imported", () => {
  for (const id of ["default", "luna"]) assert.match(readPack(path.join(__dirname, "../assets/characters", id)).manifest.id, /^imported-/);
});
function fixture(t, modify = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pet-import-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const raw = { id: "default", name: "Sample", sprite: "sprite.png", preview: "preview.png", frame: { width: 1, height: 1 }, columns: 1,
    states: { idle: { row: 0, frames: 1, interval: 900 } }, staticExpressions: [{ state: "idle", frame: 0 }] };
  modify(raw);
  fs.writeFileSync(path.join(root, "character.json"), JSON.stringify(raw, null, 2));
  fs.writeFileSync(path.join(root, "sprite.png"), png);
  fs.writeFileSync(path.join(root, "preview.png"), png);
  return { root, raw };
}

test("folder and wrapped ZIP import produce the same isolated character ID", (t) => {
  const { root } = fixture(t);
  const folder = readPack(root);
  assert.match(folder.manifest.id, /^imported-[a-f0-9]{24}$/);
  const archive = zipSync(Object.fromEntries(["character.json", "sprite.png", "preview.png"].map((name) => [`Sample/${name}`, fs.readFileSync(path.join(root, name))])));
  const file = path.join(root, "sample.zip"); fs.writeFileSync(file, archive);
  const zipped = readPack(file);
  assert.deepEqual(zipped.manifest, folder.manifest);
  installPack(folder, path.join(root, "installed"));
  installPack(folder, path.join(root, "installed"));
  assert.equal(fs.readdirSync(path.join(root, "installed")).length, 1);
});

for (const [label, change] of [
  ["path traversal", (raw) => { raw.sprite = "../sprite.png"; }],
  ["invalid row", (raw) => { raw.states.idle.row = 2; }],
  ["invalid frame", (raw) => { raw.staticExpressions[0].frame = 1; }],
  ["missing state", (raw) => { raw.clickActions = ["missing"]; }],
  ["oversized grid", (raw) => { raw.columns = 100; }],
]) test(`import rejects ${label}`, (t) => {
  assert.throws(() => readPack(fixture(t, change).root));
});

test("ZIP path traversal and undecodable PNG never install", (t) => {
  const { root } = fixture(t);
  const file = path.join(root, "bad.zip");
  fs.writeFileSync(file, zipSync({ "../character.json": Buffer.from("{}") }));
  assert.throws(() => readPack(file), /invalid_archive/);
  assert.throws(() => readPack(root, () => false), /image_decode_failed/);
});
