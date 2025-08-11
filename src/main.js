// main.js
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { scanJunkFiles, deleteSelectedPaths, cleanmgrExec } = require('./main/cleaner');

if (require('electron-squirrel-startup')) app.quit();

let mainWindow;
let scanning = false;
let deleting = false;
let deletedCountRef = { current: 0 };

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


// const template = [
//   {
//     label: '文件',
//     submenu: [
//       {
//         label: '打开日志目录',
//         click: () => {
//           shell.openPath(path.join(app.getPath('userData'), 'logs'));
//         }
//       },
//       { type: 'separator' },
//       { role: 'quit', label: '退出' }
//     ]
//   },
//   {
//     label: '帮助',
//     submenu: [
//       {
//         label: '项目主页',
//         click: () => shell.openExternal('https://github.com/Chunyu33/elc-cleaner-tool')
//       },
//       {
//         label: 'B站主页',
//         click: () => shell.openExternal('https://space.bilibili.com/387797235')
//       }
//     ]
//   }
// ];
// // 自定义顶部菜单
// const menu = Menu.buildFromTemplate(template);
// Menu.setApplicationMenu(menu);

Menu.setApplicationMenu(null); // 移除菜单

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 600,
    frame: false, // 关闭系统标题栏
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined, // Mac 优化
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY, // electron-forge webpack 注入
      icon: path.join(__dirname, 'assets/icon', 'favicon.ico')
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  mainWindow.webContents.openDevTools({ mode: 'right' }); // 开发阶段打开

};

app.whenReady().then(createWindow);

// 事件监听
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
        deletedCountRef.current += 1;
        mainWindow && mainWindow.webContents.send('delete-progress', count, currentPath);
      },
      (skippedPath, reason) => {
        const line = `${new Date().toISOString()}\t${skippedPath}\t${reason}`;
        appendSkipLog(line);
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

// 添加可用性检查
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
