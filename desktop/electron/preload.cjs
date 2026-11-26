const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("onebrain", {
  getUpdateStatus: () => ipcRenderer.invoke("updates:get"),
  getApiKey: () => ipcRenderer.invoke("settings:api-key:get"),
  saveApiKey: (key) => ipcRenderer.invoke("settings:api-key:set", key),
  captureScreen: () => ipcRenderer.invoke("screen:capture"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  onUpdateStatus: (callback) => { const handler = (_event, payload) => callback(payload); ipcRenderer.on("updates:status", handler); return () => ipcRenderer.removeListener("updates:status", handler); },
  runAgent: (task, key, model) => ipcRenderer.invoke("agent:run", { task, key, model }),
  stopAgent: () => ipcRenderer.send("agent:stop"),
  chooseWorkspace: () => ipcRenderer.invoke("workspace:choose"),
  getWorkspace: () => ipcRenderer.invoke("workspace:get"),
  getNetworkDevices: () => ipcRenderer.invoke("mdt:network"),
  onAgentEvent: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("agent:event", handler);
    return () => ipcRenderer.removeListener("agent:event", handler);
  }
});