module.exports = `
const { parentPort } = require('worker_threads');
const os = require('os');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

// 默认配置参数
const DEFAULT_SETTINGS = {
  maxDepth: 6,
  minSize: 1024,
  extensions: ['.tmp', '.log', '.cache', '.bak', '.old', '.temp', '.dmp', '.chk']
};

// 当前扫描设置
let scanSettings = { ...DEFAULT_SETTINGS };

// 接收设置
parentPort.on('message', (message) => {
  if (message.type === 'settings') {
    // 合并传入的设置
    scanSettings = {
      ...DEFAULT_SETTINGS,
      ...message.settings
    };
  }
});

// 格式化文件大小
function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return bytes + ' B';
}

// 获取文件扩展名
function getFileExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

// 判断是否是垃圾文件
function isJunkFile(filePath, fileSize) {
  if (fileSize < scanSettings.minSize) return false;
  const ext = getFileExtension(filePath);
  return scanSettings.extensions.includes(ext);
}

// 获取垃圾文件路径列表
function getJunkPaths() {
  const homedir = os.homedir();
  const appData = process.env.APPDATA || path.join(homedir, 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA || path.join(homedir, 'AppData', 'Local');
  const programData = process.env.ProgramData || path.join('C:', 'ProgramData');
  
  return [
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
    path.join(homedir, 'Downloads'),
  ];
}

// 扫描文件夹（带深度限制）
async function scanFolder(folderPath, depth = 0) {
  if (depth > scanSettings.maxDepth) return [];
  
  let entries;
  try {
    entries = await fsp.readdir(folderPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const results = [];
  
  for (const entry of entries) {
    const full = path.join(folderPath, entry.name);
    const lst = await fsp.lstat(full).catch(() => null);
    if (!lst) continue;
    
    if (lst.isSymbolicLink()) continue;
    
    if (lst.isDirectory()) {
      const subResults = await scanFolder(full, depth + 1);
      results.push(...subResults);
    } else if (lst.isFile()) {
      if (isJunkFile(full, lst.size)) {
        results.push({ 
          path: full, 
          size: lst.size, 
          sizeStr: formatSize(lst.size) 
        });
      }
    }
  }
  
  return results;
}

// 主工作流程
(async () => {
  try {
    const junkPaths = getJunkPaths();
    const totalPaths = junkPaths.length;
    let scannedPaths = 0;
    let totalFiles = 0; // 总文件数
    let scannedFiles = 0; // 已扫描文件数
    
    // 发送路径总数
    parentPort.postMessage({ type: 'totalPaths', count: totalPaths });
    
    for (const p of junkPaths) {
      try {
        if (fs.existsSync(p)) {
          // 发送当前扫描路径
          parentPort.postMessage({ type: 'scanningPath', path: p });
          
          // 扫描文件夹
          const files = await scanFolder(p);
          
          // 更新文件计数
          const fileCount = files.length;
          totalFiles += fileCount;
          
          // 发送文件
          for (const file of files) {
            scannedFiles++;
            parentPort.postMessage({ 
              type: 'file', 
              file,
              totalFiles,
              scannedFiles
            });
          }
          
          // 更新进度
          scannedPaths++;
          const progress = Math.floor((scannedPaths / totalPaths) * 100);
          parentPort.postMessage({ 
            type: 'progress', 
            progress,
            current: scannedPaths,
            total: totalPaths,
            path: p,
            totalFiles,
            scannedFiles
          });
        }
      } catch (error) {
        console.error(\`扫描路径 \${p} 时出错:\`, error);
        scannedPaths++;
        parentPort.postMessage({ 
          type: 'progress', 
          progress: Math.floor((scannedPaths / totalPaths) * 100),
          current: scannedPaths,
          total: totalPaths,
          path: p,
          totalFiles,
          scannedFiles
        });
      }
    }
    
    // 确保进度达到100%
    parentPort.postMessage({ 
      type: 'progress', 
      progress: 100,
      current: totalPaths,
      total: totalPaths,
      path: '完成扫描',
      totalFiles,
      scannedFiles
    });
    
    parentPort.postMessage({ type: 'complete' });
  } catch (error) {
    parentPort.postMessage({ type: 'error', error: error.message });
  }
})();
`;