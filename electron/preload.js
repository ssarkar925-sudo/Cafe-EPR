const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  cafeCamSelfTest: () => ipcRenderer.invoke("cafecam-self-test"),
  getCafeCamStatus: () => ipcRenderer.invoke("cafecam-status"),
  listCafeCamCameras: () => ipcRenderer.invoke("cafecam-list-cameras"),
  installCafeCamSynthetic: () => ipcRenderer.invoke("cafecam-install-synthetic"),
  installCafeCamWrapper: (symbolicLink) => ipcRenderer.invoke("cafecam-install-wrapper", symbolicLink),
  removeCafeCam: () => ipcRenderer.invoke("cafecam-remove"),
  platform: process.platform,
  printThermal: (options) => ipcRenderer.invoke("print-thermal", options),
  getPrinters: () => ipcRenderer.invoke("get-printers"),
  showNotification: (options) => ipcRenderer.invoke("show-notification", options),
  startAepsWatcher: (options) => ipcRenderer.invoke("aeps-watcher-start", options),
  startAepsWatcherAll: (options) => ipcRenderer.invoke("aeps-watcher-start-all", options),
  snapshotAepsWatcherSources: (options) => ipcRenderer.invoke("aeps-watcher-snapshot-sources", options),
  getAepsWatcherStatus: () => ipcRenderer.invoke("aeps-watcher-status"),
  showAepsWatcherWindows: (options) => ipcRenderer.invoke("aeps-watcher-show-windows", options),
  collectAepsWatcherSources: (options) => ipcRenderer.invoke("aeps-watcher-collect-sources", options),
  stopAepsWatcher: () => ipcRenderer.invoke("aeps-watcher-stop"),
  onAepsWatcherEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("aeps-watcher-event", listener);
    return () => ipcRenderer.removeListener("aeps-watcher-event", listener);
  },
});
