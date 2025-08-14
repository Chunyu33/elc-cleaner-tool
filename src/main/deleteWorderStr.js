module.exports = `
      const { parentPort } = require('worker_threads');
      const fs = require('fs');
      const fsp = fs.promises;
      const path = require('path');
      
      // 安全删除文件夹（递归）
      async function safeRemove(folderPath) {
        try {
          const entries = await fsp.readdir(folderPath, { withFileTypes: true });
          const promises = [];
          
          for (const entry of entries) {
            const full = path.join(folderPath, entry.name);
            const lst = await fsp.lstat(full).catch(() => null);
            if (!lst) continue;
            
            if (lst.isSymbolicLink()) continue;
            
            if (lst.isDirectory()) {
              promises.push(safeRemove(full));
            } else if (lst.isFile()) {
              promises.push(fsp.unlink(full));
            }
          }
          
          // 并行删除所有文件和子文件夹
          await Promise.all(promises);
          await fsp.rmdir(folderPath);
          return true;
        } catch (error) {
          return false;
        }
      }
      
      parentPort.on('message', async (message) => {
        if (message.type === 'start') {
          const paths = message.paths;
          const total = paths.length;
          let count = 0;
          
          for (const p of paths) {
            try {
              const st = await fsp.stat(p).catch(() => null);
              if (!st) {
                // 文件不存在，视为已删除
                count++;
                parentPort.postMessage({ 
                  type: 'progress', 
                  count, 
                  total,
                  path: p,
                  success: true
                });
                continue;
              }
      
              let deleted = false;
              if (st.isDirectory()) {
                try {
                  deleted = await safeRemove(p);
                } catch (err) {
                  const reason = (err && err.code) || (err && err.message) || 'unknown';
                  parentPort.postMessage({ 
                    type: 'skip', 
                    path: p, 
                    reason 
                  });
                }
              } else {
                try {
                  await fsp.unlink(p);
                  deleted = true;
                } catch (err) {
                  const reason = (err && err.code) || (err && err.message) || 'unknown';
                  parentPort.postMessage({ 
                    type: 'skip', 
                    path: p, 
                    reason 
                  });
                }
              }
              
              // 只有在成功删除时才触发 progress
              if (deleted) {
                count++;
                parentPort.postMessage({ 
                  type: 'progress', 
                  count, 
                  total,
                  path: p,
                  success: true
                });
              }
            } catch (err) {
              const reason = (err && err.code) || (err && err.message) || 'unknown';
              parentPort.postMessage({ 
                type: 'skip', 
                path: p, 
                reason 
              });
            }
          }
          
          parentPort.postMessage({ type: 'complete' });
        }
      });
    `;
