// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  scanJunk: () => ipcRenderer.invoke("scan-junk"),
  // deleteJunk: () => ipcRenderer.invoke('delete-junk')
  deleteJunk: (progressCallback) => {
    ipcRenderer.send("delete-junk");
    ipcRenderer.on("delete-progress", (event, count, currentPath) => {
      if (progressCallback) progressCallback(count, currentPath);
    });
  },
});
