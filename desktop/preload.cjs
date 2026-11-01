const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ultronDesktop", Object.freeze({
  isNativeDesktop: true,
  getPcAccessStatus: () => ipcRenderer.invoke("ultron:pc-status"),
  requestPcAccess: () => ipcRenderer.invoke("ultron:request-pc-access"),
  revokePcAccess: () => ipcRenderer.invoke("ultron:revoke-pc-access"),
  getMicrophoneStatus: () => ipcRenderer.invoke("ultron:mic-status"),
  requestMicrophone: () => ipcRenderer.invoke("ultron:request-microphone"),
  onPcStatus: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("ultron:pc-status", listener);
    return () => ipcRenderer.removeListener("ultron:pc-status", listener);
  }
}));
