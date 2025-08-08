// main/cleaner.js
const fsp = require('fs').promises;
const fs = require('fs');
const path = require('path');
const os = require('os');

const junkPaths = [
  os.tmpdir(),
  path.join(os.homedir(), 'AppData', 'Local', 'Temp'),
  path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Windows', 'INetCache'),
  path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Cache'),
];

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return bytes + ' B';
}

// safeRemove: 优先使用 fsp.rm (Node >= 14.14)，否则回退到递归删除
async function safeRemove(targetPath) {
  if (!targetPath || targetPath.length < 3) return;
  try {
    if (typeof fsp.rm === 'function') {
      await fsp.rm(targetPath, { recursive: true, force: true });
      return;
    }
  } catch (err) {
    // 如果 rm 存在但失败，继续回退机制
  }

  // 退回：手动递归删除
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

// scanFolder：递归扫描目录，遇到文件回调 onFound
async function scanFolder(folderPath, onFound) {
  let entries;
  try {
    entries = await fsp.readdir(folderPath, { withFileTypes: true });
  } catch {
    // 无权限或目录不存在，忽略
    return;
  }

  for (const entry of entries) {
    const full = path.join(folderPath, entry.name);

    // 使用 lstat 跳过符号链接
    const lst = await fsp.lstat(full).catch(() => null);
    if (!lst) continue;
    if (lst.isSymbolicLink()) continue;

    if (lst.isDirectory()) {
      await scanFolder(full, onFound);
    } else if (lst.isFile()) {
      onFound && onFound({ path: full, size: lst.size, sizeStr: formatSize(lst.size) });
    }
  }
}

// 对外：scanJunkFiles(onFound)
// onFound 每个文件会回调一个对象 {path,size,sizeStr}
async function scanJunkFiles(onFound) {
  for (const p of junkPaths) {
    await scanFolder(p, onFound);
  }
}

// 删除 selectedPaths 数组里的每一项；
// onProgress(count, path) 每处理一项回调（无论成功或跳过）
// onSkip(path, reason) 遇到跳过时调用
async function deleteSelectedPaths(selectedPaths = [], onProgress, onSkip) {
  let count = 0;
  for (const p of selectedPaths) {
    try {
      const st = await fsp.stat(p).catch(() => null);
      if (!st) {
        // 文件不存在，视为已处理
        count++;
        onProgress && onProgress(count, p);
        continue;
      }

      if (st.isDirectory()) {
        try {
          await safeRemove(p);
        } catch (err) {
          const code = err && err.code;
          const reason = code || (err && err.message) || 'unknown';
          onSkip && onSkip(p, reason);
        }
      } else {
        try {
          await fsp.unlink(p);
        } catch (err) {
          const code = err && err.code;
          const reason = code || (err && err.message) || 'unknown';
          onSkip && onSkip(p, reason);
        }
      }
    } catch (err) {
      // 记录并跳过
      const code = err && err.code;
      const reason = code || (err && err.message) || 'unknown';
      onSkip && onSkip(p, reason);
    } finally {
      count++;
      onProgress && onProgress(count, p);
    }
  }
}

module.exports = {
  scanJunkFiles,
  deleteSelectedPaths,
};
