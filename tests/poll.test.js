const test = require("node:test");
const assert = require("node:assert/strict");
const { poll } = require("./poll.cjs");

test("async state polling waits for a true value, not a truthy Promise", async () => {
  let calls = 0;
  const result = await poll(async () => ++calls === 3 ? { reply: "Ready" } : false, { interval: 1 });
  assert.equal(calls, 3);
  assert.deepEqual(result, { reply: "Ready" });
});

test("async state polling reports timeouts and propagates real evaluation failures", async () => {
  await assert.rejects(poll(async () => false, { timeout: 5, interval: 1, label: "reply" }), /waiting for reply/);
  await assert.rejects(poll(async () => { throw new Error("Window closed"); }), /Window closed/);
});
