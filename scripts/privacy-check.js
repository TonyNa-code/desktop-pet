const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.join(__dirname, "..");
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".txt",
  ".yaml",
  ".yml",
]);
const ignoredDirs = new Set([".git", "dist", "node_modules", "out"]);
const messagingArtifactPattern = [
  "x" + "wechat",
  "wx" + "id_",
  "com\\.ten" + "cent",
  "We" + "Chat",
].join("|");

const denyPatterns = [
  { name: "macOS home path", pattern: /\/Users\/[^/\s]+/g },
  { name: "macOS temporary path", pattern: /\/var\/folders\//g },
  { name: "Windows home path", pattern: /C:\\Users\\[^\\/\s]+/gi },
  { name: "messaging temporary artifact", pattern: new RegExp(`\\b(?:${messagingArtifactPattern})\\b`, "g") },
  { name: "local tool artifact", pattern: new RegExp("\\.co" + "dex\\b", "g") },
  { name: "environment secret assignment", pattern: /\b(?:OPENAI_API_KEY|DEEPSEEK_API_KEY|ANTHROPIC_API_KEY)\s*=/g },
  { name: "OpenAI-style secret", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "bearer token", pattern: /\bBearer\s+[A-Za-z0-9._-]{24,}\b/g },
];

function listGitFiles() {
  try {
    return execFileSync("git", ["ls-files"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\r?\n/)
      .filter(Boolean);
  } catch {
    return null;
  }
}

function listFilesRecursively(dir, baseDir = dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(absolutePath, baseDir));
    } else if (entry.isFile()) {
      files.push(path.relative(baseDir, absolutePath));
    }
  }
  return files;
}

function isTextFile(file) {
  return textExtensions.has(path.extname(file).toLowerCase());
}

function lineAndColumn(source, index) {
  const before = source.slice(0, index);
  const lines = before.split(/\r?\n/);
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

function listGitCandidateFiles() {
  try {
    return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\r?\n/)
      .filter(Boolean);
  } catch {
    return null;
  }
}

const files = (listGitCandidateFiles() || listGitFiles() || listFilesRecursively(repoRoot)).filter(isTextFile);
const findings = [];

for (const file of files) {
  const absolutePath = path.join(repoRoot, file);
  let source = "";
  try {
    source = fs.readFileSync(absolutePath, "utf8");
  } catch {
    continue;
  }

  for (const { name, pattern } of denyPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const location = lineAndColumn(source, match.index);
      findings.push(`${file}:${location.line}:${location.column} ${name}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Privacy check failed. Remove private paths, local artifacts, or secrets:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log(`Privacy check OK: scanned ${files.length} text files`);
