const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const root = path.join(__dirname, "..");

test("bundled CJK fonts match the unmodified upstream files and retain their license", () => {
  for (const [file, expected] of [
    ["NotoSansSC-Regular.otf", "fc0fda9394367c16c1af7555a2ae4d5e2e6a6f02"],
    ["NotoSansJP-Regular.otf", "4af556abb9cc42e585aab777b01857246a110746"],
  ]) {
    const data = fs.readFileSync(path.join(root, "assets/fonts", file));
    assert.equal(data.subarray(0, 4).toString(), "OTTO");
    const blob = createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex");
    assert.equal(blob, expected, file);
  }
  assert.match(fs.readFileSync(path.join(root, "assets/fonts/OFL.txt"), "utf8"), /SIL OPEN FONT LICENSE Version 1\.1/);
});

test("every user-facing window loads local fallback fonts under a self-only font policy", () => {
  for (const page of ["index", "chat", "quick-chat", "settings"]) {
    const html = fs.readFileSync(path.join(root, `src/${page}.html`), "utf8");
    assert.match(html, /href="\.\/fonts\.css"/);
    assert.match(html, /font-src 'self';/);
  }
  const css = fs.readFileSync(path.join(root, "src/fonts.css"), "utf8");
  assert.match(css, /:root:lang\(ja\)/);
  assert.equal((css.match(/url\("\.\.\/assets\/fonts\/NotoSans(?:SC|JP)-Regular\.otf"\)/g) || []).length, 2);
  assert.doesNotMatch(css, /https?:/);
});
