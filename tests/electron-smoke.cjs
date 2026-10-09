const { app, BrowserWindow, screen, dialog, Menu, clipboard } = require("electron");
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
let streamResponse;
let ttsRequest;
let retryAttempts = 0;
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    if (req.url === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "test-model" }, { id: "other-model" }] }));
      return;
    }
    if (req.url.startsWith("/tts")) {
      ttsRequest = { method: req.method, url: req.url, body };
      res.writeHead(200, { "content-type": "audio/wav" });
      res.end(req.url.startsWith("/tts-invalid") ? Buffer.alloc(800) : wav);
      return;
    }
    const payload = JSON.parse(body);
    requests.push(payload);
    const last = payload.messages.at(-1).content;
    if (last === "Streaming message" || last === "Stopped stream") {
      assert.equal(payload.stream, true);
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write('data: {"choices":[{"delta":{"content":"[expression:wa"}}]}\n\n');
      res.write('data: {"choices":[{"delta":{"content":"ving] First paragraph\\n\\n"}}]}\n\n');
      streamResponse = res;
      return;
    }
    if (last === "Delayed message") { delayedResponse = res; return; }
    if (last === "Failure message") { res.writeHead(401); res.end("Invalid test credential"); return; }
    if (last === "Retry once" && ++retryAttempts === 1) { res.writeHead(503); res.end("Try again"); return; }
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
    const history = (await evaluate(pet, () => window.desktopPet.getChatState())).history;
    assert.ok(history.some((item) => item.content === "Remember this message"));
    await evaluate(pet, () => window.desktopPet.setSettings({ characterId: "luna" }));
    await until(() => evaluate(pet, async () => (await window.desktopPet.getAppState()).settings.characterId === "luna"), "restart character switch");
    assert.equal((await evaluate(pet, () => window.desktopPet.getChatState())).history.length, 0);
    await evaluate(pet, () => window.desktopPet.setSettings({ characterId: "default" }));
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
  assert.ok(Menu.getApplicationMenu().items.some((item) => item.role?.toLowerCase() === "editmenu"));
  const savedClipboard = clipboard.availableFormats().map((format) => [format, clipboard.readBuffer(format)]);
  try {
    clipboard.writeText("test-only-paste-value");
    await evaluate(settings, () => {
      document.querySelector("#tab-chat").click();
      document.querySelector("#api-key").focus();
    });
    settings.webContents.paste();
    await until(() => evaluate(settings, () => document.querySelector("#api-key").value === "test-only-paste-value"), "native password field paste");
    await evaluate(settings, () => { document.querySelector("#api-key").value = ""; });
  } finally {
    clipboard.clear();
    for (const [format, buffer] of savedClipboard) clipboard.writeBuffer(format, buffer);
  }
  const inactiveVoice = await evaluate(settings, () => {
    document.querySelector("#tab-voice").click();
    return ["system-voice-row", "external-tts-fields", "rate-row", "pitch-row"].every((id) =>
      getComputedStyle(document.getElementById(id)).display === "none");
  });
  assert.equal(inactiveVoice, true);
  await evaluate(settings, () => {
    document.querySelector("#base-url").value = "invalid URL";
    document.querySelector("#save-settings").click();
  });
  assert.equal(await evaluate(settings, () => document.querySelector("#base-url").getAttribute("aria-invalid")), "true");
  assert.equal((await evaluate(pet, () => window.desktopPet.getChatState())).config.assistant.baseUrl, "");
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
  await evaluate(settings, () => document.querySelector("#fetch-models").click());
  await until(() => evaluate(settings, () => !document.querySelector("#model-options").hidden), "model discovery");
  assert.equal(await evaluate(settings, () => document.querySelector("#model-options").options.length), 3);
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
  await send("Retry once");
  await evaluate(chat, () => document.querySelector("#retry-message").click());
  await until(() => retryAttempts === 2 && evaluate(chat, () => !document.querySelector("#send-message").disabled), "retry sends and completes");
  assert.equal((await evaluate(chat, () => window.desktopPet.getChatState())).history.at(-1).failed, false);
  await screenshot(chat, "chat");

  await evaluate(pet, () => document.querySelector("#talk").click());
  const quick = await findWindow("quick-chat.html");
  assert.equal(await evaluate(quick, () => document.querySelector("#character-name").textContent), "Test Character");
  const originalPetBounds = pet.getBounds();
  const beforeQuick = quick.getBounds();
  pet.setPosition(originalPetBounds.x - 100, originalPetBounds.y - 40);
  await until(() => quick.getBounds().x !== beforeQuick.x, "companion input follows pet");
  const expectedQuick = require("../src/companion-layout").companionBounds(pet.getBounds(), screen.getDisplayMatching(pet.getBounds()).workArea);
  assert.deepEqual(quick.getBounds(), expectedQuick);
  pet.setBounds(originalPetBounds);
  await evaluate(quick, () => {
    document.querySelector("#quick-input").value = "Delayed message";
    document.querySelector("#send").click();
  });
  await until(() => delayedResponse, "delayed request");
  await until(() => evaluate(chat, () => document.querySelector("#send-message").disabled), "shared busy state");
  await evaluate(chat, () => { window.confirm = () => true; document.querySelector("#clear-history").click(); });
  await until(() => evaluate(quick, () => !document.querySelector("#send").disabled), "cancelled quick input");
  delayedResponse.end(JSON.stringify({ choices: [{ message: { content: "Late reply" } }] }));
  await send("After clear");
  assert.deepEqual(requests.at(-1).messages.slice(1).map((message) => message.content), ["After clear"]);
  assert.equal((await evaluate(chat, () => window.desktopPet.getChatState())).history.length, 2);

  await evaluate(chat, () => {
    document.querySelector("#message-input").value = "Streaming message";
    document.querySelector("#send-message").click();
  });
  await until(() => evaluate(chat, () => document.querySelector("#messages").textContent.includes("First paragraph")), "incremental reply before completion");
  assert.equal(await evaluate(pet, () => state), "waving");
  assert.equal(await evaluate(pet, () => document.querySelector("#speech-bubble").textContent.includes("[expression:")), false);
  assert.equal(await evaluate(chat, () => document.querySelector("#stop-message").hidden), false);
  const longReply = "Long reply ".repeat(220);
  streamResponse.write(`data: ${JSON.stringify({ choices: [{ delta: { content: longReply }, finish_reason: "stop" }] })}\n\n`);
  streamResponse.end("data: [DONE]\n\n");
  await until(() => evaluate(chat, () => !document.querySelector("#send-message").disabled), "stream completion");
  assert.equal((await evaluate(chat, () => window.desktopPet.getChatState())).history.at(-1).content, `First paragraph\n\n${longReply.trim()}`);
  assert.equal(await evaluate(pet, () => document.querySelector("#speech-bubble").textContent), `First paragraph\n\n${longReply.trim()}`);
  await evaluate(pet, () => document.querySelector("#speech-bubble").dispatchEvent(new MouseEvent("mouseenter")));
  await delay(3000);
  assert.equal(await evaluate(pet, () => document.querySelector("#speech-bubble").classList.contains("visible")), true);
  await evaluate(pet, () => document.querySelector("#speech-bubble").click());

  await evaluate(chat, () => {
    document.querySelector("#message-input").value = "Stopped stream";
    document.querySelector("#send-message").click();
  });
  await until(() => evaluate(chat, () => document.querySelector(".message:last-child .bubble")?.textContent === "First paragraph\n\n"), "second streaming reply");
  await evaluate(quick, () => document.querySelector("#stop").click());
  await until(() => evaluate(chat, () => !document.querySelector("#send-message").disabled), "stop from other window");
  assert.equal((await evaluate(chat, () => window.desktopPet.getChatState())).history.at(-1).failed, true);
  assert.equal(await evaluate(chat, () => document.querySelector("#retry-message").hidden), false);
  streamResponse.end("data: [DONE]\n\n");
  await send("After stop");
  assert.equal(requests.at(-1).messages.some((item) => item.content === "Stopped stream"), false);

  for (const language of ["ja-JP", "zh-CN", "en-US"]) {
    await evaluate(pet, (value) => window.desktopPet.setSettings({ language: value }), language);
    await until(() => evaluate(chat, (value) => document.documentElement.lang === value, language), "interface language");
    assert.equal(await evaluate(chat, () => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.equal(await evaluate(quick, () => document.documentElement.scrollWidth <= window.innerWidth && document.querySelector("#quick-input").getBoundingClientRect().bottom <= window.innerHeight), true);
  }
  await evaluate(pet, () => window.desktopPet.setSettings({ characterId: "luna", expressionMode: "clickOnly" }));
  await until(() => evaluate(pet, () => character.id === "luna" && spriteImage && state === "idle"), "Luna loaded");
  assert.equal((await evaluate(chat, () => window.desktopPet.getChatState())).config.persona.name, "");
  assert.equal((await evaluate(chat, () => window.desktopPet.getChatState())).history.length, 0);
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
  await evaluate(settings, (url) => {
    document.querySelector("#tab-voice").click();
    document.querySelector("#tts-provider").value = "custom";
    document.querySelector("#tts-provider").dispatchEvent(new Event("change"));
    document.querySelector("#tts-endpoint").value = `${url}/tts-invalid`;
    document.querySelector("#tts-request-mode").value = "query";
    document.querySelector("#test-tts").click();
  }, endpoint);
  await until(() => evaluate(settings, () => document.querySelector("#tts-test-status").textContent.includes("Voice playback failed")), "invalid audio reports playback failure");
  assert.equal(ttsRequest.method, "GET");
  assert.ok(ttsRequest.url.includes("text="));
  await evaluate(settings, (url) => {
    document.querySelector("#tts-endpoint").value = `${url}/tts`;
    document.querySelector("#test-tts").click();
  }, endpoint);
  await until(() => evaluate(settings, () => document.querySelector("#tts-test-status").textContent.includes("playback started")), "valid audio starts playback");

  const originalDialog = dialog.showMessageBox;
  let confirmations = 0;
  dialog.showMessageBox = async () => { confirmations++; return { response: 0 }; };
  await evaluate(settings, () => { document.querySelector("#persona-name").value = "Unsaved"; document.querySelector("#back-to-chat").click(); });
  await until(() => confirmations === 1, "unsaved leave confirmation");
  assert.equal(settings.isDestroyed(), false);
  assert.equal(await evaluate(settings, () => document.querySelector("#persona-name").value), "Unsaved");
  // Import uses the real IPC/validation/install path with a predetermined file picker result.
  const originalPicker = dialog.showOpenDialog;
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(__dirname, "../assets/characters/default")] });
  await evaluate(settings, () => { document.querySelector("#tab-character").click(); document.querySelector("#import-folder").click(); });
  await until(() => evaluate(settings, () => !document.querySelector("#import-preview").hidden), "import preview");
  await evaluate(settings, () => document.querySelector("#confirm-import").click());
  await until(() => evaluate(settings, () => document.querySelectorAll(".character-card").length === 3), "installed character visible");
  const imported = (await evaluate(settings, () => window.desktopPet.getChatState())).characters.find((item) => item.imported);
  assert.ok(imported);
  await evaluate(pet, (id) => window.desktopPet.setSettings({ characterId: id }), imported.id);
  await until(() => evaluate(pet, (id) => character.id === id && spriteImage?.src.includes(id), imported.id), "imported sprite loaded");
  assert.equal(await evaluate(pet, () => document.querySelector("canvas").getContext("2d").getImageData(0, 0, 768, 832).data.some((value, index) => index % 4 === 3 && value > 0)), true);
  dialog.showMessageBox = async () => ({ response: 1 });
  const removed = await evaluate(settings, (id) => window.desktopPet.removeCharacterImport(id), imported.id);
  assert.equal(removed.ok, true);
  assert.equal(removed.characters.length, 2);
  assert.equal(fs.existsSync(path.join(dataDir, "characters", imported.id)), false);
  dialog.showOpenDialog = originalPicker;
  dialog.showMessageBox = originalDialog;
  await evaluate(settings, () => window.desktopPet.saveChatConfig({ rememberHistory: true }));
  await send("Remember this message");
  // Exercise all setting tabs at the supported minimum window size.
  settings.setSize(560, 620);
  for (const tab of ["general", "character", "chat", "voice"]) {
    await evaluate(settings, (name) => document.querySelector(`#tab-${name}`).click(), tab);
    assert.equal(await evaluate(settings, () => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.equal(await evaluate(settings, () => document.querySelector("#save-settings").getBoundingClientRect().bottom <= window.innerHeight), true);
    await screenshot(settings, `settings-${tab}`);
  }
  await screenshot(quick, "quick-input");
  for (const window of [pet, settings, chat, quick]) {
    assert.deepEqual(await evaluate(window, () => window.smokeErrors), []);
  }
  console.log("Electron smoke PASS: startup, canvas, resizing, drafts, validation, settings tabs, streaming, stop, long replies, bubble hover, context isolation, languages, click-only, voice GET/playback errors, import/preview/remove and optional history.");
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
