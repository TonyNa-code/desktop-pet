const CHAT_LIMIT = 2 * 1024 * 1024;
const AUDIO_LIMIT = 24 * 1024 * 1024;
const ERROR_LIMIT = 32 * 1024;

async function readResponseBytes(response, limit) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel().catch(() => {});
    throw new Error("response_too_large");
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("response_too_large");
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function readResponseJson(response, limit = CHAT_LIMIT) {
  return JSON.parse((await readResponseBytes(response, limit)).toString("utf8"));
}

function returnedAudioUrl(value, endpoint) {
  const target = new URL(value);
  const service = new URL(endpoint);
  // Only the endpoint chosen by the user has network authority, not a URL in its reply.
  if (!["http:", "https:"].includes(target.protocol) || target.origin !== service.origin
    || target.username || target.password) throw new Error("audio_origin_not_allowed");
  target.hash = "";
  return target.href;
}

function audioDataUrl(value) {
  const match = /^data:(audio\/(?:wav|x-wav|wave|mpeg|mp3|mp4|ogg|aac|flac|webm));base64,([A-Za-z0-9+/]*={0,2})$/i.exec(value);
  if (!match || !match[2] || match[2].length > Math.ceil(AUDIO_LIMIT / 3) * 4) throw new Error("invalid_audio");
  return `data:${match[1].toLowerCase()};base64,${match[2]}`;
}

function redactServiceText(value, secrets = []) {
  let text = String(value || "");
  for (const secret of secrets.filter((item) => typeof item === "string" && item.length)) {
    for (const form of new Set([secret, encodeURIComponent(secret)])) text = text.split(form).join("[redacted]");
  }
  return text.replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[redacted]")
    .replace(/\bBearer\s+[^\s,;"']+/gi, "Bearer [redacted]")
    .replace(/\/(?:Users|home)\/[^\s"'<>]+/g, "[local path]")
    .replace(/[A-Z]:\\Users\\[^\s"'<>]+/gi, "[local path]");
}

module.exports = { CHAT_LIMIT, AUDIO_LIMIT, ERROR_LIMIT, readResponseBytes, readResponseJson, returnedAudioUrl, audioDataUrl, redactServiceText };
