const { app, BrowserWindow, screen } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");

const dataDir = process.env.PET_SMOKE_DATA || fs.mkdtempSync(path.join(os.tmpdir(), "desktop-pet-smoke-"));
const screenshots = path.join(__dirname, "../out/smoke");
app.setPath("userData", dataDir);
app.disableHardwareAcceleration();

const wav = Buffer.alloc(44 + 800);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write("data", 36); wav.writeUInt32LE(800, 40);
const requests = [];
let delayedResponse;
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    if (req.url === "/tts") {
      res.writeHead(200, { "content-type": "audio/wav" });
      res.end(wav);
      return;
    }
    const payload = JSON.parse(body);
    requests.push(payload);
    const last = payload.messages.at(-1).content;
    if (last === "Delayed message") { delayedResponse = res; return; }
    if (last === "Failure message") { res.writeHead(401); res.end("Invalid test credential"); return; }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: "Test reply received." } }] }));
  });
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await delay(50);
  }
  throw new Error(`Timed out: ${label}`);
}
function evaluate(window, fn, ...args) {
  return window.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
}
async function findWindow(file) {
  const window = await until(() => BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().endsWith(file)), file);
  await until(() => !window.webContents.isLoading(), `${file} loaded`);
  await evaluate(window, () => {
    window.smokeErrors = [];
    window.addEventListener("error", (event) => window.smokeErrors.push(event.message));
    window.addEventListener("unhandledrejection", (event) => window.smokeErrors.push(String(event.reason)));
  });
  return window;
}
async function screenshot(window, name) {
  fs.mkdirSync(screenshots, { recursive: true });
  fs.writeFileSync(path.join(screenshots, `${name}.png`), (await window.webContents.capturePage()).toPNG());
}

