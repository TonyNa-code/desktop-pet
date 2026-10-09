(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DesktopPetValidation = factory();
}(typeof globalThis !== "undefined" ? globalThis : window, () => {
  function validUrl(value) {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
    } catch { return false; }
  }

  function validate(config, scope = "all", complete = true) {
    const llm = config.assistant || {};
    const tts = config.tts || {};
    const error = (field, key) => ({ field, key: `validation.${key}` });
    if (scope !== "tts") {
      if (llm.baseUrl && !validUrl(llm.baseUrl)) return error("base-url", "url");
      if (complete && (llm.baseUrl || llm.model) && (!llm.baseUrl || !llm.model)) return error(llm.baseUrl ? "model" : "base-url", "model");
    }
    if (scope !== "llm" && ["custom", "gptsovits"].includes(tts.provider)) {
      if (tts.endpoint && !validUrl(tts.endpoint)) return error("tts-endpoint", "url");
      if (complete && tts.provider === "custom" && !tts.endpoint) return error("tts-endpoint", "url");
      if (complete && tts.provider === "gptsovits" && !tts.referenceAudioPath?.trim()) return error("tts-reference-audio", "reference");
      if (tts.provider === "custom" && tts.customBodyTemplate) {
        try {
          const body = JSON.parse(tts.customBodyTemplate);
          if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
          if (!tts.customBodyTemplate.includes("{{text}}")) return error("tts-custom-body", "placeholder");
          if (tts.requestMode === "query" && Object.values(body).some((v) => v !== null && typeof v === "object")) return error("tts-custom-body", "query");
        } catch { return error("tts-custom-body", "json"); }
      }
    }
    return null;
  }
  return { validate, validUrl };
}));
