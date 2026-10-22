const { app, BrowserWindow, screen, dialog, Menu, clipboard } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { restorePlacement } = require("../src/window-placement");

const dataDir = process.env.PET_SMOKE_DATA || fs.mkdtempSync(path.join(os.tmpdir(), "desktop-pet-smoke-"));
const screenshots = path.join(__dirname, "../out/smoke");
app.setPath("userData", dataDir);
app.disableHardwareAcceleration();

const wav = Buffer.alloc(44 + 96000);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
const requests = [];
let delayedResponse;
let streamResponse;
let ttsRequest;
const voiceRequests = [];
let slowVoiceClosed = false;
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
      voiceRequests.push(ttsRequest);
      if (req.url === "/tts-slow") {
        slowVoiceClosed = false;
        res.on("close", () => { slowVoiceClosed = true; });
        return;
      }
      res.writeHead(200, { "content-type": "audio/wav" });
      res.end(req.url.startsWith("/tts-invalid") ? Buffer.alloc(800) : wav);
      return;
    }
    const payload = JSON.parse(body);
    requests.push(payload);
    const last = payload.messages.at(-1).content;
    if (last === "Streaming message" || last === "Stopped stream" || last === "Dismissed stream") {
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
  const window = await until(() => BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().endsWith(`/${file}`)), file);
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
  if (process.env.PET_SMOKE_PHASE === "second-instance") {
    require("../src/main.js");
    assert.equal(app.hasSingleInstanceLock(), false, "A second instance acquired the profile lock");
    // Quit may finish after ready on Linux; the parent verifies the natural exit.
    await new Promise((resolve, reject) => setTimeout(() => reject(new Error("Second instance did not quit")), 5000));
  }
  if (process.env.PET_SMOKE_PHASE === "restart") {
    require("../src/main.js");
    await app.whenReady();
    const pet = await findWindow("index.html");
    const placement = JSON.parse(fs.readFileSync(path.join(dataDir, "window-placement.json"), "utf8"));
    const expected = JSON.parse(fs.readFileSync(path.join(dataDir, "expected-pet-bounds.json"), "utf8"));
    const restored = restorePlacement(placement, {width:320,height:472}, screen.getAllDisplays().map((item)=>item.workArea), screen.getPrimaryDisplay().workArea);
    assert.deepEqual(pet.getBounds(), restored);
    if (JSON.stringify(placement.area) === JSON.stringify(screen.getDisplayMatching(expected).workArea)) assert.deepEqual(pet.getBounds(), expected);
    const state = await evaluate(pet, () => window.desktopPet.getAppState());
    assert.equal(state.settings.persona.name, "Test Character");
    assert.equal(state.settings.persona.userName, "Alex");
    assert.equal(state.settings.persona.relationship, "partner");
    assert.equal(state.settings.language, "en-US");
    assert.equal(state.settings.scale, 1.5);
    assert.equal(state.settings.characterId, "default");
    assert.equal(state.settings.tts.provider, "custom");
    assert.equal(state.settings.affection.enabled, false);
    const history = (await evaluate(pet, () => window.desktopPet.getChatState())).history;
    assert.equal((await evaluate(pet, () => window.desktopPet.getChatState())).draft.text, "");
    assert.ok(history.some((item) => item.content === "Remember this message"));
    const memory = (await evaluate(pet, () => window.desktopPet.getChatState())).config.memory;
    assert.deepEqual(memory, { enabled: true, notes: ["Enjoys piano on rainy days"] });
    await evaluate(pet, () => window.desktopPet.setSettings({ characterId: "luna" }));
    await until(() => evaluate(pet, async () => (await window.desktopPet.getAppState()).settings.characterId === "luna"), "restart character switch");
    assert.equal((await evaluate(pet, () => window.desktopPet.getChatState())).history.length, 0);
    assert.deepEqual((await evaluate(pet, () => window.desktopPet.getChatState())).config.memory, { enabled: false, notes: [] });
    await evaluate(pet, () => window.desktopPet.setSettings({ characterId: "default" }));
    await delay(1100);
    assert.equal(BrowserWindow.getAllWindows().length, 1);
    await evaluate(pet, () => window.desktopPet.openCompanionSettings());
    const settings = await findWindow("settings.html");
    await until(() => evaluate(settings, () => document.querySelector("#persona-name").value === "Test Character"), "restored settings form");
    await evaluate(settings, () => { document.querySelector("#persona-name").value = "Discard this name"; });
    let prompts = 0;
    dialog.showMessageBox = async () => { prompts++; return { response: 1 }; };
    app.once("will-quit", () => {
      try {
        assert.equal(prompts, 1);
        assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, "settings.json"), "utf8")).persona.name, "Test Character");
        fs.writeFileSync(path.join(dataDir, "restart.passed"), "ok");
        console.log("Electron restart PASS: position and saved settings restored; confirmed quit exits without saving discarded edits.");
      } catch (error) { console.error(error); app.exit(1); }
    });
    app.quit();
    await new Promise((resolve, reject) => setTimeout(() => reject(new Error("Confirmed quit did not exit")), 5000));
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
    document.querySelector("#persona-user-name").value = "Alex";
    document.querySelector("#persona-relationship").value = "partner";
    document.querySelector("#persona-relationship").dispatchEvent(new Event("change"));
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
  await until(() => pet.getBounds().width === 320 && pet.getBounds().height === 472, "pet size");
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
  let chat = await findWindow("chat.html");
  async function send(message) {
    await evaluate(chat, (text) => {
      document.querySelector("#message-input").value = text;
      document.querySelector("#send-message").click();
    }, message);
    await until(() => evaluate(chat, () => !document.querySelector("#send-message").disabled), "chat reply");
  }
  await send("First message");
  assert.match(requests.at(-1).messages[0].content, /Alex/);
  assert.match(requests.at(-1).messages[0].content, /fictional romantic companionship/);
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

  // Edit and save through the real settings page; only the isolated service receives notes.
  assert.deepEqual((await evaluate(chat, () => window.desktopPet.getChatState())).config.memory, { enabled: false, notes: [] });
  await evaluate(settings, () => {
    document.querySelector("#tab-memory").click();
    document.querySelector("#memory-enabled").checked = true;
    document.querySelector("#memory-notes").value = "x".repeat(241);
    document.querySelector("#save-settings").click();
  });
  assert.equal(await evaluate(settings, () => document.querySelector("#memory-notes").getAttribute("aria-invalid")), "true");
  assert.equal(await evaluate(settings, () => document.querySelector("#tab-memory").getAttribute("aria-selected")), "true");
  await evaluate(settings, () => {
    document.querySelector("#memory-notes").value = "Enjoys piano on rainy days\nA note to delete";
    document.querySelector("#memory-notes").dispatchEvent(new Event("input"));
    document.querySelector("#save-settings").click();
  });
  await until(() => evaluate(chat, async () => (await window.desktopPet.getChatState()).config.memory.notes.length === 2), "memory saved");
  await send("Memory context check");
  assert.match(requests.at(-1).messages[0].content, /Enjoys piano on rainy days/);
  await evaluate(settings, () => {
    document.querySelector("#memory-enabled").checked = false;
    document.querySelector("#save-settings").click();
  });
  await until(() => evaluate(chat, async () => !(await window.desktopPet.getChatState()).config.memory.enabled), "memory disabled");
  await send("Memory off check");
  assert.doesNotMatch(requests.at(-1).messages[0].content, /Enjoys piano on rainy days/);
  await evaluate(settings, () => {
    document.querySelector("#clear-memories").click();
    document.querySelector("#save-settings").click();
  });
  await until(() => evaluate(chat, async () => (await window.desktopPet.getChatState()).config.memory.notes.length === 0), "memory deleted");
  assert.doesNotMatch(fs.readFileSync(path.join(dataDir, "characters-state.json"), "utf8"), /A note to delete/);
  await evaluate(settings, () => {
    document.querySelector("#memory-enabled").checked = true;
    document.querySelector("#memory-notes").value = "Enjoys piano on rainy days";
    document.querySelector("#save-settings").click();
  });
  await until(() => evaluate(chat, async () => (await window.desktopPet.getChatState()).config.memory.notes.length === 1), "memory ready for restart");

  await evaluate(pet, () => document.querySelector("#talk").click());
  let quick = await findWindow("quick-chat.html");
  assert.equal(await evaluate(quick, () => document.querySelector("#character-name").textContent), "Test Character");
  const draftText = "An unsent thought\nA second line";
  await evaluate(quick, (text) => {
    const input = document.querySelector("#quick-input");
    input.value = text;
    input.dispatchEvent(new Event("input"));
  }, draftText);
  await until(() => evaluate(chat, (text) => document.querySelector("#message-input").value === text, draftText), "draft mirrored into full chat");
  await evaluate(quick, () => document.querySelector("#history").click());
  await until(() => quick.isDestroyed(), "quick mode closed after switching");
  await evaluate(pet, () => window.desktopPet.openQuickChatWindow());
  quick = await findWindow("quick-chat.html");
  await until(() => evaluate(quick, (text) => document.querySelector("#quick-input").value === text, draftText), "draft recovered after reopening");
  assert.doesNotMatch(fs.readFileSync(path.join(dataDir, "characters-state.json"), "utf8"), /An unsent thought/);
  await evaluate(quick, () => {
    const input = document.querySelector("#quick-input");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true }));
  });
  assert.equal((await evaluate(quick, () => window.desktopPet.getChatState())).busy, false);
  await evaluate(pet, () => window.desktopPet.setSettings({ characterId: "luna" }));
  await until(() => evaluate(quick, () => document.querySelector("#quick-input").value === ""), "new character has no old draft");
  await evaluate(pet, () => window.desktopPet.setSettings({ characterId: "default" }));
  await until(() => evaluate(quick, (text) => document.querySelector("#quick-input").value === text, draftText), "character draft restored");
  await evaluate(quick, () => {
    const input = document.querySelector("#quick-input");
    input.value = "";
    input.dispatchEvent(new Event("input"));
  });
  const originalPetBounds = pet.getBounds();
  const beforeQuick = quick.getBounds();
  pet.setPosition(originalPetBounds.x - 100, originalPetBounds.y - 40);
  await until(() => quick.getBounds().x !== beforeQuick.x, "companion input follows pet");
  const expectedQuick = require("../src/companion-layout").companionBounds(pet.getBounds(), screen.getDisplayMatching(pet.getBounds()).workArea);
  assert.deepEqual(quick.getBounds(), expectedQuick);
  pet.setBounds(originalPetBounds);
  const recovery = Menu.getApplicationMenu().getMenuItemById("show-pet");
  assert.ok(recovery);
  pet.hide();
  recovery.click();
  await until(() => pet.isVisible(), "recover hidden pet from application menu");
  pet.hide();
  app.emit("activate", {}, false);
  await until(() => pet.isVisible(), "reopen existing application");
  const profileBeforeRecovery = await evaluate(pet, () => window.desktopPet.getChatState());
  pet.setPosition(20000, -20000);
  chat.setPosition(20000, -20000);
  screen.emit("display-metrics-changed", {}, screen.getPrimaryDisplay(), ["workArea"]);
  await until(() => {
    const bounds = pet.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    return bounds.x >= area.x && bounds.y >= area.y && bounds.x + bounds.width <= area.x + area.width && bounds.y + bounds.height <= area.y + area.height;
  }, "recover pet after display change");
  await delay(400);
  assert.deepEqual(quick.getBounds(), require("../src/companion-layout").companionBounds(pet.getBounds(), screen.getDisplayMatching(pet.getBounds()).workArea));
  assert.deepEqual((await evaluate(pet, () => window.desktopPet.getChatState())).history, profileBeforeRecovery.history);
  const recoveredChat = chat.getBounds();
  const recoveredArea = screen.getDisplayMatching(recoveredChat).workArea;
  assert.ok(recoveredChat.x >= recoveredArea.x && recoveredChat.y >= recoveredArea.y);
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
  await evaluate(pet, () => { handleClick("head"); handleLongPress(); handleDoubleClick(); });
  assert.equal(await evaluate(pet, () => state), "waving");
  await delay(1800);
  assert.equal(await evaluate(pet, () => state), "waving");
  await evaluate(pet, () => handlePetMessage({ text: "Deferred reminder", action: "review", speak: false }));
  assert.equal(await evaluate(pet, () => document.querySelector("#speech-bubble").textContent), "First paragraph");
  assert.equal(await evaluate(pet, () => document.querySelector("#speech-bubble").textContent.includes("[expression:")), false);
  assert.equal(await evaluate(chat, () => document.querySelector("#stop-message").hidden), false);
  const longReply = "Long reply ".repeat(220);
  await evaluate(chat, () => {
    window.savedBubble = document.querySelector(".bubble");
    const range = document.createRange();
    range.selectNodeContents(window.savedBubble);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    window.savedSelection = window.getSelection().toString();
    document.querySelector("#messages").scrollTop = 0;
    document.querySelector("#open-settings").focus();
  });
  streamResponse.write(`data: ${JSON.stringify({ choices: [{ delta: { content: longReply }, finish_reason: "stop" }] })}\n\n`);
  streamResponse.end("data: [DONE]\n\n");
  await until(() => evaluate(chat, () => !document.querySelector("#send-message").disabled), "stream completion");
  assert.equal(await evaluate(chat, () => window.savedBubble === document.querySelector(".bubble")
    && window.getSelection().toString() === window.savedSelection), true);
  assert.equal(await evaluate(chat, () => document.activeElement.id), "open-settings");
  await evaluate(chat, () => {
    const messages = document.querySelector("#messages");
    messages.scrollTop = 0;
    messages.dispatchEvent(new Event("scroll"));
  });
  assert.equal(await evaluate(chat, () => document.querySelector("#latest-message").hidden), false);
  await evaluate(chat, () => document.querySelector("#latest-message").click());
  assert.equal(await evaluate(chat, () => document.querySelector("#latest-message").hidden), true);
  assert.equal((await evaluate(chat, () => window.desktopPet.getChatState())).history.at(-1).content, `First paragraph\n\n${longReply.trim()}`);
  assert.equal(await evaluate(pet, () => document.querySelector("#speech-bubble").textContent), `First paragraph\n\n${longReply.trim()}`);
  await evaluate(pet, () => document.querySelector("#speech-card").dispatchEvent(new MouseEvent("mouseenter")));
  await delay(3000);
  assert.equal(await evaluate(pet, () => document.querySelector("#speech-bubble").classList.contains("visible")), true);
  await evaluate(pet, () => {
    document.querySelector("#bubble-pin").click();
    document.querySelector("#speech-card").dispatchEvent(new MouseEvent("mouseleave"));
    hideBubbleLater(30);
    const range = document.createRange();
    range.selectNodeContents(speechBubble);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
  await delay(100);
  assert.equal(await evaluate(pet, () => bubbleVisible && bubblePinned && window.getSelection().toString() === speechBubble.textContent), true);
  assert.equal(await evaluate(pet, () => document.querySelector("#bubble-speaker").textContent), "Test Character");
  for (const language of ["zh-CN", "ja-JP", "en-US"]) {
    for (const scale of [0.75, 1, 2]) {
      await evaluate(pet, (language, scale) => window.desktopPet.setSettings({ language, scale }), language, scale);
      await until(() => evaluate(pet, (language, scale) => activeLanguage === language && settings.scale === scale, language, scale), "bubble language and size");
      assert.equal(await evaluate(pet, () => {
        const panel = document.querySelector("#speech-panel").getBoundingClientRect();
        return panel.top >= 0 && panel.bottom + 6 <= canvas.getBoundingClientRect().top
          && panel.left >= 0 && panel.right <= innerWidth
          && [...document.querySelectorAll(".bubble-toolbar button")].every((button) => {
            const bounds = button.getBoundingClientRect();
            return bounds.width === 24 && bounds.right <= panel.right && button.title && button.getAttribute("aria-label") === button.title;
          })
          && [...document.querySelectorAll(".icon-button img")].every((img) => img.complete && img.naturalWidth > 0)
          && getComputedStyle(speechBubble).userSelect === "text";
      }), true);
      await screenshot(pet, `bubble-${language}-${scale}`);
    }
  }
  await evaluate(pet, () => window.desktopPet.setSettings({ scale: 1.5 }));
  await until(async () => pet.getBounds().width === 320 && await evaluate(pet, () => settings.scale === 1.5), "pet size before mouse input");
  pet.focus();
  const pinPoint = await evaluate(pet, () => {
    const bounds = document.querySelector("#bubble-pin").getBoundingClientRect();
    return { x: Math.round(bounds.left + bounds.width / 2), y: Math.round(bounds.top + bounds.height / 2) };
  });
  pet.webContents.sendInputEvent({ type: "mouseMove", ...pinPoint });
  pet.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...pinPoint });
  pet.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...pinPoint });
  await until(() => evaluate(pet, () => !bubblePinned && !bubbleFocused), "mouse unpins without a keyboard hold");
  pet.webContents.sendInputEvent({ type: "mouseMove", x: 2, y: 200 });
  await until(() => evaluate(pet, () => !bubblePaused), "pointer leaves unpinned bubble");
  await evaluate(pet, () => { queuedNotice = null; hideBubbleLater(30); });
  await until(() => evaluate(pet, () => !bubbleVisible), "unpinned bubble hides after mouse use");
  await evaluate(pet, () => window.desktopPet.showLastReply());
  await until(() => evaluate(pet, () => bubbleVisible && bubblePinned), "restore bubble after mouse unpin");
  await evaluate(pet, () => document.querySelector("#bubble-history").click());
  await until(() => chat.isVisible(), "bubble opens history");
  await evaluate(pet, () => document.querySelector("#bubble-reply").click());
  await until(() => quick.isVisible(), "bubble opens quick reply");
  const beforeRecallRequests = requests.length;
  const beforeRecallHistory = (await evaluate(pet, () => window.desktopPet.getChatState())).history;
  await evaluate(pet, () => document.querySelector("#bubble-dismiss").click());
  assert.equal(await evaluate(pet, () => document.querySelector("#speech-card").hidden), true);
  await until(() => evaluate(pet, () => !document.querySelector("#last-reply").disabled), "last reply available");
  await evaluate(pet, () => document.querySelector("#last-reply").click());
  await until(() => evaluate(pet, () => bubbleVisible && bubblePinned), "last reply restored and pinned");
  assert.equal(requests.length, beforeRecallRequests);
  assert.deepEqual((await evaluate(pet, () => window.desktopPet.getChatState())).history, beforeRecallHistory);
  await evaluate(pet, () => {
    document.querySelector("#bubble-pin").focus();
    document.querySelector("#speech-card").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  assert.equal(await evaluate(pet, () => !bubbleVisible && document.activeElement.id === "talk"), true);

  await evaluate(chat, () => {
    document.querySelector("#message-input").value = "Dismissed stream";
    document.querySelector("#send-message").click();
  });
  await until(() => evaluate(pet, () => bubbleVisible && bubbleStreaming && speechBubble.textContent === "First paragraph"), "dismissable stream");
  await evaluate(pet, () => document.querySelector("#bubble-dismiss").click());
  await evaluate(pet, () => {
    handlePetMessage({ text: "Local reminder during hidden generation", speak: false });
    document.querySelector("#bubble-dismiss").click();
  });
  streamResponse.write('data: {"choices":[{"delta":{"content":"Still saved in history"},"finish_reason":"stop"}]}\n\n');
  streamResponse.end("data: [DONE]\n\n");
  await until(() => evaluate(chat, () => !document.querySelector("#send-message").disabled), "dismissed stream completed");
  assert.equal(await evaluate(pet, () => !bubbleVisible && !speechActive && document.querySelector("#speech-card").hidden), true);
  assert.equal((await evaluate(chat, () => window.desktopPet.getChatState())).history.at(-1).content, "First paragraph\n\nStill saved in history");

  await evaluate(chat, () => {
    document.querySelector("#message-input").value = "Stopped stream";
    document.querySelector("#send-message").click();
  });
  await until(() => evaluate(chat, () => document.querySelector(".message:last-child .bubble")?.textContent === "First paragraph\n\n"), "second streaming reply");
  await evaluate(quick, () => document.querySelector("#stop").click());
  await until(() => evaluate(chat, () => !document.querySelector("#send-message").disabled), "stop from other window");
  assert.equal((await evaluate(chat, () => window.desktopPet.getChatState())).history.at(-1).failed, true);
  assert.equal(await evaluate(chat, () => document.querySelector("#retry-message").hidden), false);
  assert.equal(await evaluate(quick, () => document.querySelector("#retry-message").hidden), false);
  streamResponse.end("data: [DONE]\n\n");
  await send("After stop");
  assert.equal(requests.at(-1).messages.some((item) => item.content === "Stopped stream"), false);

  await evaluate(quick, () => {
    const input = document.querySelector("#quick-input");
    input.value = "Failure message";
    input.dispatchEvent(new Event("input"));
    document.querySelector("#send").click();
  });
  await until(() => evaluate(quick, () => !document.querySelector("#retry-message").hidden), "quick failure offers retry");
  assert.equal(await evaluate(quick, () => document.querySelector("#quick-input").value), "Failure message");
  const beforeRetry = requests.length;
  await evaluate(quick, () => { document.querySelector("#retry-message").click(); document.querySelector("#retry-message").click(); });
  await until(() => evaluate(quick, () => !document.querySelector("#send").disabled), "explicit retry completed");
  assert.equal(requests.length, beforeRetry + 1);
  await screenshot(quick, "quick-retry");
  await send("Recovered from retry");

  for (const language of ["ja-JP", "zh-CN", "en-US"]) {
    await evaluate(pet, (value) => window.desktopPet.setSettings({ language: value }), language);
    await until(() => evaluate(chat, (value) => document.documentElement.lang === value, language), "interface language");
    assert.equal(await evaluate(chat, () => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.equal(await evaluate(quick, () => document.documentElement.scrollWidth <= window.innerWidth && document.querySelector("#quick-input").getBoundingClientRect().bottom <= window.innerHeight), true);
  }
  await evaluate(pet, () => window.desktopPet.setSettings({ characterId: "luna", expressionMode: "clickOnly" }));
  await until(() => evaluate(pet, () => character.id === "luna" && spriteImage && state === "idle"), "Luna loaded");
  assert.equal((await evaluate(chat, () => window.desktopPet.getChatState())).config.persona.name, "");
  assert.equal((await evaluate(chat, () => window.desktopPet.getChatState())).config.persona.userName, "");
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
  await evaluate(pet, () => {
    document.querySelector("canvas").dispatchEvent(new PointerEvent("pointerdown", { button: 0 }));
    didDrag = true;
    setState("running");
    window.dispatchEvent(new PointerEvent("pointerup", { button: 0, detail: 1 }));
    handleLongPress();
    handleDoubleClick();
  });
  assert.equal(await evaluate(pet, () => document.querySelector("canvas").toDataURL()), nextFrame);
  await screenshot(pet, "pet");
  await evaluate(pet, () => window.desktopPet.setSettings({ characterId: "default", expressionMode: "automatic" }));
  await until(() => evaluate(pet, () => character.id === "default" && spriteImage?.src.includes("/default/")), "default character restored");
  await evaluate(pet, () => {
    handlePetMessage({ clear: true });
    const bounds = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent("pointerdown", { button: 0, clientY: bounds.top + bounds.height * 0.2 }));
    window.dispatchEvent(new PointerEvent("pointerup", { button: 0, detail: 1 }));
  });
  await until(() => evaluate(pet, () => bubbleVisible && state === "review"), "local head touch");
  assert.match(await evaluate(pet, () => speechBubble.textContent), /Alex/);
  await screenshot(pet, "pet-touch");
  const localResponse = await evaluate(pet, () => speechBubble.textContent);
  await evaluate(pet, () => { handleClick("greet"); handleClick("head"); });
  assert.equal(await evaluate(pet, () => speechBubble.textContent), localResponse);

  await evaluate(settings, (url) => window.desktopPet.saveChatConfig({ tts: { provider: "custom", enabled: true, endpoint: `${url}/tts`, customBodyTemplate: '{"text":"{{text}}"}' } }), endpoint);
  await evaluate(pet, () => {
    document.querySelector("#speech-card").dispatchEvent(new MouseEvent("mouseleave"));
    handlePetMessage({ source: "chat", text: "Spoken reply", action: "review" });
  });
  await until(() => evaluate(pet, () => speechActive && activeAudio && !activeAudio.paused), "reply voice starts");
  await delay(4700);
  assert.equal(await evaluate(pet, () => speechActive && bubbleVisible && state === "review"), true);
  await until(() => evaluate(pet, () => !speechActive), "reply voice finishes");
  assert.equal(await evaluate(pet, () => bubbleVisible), true);
  for (const window of [pet, chat, quick]) {
    assert.equal(await evaluate(window, () => document.querySelector("#voice-controls").hidden), false);
    assert.equal(await evaluate(window, () => document.querySelector("#voice-toggle").textContent), "Replay");
  }
  const beforeReplay = requests.length;
  await evaluate(quick, () => { document.querySelector("#voice-toggle").click(); document.querySelector("#voice-toggle").click(); });
  await until(() => evaluate(pet, () => speechActive && activeAudio && !activeAudio.paused), "quick input replays voice");
  assert.equal(requests.length, beforeReplay);
  for (const window of [pet, chat, quick]) {
    await until(() => evaluate(window, () => document.querySelector("#voice-status").textContent === "Speaking…"), "speaking state synchronized");
  }
  await screenshot(pet, "pet-speaking");
  assert.equal(await evaluate(pet, () => document.querySelector("#speech-panel").getBoundingClientRect().bottom + 6 <= canvas.getBoundingClientRect().top), true);
  await screenshot(quick, "quick-speaking");
  assert.equal(await evaluate(quick, () => ["#quick-input", ".quick-feedback", "#voice-controls"].every((selector) => {
    const rect = document.querySelector(selector).getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth;
  })), true);
  await screenshot(chat, "chat-speaking");
  const replayText = await evaluate(pet, () => speechBubble.textContent);
  await evaluate(pet, () => document.querySelector("#voice-toggle").click());
  await until(() => evaluate(pet, () => !speechActive && !activeAudio), "pet voice stop");
  assert.equal(await evaluate(pet, () => speechBubble.textContent), replayText);
  await evaluate(chat, () => document.querySelector("#voice-toggle").click());
  await until(() => evaluate(pet, () => speechActive && activeAudio && !activeAudio.paused), "full chat replays voice");
  await evaluate(quick, () => document.querySelector("#voice-toggle").click());
  await until(() => evaluate(pet, () => !speechActive), "quick input stops voice");

  await evaluate(settings, (url) => window.desktopPet.saveChatConfig({ tts: { endpoint: `${url}/tts-slow` } }), endpoint);
  const slowStart = voiceRequests.length;
  await evaluate(chat, () => document.querySelector("#voice-toggle").click());
  await until(() => voiceRequests.length > slowStart, "slow voice request reaches server");
  await until(() => evaluate(chat, () => document.querySelector("#voice-status").textContent === "Preparing voice…"), "preparing state visible");
  await evaluate(chat, () => document.querySelector("#voice-toggle").click());
  await until(() => slowVoiceClosed, "stop aborts synthesis connection");
  assert.equal((await evaluate(pet, () => window.desktopPet.getChatState())).voiceError, false);
  const slowAgain = voiceRequests.length;
  await evaluate(quick, () => document.querySelector("#voice-toggle").click());
  await until(() => voiceRequests.length > slowAgain, "second slow synthesis");
  await evaluate(quick, () => window.desktopPet.sendChatMessage("Interrupt voice"));
  await until(() => slowVoiceClosed, "new message aborts old synthesis");
  await evaluate(pet, () => window.desktopPet.stopVoice());

  await evaluate(settings, (url) => window.desktopPet.saveChatConfig({ tts: { endpoint: `${url}/tts` } }), endpoint);
  const longStart = voiceRequests.length;
  await evaluate(pet, () => handlePetMessage({ source: "chat", text: "Long voice reply. ".repeat(60) + "Final sentence.", action: "idle" }));
  await until(() => voiceRequests.length >= longStart + 2, "long reply continues past 800 characters");
  await until(() => evaluate(pet, () => !speechActive), "all long reply audio finishes");
  assert.equal(voiceRequests.slice(longStart).map((request) => JSON.parse(request.body).text).join(" ").replace(/\s+/g, " "), "Long voice reply. ".repeat(60) + "Final sentence.");
  await evaluate(chat, () => document.querySelector("#voice-toggle").click());
  await until(() => evaluate(pet, () => speechActive), "replay before disabling voice");
  await evaluate(settings, () => window.desktopPet.saveChatConfig({ tts: { enabled: false } }));
  await until(() => evaluate(pet, () => !speechActive && document.querySelector("#voice-controls").hidden), "disabling voice stops and hides pet controls");
  await evaluate(settings, () => window.desktopPet.saveChatConfig({ tts: { enabled: true } }));
  await evaluate(pet, () => handlePetMessage({ clear: true }));
  const voice = await evaluate(pet, async () => {
    const id = await window.desktopPet.beginSpeech(speechGeneration);
    const result = await window.desktopPet.synthesizeSpeech({ id, text: "Voice test" });
    window.desktopPet.speechStateChanged({ id, status: "idle" });
    return result;
  });
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
  for (const tab of ["general", "character", "memory", "chat", "voice"]) {
    await evaluate(settings, (name) => document.querySelector(`#tab-${name}`).click(), tab);
    assert.equal(await evaluate(settings, () => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.equal(await evaluate(settings, () => document.querySelector("#save-settings").getBoundingClientRect().bottom <= window.innerHeight), true);
    if (tab === "memory") {
      assert.equal(await evaluate(settings, () => document.querySelector("#memory-enabled").getBoundingClientRect().top >= document.querySelector(".settings-tabs").getBoundingClientRect().bottom), true);
    }
    await screenshot(settings, `settings-${tab}`);
  }
  await evaluate(settings, () => {
    document.querySelector("#tab-character").click();
    document.querySelector("#persona-relationship").value = "custom";
    document.querySelector("#persona-relationship").dispatchEvent(new Event("change"));
    document.querySelector("#persona-custom-relationship").value = "Childhood friends";
    document.querySelector("#persona-relationship").scrollIntoView({ block: "center" });
  });
  assert.equal(await evaluate(settings, () => !document.querySelector("#custom-relationship-row").hidden), true);
  await screenshot(settings, "settings-relationship");
  chat.setSize(320, 360);
  for (const language of ["zh-CN", "ja-JP", "en-US"]) {
    await evaluate(pet, (value) => window.desktopPet.setSettings({ language: value }), language);
    await until(() => evaluate(chat, (value) => document.documentElement.lang === value, language), "minimum chat language");
    assert.equal(await evaluate(chat, () => ["#message-input", ".chat-footer", ".chat-actions"].every((selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
    })), true);
    assert.equal(await evaluate(chat, () => [...document.querySelectorAll(".chat-actions img, #latest-message img")]
      .every((img) => img.complete && img.naturalWidth > 0)), true);
    assert.equal(await evaluate(chat, () => document.querySelector("#latest-message").hidden
      || document.querySelector("#latest-message").getBoundingClientRect().top >= document.querySelector("#messages").getBoundingClientRect().bottom), true);
    await screenshot(chat, `chat-minimum-${language}`);
  }
  await evaluate(quick, () => {
    const input = document.querySelector("#quick-input");
    input.value = "Draft must disappear after quitting";
    input.dispatchEvent(new Event("input"));
  });
  await until(() => evaluate(chat, () => document.querySelector("#message-input").value === "Draft must disappear after quitting"), "final draft sync");
  assert.doesNotMatch(fs.readFileSync(path.join(dataDir, "characters-state.json"), "utf8"), /Draft must disappear/);
  await evaluate(chat, () => document.querySelector("#quick-mode").click());
  await until(() => chat.isDestroyed(), "full chat switches to quick mode");
  await evaluate(pet, () => window.desktopPet.openChatWindow());
  chat = await findWindow("chat.html");
  await until(() => evaluate(chat, () => document.querySelector("#message-input").value === "Draft must disappear after quitting"), "full chat recovers shared draft");
  await screenshot(quick, "quick-input");
  const beforeSecondInstance = (await evaluate(pet, () => window.desktopPet.getChatState())).draft;
  pet.hide();
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [__filename, ...process.argv.filter((arg)=>arg === "--no-sandbox")], {
      env: {...process.env, PET_SMOKE_PHASE:"second-instance"}, stdio:["ignore", "pipe", "pipe"],
    });
    let output = "";
    const collect = (data) => { output = (output + data.toString()).slice(-3000); };
    child.stdout.on("data", collect); child.stderr.on("data", collect);
    const timeout = setTimeout(() => { child.kill(); reject(new Error("Second instance did not exit")); }, 15000);
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("exit", (code) => { clearTimeout(timeout); if (code === 0) resolve(); else reject(new Error(`Second instance exited ${code}: ${output}`)); });
  });
  await until(() => pet.isVisible(), "second launch reveals the existing pet");
  assert.deepEqual((await evaluate(pet, () => window.desktopPet.getChatState())).draft, beforeSecondInstance);
  const finalArea = screen.getDisplayMatching(pet.getBounds()).workArea;
  pet.setPosition(finalArea.x + 83, finalArea.y + 61);
  await delay(600);
  const savedPlacement = JSON.parse(fs.readFileSync(path.join(dataDir, "window-placement.json"), "utf8"));
  assert.deepEqual(restorePlacement(savedPlacement, {width:320,height:472}, [finalArea], finalArea), pet.getBounds());
  fs.writeFileSync(path.join(dataDir, "expected-pet-bounds.json"), JSON.stringify(pet.getBounds()));
  assert.deepEqual(Object.keys(savedPlacement).sort(), ["area","bottom","center","version"]);
  let leavePrompts = 0;
  dialog.showMessageBox = async () => { leavePrompts++; return { response: 0 }; };
  await evaluate(settings, () => { document.querySelector("#persona-name").value = "Unsaved name"; });
  app.quit();
  await until(() => leavePrompts === 1, "confirm before quitting with unsaved settings");
  await delay(300);
  for (const window of [pet, settings, chat, quick]) assert.equal(window.isDestroyed(), false, "Cancelling quit keeps every window alive");
  assert.equal(await evaluate(settings, () => document.querySelector("#persona-name").value), "Unsaved name");
  assert.deepEqual((await evaluate(pet, () => window.desktopPet.getChatState())).draft, beforeSecondInstance);
  for (const window of [pet, settings, chat, quick]) {
    assert.deepEqual(await evaluate(window, () => window.smokeErrors), []);
  }
  console.log("Electron smoke PASS: startup, canvas, resizing, position recovery, single instance, drafts, validation, settings tabs, streaming, stop, long replies, bubble selection/pin/dismiss/recall, relationship settings, shared memory save/context/disable/delete, touch responses, manual drag restoration, conversation holds, deferred reminders, context isolation, languages, click-only, voice lifecycle/GET/playback errors, import/preview/remove and optional history.");
}

const watchdog = setTimeout(() => { console.error("Electron smoke timed out"); app.exit(1); }, 120000);
run().then(() => finish(0), async (error) => {
  console.error(error);
  for (const window of BrowserWindow.getAllWindows()) await screenshot(window, `failure-${window.id}`).catch(() => {});
  finish(1);
});
function finish(code) {
  clearTimeout(watchdog);
  if (code === 0) fs.writeFileSync(path.join(dataDir, `${process.env.PET_SMOKE_PHASE || "initial"}.passed`), "ok");
  server.closeAllConnections();
  server.close();
  app.exit(code);
}
