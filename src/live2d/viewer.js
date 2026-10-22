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
  let busy = false;
  let expressionIndex = -1;
  let expressionQueue = Promise.resolve();
  let mouthTarget = 0;
  let mouthValue = 0;
  let mouthAt = 0;
  let pettingUntil = 0;
  let nextMotionAt = 0;
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

  function motion(group, index = 0) {
    if (!automatic || !model || !Object.hasOwn(metadata.motions, group)) return;
    if (!Number.isInteger(index) || index < 0 || index >= metadata.motions[group]) return;
    const target = model;
    target.motion(group, index, 3).then((started) => { if (target === model) notify(started ? "motion" : "action-error", { group, index }); })
      .catch(() => notify("action-error"));
    nextMotionAt = performance.now() + 45000;
  }

  async function load(data) {
    const token = ++generation;
    modelId = data.id;
    automatic = data.automatic !== false;
    gazeEnabled = data.gaze !== false;
    busy = data.busy === true;
    presence = "idle";
    attentionWeight = 0;
    artBounds = null;
    expressionIndex = -1;
    mouthTarget = mouthValue = 0;
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
      const core = internal.coreModel;
      const { ids, resolve } = window.DesktopPetRig.configure(internal);
      artBounds = window.DesktopPetRig.measure(application, model);
      fit();
      nextMotionAt = performance.now() + 35000;
      const lips = descriptor.Groups?.find((group) => group.Name === "LipSync")?.Ids || ["ParamMouthOpenY"];
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
        if (automatic && now < pettingUntil) {
          const weight = Math.min(1, (pettingUntil - now) / 400);
          if (ids.has(resolve("ParamAngleZ"))) core.addParameterValueById(resolve("ParamAngleZ"), -4 * weight);
        }
        if (automatic && !busy && presence === "idle" && now > nextMotionAt) {
          const group = Object.keys(metadata.motions).find((key) => /^idle$/i.test(key));
          nextMotionAt = now + 45000 + Math.random() * 15000;
          if (group && metadata.motions[group]) model.motion(group, 0, 1).catch(() => {});
        }
      });
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
      if (data.busy === true && !busy) stopMotions();
      busy = data.busy === true;
      if (changed) { stopMotions(); nextMotionAt = performance.now() + 45000; }
      if (!gazeEnabled || !automatic) model.internalModel.focusController.focus(0, 0);
    } else if (data.type === "presence" && ["idle", "attentive", "thinking", "speaking"].includes(data.state)) {
      if (presence === data.state) return;
      presence = data.state;
      if (presence !== "idle") stopMotions();
      nextMotionAt = performance.now() + 45000;
      if (automatic && gazeEnabled) model.internalModel.focusController.focus(0, presence === "idle" ? 0 : 0.08);
    } else if (data.type === "gaze") {
      if (!automatic || !gazeEnabled || presence !== "idle" || !Number.isFinite(data.x) || !Number.isFinite(data.y)) return;
      model.internalModel.focusController.focus(Math.max(-0.35, Math.min(0.35, data.x)), Math.max(-0.25, Math.min(0.25, data.y)));
    } else if (data.type === "mouth" && Number.isFinite(data.value)) {
      mouthTarget = Math.max(0, Math.min(1, data.value)); mouthAt = performance.now();
    } else if (data.type === "cycle") {
      expression((expressionIndex + 2) % (metadata.expressions.length + 1) - 1);
    } else if (data.type === "expression" && Number.isInteger(data.index) && data.index >= -1 && data.index < metadata.expressions.length) {
      expression(data.index);
    } else if (data.type === "motion") {
      motion(data.group, data.index);
    } else if (data.type === "touch" && automatic && !busy) {
      pettingUntil = performance.now() + 1200;
      const group = Object.keys(metadata.motions).find((key) => /^(tapbody|tap_body|touch|tap)$/i.test(key));
      if (group && metadata.motions[group]) motion(group, 0);
    }
  });
  window.addEventListener("resize", fit);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) application?.ticker.stop();
    else application?.ticker.start();
  });
  notify("boot");
})();
