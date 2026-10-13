/* This frame has no preload bridge. It receives presentation state only. */
(() => {
  const CHANNEL = "desktop-pet-model";
  const canvas = document.querySelector("#model");
  let application;
  let model;
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
    const bounds = model.internalModel;
    const scale = Math.min(width / bounds.width, height / bounds.height) * 0.94;
    model.scale.set(scale);
    model.anchor.set(0.5, 1);
    model.position.set(width / 2, height - 2);
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
    expressionIndex = -1;
    mouthTarget = mouthValue = 0;
    model?.destroy({ children: true, texture: true, baseTexture: true });
    model = null;
    try {
      if (!window.Live2DCubismCore || !window.PIXI?.live2d) throw new Error();
      if (!application) {
        application = new PIXI.Application({ view: canvas, backgroundAlpha: 0, antialias: true,
          autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 2), preserveDrawingBuffer: true });
        application.ticker.maxFPS = 30;
      }
      const url = `/models/${modelId}/model.model3.json`;
      const descriptor = await (await fetch(url)).json();
      const refs = descriptor.FileReferences;
      metadata = { expressions: (refs.Expressions || []).map((entry) => entry.Name),
        motions: Object.fromEntries(Object.entries(refs.Motions || {}).map(([group, entries]) => [group, entries.length])) };
      const loaded = await PIXI.live2d.Live2DModel.from(url, { autoInteract: false, idleMotionGroup: "__desktop_pet_no_automatic_motion__" });
      if (generation !== token) { loaded.destroy({ children: true, texture: true, baseTexture: true }); return; }
      model = loaded;
      application.stage.addChild(model);
      stopMotions();
      fit();
      nextMotionAt = performance.now() + 35000;
      const internal = model.internalModel;
      const core = internal.coreModel;
      const ids = new Set(core.getModel().parameters.ids);
      const lips = descriptor.Groups?.find((group) => group.Name === "LipSync")?.Ids || ["ParamMouthOpenY"];
      internal.on("beforeModelUpdate", () => {
        const now = performance.now();
        if (now - mouthAt > 300) mouthTarget = 0;
        mouthValue += (mouthTarget - mouthValue) * 0.4;
        if (mouthTarget > 0 || mouthValue > 0.005) {
          for (const id of lips) if (ids.has(id)) core.setParameterValueById(id, mouthValue);
        }
        if (automatic && now < pettingUntil) {
          const weight = Math.min(1, (pettingUntil - now) / 400);
          if (ids.has("ParamAngleZ")) core.addParameterValueById("ParamAngleZ", -4 * weight);
        }
        if (automatic && !busy && now > nextMotionAt) {
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
    } else if (data.type === "gaze") {
      if (!automatic || !gazeEnabled || !Number.isFinite(data.x) || !Number.isFinite(data.y)) return;
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
      const group = Object.keys(metadata.motions).find((key) => /tapbody|tap_body|touch/i.test(key));
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
