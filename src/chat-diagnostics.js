const { ERROR_LIMIT, readResponseJson } = require("./network-safety");

function retryAfterSeconds(header, now = Date.now()) {
  const value = (header || "").trim();
  let seconds;
  if (/^\d+$/.test(value)) seconds = Number(value);
  else if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/.test(value) && /\d\d:\d\d:\d\d (GMT|\d{4})$/.test(value)) {
    const date = Date.parse(value.endsWith("GMT") ? value : value + " GMT");
    seconds = Math.ceil((date - now) / 1000);
  }
  return Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 86400 ? seconds : 0;
}

async function chatHttpIssue(response, translate, modelList = false) {
  const status = response.status;
  let reason = ({
    400: "parameters", 401: "credentials", 402: "quota", 403: "access",
    404: modelList ? "modelList" : "endpoint", 408: "timeout", 413: "length",
    422: "parameters", 429: "limit", 504: "timeout",
  })[status] || (status >= 500 ? "service" : "rejected");

  // Use known error codes only. Upstream prose can echo credentials or prompts.
  if (status === 429 && /json/i.test(response.headers.get("content-type") || "")) {
    try {
      const error = (await readResponseJson(response, ERROR_LIMIT))?.error;
      if ([error?.code, error?.type].includes("insufficient_quota")) reason = "quota";
    } catch { /* A nonstandard body does not invalidate the HTTP status. */ }
  } else {
    await response.body?.cancel().catch(() => {});
  }
  let message = translate("chatError." + reason) + " (HTTP " + status + ")";
  if (reason === "limit" || status === 503) {
    const seconds = retryAfterSeconds(response.headers.get("retry-after"));
    if (seconds) message += " " + (seconds < 120
      ? translate("chatError.waitSeconds", { count: seconds })
      : translate("chatError.waitMinutes", { count: Math.ceil(seconds / 60) }));
  }
  return { message, settingsSuggested: ["credentials", "access", "parameters", "endpoint"].includes(reason) };
}

function chatReadIssue(error, aborted, translate, receivedText = false) {
  let key = receivedText ? "interrupted" : "connection";
  if (aborted || error?.name === "AbortError") key = "timeout";
  else if (["incomplete_stream", "stream_error"].includes(error?.message)) key = "interrupted";
  else if (["reply_too_large", "response_too_large", "event_too_large"].includes(error?.message)) key = "largeReply";
  else if (!receivedText && (error?.name === "SyntaxError" || error?.message === "invalid_reply")) key = "format";
  return { message: translate("chatError." + key), settingsSuggested: key === "format" || key === "connection" };
}

module.exports = { chatHttpIssue, chatReadIssue, retryAfterSeconds };
