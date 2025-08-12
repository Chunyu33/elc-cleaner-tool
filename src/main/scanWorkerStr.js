// worker代码
module.exports = `
const { parentPort } = require('worker_threads');
const os = require('os');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

// 配置参数
const MAX_SCAN_DEPTH = 6; // 最大扫描深度
const MIN_FILE_SIZE = 1024; // 最小文件大小 (1KB)
const JUNK_EXTENSIONS = ['.tmp', '.log', '.cache', '.bak', '.old', '.temp', '.dmp', '.chk'];

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
  // 检查文件大小
  if (fileSize < MIN_FILE_SIZE) return false;
  
  // 检查文件扩展名
  const ext = getFileExtension(filePath);
  return JUNK_EXTENSIONS.includes(ext);
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
  // 检查深度限制
  if (depth > MAX_SCAN_DEPTH) {
    return [];
  }
  
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
      // 递归扫描子目录，增加深度
      const subResults = await scanFolder(full, depth + 1);
      results.push(...subResults);
    } else if (lst.isFile()) {
      // 检查是否是垃圾文件
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
    
    // 发送路径总数
    parentPort.postMessage({ type: 'totalPaths', count: junkPaths.length });
    
    for (const p of junkPaths) {
      try {
        if (fs.existsSync(p)) {
          // 发送进度更新
          parentPort.postMessage({ type: 'progress', path: p });
          
          // 扫描文件夹
          const files = await scanFolder(p);
          
          // 发送文件
          for (const file of files) {
            parentPort.postMessage({ type: 'file', file });
          }
        }
      } catch (error) {
        console.error(\`扫描路径 \${p} 时出错:\`, error);
      }
    }
    
    parentPort.postMessage({ type: 'complete' });
  } catch (error) {
    parentPort.postMessage({ type: 'error', error: error.message });
  }
})();
`;