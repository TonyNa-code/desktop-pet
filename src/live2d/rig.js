((root) => {
  const aliases = { ParamAngleX: "PARAM_ANGLE_X", ParamAngleY: "PARAM_ANGLE_Y", ParamAngleZ: "PARAM_ANGLE_Z",
    ParamEyeBallX: "PARAM_EYE_BALL_X", ParamEyeBallY: "PARAM_EYE_BALL_Y", ParamBodyAngleX: "PARAM_BODY_ANGLE_X", ParamBreath: "PARAM_BREATH",
    ParamMouthOpenY: "PARAM_MOUTH_OPEN_Y" };
  function configure(internal) {
    const ids = new Set(internal.coreModel.getModel().parameters.ids);
    const resolve = (name) => ids.has(name) ? name : ids.has(aliases[name]) ? aliases[name] : name;
    for (const key of ["AngleX", "AngleY", "AngleZ", "EyeBallX", "EyeBallY", "BodyAngleX", "Breath"]) internal[`idParam${key}`] = resolve(`Param${key}`);
    for (const parameter of internal.breath.getParameters()) {
      parameter.parameterId = resolve(parameter.parameterId);
      if (parameter.parameterId !== resolve("ParamBreath")) parameter.peak *= 0.45;
    }
    internal.eyeBlink?.setBlinkingInterval(4);
    return { ids, resolve };
  }
  function measure(application, model) {
    const { width, height } = application.screen;
    const zoom = Math.min(width / model.internalModel.width, height / model.internalModel.height) * 0.25;
    model.anchor.set(0.5, 0.5); model.scale.set(zoom); model.position.set(width / 2, height / 2);
    model.update(16); application.renderer.render(application.stage);
    const gl = application.renderer.gl;
    const canvas = application.view;
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 8) {
      const x = ((i - 3) / 4) % canvas.width, y = Math.floor((i - 3) / 4 / canvas.width);
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (right < left) return null;
    const ratio = application.renderer.resolution;
    return { width: (right - left + 1) / ratio / zoom, height: (bottom - top + 1) / ratio / zoom,
      x: ((left + right + 1) / 2 / ratio - width / 2) / zoom,
      y: (height / 2 - (top + bottom + 1) / 2 / ratio) / zoom };
  }
  const api = { configure, measure };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DesktopPetRig = api;
})(globalThis);
