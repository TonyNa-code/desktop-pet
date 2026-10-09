const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { unzipSync } = require("fflate");

const MAX_BYTES = 64 * 1024 * 1024;
function safeName(name) {
  return typeof name === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(name) && !name.includes("..");
}

function readLimited(file, limit) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) throw new Error("invalid_file");
  return fs.readFileSync(file);
}

function pngSize(bytes) {
  if (!bytes || bytes.length < 33 || Buffer.from(bytes.subarray(0, 8)).toString("hex") !== "89504e470d0a1a0a") throw new Error("invalid_png");
  const buffer = Buffer.from(bytes);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!width || !height || width > 16384 || height > 16384 || width * height > 80000000) throw new Error("image_too_large");
  return { width, height };
}

function readPack(source, decodeImage) {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error("symlink");
  let files;
  if (stat.isDirectory()) {
    const manifest = JSON.parse(readLimited(path.join(source, "character.json"), 262144).toString("utf8"));
    files = { "character.json": Buffer.from(JSON.stringify(manifest)) };
    for (const name of new Set([manifest.sprite || "sprite.png", manifest.preview || "preview.png"])) {
      if (!safeName(name) || !name.endsWith(".png")) throw new Error("invalid_name");
      files[name] = readLimited(path.join(source, name), MAX_BYTES);
    }
  } else {
    let total = 0;
    let count = 0;
    const zip = unzipSync(readLimited(source, MAX_BYTES), { filter(entry) {
      if (++count > 48 || /(^|\/)\.\.(\/|$)|\\|^\/|:/.test(entry.name)) throw new Error("invalid_archive");
      if (!Number.isSafeInteger(entry.originalSize) || entry.originalSize < 0) throw new Error("invalid_size");
      total += entry.originalSize;
      if (total > MAX_BYTES) throw new Error("archive_too_large");
      return /(^|\/)character\.json$|\.png$/.test(entry.name);
    } });
    const manifests = Object.keys(zip).filter((name) => /(^|\/)character\.json$/.test(name));
    if (manifests.length !== 1) throw new Error("manifest_count");
    const root = manifests[0].slice(0, -"character.json".length);
    files = Object.fromEntries(Object.entries(zip).filter(([name]) => name.startsWith(root))
      .map(([name, bytes]) => [name.slice(root.length), Buffer.from(bytes)]));
  }
  if (files["character.json"].length > 262144) throw new Error("manifest_too_large");
  const raw = JSON.parse(files["character.json"].toString("utf8"));
  const sprite = raw.sprite || "sprite.png";
  const preview = raw.preview || "preview.png";
  if (![sprite, preview].every((name) => safeName(name) && name.endsWith(".png") && files[name])) throw new Error("missing_image");
  if (files[sprite].length + files[preview].length > MAX_BYTES) throw new Error("pack_too_large");
  const size = pngSize(files[sprite]);
  const previewSize = pngSize(files[preview]);
  if (previewSize.width * previewSize.height > 4000000) throw new Error("preview_too_large");
  if (decodeImage && [sprite, preview].some((name) => !decodeImage(files[name]))) throw new Error("image_decode_failed");
  const frame = raw.frame || {};
  if (![frame.width, frame.height, raw.columns].every((n) => Number.isInteger(n) && n > 0)) throw new Error("invalid_grid");
  if (size.width !== frame.width * raw.columns || size.height % frame.height) throw new Error("grid_mismatch");
  const states = raw.states;
  if (!states || !Object.hasOwn(states, "idle") || Object.keys(states).length > 128) throw new Error("missing_idle");
  for (const [name, state] of Object.entries(states)) {
    if (!safeName(name) || !Number.isInteger(state.row) || state.row < 0 || state.row >= size.height / frame.height
      || !Number.isInteger(state.frames) || state.frames < 1 || state.frames > raw.columns
      || !Number.isFinite(state.interval) || state.interval < 16 || state.interval > 60000) throw new Error("invalid_state");
  }
  for (const key of ["automaticActions", "clickActions"]) {
    if (raw[key] !== undefined && (!Array.isArray(raw[key]) || raw[key].length > 256
      || raw[key].some((name) => !Object.hasOwn(states, name)))) throw new Error("invalid_action");
  }
  if (raw.staticExpressions !== undefined && (!Array.isArray(raw.staticExpressions) || raw.staticExpressions.length > 512
    || raw.staticExpressions.some((item) => !item || !Object.hasOwn(states, item.state)
      || !Number.isInteger(item.frame) || item.frame < 0 || item.frame >= states[item.state].frames))) throw new Error("invalid_expression");
  const digest = createHash("sha256").update(JSON.stringify(raw)).update(files[sprite]).update(files[preview]).digest("hex").slice(0, 24);
  const manifest = {
    schemaVersion: 1, id: `imported-${digest}`, name: String(raw.name || "Character").slice(0, 80),
    description: String(raw.description || "").slice(0, 500), sprite, preview, frame,
    columns: raw.columns, states, automaticActions: raw.automaticActions || [],
    clickActions: raw.clickActions || [], staticExpressions: raw.staticExpressions || [],
  };
  return { manifest, files: { [sprite]: files[sprite], [preview]: files[preview] } };
}

function installPack(pack, root) {
  const target = path.join(root, pack.manifest.id);
  if (fs.existsSync(target)) return;
  fs.mkdirSync(root, { recursive: true });
  const staging = fs.mkdtempSync(path.join(root, ".import-"));
  try {
    for (const [name, bytes] of Object.entries(pack.files)) fs.writeFileSync(path.join(staging, name), bytes);
    fs.writeFileSync(path.join(staging, "character.json"), JSON.stringify(pack.manifest, null, 2));
    fs.renameSync(staging, target);
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
}

module.exports = { readPack, installPack, pngSize };
