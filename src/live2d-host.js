const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { readLocal, resourceName } = require("./live2d-import");

const ORIGIN = "pet-live2d://viewer";
const CORE_URL = "https://cubism.live2d.com/sdk-web/core/05/live2dcubismcore.min.js";
const CORE_SHA256 = "25ae938cb4fe282ce189b357bcc97e603d1e1f7ec78bf04150d401c23cdc792f";
const CORE_LIMIT = 4 * 1024 * 1024;
const POLICY = "default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'";

function corePath(userData) { return path.join(userData, "live2d-runtime", "live2dcubismcore.min.js"); }
function validCore(bytes) {
  return bytes.length <= CORE_LIMIT && createHash("sha256").update(bytes).digest("hex") === CORE_SHA256;
}
function runtimeReady(userData) {
  try { return validCore(readLocal(path.dirname(corePath(userData)), path.basename(corePath(userData)), CORE_LIMIT)); }
  catch { return false; }
}
function installCore(source, userData) {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > CORE_LIMIT) throw new Error("invalid_runtime");
  const bytes = fs.readFileSync(source);
  if (!validCore(bytes)) throw new Error("unrecognized_runtime");
  const target = corePath(userData);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(`${target}.tmp`, bytes);
  fs.renameSync(`${target}.tmp`, target);
}

function createModelHandler({ userData, sourceDir, getActiveCharacter }) {
  const viewerFiles = new Map([
    ["/index.html", ["index.html", "text/html"]],
    ["/viewer.js", ["viewer.js", "text/javascript"]],
    ["/rig.js", ["rig.js", "text/javascript"]],
    ["/viewer.css", ["viewer.css", "text/css"]],
    ["/pixi.min.js", ["vendor/pixi.min.js", "text/javascript"]],
    ["/cubism4.min.js", ["vendor/cubism4.min.js", "text/javascript"]],
  ]);
  return (request) => {
    const headers = { "Content-Security-Policy": POLICY, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" };
    try {
      const url = new URL(request.url);
      if (url.protocol !== "pet-live2d:" || url.hostname !== "viewer" || url.port || url.username || url.password
        || url.search || request.method !== "GET") throw new Error();
      let bytes;
      let mime;
      if (viewerFiles.has(url.pathname)) {
        const [file, type] = viewerFiles.get(url.pathname);
        bytes = readLocal(path.join(sourceDir, "live2d"), file, 8 * 1024 * 1024); mime = type;
      } else if (url.pathname === "/core.js") {
        bytes = readLocal(path.dirname(corePath(userData)), path.basename(corePath(userData)), CORE_LIMIT);
        if (!validCore(bytes)) throw new Error();
        mime = "text/javascript";
      } else {
        const match = /^\/models\/(imported-[a-f0-9]{24})\/(.+)$/.exec(url.pathname);
        const pack = getActiveCharacter();
        if (!match || pack?.type !== "live2d" || pack.id !== match[1]) throw new Error();
        const name = resourceName(decodeURIComponent(match[2]));
        const root = path.join(userData, "characters", pack.id);
        const manifest = JSON.parse(readLocal(root, "character.json", 262144).toString("utf8"));
        if (!Array.isArray(manifest.resources) || !manifest.resources.includes(name)) throw new Error();
        mime = name.endsWith(".png") ? "image/png" : name.endsWith(".json") ? "application/json" : name.endsWith(".moc3") ? "application/octet-stream" : null;
        if (!mime) throw new Error();
        bytes = readLocal(root, name, 128 * 1024 * 1024);
      }
      return new Response(bytes, { headers: { ...headers, "Content-Type": mime } });
    } catch { return new Response("Unavailable", { status: 404, headers }); }
  };
}

module.exports = { ORIGIN, CORE_URL, CORE_SHA256, POLICY, validCore, runtimeReady, installCore, createModelHandler };
