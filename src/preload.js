const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopPet", {
  getAppState: () => ipcRenderer.invoke("get-app-state"),
  setSettings: (patch) => ipcRenderer.send("set-settings", patch),
  onAppStateUpdated: (callback) => {
    const listener = (_event, appState) => callback(appState);
    ipcRenderer.on("app-state-updated", listener);
    return () => ipcRenderer.off("app-state-updated", listener);
  },
  recordInteraction: (kind) => ipcRenderer.send("record-interaction", kind),
  showContextMenu: () => ipcRenderer.send("show-context-menu"),
  dragStart: () => ipcRenderer.send("drag-start"),
  dragMove: () => ipcRenderer.invoke("drag-move"),
  dragEnd: () => ipcRenderer.send("drag-end"),
});
