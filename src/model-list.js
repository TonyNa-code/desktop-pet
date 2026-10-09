function modelsEndpoint(baseUrl) {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, "").replace(/\/chat\/completions$/, "")}/models`;
  return url.href;
}

async function readModelList(response) {
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4 * 1024 * 1024) throw new Error("model_list_too_large");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!Array.isArray(data.data)) throw new Error("invalid_model_list");
  return [...new Set(data.data.map((item) => item?.id).filter((id) => typeof id === "string" && id.length > 0 && id.length <= 300 && !/[\x00-\x1f]/.test(id)))].sort().slice(0, 2000);
}

module.exports = { modelsEndpoint, readModelList };
