const fs = require("node:fs");
const path = require("node:path");

const expected = {
  width: 6144,
  height: 6656,
};

const file = path.join(__dirname, "..", "assets", "sprites", "qiongmei-soft-4x.png");
const buffer = fs.readFileSync(file);

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

const size = readPngSize(buffer);
if (size.width !== expected.width || size.height !== expected.height) {
  throw new Error(`Expected ${expected.width}x${expected.height}, got ${size.width}x${size.height}`);
}

console.log(`Asset OK: qiongmei-soft-4x.png ${size.width}x${size.height}`);
