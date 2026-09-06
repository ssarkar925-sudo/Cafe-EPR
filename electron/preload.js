const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,
  printThermal: (options) => ipcRenderer.invoke("print-thermal", options),
  getPrinters: () => ipcRenderer.invoke("get-printers"),
  showNotification: (options) => ipcRenderer.invoke("show-notification", options),
});
