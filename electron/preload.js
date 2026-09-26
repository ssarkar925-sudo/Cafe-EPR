const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,
  printThermal: (options) => ipcRenderer.invoke("print-thermal", options),
  getPrinters: () => ipcRenderer.invoke("get-printers"),
  showNotification: (options) => ipcRenderer.invoke("show-notification", options),
  startAepsWatcher: (options) => ipcRenderer.invoke("aeps-watcher-start", options),
  collectAepsWatcherSources: (options) => ipcRenderer.invoke("aeps-watcher-collect-sources", options),
  stopAepsWatcher: () => ipcRenderer.invoke("aeps-watcher-stop"),
  onAepsWatcherEvent: (callback) =>
    ipcRenderer.on("aeps-watcher-event", (_event, payload) => callback(payload)),
});
