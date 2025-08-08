// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 发起扫描（事件驱动）
  scanJunk: () => ipcRenderer.send('scan-junk'),

  // 发起删除（传入数组）
  deleteJunk: (files) => ipcRenderer.send('delete-junk', files),

  // 订阅单条扫描结果。返回 unsubscribe
  onScanItem: (cb) => {
    const listener = (event, data) => cb && cb(data);
    ipcRenderer.on('scan-item', listener);
    return () => ipcRenderer.removeListener('scan-item', listener);
  },

  // 订阅扫描完成
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

  // 订阅删除进度（每处理一项）
  onDeleteProgress: (cb) => {
    const listener = (event, count, currentPath) => cb && cb(count, currentPath);
    ipcRenderer.on('delete-progress', listener);
    return () => ipcRenderer.removeListener('delete-progress', listener);
  },

  // 订阅删除时跳过的项（path, reason）
  onDeleteSkip: (cb) => {
    const listener = (event, path, reason) => cb && cb(path, reason);
    ipcRenderer.on('delete-skip', listener);
    return () => ipcRenderer.removeListener('delete-skip', listener);
  },

  onDeleteComplete: (cb) => {
    const listener = () => cb && cb();
    ipcRenderer.on('delete-complete', listener);
    return () => ipcRenderer.removeListener('delete-complete', listener);
  },

  // 额外：错误/忙碌事件
  onScanBusy: (cb) => {
    const listener = () => cb && cb();
    ipcRenderer.on('scan-busy', listener);
    return () => ipcRenderer.removeListener('scan-busy', listener);
  },

  onDeleteBusy: (cb) => {
    const listener = () => cb && cb();
    ipcRenderer.on('delete-busy', listener);
    return () => ipcRenderer.removeListener('delete-busy', listener);
  },
});
