const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-pet-smoke-"));
const env = { ...process.env, PET_SMOKE_DATA: dataDir };
delete env.ELECTRON_RUN_AS_NODE;
const args = process.argv.slice(2).filter((arg) => arg !== "--packaged");
let status = 0;
try {
  if (process.argv.includes("--packaged")) {
    const output = path.resolve(process.env.PET_SMOKE_OUTPUT || path.join(__dirname, "../dist"));
    const candidates = process.platform === "darwin"
      ? ["mac", `mac-${process.arch}`].map((folder) => path.join(output, folder, "Desktop Pet.app/Contents/Resources/app.asar"))
      : [path.join(output, process.platform === "win32" ? "win-unpacked" : "linux-unpacked", "resources/app.asar")];
    const archive = candidates.find((file) => fs.existsSync(file));
    if (!archive) throw new Error("Packaged app.asar missing; build before running --packaged");
    env.PET_SMOKE_APP = archive;
    console.log("Testing packaged app resources with an isolated profile");
  }
  for (const phase of ["initial", "restart"]) {
    const result = spawnSync(require("electron"), [path.join(__dirname, "electron-smoke.cjs"), ...args], {
      env: { ...env, PET_SMOKE_PHASE: phase }, stdio: "inherit", timeout: 150000,
    });
    if (result.error) console.error(result.error.message);
    status = result.status ?? 1;
    if (status === 0 && !fs.existsSync(path.join(dataDir, `${phase}.passed`))) {
      console.error(`Electron ${phase} exited before completing its checks`);
      status = 1;
    }
    if (status !== 0) break;
  }
} finally {
  fs.rmSync(dataDir, { recursive: true, force: true });
}
process.exitCode = status;
