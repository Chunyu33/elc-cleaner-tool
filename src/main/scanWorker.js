const { parentPort } = require('worker_threads');
const os = require('os');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

// 配置
const MAX_SCAN_DEPTH = 6; // 最大扫描深度
const MIN_FILE_SIZE = 1024; // 最小文件大小 (1KB)
const JUNK_EXTENSIONS = ['.tmp', '.log', '.cache', '.bak', '.old', '.temp', '.dmp', '.chk'];

const excludedPaths = [
  path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Windows', 'Explorer'),
  path.join('C:', 'Windows', 'System32')
];


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

// 文件夹扫描
async function scanFolder(folderPath, depth) {
  if (depth > MAX_SCAN_DEPTH) return;
  
  let entries;
  try {
    entries = await fsp.readdir(folderPath, { withFileTypes: true });
  } catch (error) {
    // 跳过无权限访问的目录
    return;
  }

  const results = [];

  for (const entry of entries) {
    const fullPath = path.join(folderPath, entry.name);
    
    try {
      const lst = await fsp.lstat(fullPath);
      
      if (lst.isSymbolicLink()) continue; // 跳过符号链接
      
      if (lst.isDirectory()) {
        // 递归扫描子目录，增加深度
        const subResults = await scanFolder(fullPath, depth + 1);
        results.push(...subResults);
      } else if (lst.isFile()) {
        // 检查文件扩展名
        const ext = path.extname(fullPath).toLowerCase();
        
        // 检查文件大小
        const isLargeEnough = lst.size >= MIN_FILE_SIZE;
        
        // 检查是否为垃圾文件类型
        const isJunkExtension = JUNK_EXTENSIONS.includes(ext);
        
        if (isLargeEnough && isJunkExtension) {
          results.push({ 
            path: full, 
            size: lst.size, 
            sizeStr: formatSize(lst.size) 
          });
        }
      }
    } catch (error) {
      // 跳过无法访问的文件
      continue;
    }
  }

  return results;
}

// 格式化文件大小
function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return bytes + ' B';
}

// 主工作流程
(async () => {
  try {
    const junkPaths = getJunkPaths();
    
    // 发送路径总数
    parentPort.postMessage({ type: 'totalPaths', count: junkPaths.length });
    
    for (const p of junkPaths) {
      try {
         // 检查是否在排除列表中
        if (!excludedPaths.some(excluded => p.startsWith(excluded))) {
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
        }
      } catch (error) {
        console.error(`扫描路径 \${p} 时出错:`, error);
      }
    }
    
    parentPort.postMessage({ type: 'complete' });
  } catch (error) {
    parentPort.postMessage({ type: 'error', error: error.message });
  }
})();