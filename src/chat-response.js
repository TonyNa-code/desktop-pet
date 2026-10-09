// Handles both JSON responses and OpenAI-compatible SSE without retrying a paid request.
async function readChatResponse(response, onProgress = () => {}) {
  const limit = 100000;
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || reply.length > limit) throw new Error("invalid_reply");
    return reply.trim();
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  let complete = false;
  let finished = false;
  function event(block) {
    const data = block.split("\n").filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, "")).join("\n");
    if (!data) return;
    if (data === "[DONE]") { complete = true; return; }
    const parsed = JSON.parse(data);
    if (parsed.error) throw new Error("stream_error");
    const choice = parsed.choices?.find((item) => (item.index ?? 0) === 0);
    const delta = choice?.delta?.content;
    if (typeof delta === "string") {
      reply += delta;
      if (reply.length > limit) throw new Error("reply_too_large");
      onProgress(reply);
    }
    if (choice?.finish_reason) finished = true;
  }
  try {
    while (!complete) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      // Keep a trailing CR until the next chunk, which may begin with LF.
      buffer = buffer.replace(/\r\n/g, "\n").replace(/\r(?!$)/g, "\n");
      let end;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        event(block);
      }
      if (buffer.length > limit * 2) throw new Error("event_too_large");
      if (done) {
        if (buffer.trim()) event(buffer);
        break;
      }
    }
    if (!complete && !finished) throw new Error("incomplete_stream");
    return reply.trim();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

module.exports = { readChatResponse };
