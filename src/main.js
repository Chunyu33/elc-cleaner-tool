// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { scanJunkFiles, deleteSelectedPaths } = require('./main/cleaner');

if (require('electron-squirrel-startup')) app.quit();

let mainWindow;
let scanning = false;
let deleting = false;

// 日志文件路径（写入被跳过项）
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

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 760,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY, // electron-forge 注入
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  mainWindow.webContents.openDevTools({ mode: 'right' });
};

app.whenReady().then(createWindow);
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 扫描：逐条发送 'scan-item'
ipcMain.on('scan-junk', async (event) => {
  if (scanning) {
    mainWindow && mainWindow.webContents.send('scan-busy');
    return;
  }
  scanning = true;
  try {
    await scanJunkFiles((fileInfo) => {
      mainWindow && mainWindow.webContents.send('scan-item', fileInfo);
    });
    mainWindow && mainWindow.webContents.send('scan-complete');
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
      (count, currentPath) => {
        mainWindow && mainWindow.webContents.send('delete-progress', count, currentPath);
      },
      (skippedPath, reason) => {
        // 记录并通知渲染进程
        const line = `${new Date().toISOString()}\t${skippedPath}\t${reason}`;
        appendSkipLog(line);
        mainWindow && mainWindow.webContents.send('delete-skip', skippedPath, reason);
      }
    );
    mainWindow && mainWindow.webContents.send('delete-complete');
  } catch (err) {
    mainWindow && mainWindow.webContents.send('delete-error', err && (err.message || err.code));
  } finally {
    deleting = false;
  }
});
