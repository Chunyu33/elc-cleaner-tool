const { contextBridge, ipcRenderer } = require('electron');

// 将bridge挂载到window上
contextBridge.exposeInMainWorld('api', {
  // 控制
  scanJunk: () => ipcRenderer.send('scan-junk'),
  deleteJunk: (files) => ipcRenderer.send('delete-junk', files),

  // 扫描项（逐条）
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
  // 扫描进度
  onScanProgress: (cb) => {
    const listener = (event, progress, current, total, currentPath) => cb && cb(progress, current, total, currentPath);
    ipcRenderer.on('scan-progress', listener);
    return () => ipcRenderer.removeListener('scan-progress', listener);
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

  // 删除进度/跳过
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
    const listener = (event, deletedCount) => cb && cb(deletedCount);
    ipcRenderer.on('delete-complete', listener);
    return () => ipcRenderer.removeListener('delete-complete', listener);
  },
  onDeleteBusy: (cb) => {
    const listener = () => cb && cb();
    ipcRenderer.on('delete-busy', listener);
    return () => ipcRenderer.removeListener('delete-busy', listener);
  },

  // 一键打开磁盘清理工具 API
  runCleanmgr: () => ipcRenderer.invoke('run-cleanmgr'),

  // 添加可用性检查
  onCleanmgrAvailable: () => ipcRenderer.invoke('check-cleanmgr-available'),

  // 日志读取 / 打开
  readSkipLog: () => ipcRenderer.invoke('read-skip-log'),
  openSkipLog: () => ipcRenderer.invoke('open-skip-log'),

  // 窗口大小化、关闭、退出事件
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  exitApp: () => ipcRenderer.send('app-exit'),
  // 跳转到外链
  openLink: (url) => ipcRenderer.send('open-link', url)
});
