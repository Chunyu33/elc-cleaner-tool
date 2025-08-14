// 扫描、删除垃圾文件核心
const fsp = require("fs").promises;
// const os = require('os');
// const fs = require('fs');
const path = require("path");
const { exec } = require("child_process");
const { Worker } = require("worker_threads");
const scanWorkerString = require("./scanWorkerStr");
const deleteWorderStr = require("./deleteWorderStr");

async function scanJunkFiles(onFound, onProgress, userSettings = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(scanWorkerString, {
      eval: true,
      workerData: {}, // 如果需要可以传参数
    });

    let scannedPaths = 0;
    let totalPaths = 0;
    // 发送设置
    // worker.postMessage({ type: 'settings', settings });
    // 发送用户设置到 Worker
    worker.postMessage({
      type: "settings",
      settings: userSettings,
    });

    worker.on("message", (message) => {
      switch (message.type) {
        case "totalPaths":
          totalPaths = message.count;
          break;

        case "scanningPath":
          // 可以在这里处理当前扫描路径
          break;

        case "progress":
          onProgress &&
            onProgress(
              message.progress,
              message.current,
              message.total,
              message.path,
              message.totalFiles,
              message.scannedFiles
            );
          break;

        case "file":
          onFound &&
            onFound(message.file, message.totalFiles, message.scannedFiles);
          break;

        case "complete":
          // 确保进度100%后再resolve
          setTimeout(() => resolve(), 100);
          break;

        case "error":
          reject(new Error(message.error));
          break;
      }
    });

    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

async function deleteSelectedPaths(selectedPaths = [], onProgress, onSkip) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(deleteWorderStr, { eval: true });

    let totalPaths = selectedPaths.length;
    let processed = 0;

    worker.postMessage({
      type: "start",
      paths: selectedPaths,
    });

    worker.on("message", (message) => {
      switch (message.type) {
        case "progress":
          processed = message.count;
          const percent = Math.floor((processed / totalPaths) * 100);
          onProgress &&
            onProgress(percent, processed, totalPaths, message.path);
          console.log("del-----progress");
          break;

        case "skip":
          console.log("del-----skip");
          onSkip && onSkip(message.path, message.reason);
          break;

        case "complete":
          console.log("del-----complete");
          resolve();
          break;
      }
    });

    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Delete Worker stopped with exit code ${code}`));
      }
    });
  });
}

// 执行 Windows 自带的磁盘清理工具
async function cleanmgrExec() {
  return new Promise((resolve, reject) => {
    exec("cleanmgr", (error) => {
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
  cleanmgrExec,
};
