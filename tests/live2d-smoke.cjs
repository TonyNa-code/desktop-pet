const { _electron } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const http = require("node:http");
const { poll } = require("./poll.cjs");
const project = path.join(__dirname, "..");
const data = fs.mkdtempSync(path.join(os.tmpdir(), "pet-live2d-smoke-"));
const output = path.join(project, "out/playwright/live2d");
const env = { ...process.env, PET_TEST_DATA: data };
delete env.ELECTRON_RUN_AS_NODE;
const modelPath = process.env.PET_MODEL_FIXTURE;
const corePath = process.env.PET_CORE_FIXTURE;
if (!modelPath || !corePath) throw new Error("PET_MODEL_FIXTURE and PET_CORE_FIXTURE required; no model is bundled");

const wav = Buffer.alloc(44 + 8000 * 2 * 5);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 0; i < (wav.length - 44) / 2; i++) wav.writeInt16LE(Math.round(Math.sin(i / 8000 * Math.PI * 440) * 6000), 44 + i * 2);
let requests = 0;
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", chunk => { body += chunk; }); req.on("end", () => {
    if (req.url === "/tts") { res.writeHead(200, { "content-type": "audio/wav" }); res.end(wav); }
    else {
      requests++;
      const message = JSON.parse(body).messages.at(-1).content;
      if (message === "fail") { res.writeHead(503); res.end("Test service unavailable"); return; }
      const timer = setTimeout(() => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { content: "[expression:happy] It's good to see you. Sit beside me for a little while." } }] }));
      }, message === "cancel" ? 2000 : 500);
      res.on("close", () => clearTimeout(timer));
    }
  });
});

