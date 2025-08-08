// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { scanJunkFiles, deleteSelectedPaths } = require('./main/cleaner');

if (require('electron-squirrel-startup')) app.quit();

let mainWindow;
let scanning = false;
let deleting = false;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 760,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY, // electron-forge webpack 注入
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  // 开发阶段打开工具，生产请移除
  mainWindow.webContents.openDevTools({ mode: 'right' });
};

app.whenReady().then(createWindow);
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- 扫描（事件驱动） ----
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

// ---- 删除（接收数组） ----
// files: Array<string>
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
