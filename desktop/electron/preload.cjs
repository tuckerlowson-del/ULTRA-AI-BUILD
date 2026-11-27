const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("onebrain", {
  localAIChat: (messages, model) => ipcRenderer.invoke("local-ai:chat", { messages, model }),
  copyText: (text) => ipcRenderer.invoke("clipboard:write", text),
  exportChat: (payload) => ipcRenderer.invoke("chat:export", payload),
  loadAppData: () => ipcRenderer.invoke("app-data:load"),
  saveAppData: (data) => ipcRenderer.invoke("app-data:save", data),
  getModels: (endpoint, key) => ipcRenderer.invoke("models:list", { endpoint, key }),
  getUpdateStatus: () => ipcRenderer.invoke("updates:get"),
  showNotification: (payload) => ipcRenderer.invoke("notifications:show", payload),
  getApiKey: () => ipcRenderer.invoke("settings:api-key:get"),
  saveApiKey: (key) => ipcRenderer.invoke("settings:api-key:set", key),
  captureScreen: () => ipcRenderer.invoke("screen:capture"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  onUpdateStatus: (callback) => { const handler = (_event, payload) => callback(payload); ipcRenderer.on("updates:status", handler); return () => ipcRenderer.removeListener("updates:status", handler); },
  runAgent: (task, key, model, endpoint) => ipcRenderer.invoke("agent:run", { task, key, model, endpoint }),
  stopAgent: () => ipcRenderer.send("agent:stop"),
  chooseWorkspace: () => ipcRenderer.invoke("workspace:choose"),
  getWorkspace: () => ipcRenderer.invoke("workspace:get"),
  getNetworkDevices: () => ipcRenderer.invoke("mdt:network"),\n  getCsiDiagnostics: () => ipcRenderer.invoke("csi:diagnostics"),
  getSystemOverview: () => ipcRenderer.invoke("system:overview"),
  onAgentEvent: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("agent:event", handler);
    return () => ipcRenderer.removeListener("agent:event", handler);
  }
});