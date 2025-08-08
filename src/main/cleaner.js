const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const junkPaths = [
  os.tmpdir(),
  path.join(os.homedir(), 'AppData', 'Local', 'Temp'),
  path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Windows', 'INetCache'),
  path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Cache'),
];

function formatSize(bytes) {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return bytes + ' B';
}

// 异步递归计算目录大小
async function getFolderSize(folderPath) {
  let total = 0;
  try {
    const files = await fs.readdir(folderPath, { withFileTypes: true });
    for (const file of files) {
      const filePath = path.join(folderPath, file.name);
      try {
        const stat = await fs.stat(filePath);
        if (stat.isDirectory()) {
          total += await getFolderSize(filePath);
        } else {
          total += stat.size;
        }
      } catch {
        // 忽略子项错误
      }
    }
  } catch {
    // 忽略目录读取失败
  }
  return total;
}

// 更稳妥的删除目录内容方式（保留根目录）
async function deleteFolderContents(folderPath, progressCallback, deletedCountObj) {
  try {
    const files = await fs.readdir(folderPath, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(folderPath, file.name);

      try {
        await fs.rm(fullPath, { recursive: true, force: true });
        deletedCountObj.count++;
        if (progressCallback) progressCallback(deletedCountObj.count, fullPath);
      } catch (err) {
        if (!['EACCES', 'EPERM', 'EBUSY', 'ENOENT'].includes(err.code)) {
          console.error(`删除 ${fullPath} 失败:`, err);
        }
        // 常见错误跳过
      }
    }
  } catch (err) {
    console.error(`读取目录 ${folderPath} 失败:`, err);
  }
}

// 扫描所有垃圾路径大小，异步返回数组
async function scanJunkFiles() {
  const results = [];
  for (const p of junkPaths) {
    const size = await getFolderSize(p);
    results.push({ path: p, size });
  }
  return results;
}

// 删除所有垃圾目录内容，支持进度回调
async function deleteJunkFiles(progressCallback) {
  console.warn('--------删除=====0')
  const deletedCountObj = { count: 0 };
  for (const p of junkPaths) {
    try {
      const exists = await fs.stat(p).then(() => true).catch(() => false);
      console.warn('--------删除=====1')
      if (exists) {
        await deleteFolderContents(p, progressCallback, deletedCountObj);
        console.warn('--------删除=====')
      }
    } catch (err) {
      console.error(`处理目录 ${p} 出错:`, err);
    }
  }
}

module.exports = {
  scanJunkFiles,
  deleteJunkFiles,
};
