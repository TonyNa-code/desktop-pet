const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { unzipSync } = require("fflate");
const { pngSize } = require("./character-import");

const MAX_BYTES = 128 * 1024 * 1024;
const MAX_FILES = 256;
const MAX_JSON = 2 * 1024 * 1024;

function resourceName(value) {
  if (typeof value !== "string" || !value || value.length > 240
    || /[\\:%?#\x00-\x1f\x7f]/.test(value) || value.startsWith("/")) throw new Error("invalid_path");
  const parts = value.split("/");
  if (parts.length > 10 || parts.some((part) => !part || part === "." || part === ".."
    || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error("invalid_path");
  return value;
}

function readLocal(root, name, limit) {
  const parts = resourceName(name).split("/");
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error("symlink");
  }
  const stat = fs.statSync(current);
  if (!stat.isFile() || stat.size > limit) throw new Error("invalid_size");
  return fs.readFileSync(current);
}

function readJson(bytes) {
  if (!bytes || bytes.length > MAX_JSON) throw new Error("invalid_json");
  const value = JSON.parse(Buffer.from(bytes).toString("utf8"));
  const pending = [[value, 0]];
  let count = 0;
  while (pending.length) {
    const [item, depth] = pending.pop();
    if (++count > 150000 || depth > 24) throw new Error("complex_json");
    if (item && typeof item === "object") {
      for (const [key, child] of Object.entries(item)) {
        if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("invalid_json");
        pending.push([child, depth + 1]);
      }
    }
  }
  return value;
}

function readLive2DPack(source, decodeImage) {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error("symlink");
  let modelName;
  let read;
  if (stat.isFile() && source.endsWith(".zip")) {
    if (stat.size > MAX_BYTES) throw new Error("archive_too_large");
    let total = 0;
    let count = 0;
    const seen = new Set();
    const zip = unzipSync(fs.readFileSync(source), { filter(entry) {
      const name = entry.name.replace(/\/$/, "");
      resourceName(name);
      const folded = name.normalize("NFC").toLowerCase();
      if (seen.has(folded) || ++count > MAX_FILES) throw new Error("invalid_archive");
      seen.add(folded);
      if (!Number.isSafeInteger(entry.originalSize) || entry.originalSize < 0) throw new Error("invalid_size");
      total += entry.originalSize;
      if (total > MAX_BYTES || (/\.json$/i.test(name) && entry.originalSize > MAX_JSON)) throw new Error("archive_too_large");
      return /\.(moc3|png|json)$/i.test(name);
    } });
    const models = Object.keys(zip).filter((name) => name.endsWith(".model3.json"));
    if (models.length !== 1) throw new Error("model_count");
    const prefix = models[0].slice(0, models[0].lastIndexOf("/") + 1);
    modelName = models[0].slice(prefix.length);
    read = (name, limit) => {
      const bytes = zip[prefix + resourceName(name)];
      if (!bytes || bytes.length > limit) throw new Error("missing_resource");
      return Buffer.from(bytes);
    };
  } else {
    let root = source;
    if (stat.isFile() && source.endsWith(".model3.json")) {
      root = path.dirname(source);
      modelName = path.basename(source);
    } else if (stat.isDirectory()) {
      const models = fs.readdirSync(root).filter((name) => name.endsWith(".model3.json"));
      if (models.length !== 1) throw new Error("model_count");
      modelName = models[0];
    } else throw new Error("invalid_model");
    read = (name, limit) => readLocal(root, name, limit);
  }

  const raw = readJson(read(modelName, MAX_JSON));
  const refs = raw.FileReferences;
  if (raw.Version !== 3 || !refs || !Array.isArray(refs.Textures)
    || !refs.Textures.length || refs.Textures.length > 8) throw new Error("invalid_model");
  const files = Object.create(null);
  let bytesUsed = 0;
  let pixels = 0;
  const add = (name, extension) => {
    resourceName(name);
    if (!name.endsWith(extension)) throw new Error("invalid_resource");
    if (files[name]) return name;
    const bytes = read(name, extension.endsWith("json") ? MAX_JSON : MAX_BYTES);
    bytesUsed += bytes.length;
    if (bytesUsed > MAX_BYTES || Object.keys(files).length >= MAX_FILES) throw new Error("model_too_large");
    if (extension === ".png") {
      const size = pngSize(bytes);
      pixels += size.width * size.height;
      if (size.width > 8192 || size.height > 8192 || pixels > 64000000) throw new Error("image_too_large");
      if (decodeImage && !decodeImage(bytes)) throw new Error("image_decode_failed");
    } else if (extension.endsWith("json")) readJson(bytes);
    files[name] = bytes;
    return name;
  };
  const cleanRefs = { Moc: add(refs.Moc, ".moc3"), Textures: refs.Textures.map((name) => add(name, ".png")) };
  if (files[cleanRefs.Moc].length < 64 || files[cleanRefs.Moc].subarray(0, 4).toString() !== "MOC3") throw new Error("invalid_moc");
  for (const key of ["Physics", "Pose"]) if (refs[key]) cleanRefs[key] = add(refs[key], key === "Physics" ? ".physics3.json" : ".pose3.json");
  if (refs.Expressions !== undefined) {
    if (!Array.isArray(refs.Expressions) || refs.Expressions.length > 64) throw new Error("invalid_expressions");
    cleanRefs.Expressions = refs.Expressions.map((entry, index) => ({
      Name: String(entry.Name || `Expression ${index + 1}`).slice(0, 80), File: add(entry.File, ".exp3.json"),
    }));
  }
  cleanRefs.Motions = {};
  if (refs.Motions !== undefined) {
    if (!refs.Motions || Array.isArray(refs.Motions) || typeof refs.Motions !== "object"
      || Object.keys(refs.Motions).length > 32) throw new Error("invalid_motions");
    for (const [group, motions] of Object.entries(refs.Motions)) {
      if (group.length > 80 || !Array.isArray(motions) || motions.length > 64) throw new Error("invalid_motions");
      cleanRefs.Motions[group] = motions.map((entry) => {
        // Model audio is deliberately excluded: only the user's TTS may speak.
        const result = { File: add(entry.File, ".motion3.json") };
        for (const key of ["FadeInTime", "FadeOutTime"]) if (Number.isFinite(entry[key])) result[key] = Math.min(10, Math.max(0, entry[key]));
        return result;
      });
    }
  }
  const model = { Version: 3, FileReferences: cleanRefs };
  if (raw.Groups) {
    if (!Array.isArray(raw.Groups) || raw.Groups.length > 8) throw new Error("invalid_groups");
    model.Groups = raw.Groups.filter((group) => group.Target === "Parameter" && ["EyeBlink", "LipSync"].includes(group.Name))
      .map((group) => ({ Target: "Parameter", Name: group.Name,
        Ids: Array.isArray(group.Ids) ? group.Ids.slice(0, 64).filter((id) => typeof id === "string" && id.length <= 80) : [] }));
  }
  if (raw.Layout && typeof raw.Layout === "object") {
    model.Layout = Object.fromEntries(Object.entries(raw.Layout).filter(([key, value]) =>
      ["CenterX", "CenterY", "X", "Y", "Width", "Height", "Top", "Bottom", "Left", "Right"].includes(key)
      && Number.isFinite(value) && Math.abs(value) <= 100));
  }
  // Only this reconstructed resource graph is installed; no scripts, URLs or unrelated files.
  files["model.model3.json"] = Buffer.from(JSON.stringify(model));
  const digest = createHash("sha256");
  for (const name of Object.keys(files).sort()) digest.update(name).update(files[name]);
  const manifest = {
    schemaVersion: 1, type: "live2d", id: `imported-${digest.digest("hex").slice(0, 24)}`,
    name: modelName.replace(/\.model3\.json$/, "").slice(0, 80), description: "",
    model: "model.model3.json", resources: Object.keys(files),
    expressions: (cleanRefs.Expressions || []).map((item) => item.Name),
    motions: Object.fromEntries(Object.entries(cleanRefs.Motions).map(([group, items]) => [group, items.length])),
  };
  return { manifest, files };
}

function installLive2DPack(pack, root) {
  const target = path.join(root, pack.manifest.id);
  if (fs.existsSync(target)) return;
  fs.mkdirSync(root, { recursive: true });
  const staging = fs.mkdtempSync(path.join(root, ".import-"));
  try {
    for (const [name, bytes] of Object.entries(pack.files)) {
      const dest = path.join(staging, resourceName(name));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, bytes);
    }
    fs.writeFileSync(path.join(staging, "character.json"), JSON.stringify(pack.manifest, null, 2));
    fs.renameSync(staging, target);
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
}

module.exports = { readLive2DPack, installLive2DPack, resourceName, readLocal, MAX_BYTES };
