// main.js
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { scanJunkFiles, deleteSelectedPaths } = require('./main/cleaner');

if (require('electron-squirrel-startup')) app.quit();

let mainWindow;
let scanning = false;
let deleting = false;

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

Menu.setApplicationMenu(null); // 移除菜单

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY, // electron-forge webpack 注入
      icon: path.join(__dirname, 'assets/icon', 'favicon.ico')
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  mainWindow.webContents.openDevTools({ mode: 'right' }); // 开发阶段打开
};

app.whenReady().then(createWindow);
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 扫描：逐条发送 scan-item
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
