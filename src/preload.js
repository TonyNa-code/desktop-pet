const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopPet", {
  getAppState: () => ipcRenderer.invoke("get-app-state"),
  getLive2DRuntime: () => ipcRenderer.invoke("get-live2d-runtime"),
  importLive2DRuntime: () => ipcRenderer.invoke("import-live2d-runtime"),
  openLive2DDownload: () => ipcRenderer.send("open-live2d-download"),
  performModelAction: (action) => ipcRenderer.invoke("perform-model-action", action),
  onModelAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on("model-action", listener);
    return () => ipcRenderer.off("model-action", listener);
  },
  setSettings: (patch) => ipcRenderer.send("set-settings", patch),
  getChatState: () => ipcRenderer.invoke("get-chat-state"),
  saveChatConfig: (patch) => ipcRenderer.invoke("save-chat-config", patch),
  testAssistantConnection: (patch) => ipcRenderer.invoke("test-assistant-connection", patch),
  listAssistantModels: (patch) => ipcRenderer.invoke("list-assistant-models", patch),
  testTtsConnection: (patch) => ipcRenderer.invoke("test-tts-connection", patch),
  sendChatMessage: (text) => ipcRenderer.invoke("send-chat-message", text),
  clearChatHistory: () => ipcRenderer.invoke("clear-chat-history"),
  stopChat: () => ipcRenderer.invoke("stop-chat"),
  confirmDiscard: () => ipcRenderer.invoke("confirm-discard"),
  previewCharacterImport: (kind) => ipcRenderer.invoke("preview-character-import", kind),
  confirmCharacterImport: (token) => ipcRenderer.invoke("confirm-character-import", token),
  removeCharacterImport: (id) => ipcRenderer.invoke("remove-character-import", id),
  beginSpeech: (generation) => ipcRenderer.invoke("begin-speech", generation),
  speechStateChanged: (change) => ipcRenderer.send("speech-state-changed", change),
  stopVoice: () => ipcRenderer.invoke("stop-voice"),
  replaySpeech: () => ipcRenderer.invoke("replay-speech"),
  onSpeechStopped: (callback) => {
    const listener = (_event, generation) => callback(generation);
    ipcRenderer.on("speech-stopped", listener);
    return () => ipcRenderer.off("speech-stopped", listener);
  },
  presentNotification: (notice) => ipcRenderer.send("present-notification", notice),
  synthesizeSpeech: (request) => ipcRenderer.invoke("synthesize-speech", request),
  openChatWindow: () => ipcRenderer.send("open-chat-window"),
  openQuickChatWindow: () => ipcRenderer.send("open-quick-chat-window"),
  openCompanionSettings: () => ipcRenderer.send("open-companion-settings"),
  onChatStateUpdated: (callback) => {
    const listener = (_event, chatState) => callback(chatState);
    ipcRenderer.on("chat-state-updated", listener);
    return () => ipcRenderer.off("chat-state-updated", listener);
  },
  onAppStateUpdated: (callback) => {
    const listener = (_event, appState) => callback(appState);
    ipcRenderer.on("app-state-updated", listener);
    return () => ipcRenderer.off("app-state-updated", listener);
  },
  onPetMessage: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("pet-message", listener);
    return () => ipcRenderer.off("pet-message", listener);
  },
  recordInteraction: (kind) => ipcRenderer.send("record-interaction", kind),
  showContextMenu: () => ipcRenderer.send("show-context-menu"),
  dragStart: () => ipcRenderer.send("drag-start"),
  dragMove: () => ipcRenderer.invoke("drag-move"),
  dragEnd: () => ipcRenderer.send("drag-end"),
});
