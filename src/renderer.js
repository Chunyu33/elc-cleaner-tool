// renderer.js
import './index.css';

const scanBtn = document.getElementById('scan');
const cleanBtn = document.getElementById('clean');
const selectAllBtn = document.getElementById('selectAll');
const resultList = document.getElementById('result');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const stats = document.getElementById('stats');
const skippedList = document.getElementById('skipped');

let buffer = []; // 扫描项缓冲
let flushTimer = null;
let pathToLi = new Map(); // path -> li DOM
let selectedPaths = new Set();
let totalFound = 0;
let initialDeleteTotal = 0;
let deleteProcessed = 0;

// 批量渲染参数
const FLUSH_INTERVAL_MS = 120;
const IMMEDIATE_FLUSH_THRESHOLD = 250; // buffer 超过这个数量立即 flush

function updateStats() {
  stats.textContent = `已发现: ${totalFound} 项，已选: ${selectedPaths.size} 项`;
}

function createListItem(item) {
  const li = document.createElement('li');
  li.className = 'result-item';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = true;
  cb.dataset.path = item.path;

  const label = document.createElement('span');
  label.className = 'item-text';
  label.textContent = ` ${item.path} ${item.sizeStr ? ' - ' + item.sizeStr : ''}`;

  const reasonSpan = document.createElement('span');
  reasonSpan.className = 'skip-reason';
  reasonSpan.style.marginLeft = '8px';
  reasonSpan.style.color = '#c0392b';
  reasonSpan.style.display = 'none';

  cb.addEventListener('change', () => {
    if (cb.checked) selectedPaths.add(item.path);
    else selectedPaths.delete(item.path);
    updateControls();
    updateStats();
  });

  li.appendChild(cb);
  li.appendChild(label);
  li.appendChild(reasonSpan);

  return { li, checkbox: cb, reasonSpan };
}

function flushBuffer() {
  if (buffer.length === 0) return;
  const frag = document.createDocumentFragment();
  while (buffer.length) {
    const item = buffer.shift();
    if (pathToLi.has(item.path)) continue; // 去重
    const { li, checkbox } = createListItem(item);
    pathToLi.set(item.path, { li, checkbox });
    selectedPaths.add(item.path);
    frag.appendChild(li);
    totalFound++;
  }
  resultList.appendChild(frag);
  updateControls();
  updateStats();
}

// 自适应 flush：定时 + 阈值触发
function ensureFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    if (buffer.length > 0) flushBuffer();
    // 如果扫描结束，调用处会清除 timer
  }, FLUSH_INTERVAL_MS);
}

function stopFlushTimer() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

// UI 控件状态
function updateControls() {
  cleanBtn.disabled = selectedPaths.size === 0;
  selectAllBtn.textContent = selectedPaths.size === pathToLi.size ? '取消全选' : '全选';
}

// 订阅扫描事件
let unsubScanItem = null;
let unsubScanComplete = null;
let unsubScanBusy = null;
let unsubScanError = null;

function startScanSubscriptions() {
  // 先解除老订阅（若存在）
  if (typeof unsubScanItem === 'function') unsubScanItem();
  if (typeof unsubScanComplete === 'function') unsubScanComplete();
  if (typeof unsubScanBusy === 'function') unsubScanBusy();
  if (typeof unsubScanError === 'function') unsubScanError();

  unsubScanItem = window.api.onScanItem((item) => {
    if (!item || !item.path) return;
    buffer.push(item);
    if (buffer.length >= IMMEDIATE_FLUSH_THRESHOLD) flushBuffer();
    ensureFlushTimer();
  });

  unsubScanComplete = window.api.onScanComplete(() => {
    // flush remaining
    flushBuffer();
    stopFlushTimer();
    scanBtn.disabled = false;
    updateControls();
  });

  unsubScanBusy = window.api.onScanBusy(() => {
    alert('扫描任务正在运行，请稍候。');
  });

  unsubScanError = window.api.onScanError((err) => {
    console.error('scan error', err);
    stopFlushTimer();
    scanBtn.disabled = false;
    alert('扫描出错: ' + (err || 'unknown'));
  });
}

// 订阅删除事件
let unsubDeleteProgress = null;
let unsubDeleteSkip = null;
let unsubDeleteComplete = null;
let unsubDeleteBusy = null;

