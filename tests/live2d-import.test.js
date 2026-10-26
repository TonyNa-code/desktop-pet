const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { zipSync } = require("fflate");
const { readLive2DPack, installLive2DPack, resourceName } = require("../src/live2d-import");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64");

function fixture(t, change = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pet-model-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const raw = { Version: 3, FileReferences: {
    Moc: "sample.moc3", Textures: ["textures/skin.png"],
    Expressions: [{ Name: "Smile", File: "smile.exp3.json" }],
    Motions: { Idle: [{ File: "rest.motion3.json", Sound: "private.wav" }] },
  }, Groups: [{ Target: "Parameter", Name: "LipSync", Ids: ["ParamMouthOpenY"] }], url: "https://example.invalid/tracker" };
  change(raw);
  const moc = Buffer.alloc(64); moc.write("MOC3");
  const files = { "sample.model3.json": Buffer.from(JSON.stringify(raw)), "sample.moc3": moc,
    "textures/skin.png": png, "smile.exp3.json": Buffer.from('{"Parameters":[]}'),
    "rest.motion3.json": Buffer.from('{"Version":3,"Curves":[]}'), "private.wav": Buffer.from("unused") };
  for (const [name, bytes] of Object.entries(files)) {
    const target = path.join(root, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
  }
  return { root, files };
}

test("Live2D folder, selected model and wrapped ZIP install the same bounded resource graph", (t) => {
  const { root, files } = fixture(t);
  const pack = readLive2DPack(root);
  const zipPath = path.join(root, "model.zip");
  fs.writeFileSync(zipPath, zipSync(Object.fromEntries(Object.entries(files).map(([key, bytes]) => [`Model/${key}`, bytes]))));
  assert.deepEqual(readLive2DPack(zipPath), pack);
  assert.deepEqual(readLive2DPack(path.join(root, "sample.model3.json")), pack);
  assert.equal(pack.manifest.type, "live2d");
  assert.deepEqual(pack.manifest.expressions, ["Smile"]);
  const model = JSON.parse(pack.files["model.model3.json"]);
  assert.equal(model.url, undefined);
  assert.equal(model.FileReferences.Motions.Idle[0].Sound, undefined);
  assert.equal(pack.files["private.wav"], undefined);
  installLive2DPack(pack, path.join(root, "installed"));
  installLive2DPack(pack, path.join(root, "installed"));
  assert.ok(fs.existsSync(path.join(root, "installed", pack.manifest.id, "textures/skin.png")));
});

for (const unsafe of ["../key.json", "/key.json", "https://example.invalid/a.png", "file:///key.json", "a\\b.png", "a/%2e%2e/b.png", "a.png?token=1", "CON.png", "a./b.png", "a//b.png"]) {
  test(`Live2D rejects nonportable or escaping resource ${unsafe}`, () => assert.throws(() => resourceName(unsafe)));
}
for (const [label, change] of [
  ["remote texture", (raw) => { raw.FileReferences.Textures = ["https://example.invalid/x.png"]; }],
  ["executable reference", (raw) => { raw.FileReferences.Moc = "loader.js"; }],
  ["too many textures", (raw) => { raw.FileReferences.Textures = Array(9).fill("textures/skin.png"); }],
  ["invalid version", (raw) => { raw.Version = 2; }],
]) test(`Live2D rejects ${label}`, (t) => assert.throws(() => readLive2DPack(fixture(t, change).root)));

test("Live2D rejects missing resources, symlinked directories and malformed PNGs", (t) => {
  const { root } = fixture(t);
  assert.throws(() => readLive2DPack(root, () => false), /image_decode_failed/);
  fs.renameSync(path.join(root, "textures"), path.join(root, "real-textures"));
  fs.symlinkSync(path.join(root, "real-textures"), path.join(root, "textures"), "junction");
  assert.throws(() => readLive2DPack(root), /symlink/);
  fs.unlinkSync(path.join(root, "textures"));
  assert.throws(() => readLive2DPack(root));
});

test("native hit areas survive import with unique names and no unrelated metadata", (t) => {
  const { root } = fixture(t, raw => { raw.HitAreas = [
    { Id: "HitAreaHead", Name: "", url: "https://example.invalid" },
    { Id: "HitAreaBody", Name: "" }, { Id: "Hair", Name: "Head" }, { Id: "Hair2", Name: "Head" },
    { Id: "Hands", Name: "__proto__" },
  ]; });
  const areas = JSON.parse(readLive2DPack(root).files["model.model3.json"]).HitAreas;
  assert.equal(areas.length, 5);
  assert.equal(new Set(areas.map(area => area.Name)).size, 5);
  assert.equal(areas[0].Name, "HitAreaHead 1");
  assert.equal(areas[1].Name, "HitAreaBody 2");
  assert.equal(areas[0].url, undefined);
  assert.equal(areas.some(area => area.Name === "__proto__"), false);
});

test("malformed or unbounded hit areas are rejected", t => {
  for (const areas of [null, {}, [null], [{ Id: "" }], [{ Id: "x".repeat(129) }], Array(65).fill({ Id: "Head" })]) {
    assert.throws(() => readLive2DPack(fixture(t, raw => { raw.HitAreas = areas; }).root), /invalid_hit_areas/);
  }
});

test("Live2D ZIP rejects ambiguous models, traversal and case-colliding paths", (t) => {
  const { root, files } = fixture(t);
  const target = path.join(root, "bad.zip");
  for (const extra of [{ "second.model3.json": files["sample.model3.json"] }, { "../secret.json": Buffer.from("{}") }, { "textures/SKIN.png": png }]) {
    fs.writeFileSync(target, zipSync({ ...files, ...extra }));
    assert.throws(() => readLive2DPack(target));
  }
});
