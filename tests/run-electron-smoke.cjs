const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-pet-smoke-"));
const env = { ...process.env, PET_SMOKE_DATA: dataDir };
delete env.ELECTRON_RUN_AS_NODE;
let status = 0;
try {
  for (const phase of ["initial", "restart"]) {
    const result = spawnSync(require("electron"), [path.join(__dirname, "electron-smoke.cjs"), ...process.argv.slice(2)], {
      env: { ...env, PET_SMOKE_PHASE: phase }, stdio: "inherit", timeout: 150000,
    });
    if (result.error) console.error(result.error.message);
    status = result.status ?? 1;
    if (status !== 0) break;
  }
} finally {
  fs.rmSync(dataDir, { recursive: true, force: true });
}
process.exitCode = status;
