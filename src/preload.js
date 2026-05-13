const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopPet", {
  getAppState: () => ipcRenderer.invoke("get-app-state"),
  setSettings: (patch) => ipcRenderer.send("set-settings", patch),
  getChatState: () => ipcRenderer.invoke("get-chat-state"),
  saveChatConfig: (patch) => ipcRenderer.invoke("save-chat-config", patch),
  testAssistantConnection: (patch) => ipcRenderer.invoke("test-assistant-connection", patch),
  testTtsConnection: (patch) => ipcRenderer.invoke("test-tts-connection", patch),
  sendChatMessage: (text) => ipcRenderer.invoke("send-chat-message", text),
  clearChatHistory: () => ipcRenderer.invoke("clear-chat-history"),
  synthesizeSpeech: (text) => ipcRenderer.invoke("synthesize-speech", text),
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