async function run() {
  if (process.env.PET_SMOKE_PHASE === "restart") {
    require("../src/main.js");
    await app.whenReady();
    const pet = await findWindow("index.html");
    const state = await evaluate(pet, () => window.desktopPet.getAppState());
    assert.equal(state.settings.persona.name, "Test Character");
    assert.equal(state.settings.language, "en-US");
    assert.equal(state.settings.scale, 1.5);
    assert.equal(state.settings.characterId, "default");
    assert.equal(state.settings.tts.provider, "custom");
    assert.equal(state.settings.affection.enabled, false);
    await delay(1100);
    assert.equal(BrowserWindow.getAllWindows().length, 1);
    console.log("Electron restart PASS: saved settings restored; first-launch setup does not reopen.");
    return;
  }
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  require("../src/main.js");
  await app.whenReady();
  const pet = await findWindow("index.html");
  const settings = await findWindow("settings.html");
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  await until(() => evaluate(pet, () => {
    const pixels = document.querySelector("canvas").getContext("2d").getImageData(0, 0, 768, 832).data;
    return pixels.some((value, index) => index % 4 === 3 && value > 0);
  }), "nonblank character canvas");
  await evaluate(settings, (url) => {
    document.querySelector("#persona-name").value = "Test Character";
    document.querySelector("#base-url").value = `${url}/v1`;
    document.querySelector("#model").value = "test-model";
    document.querySelector("#api-key").value = "unsaved-test-key";
    document.querySelector("#language").value = "en-US";
    document.querySelector("#language").dispatchEvent(new Event("change"));
  }, endpoint);
  assert.equal(await evaluate(settings, () => document.querySelector("#api-key").value), "unsaved-test-key");
  await evaluate(pet, () => window.desktopPet.setSettings({ scale: 1.5 }));
  await until(() => pet.getBounds().width === 320 && pet.getBounds().height === 444, "pet size");
  const bounds = pet.getBounds();
  const workArea = screen.getDisplayMatching(bounds).workArea;
  assert.ok(bounds.y >= workArea.y && bounds.y + bounds.height <= workArea.y + workArea.height);
  assert.equal(await evaluate(settings, () => document.querySelector("#persona-name").value), "Test Character");
  await evaluate(settings, () => {
    document.querySelector("#api-key").value = "";
    document.querySelector("#test-llm").click();
  });
  await until(() => evaluate(settings, () => document.querySelector("#llm-test-status").textContent.includes("Test reply received")), "connection test");
  await evaluate(settings, () => document.querySelector("#save-settings").click());
  await until(() => fs.existsSync(path.join(dataDir, "settings.json"))
    && JSON.parse(fs.readFileSync(path.join(dataDir, "settings.json"))).persona.name === "Test Character", "saved settings");
  await screenshot(settings, "settings");
  await evaluate(pet, () => window.desktopPet.openChatWindow());
  const chat = await findWindow("chat.html");
  async function send(message) {
    await evaluate(chat, (text) => {
      document.querySelector("#message-input").value = text;
      document.querySelector("#send-message").click();
    }, message);
    await until(() => evaluate(chat, () => !document.querySelector("#send-message").disabled), "chat reply");
  }
  await send("First message");
  await send("Second message");
  assert.ok(requests.at(-1).messages.some((message) => message.role === "assistant" && message.content === "Test reply received."));
  await send("Failure message");
  await send("Recovery message");
  assert.equal(requests.at(-1).messages.some((message) => message.content === "Failure message"), false);
  await screenshot(chat, "chat");

  await evaluate(pet, () => window.desktopPet.openQuickChatWindow());
  const quick = await findWindow("quick-chat.html");
  await evaluate(quick, () => {
    document.querySelector("#quick-input").value = "Delayed message";
    document.querySelector("#send").click();
  });
  await until(() => delayedResponse, "delayed request");
  await until(() => evaluate(chat, () => document.querySelector("#send-message").disabled), "shared busy state");
  await evaluate(chat, () => document.querySelector("#clear-history").click());
  await until(() => evaluate(quick, () => !document.querySelector("#send").disabled), "cancelled quick input");
  delayedResponse.end(JSON.stringify({ choices: [{ message: { content: "Late reply" } }] }));
  await send("After clear");
  assert.deepEqual(requests.at(-1).messages.slice(1).map((message) => message.content), ["After clear"]);
  assert.equal((await evaluate(chat, () => window.desktopPet.getChatState())).history.length, 2);

  for (const language of ["ja-JP", "zh-CN", "en-US"]) {
    await evaluate(pet, (value) => window.desktopPet.setSettings({ language: value }), language);
    await until(() => evaluate(chat, (value) => document.documentElement.lang === value, language), "interface language");
    assert.equal(await evaluate(chat, () => document.documentElement.scrollWidth <= window.innerWidth), true);
  }
  await evaluate(pet, () => window.desktopPet.setSettings({ characterId: "luna", expressionMode: "clickOnly" }));
  await until(() => evaluate(pet, () => character.id === "luna" && spriteImage && state === "idle"), "Luna loaded");
  const initialFrame = await evaluate(pet, () => document.querySelector("canvas").toDataURL());
  await evaluate(pet, () => {
    document.querySelector("canvas").dispatchEvent(new PointerEvent("pointerdown", { button: 0 }));
    window.dispatchEvent(new PointerEvent("pointerup", { button: 0, detail: 1 }));
  });
  const nextFrame = await evaluate(pet, () => document.querySelector("canvas").toDataURL());
  assert.notEqual(nextFrame, initialFrame);
  await delay(1400);
  assert.equal(await evaluate(pet, () => document.querySelector("canvas").toDataURL()), nextFrame);
  await screenshot(pet, "pet");
  await evaluate(pet, () => window.desktopPet.setSettings({ characterId: "default", expressionMode: "automatic" }));
  await until(() => evaluate(pet, () => character.id === "default" && spriteImage?.src.includes("/default/")), "default character restored");

  await evaluate(settings, (url) => window.desktopPet.saveChatConfig({ tts: { provider: "custom", enabled: true, endpoint: `${url}/tts`, customBodyTemplate: '{"text":"{{text}}"}' } }), endpoint);
  const voice = await evaluate(pet, () => window.desktopPet.synthesizeSpeech("Voice test"));
  assert.equal(voice.ok, true);
  assert.ok(voice.audioDataUrl.startsWith("data:audio/wav;base64,"));
  assert.equal(await evaluate(pet, (url) => new Promise((resolve) => {
    const audio = new Audio(url);
    audio.addEventListener("loadeddata", () => resolve(true), { once: true });
    audio.addEventListener("error", () => resolve(false), { once: true });
    audio.load();
  }), voice.audioDataUrl), true);
  await screenshot(quick, "quick-input");
  for (const window of [pet, settings, chat, quick]) {
    assert.deepEqual(await evaluate(window, () => window.smokeErrors), []);
  }
  console.log("Electron smoke PASS: startup, canvas, resizing, settings drafts/save, chat/context/errors, cross-window cancellation, languages, character switching, click-only mode, voice HTTP/audio decode.");
}

const watchdog = setTimeout(() => { console.error("Electron smoke timed out"); app.exit(1); }, 120000);
run().then(() => finish(0), async (error) => {
  console.error(error);
  for (const window of BrowserWindow.getAllWindows()) await screenshot(window, `failure-${window.id}`).catch(() => {});
  finish(1);
});
function finish(code) {
  clearTimeout(watchdog);
  server.closeAllConnections();
  server.close();
  app.exit(code);
}
