// 扫描、删除垃圾文件核心
const fsp = require('fs').promises;
// const os = require('os');
// const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { Worker } = require('worker_threads');
const scanWorkerString = require('./scanWorkerStr');

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return bytes + ' B';
}

// safeRemove: 优先使用 fsp.rm；若不可用退回到手动递归
async function safeRemove(targetPath) {
  if (!targetPath || targetPath.length < 3) return;
  try {
    if (typeof fsp.rm === 'function') {
      await fsp.rm(targetPath, { recursive: true, force: true });
      return;
    }
  } catch (err) {
    // 如果 rm 存在但异常，继续回退
  }

  // 回退实现
  const stat = await fsp.stat(targetPath).catch(() => null);
  if (!stat) return;
  if (stat.isDirectory()) {
    const entries = await fsp.readdir(targetPath).catch(() => []);
    for (const e of entries) {
      await safeRemove(path.join(targetPath, e));
    }
    await fsp.rmdir(targetPath).catch(() => {});
  } else {
    await fsp.unlink(targetPath).catch(() => {});
  }
}


async function scanJunkFiles(onFound, onProgress, userSettings = {}) {
  return new Promise((resolve, reject) => {

    const worker = new Worker(scanWorkerString, {
      eval: true,
      workerData: {} // 如果需要可以传参数
    });

    let scannedPaths = 0;
    let totalPaths = 0;
    // 发送设置
    // worker.postMessage({ type: 'settings', settings });
     // 发送用户设置到 Worker
     worker.postMessage({ 
      type: 'settings', 
      settings: userSettings 
    });
    
    worker.on('message', (message) => {
      switch (message.type) {
        case 'totalPaths':
          totalPaths = message.count;
          break;
          
        case 'scanningPath':
          // 可以在这里处理当前扫描路径
          break;
          
        case 'progress':
          onProgress && onProgress(
            message.progress, 
            message.current, 
            message.total, 
            message.path,
            message.totalFiles,
            message.scannedFiles
          );
          break;
          
        case 'file':
          onFound && onFound(
            message.file,
            message.totalFiles,
            message.scannedFiles
          );
          break;
          
        case 'complete':
          // 确保进度100%后再resolve
          setTimeout(() => resolve(), 100);
          break;
          
        case 'error':
          reject(new Error(message.error));
          break;
      }
    });
    
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

async function deleteSelectedPaths(selectedPaths = [], onProgress, onSkip) {
  let count = 0;
  for (const p of selectedPaths) {
    try {
      const st = await fsp.stat(p).catch(() => null);
      if (!st) {
        // 文件不存在，视为已删除
        count++;
        onProgress && onProgress(count, p);
        continue;
      }

      let deleted = false;
      if (st.isDirectory()) {
        try {
          await safeRemove(p);
          deleted = true;
        } catch (err) {
          const reason = (err && err.code) || (err && err.message) || 'unknown';
          onSkip && onSkip(p, reason);
        }
      } else {
        try {
          await fsp.unlink(p);
          deleted = true;
        } catch (err) {
          const reason = (err && err.code) || (err && err.message) || 'unknown';
          onSkip && onSkip(p, reason);
        }
      }
      
      // 只有在成功删除时才触发 onProgress
      if (deleted) {
        count++;
        onProgress && onProgress(count, p);
      }
    } catch (err) {
      const reason = (err && err.code) || (err && err.message) || 'unknown';
      onSkip && onSkip(p, reason);
    }
  }
}

// 执行 Windows 自带的磁盘清理工具
async function cleanmgrExec() {
  return new Promise((resolve, reject) => {
    exec('cleanmgr', (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

module.exports = {
  scanJunkFiles,
  deleteSelectedPaths,
  formatSize,
  cleanmgrExec,
};
