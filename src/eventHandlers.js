const { ipcMain, shell } = require('electron');
const { exec } = require("child_process");
const { scanJunkFiles, deleteSelectedPaths, cleanmgrExec } = require('./main/cleaner');
const fs = require('fs');
const path = require('path');

function getSkipLogPath() {
  const dir = app.getPath('userData') || __dirname;
  return path.join(dir, 'skipped.log');
}

function appendSkipLog(line) {
  try {
    const lp = getSkipLogPath();
    fs.appendFileSync(lp, line + '\n', { encoding: 'utf8', flag: 'a' });
  } catch (e) {
    console.error('写入跳过日志失败', e);
  }
}

module.exports = function initEventHandlers(app, mainWindow) {
  let scanning = false;
  let deleting = false;
  let deletedCountRef = { current: 0 };
  let userSettings = {};

  ipcMain.on('scan-junk', async (event) => {
    if (scanning) {
      mainWindow && mainWindow.webContents.send('scan-busy');
      return;
    }
    scanning = true;
    
    try {
      await scanJunkFiles(
        (file, totalFiles, scannedFiles) => {
          mainWindow && mainWindow.webContents.send('scan-item', file, totalFiles, scannedFiles);
        },
        (progress, current, total, currentPath, totalFiles, scannedFiles) => {
          mainWindow && mainWindow.webContents.send('scan-progress', progress, current, total, currentPath, totalFiles, scannedFiles);
        },
        userSettings
      );
      // mainWindow && mainWindow.webContents.send('scan-complete');
      // 确保进度100%后再发送完成事件
      setTimeout(() => {
        mainWindow && mainWindow.webContents.send('scan-complete');
      }, 200);
    } catch (err) {
      mainWindow && mainWindow.webContents.send('scan-error', err && (err.message || err.code));
    } finally {
      scanning = false;
    }
  });
  
  // 删除：接收 files 数组
  ipcMain.on('delete-junk', async (event, files) => {
    if (deleting) {
      mainWindow && mainWindow.webContents.send('delete-busy');
      return;
    }
    deleting = true;
    try {
      await deleteSelectedPaths(files || [],
        (percent, processed, total, currentPath) => {
          deletedCountRef.current += 1;
          mainWindow && mainWindow.webContents.send('delete-progress', percent, processed, total, currentPath);
        },
        (skippedPath, reason) => {
          mainWindow && mainWindow.webContents.send('delete-skip', skippedPath, reason);
        }
      );
      mainWindow && mainWindow.webContents.send('delete-complete', deletedCountRef.current);
    } catch (err) {
      mainWindow && mainWindow.webContents.send('delete-error', err && (err.message || err.code));
    } finally {
      deleting = false;
      deletedCountRef.current = 0;
    }
  });
  
  // 读取跳过日志文本
  ipcMain.handle('read-skip-log', async () => {
    try {
      const p = getSkipLogPath();
      const content = fs.readFileSync(p, 'utf8');
      return content;
    } catch (e) {
      return '';
    }
  });
  
  // 在文件管理器中打开日志目录
  ipcMain.handle('open-skip-log', async () => {
    try {
      const p = getSkipLogPath();
      const dir = path.dirname(p);
      await shell.openPath(dir);
      return true;
    } catch (e) {
      return false;
    }
  });
  
  // 打开磁盘清理
  ipcMain.handle('run-cleanmgr', async () => {
    try {
      await cleanmgrExec();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message || '未知错误' };
    }
  });
  
  // cleanmgr可用性检查
  ipcMain.handle('check-cleanmgr-available', async () => {
    return new Promise((resolve) => {
      exec('where cleanmgr', (error) => {
        resolve(!error);
      });
    });
  });
  
  // 窗口控制、以及其他事件
  ipcMain.on('window:minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    mainWindow.close();
  });
  
  ipcMain.on('app-exit', () => {
    app.quit();
  });
  
  ipcMain.on('open-link', (event, url) => {
    shell.openExternal(url);
  });

}