async function run() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const app = await _electron.launch({ executablePath: require("electron"), args: [path.join(__dirname, "live2d-boot.cjs")], env });
  const errors = [];
  app.on("window", (page) => {
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (entry) => { if (entry.type() === "error") console.log("Renderer:", entry.text()); });
  });
  const find = async (file) => {
    for (let i = 0; i < 150; i++) {
      const page = app.windows().find((item) => item.url().endsWith(`/${file}`));
      if (page) { await page.waitForLoadState(); return page; }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Window missing: ${file}`);
  };
  try {
    fs.mkdirSync(output, { recursive: true });
    const pet = await find("index.html");
    const settings = await find("settings.html");
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, modelPath);
    await settings.locator("#import-live2d").click();
    await settings.locator("#import-preview").waitFor({ state: "visible" });
    await settings.locator("#confirm-import").click();
    const id = await settings.evaluate(async () => (await window.desktopPet.getChatState()).characters.find((item) => item.type === "live2d").id);
    await settings.evaluate((id) => window.desktopPet.saveChatConfig({ characterId: id, language: "en-US", persona: { setupDone: true } }), id);
    await pet.waitForFunction(() => document.querySelector("#model-status").textContent.includes("not installed"));
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, corePath);
    await settings.locator("#import-core").click();
    await pet.waitForFunction(() => document.querySelector("#model-status").hidden, null, { timeout: 30000 });
    const frame = pet.frames().find((item) => item.url().startsWith("pet-live2d:"));
    assert.ok(frame, "isolated model frame");
    assert.equal(await frame.evaluate(() => typeof window.desktopPet), "undefined");
    assert.equal(await frame.evaluate(() => typeof window.require), "undefined");
    await frame.evaluate(() => {
      const original = PIXI.live2d.Live2DModel.from;
      PIXI.live2d.Live2DModel.from = async (...args) => { window.testModel = await original.apply(PIXI.live2d.Live2DModel, args); return window.testModel; };
    });
    await pet.evaluate((id) => {
      document.querySelector("iframe").contentWindow.postMessage({ channel: "desktop-pet-model", type: "load", id }, "pet-live2d://viewer");
      window.modelEvents = [];
      window.addEventListener("message", (event) => { if (event.data?.channel === "desktop-pet-model") modelEvents.push(event.data); });
    }, id);
    await frame.waitForFunction(() => window.testModel?.internalModel);
    await frame.evaluate(() => testModel.internalModel.on("beforeModelUpdate", () => {
      const core = testModel.internalModel.coreModel;
      const ids = core.getModel().parameters.ids;
      const pick = (...names) => names.find(name => ids.includes(name));
      window.testParameters = { eye: core.getParameterValueById(pick("ParamEyeLOpen", "PARAM_EYE_L_OPEN")),
        breath: core.getParameterValueById(pick("ParamBreath", "PARAM_BREATH")),
        x: core.getParameterValueById(pick("ParamAngleX", "PARAM_ANGLE_X")),
        mouth: core.getParameterValueById(testModel.internalModel.settings.getLipSyncParameters()[0]) };
      window.testBlinkMinimum = Math.min(window.testBlinkMinimum ?? 1, testParameters.eye);
    }));
    const stats = () => frame.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let visible = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 10) visible++;
      return { visible, ...window.testParameters };
    });
    await pet.waitForTimeout(500);
    assert.ok((await stats()).visible > 1000);
    const sampled = [];
    for (let i = 0; i < 50; i++) { sampled.push(await stats()); await pet.waitForTimeout(100); }
    console.log("Model parameters", { first: sampled[0], last: sampled.at(-1), eyeRange: [Math.min(...sampled.map((s) => s.eye)), Math.max(...sampled.map((s) => s.eye))], breathRange: [Math.min(...sampled.map((s) => s.breath)), Math.max(...sampled.map((s) => s.breath))] });
    await frame.waitForFunction(() => window.testBlinkMinimum < 0.2, null, { timeout: 12000 });
    assert.ok(Math.max(...sampled.map((s) => s.breath)) - Math.min(...sampled.map((s) => s.breath)) > 0.1, "native breathing");
    await pet.evaluate(() => window.desktopPet.setSettings({ expressionMode: "clickOnly", scale: 2 }));
    await pet.waitForTimeout(600);
    const before = await pet.evaluate(() => modelEvents.filter((item) => item.type === "expression").length);
    await pet.locator("#pet").click();
    await pet.waitForTimeout(800);
    const after = await pet.evaluate(() => modelEvents.filter((item) => item.type === "expression"));
    assert.equal(after.length, before + 1, "one click, one expression");
    assert.equal(after.at(-1).index, 0);
    await pet.waitForTimeout(1200);
    assert.equal(await pet.evaluate(() => modelEvents.filter((item) => item.type === "expression").length), after.length);
    await pet.screenshot({ path: path.join(output, "model-manual-200.png") });
    await pet.evaluate(() => window.desktopPet.setSettings({ expressionMode: "automatic", scale: 0.75 }));
    await pet.waitForTimeout(600);
    const bounds = await pet.locator("#pet").boundingBox();
    await pet.mouse.move(bounds.x + bounds.width * 0.95, bounds.y + bounds.height * 0.25);
    await pet.waitForTimeout(800);
    assert.ok(Math.abs((await stats()).x) > 0.5, "gaze follows pointer");
    assert.ok(await frame.evaluate(() => testModel.internalModel.focusController.x > 0.1), "pointer input reaches the gaze controller");
    assert.ok((await stats()).visible > 1000);
    await pet.screenshot({ path: path.join(output, "model-automatic-75.png") });
    await settings.locator("#live2d-expression").selectOption("2");
    await settings.locator("#preview-expression").click();
    await pet.waitForFunction(() => modelEvents.filter((item) => item.type === "expression").at(-1)?.index === 2);
    await settings.screenshot({ path: path.join(output, "settings-live2d.png") });
    await settings.locator("#preview-motion").click();
    await pet.waitForFunction(() => modelEvents.some((item) => item.type === "motion"));
    await settings.locator("#live2d-happy").selectOption("1");
    const replyMotion = await settings.locator("#live2d-motion-happy").evaluate(select => {
      const options = [...select.options].filter(option => option.value);
      return (options.find(option => !/^idle$/i.test(JSON.parse(option.value).group)) || options[0]).value;
    });
    await settings.locator("#live2d-motion-happy").selectOption(replyMotion);
    await settings.locator("#live2d-motion-happy").scrollIntoViewIfNeeded();
    await settings.screenshot({ path: path.join(output, "settings-reply-gestures.png") });
    await settings.locator("#save-settings").click();
    await pet.waitForFunction(() => settings.persona.live2dExpressions.happy === 1);
    await settings.evaluate((endpoint) => window.desktopPet.saveChatConfig({
      assistant: { baseUrl: `${endpoint}/v1`, model: "local-test", stream: false },
      tts: { enabled: true, provider: "custom", endpoint: `${endpoint}/tts`, customBodyTemplate: '{"text":"{{text}}"}' },
      persona: { relationship: "partner", userName: "Alex" },
    }), endpoint);
    await pet.locator("#talk").click();
    await pet.locator("#companion-text").fill("Stay with me a little.");
    await pet.locator("#companion-text").press("Escape");
    await pet.locator("#talk").click();
    assert.equal(await pet.locator("#companion-text").inputValue(), "Stay with me a little.");
    await pet.screenshot({ path: path.join(output, "inline-composer.png") });
    const layout = await pet.evaluate(() => {
      const input = document.querySelector("#companion-input").getBoundingClientRect();
      const model = document.querySelector("#model-stage").getBoundingClientRect();
      const bubble = document.querySelector("#speech-panel").getBoundingClientRect();
      return { gap: model.top - input.bottom, bubbleGap: input.top - bubble.bottom };
    });
    assert.ok(layout.gap >= 8 && layout.bubbleGap >= 0, "composer, bubble and model never overlap");
    await pet.locator("#companion-send").click();
    await pet.waitForFunction(() => document.querySelector("#companion-input").hidden);
    assert.equal(app.windows().some(page => page.url().endsWith("/quick-chat.html")), false, "no detached conversation window");
    await pet.waitForFunction(() => speechActive && activeAudio && !activeAudio.paused);
    await pet.waitForFunction(() => modelEvents.filter((item) => item.type === "expression").at(-1)?.index === 1);
    await frame.waitForFunction(() => window.testParameters.mouth > 0.3);
    await poll(() => pet.evaluate(async () => (await window.desktopPet.getChatState()).voice.status === "playing"), { label: "playing voice" });
    await pet.waitForFunction(() => modelEvents.filter(item => item.type === "motion").length === 2);
    await pet.screenshot({ path: path.join(output, "model-speaking.png") });
    assert.equal(await pet.locator("#voice-toggle img").evaluate(img => img.complete && img.naturalWidth > 0 && img.src.endsWith("/square.svg")), true);
    await pet.locator("#voice-toggle").click();
    await frame.waitForFunction(() => window.testParameters.mouth < 0.03);
    await pet.waitForFunction(() => document.querySelector("#voice-toggle img").src.endsWith("/volume-2.svg"));
    assert.equal(await pet.locator("#voice-toggle img").evaluate(img => img.complete && img.naturalWidth > 0), true);
    assert.equal(requests, 1);
    assert.equal(await pet.evaluate(() => {
      const bubble = document.querySelector("#speech-panel").getBoundingClientRect();
      const model = document.querySelector("#model-stage").getBoundingClientRect();
      return bubble.bottom <= model.top;
    }), true, "reply does not cover model");
    await pet.locator("#talk").click();
    await pet.locator("#companion-text").fill("fail");
    await pet.locator("#companion-send").click();
    await pet.waitForFunction(() => document.querySelector("#companion-text").value === "fail");
    assert.equal(await pet.evaluate(() => modelEvents.filter(item => item.type === "motion").length), 2, "failed requests never trigger reply gestures");
    assert.equal(await pet.locator("#companion-input").isHidden(), true, "failure does not steal focus");
    await pet.locator("#talk").click();
    await pet.locator("#companion-text").fill("cancel");
    await pet.locator("#companion-send").click();
    await pet.locator("#companion-stop").click();
    await poll(() => pet.evaluate(async () => !(await window.desktopPet.getChatState()).busy), { label: "cancelled request" });
    await pet.waitForTimeout(2200);
    assert.equal(await pet.evaluate(() => bubbleVisible), false, "cancelled reply cannot return later");
    await pet.locator("#talk").click();
    await pet.locator("#companion-text").fill("Unsent companion thought");
    await pet.evaluate(() => window.desktopPet.openChatWindow());
    const chat = await find("chat.html");
    await chat.waitForFunction(() => document.querySelector("#message-input").value === "Unsent companion thought");
    await pet.locator("#companion-close").click();
    await pet.evaluate(() => window.desktopPet.setSettings({ characterId: "luna" }));
    await pet.waitForFunction(() => !document.querySelector("iframe") && spriteImage && character.id === "luna");
    assert.equal(await pet.evaluate(() => ctx.getImageData(0, 0, 768, 832).data.some((value, index) => index % 4 === 3 && value > 0)), true);
    assert.deepEqual(errors, []);
    console.log("PASS: native sample loading, isolated frame, blink, breath, gaze, manual expression, motion, inline draft/submit/failure/cancel, history sync, chat expression, audio-driven mouth/stop, scaling, sprite fallback; isolated local LLM/TTS only.");
  } finally {
    await app.evaluate(({ app }) => app.exit(0));
    await app.close();
    fs.rmSync(data, { recursive: true, force: true });
    server.closeAllConnections(); server.close();
  }
}
run().catch((error) => { console.error(error); server.closeAllConnections(); server.close(); process.exitCode = 1; });
