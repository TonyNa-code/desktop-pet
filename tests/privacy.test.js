const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync, execFileSync } = require("node:child_process");

test("privacy checks include Unicode filenames and CommonJS modules", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-pet-privacy-"));
  try {
    fs.mkdirSync(path.join(root, "scripts"));
    fs.copyFileSync(path.join(__dirname, "../scripts/privacy-check.js"), path.join(root, "scripts/privacy-check.js"));
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    const privatePath = ["", "Users", "fixture-user", "private-file"].join("/");
    fs.writeFileSync(path.join(root, "使用指南.md"), privatePath);
    fs.writeFileSync(path.join(root, "module.cjs"), privatePath);
    const result = spawnSync(process.execPath, ["scripts/privacy-check.js"], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /使用指南\.md:1:1/);
    assert.match(result.stderr, /module\.cjs:1:1/);
    assert.equal(result.stderr.includes(privatePath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
