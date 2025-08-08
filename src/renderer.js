/**
 * This file will automatically be loaded by webpack and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/process-model
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.js` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

import "./index.css";

const scanBtn = document.getElementById("scan");
const cleanBtn = document.getElementById("clean");
const resultList = document.getElementById("result");
const progressBar = document.getElementById("progressBar");
const progressContainer = document.getElementById("progressContainer");

let totalItems = 0; // 总待删除项数

scanBtn.addEventListener("click", async () => {
  scanBtn.disabled = true;
  cleanBtn.disabled = true;
  progressContainer.style.display = "none";
  resultList.innerHTML = "扫描中...";
  const result = await window.api.scanJunk();
  resultList.innerHTML = "";
  totalItems = 0;
  result.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.path} - ${(item.size / 1024 / 1024).toFixed(2)} MB`;
    resultList.appendChild(li);
    if (item.size > 0) totalItems += 1;
  });
  cleanBtn.disabled = totalItems === 0;
  scanBtn.disabled = false;
});

cleanBtn.addEventListener("click", async () => {
  scanBtn.disabled = true;
  cleanBtn.disabled = true;
  progressContainer.style.display = "block";
  progressBar.style.width = "0%";
  progressBar.textContent = "0%";

  let current = 0;

  await window.api.deleteJunk((count, currentPath) => {
    current = count;
    const percent = Math.min(100, Math.floor((current / totalItems) * 100));
    progressBar.style.width = `${percent}%`;
    progressBar.textContent = `${percent}%`;
  });

  progressBar.style.width = "100%";
  progressBar.textContent = "清理完成";
  // alert("垃圾清理完成！");
  scanBtn.disabled = false;
});
