(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DesktopPetLlmPresets = factory();
}(typeof globalThis !== "undefined" ? globalThis : window, () => ({
  ollama: { baseUrl: "http://localhost:11434/v1", model: "", needsKey: false },
  lmstudio: { baseUrl: "http://localhost:1234/v1", model: "", needsKey: false },
  deepseek: { baseUrl: "https://api.deepseek.com", model: "deepseek-flash", needsKey: true },
  openai: { baseUrl: "https://api.openai.com/v1", model: "", needsKey: true },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "", needsKey: true },
  qwen: { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus", needsKey: true },
  siliconflow: { baseUrl: "https://api.siliconflow.cn/v1", model: "", needsKey: true },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "", needsKey: true },
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "", needsKey: true },
  custom: { baseUrl: "", model: "", needsKey: true },
})));
