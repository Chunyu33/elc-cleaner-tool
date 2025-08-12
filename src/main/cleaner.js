// 扫描、删除垃圾文件核心
const fsp = require('fs').promises;
const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { Worker } = require('worker_threads');
const scanWorkerString = require('./scanWorkerStr');

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

// 配置
const MAX_SCAN_DEPTH = 6; // 最大扫描深度
const MIN_FILE_SIZE = 1024; // 最小文件大小 (1KB)
const JUNK_EXTENSIONS = ['.tmp', '.log', '.cache', '.bak', '.old', '.temp', '.dmp', '.chk'];

async function scanJunkFiles(onFound, onProgress) {
  return new Promise((resolve, reject) => {

    const worker = new Worker(scanWorkerString, {
      eval: true,
      workerData: {} // 如果需要可以传参数
    });

    let scannedPaths = 0;
    let totalPaths = 0;
    
    worker.on('message', (message) => {
      switch (message.type) {
        case 'progress':
          scannedPaths++;
          const progress = Math.floor((scannedPaths / totalPaths) * 100);
          onProgress && onProgress(progress, scannedPaths, totalPaths, message.path);
          break;
          
        case 'file':
          onFound && onFound(message.file);
          break;
          
        case 'totalPaths':
          totalPaths = message.count;
          break;
          
        case 'complete':
          resolve();
          break;
          
        case 'error':
          reject(new Error(message.error));
          break;
      }
    });
    
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

// 不再使用这里  改用worker
// async function scanJunkFiles(onFound, onProgress) {
//   const homedir = os.homedir();
//   const appData = process.env.APPDATA || path.join(homedir, 'AppData', 'Roaming');
//   const localAppData = process.env.LOCALAPPDATA || path.join(homedir, 'AppData', 'Local');
//   const programData = process.env.ProgramData || path.join('C:', 'ProgramData');
  
//   // 垃圾文件路径列表
//   const junkPaths = [
//     // 系统临时文件
//     os.tmpdir(),
//     path.join(localAppData, 'Temp'),
    
//     // 浏览器缓存
//     path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Cache'),
//     path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Media Cache'),
//     path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache'),
//     path.join(localAppData, 'Mozilla', 'Firefox', 'Profiles'),
//     path.join(localAppData, 'Opera Software', 'Opera Stable', 'Cache'),
//     path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Cache'),
    
//     // Windows 系统缓存
//     path.join(localAppData, 'Microsoft', 'Windows', 'INetCache'),
//     path.join(localAppData, 'Microsoft', 'Windows', 'INetCookies'),
//     path.join(localAppData, 'Microsoft', 'Windows', 'History'),
//     path.join(localAppData, 'Microsoft', 'Windows', 'WER'),
    
//     // 应用程序缓存
//     path.join(localAppData, 'Adobe'),
//     path.join(localAppData, 'Apple Computer'),
//     path.join(localAppData, 'Spotify'),
//     path.join(localAppData, 'Discord'),
//     path.join(localAppData, 'Zoom'),
//     path.join(localAppData, 'Steam'),
    
//     // 软件更新缓存
//     path.join(programData, 'Package Cache'),
//     path.join(localAppData, 'Microsoft', 'Windows', 'Temporary Internet Files'),
    
//     // 日志文件
//     path.join(localAppData, 'Diagnostics'),
//     path.join(programData, 'Microsoft', 'Windows', 'WER'),
    
//     // 回收站
//     path.join('C:', '$Recycle.Bin'),
    
//     // 缩略图缓存
//     path.join(localAppData, 'Microsoft', 'Windows', 'Explorer', 'thumbnails'),
    
//     // 内存转储文件
//     path.join('C:', 'Windows', 'MEMORY.DMP'),
//     path.join('C:', 'Windows', 'Minidump'),
    
//     // Windows 更新残留
//     path.join('C:', 'Windows', 'SoftwareDistribution', 'Download'),
//     path.join('C:', 'Windows', 'Temp'),
    
//     // 下载目录中的临时文件
//     path.join(homedir, 'Downloads'),
//   ];

//   // 添加用户自定义路径
//   const customPaths = getCustomJunkPaths();
//   junkPaths.push(...customPaths);

//   // 排除的关键系统目录
//   const excludedPaths = [
//     path.join('C:', 'Windows', 'System32'),
//     path.join('C:', 'Windows', 'SysWOW64'),
//     path.join('C:', 'Program Files'),
//     path.join('C:', 'Program Files (x86)'),
//     path.join(appData, 'Microsoft', 'Windows', 'Start Menu'),
//     path.join(localAppData, 'Microsoft', 'Windows', 'Explorer')
//   ];

//   // 扫描所有路径
//   let scannedPaths = 0;
//   const totalPaths = junkPaths.length;
  
//   for (const p of junkPaths) {
//     try {
//       // 检查是否在排除列表中
//       const isExcluded = excludedPaths.some(excluded => p.startsWith(excluded));
      
//       if (!isExcluded && fs.existsSync(p)) {
//         await scanFolder(p, onFound, 0);
//       }
//       // 更新进度
//       scannedPaths++;
//       onProgress && onProgress(scannedPaths, totalPaths, p);
//     } catch (error) {
//       scannedPaths++;
//       console.error(`扫描路径 ${p} 时出错:`, error);
//     }
//   }
// }

// 获取用户自定义的垃圾文件路径
function getCustomJunkPaths() {
  try {
    const configDir = path.join(os.homedir(), '.junkcleaner');
    const configPath = path.join(configDir, 'custom-paths.json');
    
    // 确保配置目录存在
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('读取自定义路径配置失败:', error);
  }
  return [];
}

// 文件夹扫描
async function scanFolder(folderPath, onFound, depth) {
  if (depth > MAX_SCAN_DEPTH) return;
  
  let entries;
  try {
    entries = await fsp.readdir(folderPath, { withFileTypes: true });
  } catch (error) {
    // 跳过无权限访问的目录
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(folderPath, entry.name);
    
    try {
      const lst = await fsp.lstat(fullPath);
      
      if (lst.isSymbolicLink()) continue; // 跳过符号链接
      
      if (lst.isDirectory()) {
        // 递归扫描子目录
        await scanFolder(fullPath, onFound, depth + 1);
      } else if (lst.isFile()) {
        // 检查文件扩展名
        const ext = path.extname(fullPath).toLowerCase();
        
        // 检查文件大小
        const isLargeEnough = lst.size >= MIN_FILE_SIZE;
        
        // 检查是否为垃圾文件类型
        const isJunkExtension = JUNK_EXTENSIONS.includes(ext);
        
        if (isLargeEnough && isJunkExtension) {
          onFound && onFound({ 
            path: fullPath, 
            size: lst.size, 
            sizeStr: formatSize(lst.size),
            type: 'file'
          });
        }
      }
    } catch (error) {
      // 跳过无法访问的文件
      continue;
    }
  }
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
