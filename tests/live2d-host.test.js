const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createModelHandler, installCore, runtimeReady } = require("../src/live2d-host");

test("model protocol serves only the active model's declared nonexecutable resources", async (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "pet-protocol-test-"));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const id = "imported-012345678901234567890123";
  let active = { id, type: "live2d" };
  const root = path.join(userData, "characters", id);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "character.json"), JSON.stringify({ resources: ["model.model3.json", "loader.js", "linked.json"] }));
  fs.writeFileSync(path.join(root, "model.model3.json"), "{}");
  fs.writeFileSync(path.join(root, "loader.js"), "alert('no')");
  fs.writeFileSync(path.join(userData, "settings.json"), "private fixture");
  fs.symlinkSync(path.join(userData, "settings.json"), path.join(root, "linked.json"));
  const handler = createModelHandler({ userData, sourceDir: path.join(__dirname, "../src"), getActiveCharacter: () => active });
  const request = (suffix, method = "GET") => handler({ url: `pet-live2d://viewer${suffix}`, method });
  const valid = request(`/models/${id}/model.model3.json`);
  assert.equal(valid.status, 200);
  assert.equal(await valid.text(), "{}");
  assert.match(valid.headers.get("Content-Security-Policy"), /connect-src 'self'/);
  for (const suffix of [`/models/${id}/loader.js`, `/models/${id}/linked.json`, `/models/${id}/character.json`,
    `/models/${id}/../settings.json`, `/models/${id}/%252e%252e/settings.json`, "/settings.json", "/index.html?token=private", "/core.js"]) {
    const result = request(suffix);
    assert.equal(result.status, 404, suffix);
    assert.equal(await result.text(), "Unavailable");
  }
  assert.equal(request("/index.html", "POST").status, 404);
  active = { id: "default", type: "sprite" };
  assert.equal(request(`/models/${id}/model.model3.json`).status, 404);
  assert.equal(request("/index.html").status, 200);
});

test("unknown runtime JavaScript is never installed or served", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pet-core-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "anything.js");
  fs.writeFileSync(source, "console.log('untrusted')");
  assert.throws(() => installCore(source, root), /unrecognized_runtime/);
  assert.equal(runtimeReady(root), false);
});