function startDeleteSubscriptions() {
  if (typeof unsubDeleteProgress === 'function') unsubDeleteProgress();
  if (typeof unsubDeleteSkip === 'function') unsubDeleteSkip();
  if (typeof unsubDeleteComplete === 'function') unsubDeleteComplete();
  if (typeof unsubDeleteBusy === 'function') unsubDeleteBusy();

  deleteProcessed = 0;

  unsubDeleteProgress = window.api.onDeleteProgress((count, currentPath) => {
    // 主进程按处理项回调；用本地 deleteProcessed++ 来计算进度
    deleteProcessed++;
    const percent = initialDeleteTotal > 0 ? Math.min(100, Math.floor((deleteProcessed / initialDeleteTotal) * 100)) : 100;
    progressBar.style.width = `${percent}%`;
    progressBar.textContent = `${percent}%`;

    // 从列表中移除已删除项（若存在）
    const rec = pathToLi.get(currentPath);
    if (rec) {
      rec.li.classList.add('deleted');
      rec.li.remove(); // 直接移除 DOM
      pathToLi.delete(currentPath);
      selectedPaths.delete(currentPath);
      updateStats();
      updateControls();
    }
  });

  unsubDeleteSkip = window.api.onDeleteSkip((p, reason) => {
    // 标记为跳过：在原列表中显示原因；同时在 skipped 区域列出
    const rec = pathToLi.get(p);
    if (rec) {
      rec.li.classList.add('skipped');
      // 在 rec.li 找到 reasonSpan 并显示
      const reasonSpan = rec.li.querySelector('.skip-reason');
      if (reasonSpan) {
        reasonSpan.textContent = `跳过: ${reason}`;
        reasonSpan.style.display = 'inline';
      }
      // 取消选中
      if (rec.checkbox) {
        rec.checkbox.checked = false;
      }
      selectedPaths.delete(p);
      updateStats();
      updateControls();
    }

    // 在 skipped 列表新增记录
    const k = document.createElement('div');
    k.className = 'skipped-item';
    k.textContent = `${p} — ${reason}`;
    skippedList.appendChild(k);
  });

  unsubDeleteComplete = window.api.onDeleteComplete(() => {
    progressBar.style.width = '100%';
    progressBar.textContent = '清理完成';
    scanBtn.disabled = false;
    // 解绑
    if (typeof unsubDeleteProgress === 'function') unsubDeleteProgress();
    if (typeof unsubDeleteSkip === 'function') unsubDeleteSkip();
    if (typeof unsubDeleteComplete === 'function') unsubDeleteComplete();
    if (typeof unsubDeleteBusy === 'function') unsubDeleteBusy();
    unsubDeleteProgress = unsubDeleteSkip = unsubDeleteComplete = unsubDeleteBusy = null;
  });

  unsubDeleteBusy = window.api.onDeleteBusy(() => {
    alert('删除任务正在运行，请稍候。');
  });
}

// --- UI 事件绑定 ---
scanBtn.addEventListener('click', () => {
  // reset UI
  buffer = [];
  stopFlushTimer();
  pathToLi.forEach((v) => v.li.remove());
  pathToLi.clear();
  selectedPaths.clear();
  totalFound = 0;
  resultList.innerHTML = '';
  skippedList.innerHTML = '';
  stats.textContent = '';
  progressContainer.style.display = 'none';
  progressBar.style.width = '0%';
  progressBar.textContent = '0%';

  scanBtn.disabled = true;
  cleanBtn.disabled = true;
  startScanSubscriptions();
  window.api.scanJunk();
});

selectAllBtn.addEventListener('click', () => {
  const shouldSelectAll = selectedPaths.size !== pathToLi.size;
  selectedPaths.clear();
  pathToLi.forEach((rec, p) => {
    const cb = rec.checkbox;
    if (!cb) return;
    cb.checked = shouldSelectAll;
    if (shouldSelectAll) selectedPaths.add(p);
  });
  updateControls();
  updateStats();
});

cleanBtn.addEventListener('click', () => {
  if (selectedPaths.size === 0) return alert('未选择任何要删除的项。');

  // snapshot
  initialDeleteTotal = selectedPaths.size;
  deleteProcessed = 0;
  progressContainer.style.display = 'block';
  progressBar.style.width = '0%';
  progressBar.textContent = '0%';
  scanBtn.disabled = true;
  cleanBtn.disabled = true;

  // start delete subscriptions
  startDeleteSubscriptions();

  // send delete request (array)
  window.api.deleteJunk(Array.from(selectedPaths));
});

// 清理卸载时解绑
window.addEventListener('beforeunload', () => {
  if (typeof unsubScanItem === 'function') unsubScanItem();
  if (typeof unsubScanComplete === 'function') unsubScanComplete();
  if (typeof unsubScanBusy === 'function') unsubScanBusy();
  if (typeof unsubScanError === 'function') unsubScanError();
  if (typeof unsubDeleteProgress === 'function') unsubDeleteProgress();
  if (typeof unsubDeleteSkip === 'function') unsubDeleteSkip();
  if (typeof unsubDeleteComplete === 'function') unsubDeleteComplete();
});

