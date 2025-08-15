// scanWorkerString.js
module.exports = String.raw`
const { parentPort } = require('worker_threads');
const os = require('os');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

// 默认扫描配置
const DEFAULT_SETTINGS = {
  maxDepth: 6,
  minSize: 1024, // 1 KB
  extensions: ['.tmp', '.log', '.cache', '.bak', '.old', '.temp', '.dmp', '.chk'],
};

let scanSettings = { ...DEFAULT_SETTINGS };

// 接收设置
parentPort.on('message', (message) => {
  if (message.type === 'settings') {
    scanSettings = { ...DEFAULT_SETTINGS, ...message.settings };
  }
});

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return bytes + ' B';
}

function getFileExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

// 判断是否是垃圾文件
function isJunkFile(filePath, fileSize, folderName) {
  if (folderName.toLowerCase().includes('temp')) return true; // temp 目录忽略扩展名限制
  if (fileSize < scanSettings.minSize) return false;
  const ext = getFileExtension(filePath);
  return scanSettings.extensions.includes(ext);
}

// 获取所有盘符
function getAllDrives() {
  const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  return letters.filter(letter => {
    try { return fs.existsSync(letter + ':\\'); } catch { return false; }
  }).map(letter => letter + ':');
}

// 获取垃圾文件目录列表
function getJunkPaths() {
  const homedir = os.homedir();
  const drives = getAllDrives();
  const paths = [];

  for (const drive of drives) {
    const localAppData = path.join(drive, 'Users', path.basename(homedir), 'AppData', 'Local');
    const appData = path.join(drive, 'Users', path.basename(homedir), 'AppData', 'Roaming');
    const programData = path.join(drive, 'ProgramData');

    paths.push(
      // 系统临时目录
      path.join(drive, 'Windows', 'Temp'),
      path.join(localAppData, 'Temp'),
      os.tmpdir(),

      // 回收站
      path.join(drive, '$Recycle.Bin'),

      // 系统缓存与日志
      path.join(drive, 'Windows', 'SoftwareDistribution', 'Download'),
      path.join(drive, 'Windows', 'Prefetch'),
      path.join(drive, 'Windows', 'Minidump'),
      path.join(drive, 'Windows', 'MEMORY.DMP'),
      path.join(localAppData, 'Microsoft', 'Windows', 'INetCache'),
      path.join(localAppData, 'Microsoft', 'Windows', 'INetCookies'),
      path.join(localAppData, 'Microsoft', 'Windows', 'History'),
      path.join(localAppData, 'Microsoft', 'Windows', 'Explorer', 'thumbnails'),
      path.join(localAppData, 'Microsoft', 'Windows', 'WER'),
      path.join(localAppData, 'Diagnostics'),
      path.join(programData, 'Microsoft', 'Windows', 'WER'),

      // 浏览器缓存
      path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Cache'),
      path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Media Cache'),
      path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache'),
      path.join(localAppData, 'Mozilla', 'Firefox', 'Profiles'),
      path.join(localAppData, 'Opera Software', 'Opera Stable', 'Cache'),
      path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Cache'),

      // 应用缓存
      path.join(localAppData, 'Adobe'),
      path.join(localAppData, 'Apple Computer'),
      path.join(localAppData, 'Spotify'),
      path.join(localAppData, 'Discord'),
      path.join(localAppData, 'Zoom'),
      path.join(localAppData, 'Steam'),

      // 下载目录
      path.join(homedir, 'Downloads')
    );
  }

  return Array.from(new Set(paths));
}

// 扫描文件夹
async function scanFolder(folderPath, depth = 0) {
  if (depth > scanSettings.maxDepth) return [];
  let entries;
  try { entries = await fsp.readdir(folderPath, { withFileTypes: true }); } catch { return []; }
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
      if (isJunkFile(full, lst.size, folderPath)) {
        results.push({ path: full, size: lst.size, sizeStr: formatSize(lst.size) });
      }
    }
  }
  return results;
}

// 主流程
(async () => {
  try {
    const junkPaths = getJunkPaths();
    const totalPaths = junkPaths.length;
    let scannedPaths = 0;
    let totalFiles = 0;
    let scannedFiles = 0;

    parentPort.postMessage({ type: 'totalPaths', count: totalPaths });

    for (const p of junkPaths) {
      try {
        if (fs.existsSync(p)) {
          parentPort.postMessage({ type: 'scanningPath', path: p });

          const files = await scanFolder(p);
          const fileCount = files.length;
          totalFiles += fileCount;

          for (const file of files) {
            scannedFiles++;
            parentPort.postMessage({ type: 'file', file, totalFiles, scannedFiles });
          }

          scannedPaths++;
          const progress = Math.floor((scannedPaths / totalPaths) * 100);
          parentPort.postMessage({
            type: 'progress', progress, current: scannedPaths, total: totalPaths,
            path: p, totalFiles, scannedFiles
          });
        }
      } catch {
        scannedPaths++;
      }
    }

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
