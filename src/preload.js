const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopPet", {
  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSettings: (patch) => ipcRenderer.send("set-settings", patch),
  onSettingsUpdated: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on("settings-updated", listener);
    return () => ipcRenderer.off("settings-updated", listener);
  },
  showContextMenu: () => ipcRenderer.send("show-context-menu"),
  dragStart: () => ipcRenderer.send("drag-start"),
  dragMove: () => ipcRenderer.invoke("drag-move"),
  dragEnd: () => ipcRenderer.send("drag-end"),
});
