const test = require("node:test");
const assert = require("node:assert/strict");
const { configure } = require("../src/live2d/rig");
test("legacy exported models use their actual parameter IDs for gaze and breathing", () => {
  const params = [{ parameterId: "ParamAngleX", peak: 15 }, { parameterId: "ParamBreath", peak: .5 }];
  const internal = { coreModel: { getModel: () => ({ parameters: { ids: ["PARAM_ANGLE_X", "PARAM_BREATH"] } }) },
    breath: { getParameters: () => params } };
  configure(internal);
  assert.equal(internal.idParamAngleX, "PARAM_ANGLE_X");
  assert.equal(params[0].parameterId, "PARAM_ANGLE_X");
  assert.equal(params[0].peak, 6.75);
  assert.equal(params[1].parameterId, "PARAM_BREATH");
  assert.equal(params[1].peak, .5);
});
test("modern parameter IDs take precedence when both conventions exist", () => {
  const internal = { coreModel: { getModel: () => ({ parameters: { ids: ["ParamAngleX", "PARAM_ANGLE_X"] } }) }, breath: { getParameters: () => [] } };
  const { resolve } = configure(internal);
  assert.equal(resolve("ParamAngleX"), "ParamAngleX");
  assert.equal(resolve("Missing"), "Missing");
});
