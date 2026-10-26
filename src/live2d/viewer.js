/* This frame has no preload bridge. It receives presentation state only. */
(() => {
  const CHANNEL = "desktop-pet-model";
  const canvas = document.querySelector("#model");
  let application;
  let model;
  let artBounds;
  let presence = "idle";
  let attentionWeight = 0;
  let modelId = "";
  let generation = 0;
  let automatic = true;
  let gazeEnabled = true;
  let idleEnabled = true;
  let busy = false;
  let dragging = false;
  let expressionIndex = -1;
  let expressionQueue = Promise.resolve();
  let mouthTarget = 0;
  let mouthValue = 0;
  let mouthAt = 0;
  let touchState = null;
  let touchAt = -Infinity;
  let touches = {};
  let nextMotionAt = 0;
  let replyMotionActive = false;
  let replyMotionAt = -Infinity;
  let metadata = { expressions: [], motions: {} };

  function notify(type, extra = {}) { parent.postMessage({ channel: CHANNEL, type, ...extra }, "*"); }
  function fit() {
    if (!application || !model) return;
    const width = Math.max(1, innerWidth);
    const height = Math.max(1, innerHeight);
    application.renderer.resize(width, height);
    const bounds = artBounds || model.internalModel;
    const scale = Math.min(width / bounds.width, height / bounds.height) * 0.88;
    model.scale.set(scale);
    model.anchor.set(0.5, 0.5);
    model.position.set(width / 2 - (bounds.x || 0) * scale, height / 2 - (bounds.y || 0) * scale);
  }

  function stopMotions() {
    if (!model) return;
    replyMotionActive = false;
    model.internalModel.motionManager.stopAllMotions();
    // Breathing and blinking remain active; large idle motions are explicitly paced below.
    model.internalModel.motionManager.groups.idle = "__desktop_pet_no_automatic_motion__";
  }

  function expression(index) {
    const target = model;
    const token = generation;
    expressionIndex = index;
    expressionQueue = expressionQueue.then(async () => {
      if (!target || model !== target || generation !== token) return;
      const manager = target.internalModel.motionManager.expressionManager;
      if (index < 0 && manager) {
        // The library restores currentExpression after motions; neutral must persist too.
        manager.currentExpression = manager.defaultExpression;
        manager.resetExpression();
      } else if (manager && !(await manager.setExpression(index))) { notify("action-error"); return; }
      if (model === target) notify("expression", { index });
    }).catch(() => notify("action-error"));
  }

  function cancelTouch(restore = true) {
    const previous = touchState;
    touchState = null;
    if (restore && previous?.expressionChanged) expression(previous.expression);
  }

  function touch(kind) {
    const now = performance.now();
    if (!automatic || busy || dragging || presence !== "idle" || now - touchAt < 2400) return;
    if (!["head", "greet", "drop"].includes(kind)) return;
    cancelTouch();
    stopMotions();
    const mapping = touches[kind];
    const index = mapping?.expression;
    const expressionChanged = Number.isInteger(index) && index >= 0 && index < metadata.expressions.length;
    touchState = { kind, start: now, expression: expressionIndex, expressionChanged };
    touchAt = now;
    if (expressionChanged) expression(index);
    touchState.nativeMotion = mapping?.motion ? motion(mapping.motion.group, mapping.motion.index) : false;
    nextMotionAt = now + 45000;
    notify("touch", { kind });
  }

  function locate(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x >= 1 || y < 0 || y >= 1) return null;
    const gl = application.renderer.gl;
    const pixel = new Uint8Array(4);
    gl.readPixels(Math.floor(x * canvas.width), canvas.height - 1 - Math.floor(y * canvas.height), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    if (pixel[3] <= 8) return null;
    const areas = model.internalModel.hitAreas;
    if (areas && Object.keys(areas).length) {
      const hits = model.hitTest(x * innerWidth, y * innerHeight);
      if (hits.some(name => /head|face/i.test(`${name} ${areas[name]?.id || ""}`))) return "head";
      return hits.length ? "greet" : null;
    }
    // Without named regions, use a height split inside the visible silhouette.
    return y < 0.46 ? "head" : "greet";
  }

  function motion(group, index = 0, reply = false) {
    if (!automatic || !model || !Object.hasOwn(metadata.motions, group)) return false;
    if (!Number.isInteger(index) || index < 0 || index >= metadata.motions[group]) return false;
    replyMotionActive = reply;
    const target = model;
    target.motion(group, index, 3).then((started) => { if (target === model) notify(started ? "motion" : "action-error", { group, index }); })
      .catch(() => notify("action-error"));
    nextMotionAt = performance.now() + 45000;
    return true;
  }

  async function load(data) {
    const token = ++generation;
    modelId = data.id;
    automatic = data.automatic !== false;
    gazeEnabled = data.gaze !== false;
    idleEnabled = data.idle !== false;
    touches = data.touches || {};
    busy = data.busy === true;
    dragging = data.dragging === true;
    presence = "idle";
    attentionWeight = 0;
    artBounds = null;
    expressionIndex = -1;
    mouthTarget = mouthValue = 0;
    replyMotionAt = -Infinity;
    touchState = null;
    touchAt = -Infinity;
    model?.destroy({ children: true, texture: true, baseTexture: true });
    model = null;
    try {
      if (!window.Live2DCubismCore || !window.PIXI?.live2d) throw new Error();
      if (!application) {
        application = new PIXI.Application({ view: canvas, backgroundAlpha: 0, antialias: true,
          autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 2), preserveDrawingBuffer: true });
        application.ticker.maxFPS = 60;
        application.ticker.add(() => model?.update(Math.min(50, application.ticker.elapsedMS)));
      }
      application.renderer.resize(Math.max(1, innerWidth), Math.max(1, innerHeight));
      const url = `/models/${modelId}/model.model3.json`;
      const descriptor = await (await fetch(url)).json();
      const refs = descriptor.FileReferences;
      const nextMetadata = { expressions: (refs.Expressions || []).map((entry) => entry.Name),
        motions: Object.fromEntries(Object.entries(refs.Motions || {}).map(([group, entries]) => [group, entries.length])) };
      const loaded = await PIXI.live2d.Live2DModel.from(url, { autoUpdate: false, autoInteract: false, idleMotionGroup: "__desktop_pet_no_automatic_motion__" });
      if (generation !== token) { loaded.destroy({ children: true, texture: true, baseTexture: true }); return; }
      model = loaded;
      metadata = nextMetadata;
      application.stage.addChild(model);
      stopMotions();
      const internal = model.internalModel;
      internal.motionManager.on("motionFinish", () => { if (internal === model?.internalModel) replyMotionActive = false; });
      const core = internal.coreModel;
      const { ids, resolve } = window.DesktopPetRig.configure(internal);
      artBounds = window.DesktopPetRig.measure(application, model);
      fit();
      nextMotionAt = performance.now() + 35000;
      const lips = (descriptor.Groups?.find((group) => group.Name === "LipSync")?.Ids || []).filter(id => ids.has(id));
      if (!lips.length && ids.has(resolve("ParamMouthOpenY"))) lips.push(resolve("ParamMouthOpenY"));
      internal.on("beforeModelUpdate", () => {
        const now = performance.now();
        if (now - mouthAt > 300) mouthTarget = 0;
        const wasOpen = mouthValue > 0.005;
        mouthValue += (mouthTarget - mouthValue) * 0.25;
        if (mouthTarget > 0 || wasOpen) {
          for (const id of lips) if (ids.has(id)) core.setParameterValueById(id, mouthValue < 0.005 ? 0 : mouthValue);
        }
        attentionWeight += ((automatic && presence !== "idle" ? 1 : 0) - attentionWeight) * 0.08;
        if (attentionWeight > 0.005) {
          if (ids.has(resolve("ParamAngleZ"))) core.addParameterValueById(resolve("ParamAngleZ"), (presence === "thinking" ? 2 : -1.5) * attentionWeight);
        }
        if (touchState) {
          const progress = Math.min(1, (now - touchState.start) / 2200);
          const weight = Math.sin(Math.PI * progress) ** 2;
          if (automatic && !touchState.nativeMotion && ids.has(resolve("ParamAngleZ"))) {
            core.addParameterValueById(resolve("ParamAngleZ"), (touchState.kind === "head" ? -5 : 2) * weight);
          }
          if (progress >= 1) cancelTouch();
        }
        if (automatic && idleEnabled && !busy && !dragging && presence === "idle" && now > nextMotionAt) {
          const group = Object.keys(metadata.motions).find((key) => /^idle$/i.test(key));
          nextMotionAt = now + 45000 + Math.random() * 15000;
          if (group && metadata.motions[group]) model.motion(group, 0, 1).catch(() => {});
        }
      });
      if (document.hidden) application.ticker.stop();
      notify("loaded", { expressions: metadata.expressions, motions: metadata.motions });
    } catch {
      if (generation === token) notify("error");
    }
  }

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.source !== parent || event.origin !== "null" || !data || data.channel !== CHANNEL) return;
    if (data.type === "load" && /^imported-[a-f0-9]{24}$/.test(data.id)) { load(data); return; }
    if (!model || data.id !== modelId) return;
    if (data.type === "options") {
      const changed = automatic !== (data.automatic !== false);
      automatic = data.automatic !== false;
      gazeEnabled = data.gaze !== false;
      const interrupt = (data.busy === true && !busy) || (data.dragging === true && !dragging)
        || (data.idle === false && idleEnabled) || changed;
      if (interrupt) { cancelTouch(); stopMotions(); nextMotionAt = performance.now() + 45000; }
      busy = data.busy === true;
      dragging = data.dragging === true;
      idleEnabled = data.idle !== false;
      touches = data.touches || {};
      if (!gazeEnabled || !automatic) model.internalModel.focusController.focus(0, 0);
    } else if (data.type === "presence" && ["idle", "attentive", "thinking", "speaking"].includes(data.state)) {
      if (presence === data.state) return;
      presence = data.state;
      if (presence !== "idle") cancelTouch();
      if (presence !== "idle" && !(presence === "speaking" && replyMotionActive)) stopMotions();
      nextMotionAt = performance.now() + 45000;
      if (automatic && gazeEnabled) model.internalModel.focusController.focus(0, presence === "idle" ? 0 : 0.08);
    } else if (data.type === "gaze") {
      if (!automatic || !gazeEnabled || dragging || presence !== "idle" || !Number.isFinite(data.x) || !Number.isFinite(data.y)) return;
      model.internalModel.focusController.focus(Math.max(-0.35, Math.min(0.35, data.x)), Math.max(-0.25, Math.min(0.25, data.y)));
    } else if (data.type === "mouth" && Number.isFinite(data.value)) {
      mouthTarget = Math.max(0, Math.min(1, data.value)); mouthAt = performance.now();
    } else if (data.type === "cycle") {
      cancelTouch(false);
      expression((expressionIndex + 2) % (metadata.expressions.length + 1) - 1);
    } else if (data.type === "expression" && Number.isInteger(data.index) && data.index >= -1 && data.index < metadata.expressions.length) {
      cancelTouch(false);
      expression(data.index);
    } else if (data.type === "motion") {
      cancelTouch();
      motion(data.group, data.index);
    } else if (data.type === "reply-motion") {
      const now = performance.now();
      if (now - replyMotionAt >= 12000 && motion(data.group, data.index, true)) replyMotionAt = now;
    } else if (data.type === "touch") {
      touch(data.kind);
    } else if (data.type === "locate" && Number.isSafeInteger(data.request)) {
      notify("location", { request: data.request, kind: locate(data.x, data.y) });
    }
  });
  window.addEventListener("resize", fit);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelTouch(); stopMotions();
      mouthTarget = 0;
      application?.ticker.stop();
    } else {
      nextMotionAt = performance.now() + 45000;
      application?.ticker.start();
    }
  });
  notify("boot");
})();
