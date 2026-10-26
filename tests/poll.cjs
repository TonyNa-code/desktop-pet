async function poll(check, { timeout = 30000, interval = 50, label = "condition" } = {}) {
  const deadline = Date.now() + timeout;
  do {
    const result = await check();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, interval));
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for ${label}`);
}
module.exports = { poll };
