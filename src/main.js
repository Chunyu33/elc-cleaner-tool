const { app, BrowserWindow, Menu, Tray } = require('electron');
const path = require('path');

const initEventHandlers = require('./eventHandlers');

if (require('electron-squirrel-startup')) app.quit();

let mainWindow;
let tray;

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

// 获取图标路径
const getIconPath = () => {
  // 开发环境和打包环境路径一致，Webpack 会拷贝 assets
  return path.join(__dirname, 'assets', 'favicon.ico');
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 680,
    frame: false, // 关闭系统标题栏
    icon: getIconPath(),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    webPreferences: {
      // nodeIntegration: true,
      // contextIsolation: false,
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY, // electron-forge webpack 注入
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  // 开发阶段打开开发者工具
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
  // 初始化事件处理器
  initEventHandlers(app, mainWindow);
};

// 创建托盘
const createTray = () => {
  tray = new Tray(getIconPath());
  // 创建右键菜单
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: '显示主窗口', 
      click: () => { mainWindow.show(); } 
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit(); // 点击后退出应用
      },
    },
  ]);
  // 绑定菜单
  tray.setContextMenu(contextMenu);
  // 设置标题
  tray.setToolTip('ELC Cleaner Tool');
  tray.on('click', () => {
    mainWindow.show();
  });
};

app.whenReady().then(() => {
  createWindow();
  createTray();
});

// 事件监听
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

