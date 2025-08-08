// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 控制：scan / delete
  scanJunk: () => ipcRenderer.send('scan-junk'),
  deleteJunk: (files) => ipcRenderer.send('delete-junk', files),

  // 订阅单条扫描项（返回 unsubscribe）
  onScanItem: (cb) => {
    const listener = (event, data) => cb && cb(data);
    ipcRenderer.on('scan-item', listener);
    return () => ipcRenderer.removeListener('scan-item', listener);
  },
  onScanComplete: (cb) => {
    const listener = () => cb && cb();
    ipcRenderer.on('scan-complete', listener);
    return () => ipcRenderer.removeListener('scan-complete', listener);
  },
  onScanError: (cb) => {
    const listener = (event, err) => cb && cb(err);
    ipcRenderer.on('scan-error', listener);
    return () => ipcRenderer.removeListener('scan-error', listener);
  },
  onScanBusy: (cb) => {
    const listener = () => cb && cb();
    ipcRenderer.on('scan-busy', listener);
    return () => ipcRenderer.removeListener('scan-busy', listener);
  },

  // 删除相关订阅
  onDeleteProgress: (cb) => {
    const listener = (event, count, currentPath) => cb && cb(count, currentPath);
    ipcRenderer.on('delete-progress', listener);
    return () => ipcRenderer.removeListener('delete-progress', listener);
  },
  onDeleteSkip: (cb) => {
    const listener = (event, p, reason) => cb && cb(p, reason);
    ipcRenderer.on('delete-skip', listener);
    return () => ipcRenderer.removeListener('delete-skip', listener);
  },
  onDeleteComplete: (cb) => {
    const listener = () => cb && cb();
    ipcRenderer.on('delete-complete', listener);
    return () => ipcRenderer.removeListener('delete-complete', listener);
  },
  onDeleteBusy: (cb) => {
    const listener = () => cb && cb();
    ipcRenderer.on('delete-busy', listener);
    return () => ipcRenderer.removeListener('delete-busy', listener);
  },
});
