const fs = require("node:fs");
const path = require("node:path");

const charactersDir = path.join(__dirname, "..", "assets", "characters");
const requiredStates = [
  "idle",
  "runningRight",
  "runningLeft",
  "waving",
  "jumping",
  "failed",
  "running",
  "review",
];

function readPngSize(png) {
  const signature = png.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error("spritesheet is not a PNG file");
  }
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

function validateCharacter(folderName) {
  const characterDir = path.join(charactersDir, folderName);
  const manifestPath = path.join(characterDir, "character.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const spritePath = path.join(characterDir, manifest.sprite || "sprite.png");
  const sprite = fs.readFileSync(spritePath);
  const size = readPngSize(sprite);
  const frame = manifest.frame || {};
  const expectedWidth = Number(frame.width) * Number(manifest.columns);
  const rowCount = Math.max(...Object.values(manifest.states || {}).map((state) => Number(state.row))) + 1;
  const expectedHeight = Number(frame.height) * rowCount;

  if (size.width !== expectedWidth || size.height !== expectedHeight) {
    throw new Error(`${folderName}: expected ${expectedWidth}x${expectedHeight}, got ${size.width}x${size.height}`);
  }

  for (const stateName of requiredStates) {
    const state = manifest.states?.[stateName];
    if (!state) throw new Error(`${folderName}: missing state ${stateName}`);
    if (!Number.isFinite(Number(state.row))) throw new Error(`${folderName}: ${stateName} row is invalid`);
    if (!Number.isFinite(Number(state.frames))) throw new Error(`${folderName}: ${stateName} frames is invalid`);
    if (!Number.isFinite(Number(state.interval))) throw new Error(`${folderName}: ${stateName} interval is invalid`);
  }

  for (const stateName of manifest.automaticActions || []) {
    if (!manifest.states?.[stateName]) throw new Error(`${folderName}: automatic action ${stateName} is missing`);
  }

  for (const stateName of manifest.clickActions || []) {
    if (!manifest.states?.[stateName]) throw new Error(`${folderName}: click action ${stateName} is missing`);
  }

  for (const expression of manifest.staticExpressions || []) {
    if (!manifest.states?.[expression.state]) throw new Error(`${folderName}: static expression ${expression.state} is missing`);
    if (!Number.isFinite(Number(expression.frame))) throw new Error(`${folderName}: static expression frame is invalid`);
  }

  console.log(`Character OK: ${folderName} ${size.width}x${size.height}`);
}

const characters = fs.readdirSync(charactersDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

if (characters.length === 0) {
  throw new Error("No character packs found");
}

for (const character of characters) {
  validateCharacter(character);
}
