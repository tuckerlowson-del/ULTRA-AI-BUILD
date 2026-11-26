const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("onebrain", {
  runAgent: (task, key, model) => ipcRenderer.invoke("agent:run", { task, key, model }),
  stopAgent: () => ipcRenderer.send("agent:stop"),
  chooseWorkspace: () => ipcRenderer.invoke("workspace:choose"),
  getWorkspace: () => ipcRenderer.invoke("workspace:get"),
  onAgentEvent: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("agent:event", handler);
    return () => ipcRenderer.removeListener("agent:event", handler);
  }
});