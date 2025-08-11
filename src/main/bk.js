// 扫描、删除垃圾文件核心
const fsp = require('fs').promises;
const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

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

// 递归扫描目录，遇到文件回调 onFound({path,size,sizeStr})
async function scanFolder(folderPath, onFound) {
  let entries;
  try {
    entries = await fsp.readdir(folderPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = path.join(folderPath, entry.name);
    const lst = await fsp.lstat(full).catch(() => null);
    if (!lst) continue;
    if (lst.isSymbolicLink()) continue; // 跳过符号链接
    if (lst.isDirectory()) {
      // 递归子目录
      await scanFolder(full, onFound);
    } else if (lst.isFile()) {
      onFound && onFound({ path: full, size: lst.size, sizeStr: formatSize(lst.size) });
    }
  }
}

// 对外 API：scanJunkFiles(onFound)
// onFound 每次找到一个文件会收到回调
async function scanJunkFiles(onFound) {
  const homedir = os.homedir();
  const appData = process.env.APPDATA || path.join(homedir, 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA || path.join(homedir, 'AppData', 'Local');
  const programData = process.env.ProgramData || path.join('C:', 'ProgramData');

  const excludedPaths = [
    path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Windows', 'Explorer'),
    path.join('C:', 'Windows', 'System32')
  ];

  // const junkPaths = [
  //   os.tmpdir(),
  //   path.join(homedir, 'AppData', 'Local', 'Temp'),
  //   path.join(homedir, 'AppData', 'Local', 'Microsoft', 'Windows', 'INetCache'),
  //   path.join(homedir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Cache'),
  // ];
  // 扩展的垃圾文件路径列表
  const junkPaths = [
    // 系统临时文件
    os.tmpdir(),
    path.join(localAppData, 'Temp'),
    
    // 浏览器缓存
    path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Cache'),
    path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Media Cache'),
    path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache'),
    path.join(localAppData, 'Mozilla', 'Firefox', 'Profiles'),
    path.join(localAppData, 'Opera Software', 'Opera Stable', 'Cache'),
    path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Cache'),
    
    // Windows 系统缓存
    path.join(localAppData, 'Microsoft', 'Windows', 'INetCache'),
    path.join(localAppData, 'Microsoft', 'Windows', 'INetCookies'),
    path.join(localAppData, 'Microsoft', 'Windows', 'History'),
    path.join(localAppData, 'Microsoft', 'Windows', 'WER'),
    
    // 应用程序缓存
    path.join(localAppData, 'Adobe'),
    path.join(localAppData, 'Apple Computer'),
    path.join(localAppData, 'Spotify'),
    path.join(localAppData, 'Discord'),
    path.join(localAppData, 'Zoom'),
    path.join(localAppData, 'Steam'),
    
    // 软件更新缓存
    path.join(programData, 'Package Cache'),
    path.join(localAppData, 'Microsoft', 'Windows', 'Temporary Internet Files'),
    
    // 日志文件
    path.join(localAppData, 'Diagnostics'),
    path.join(programData, 'Microsoft', 'Windows', 'WER'),
    
    // 回收站
    path.join('C:', '$Recycle.Bin'),
    
    // 缩略图缓存
    path.join(localAppData, 'Microsoft', 'Windows', 'Explorer', 'thumbnails'),
    
    // 内存转储文件
    path.join('C:', 'Windows', 'MEMORY.DMP'),
    path.join('C:', 'Windows', 'Minidump'),
    
    // Windows 更新残留
    path.join('C:', 'Windows', 'SoftwareDistribution', 'Download'),
    path.join('C:', 'Windows', 'Temp'),
    
    // 下载目录中的临时文件
    path.join(homedir, 'Downloads', '*.tmp'),
    path.join(homedir, 'Downloads', '*.temp'),
    
    // 无效的快捷方式
    // path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    // path.join(homedir, 'Desktop')
  ];

  // 添加用户自定义路径
  const customPaths = getCustomJunkPaths();
  junkPaths.push(...customPaths);

  // 扫描所有路径
  for (const p of junkPaths) {
    try {
       // 检查是否在排除列表中
      if (!excludedPaths.some(excluded => p.startsWith(excluded))) {
        // 检查路径是否存在
        if (fs.existsSync(p)) {
          await scanFolder(p, onFound);
        }
      }
    } catch (error) {
      console.error(`scan path ${p} error====`, error);
    }
  }
}

// 获取用户自定义的垃圾文件路径
function getCustomJunkPaths() {
  try {
    // ~/.junkcleaner/custom-paths.json
    const configPath = path.join(os.homedir(), '.junkcleaner', 'custom-paths.json');
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('读取自定义路径配置失败:', error);
  }
  return [];
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
