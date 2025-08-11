// 扫描、删除垃圾文件核心
const fsp = require('fs').promises;
const fs = require('fs');
const path = require('path');

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
  // 建议外部定义这些路径（Windows 为例），这里你可以自定义
  const os = require('os');
  const junkPaths = [
    os.tmpdir(),
    path.join(os.homedir(), 'AppData', 'Local', 'Temp'),
    path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Windows', 'INetCache'),
    path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Cache'),
  ];

  for (const p of junkPaths) {
    await scanFolder(p, onFound);
  }
}

// onProgress(count, path) 每处理一项回调；onSkip(path,reason) 跳过回调
// async function deleteSelectedPaths(selectedPaths = [], onProgress, onSkip) {
//   let count = 0;
//   for (const p of selectedPaths) {
//     try {
//       const st = await fsp.stat(p).catch(() => null);
//       if (!st) {
//         // 不存在，视为已处理
//         count++;
//         onProgress && onProgress(count, p);
//         continue;
//       }

//       if (st.isDirectory()) {
//         try {
//           await safeRemove(p);
//         } catch (err) {
//           const reason = (err && err.code) || (err && err.message) || 'unknown';
//           onSkip && onSkip(p, reason);
//         }
//       } else {
//         try {
//           await fsp.unlink(p);
//         } catch (err) {
//           const reason = (err && err.code) || (err && err.message) || 'unknown';
//           onSkip && onSkip(p, reason);
//         }
//       }
//     } catch (err) {
//       const reason = (err && err.code) || (err && err.message) || 'unknown';
//       onSkip && onSkip(p, reason);
//     } finally {
//       count++;
//       onProgress && onProgress(count, p);
//     }
//   }
// }
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

module.exports = {
  scanJunkFiles,
  deleteSelectedPaths,
  formatSize,
};
