const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const { scanJunkFiles, deleteJunkFiles } = require("./main/cleaner");

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

let mainWindow;

const createWindow = () => {
  // Create the browser window.
  // const mainWindow = new BrowserWindow({
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// 注册 IPC 事件

// 扫描垃圾文件请求
ipcMain.handle("scan-junk", async () => {
  return await scanJunkFiles();
});

// ipcMain.handle('delete-junk', () => {
//   deleteJunkFiles();
//   return true;
// });

// 清理垃圾文件请求
ipcMain.on("delete-junk", async () => {
  await deleteJunkFiles((count, currentPath) => {
    mainWindow.webContents.send("delete-progress", count, currentPath);
  });
});

