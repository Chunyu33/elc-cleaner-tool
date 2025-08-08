// renderer.js
import './index.css';

// DOM elements
const scanBtn = document.getElementById('scan');
const cleanBtn = document.getElementById('clean');
const selectAllBtn = document.getElementById('selectAll');
const groupBySelect = document.getElementById('groupBy');
const fileTypeSelect = document.getElementById('fileType');
const sizeFiltersDiv = document.getElementById('sizeFilters');

const resultList = document.getElementById('result'); // viewport
const inner = document.getElementById('inner'); // inner wrapper
const visible = document.getElementById('visible'); // rendered nodes container

const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const stats = document.getElementById('stats');
const skippedList = document.getElementById('skipped');

//////////////////////////////////////////////////////////////////////////
// Data structures
let buffer = []; // incoming scanned items buffer
let flushTimer = null;
const FLUSH_INTERVAL_MS = 120;
const IMMEDIATE_FLUSH_THRESHOLD = 200;

let allItems = []; // { path,size,sizeStr,ext,selected,skipped,skipReason,groupKey }
let extSet = new Set();

let filteredFlat = []; // flattened display list (including group headers)
let groupMap = new Map(); // groupKey -> [indexes...]

let selectedPaths = new Set();
let totalFound = 0;
let initialDeleteTotal = 0;
let deleteProcessed = 0;

// Virtualization parameters
const ROW_HEIGHT = 36; // px (group headers and items share same height)
let viewportHeight = resultList.clientHeight || 420;
let visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + 6;

//////////////////////////////////////////////////////////////////////////
// Helpers
function extOf(p) {
  const m = p.match(/\.([^.\\\/]+)$/);
  return m ? m[1].toLowerCase() : '';
}
function sizeBucket(size) {
  if (size >= 100 * 1024 * 1024) return '>=100 MB';
  if (size >= 10 * 1024 * 1024) return '10 - 100 MB';
  if (size >= 1 * 1024 * 1024) return '1 - 10 MB';
  return '< 1 MB';
}
function parentFolderName(p) {
  // Windows / Unix both supported: normalize slashes
  const s = p.replace(/\\/g, '/');
  const parts = s.split('/');
  if (parts.length <= 1) return s;
  return parts[parts.length - 2] || parts[0];
}

function updateStats() {
  stats.textContent = `已发现: ${totalFound} 项；已选: ${selectedPaths.size} 项`;
}

//////////////////////////////////////////////////////////////////////////
// Buffer flush -> integrate into allItems
function flushBuffer() {
  if (buffer.length === 0) return;
  for (const item of buffer) {
    // dedupe: if already exists, skip
    if (allItems.some(x => x.path === item.path)) continue;
    const ext = extOf(item.path);
    extSet.add(ext);
    const obj = {
      path: item.path,
      size: item.size,
      sizeStr: item.sizeStr || '',
      ext,
      selected: true,
      skipped: false,
      skipReason: null,
      parent: parentFolderName(item.path),
      sizeBucket: sizeBucket(item.size),
    };
    allItems.push(obj);
    selectedPaths.add(obj.path);
    totalFound++;
  }
  buffer = [];
  // update fileTypeSelect options
  rebuildFileTypeOptions();
  // rebuild flat list based on current filters & grouping
  rebuildFlatList();
  // update virtualization height
  updateInnerHeight();
  updateStats();
}

function ensureFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    if (buffer.length > 0) flushBuffer();
  }, FLUSH_INTERVAL_MS);
}

function stopFlushTimer() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

//////////////////////////////////////////////////////////////////////////
// Filters & Grouping
function currentFileTypeFilter() {
  const v = fileTypeSelect.value;
  return v === '__all__' ? null : v;
}
function currentSizeFilters() {
  // read checkboxes
  const checkboxes = sizeFiltersDiv.querySelectorAll('input[type=checkbox]');
  const active = [];
  checkboxes.forEach(cb => {
    if (cb.checked) active.push(cb.value);
  });
  return active;
}
function currentGroupBy() {
  return groupBySelect.value; // 'none','size','path'
}

function rebuildFileTypeOptions() {
  // rebuild select: preserve current selection
  const prev = fileTypeSelect.value;
  const exts = Array.from(extSet).filter(e => e).sort();
  fileTypeSelect.innerHTML = '';
  const optAll = document.createElement('option');
  optAll.value = '__all__';
  optAll.textContent = '全部文件类型';
  fileTypeSelect.appendChild(optAll);
  for (const e of exts) {
    const o = document.createElement('option');
    o.value = e;
    o.textContent = '.' + e;
    fileTypeSelect.appendChild(o);
  }
  if ([...fileTypeSelect.options].some(o => o.value === prev)) {
    fileTypeSelect.value = prev;
  }
}

function rebuildFlatList() {
  // Apply filters, then grouping (create flattened array)
  const ft = currentFileTypeFilter();
  const sizeFilters = currentSizeFilters();
  // filtered items indices
  const filtered = allItems.filter(it => {
    if (it.skipped) return true; // still show skipped items but deselected already
    if (ft && it.ext !== ft) return false;
    if (sizeFilters.length > 0 && !sizeFilters.includes(it.sizeBucket)) return false;
    return true;
  });

  // grouping
  const groupBy = currentGroupBy();
  const flat = [];
  if (groupBy === 'none') {
    for (const it of filtered) {
      flat.push({ type: 'file', item: it });
    }
  } else if (groupBy === 'size') {
    const map = new Map();
    for (const it of filtered) {
      const k = it.sizeBucket;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    const order = ['>=100 MB','10 - 100 MB','1 - 10 MB','< 1 MB'];
    for (const k of order) {
      if (!map.has(k)) continue;
      flat.push({ type: 'group', label: k, count: map.get(k).length });
      for (const it of map.get(k)) flat.push({ type: 'file', item: it });
    }
  } else if (groupBy === 'path') {
    const map = new Map();
    for (const it of filtered) {
      const k = it.parent || '其他';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    // sort groups by name
    const keys = Array.from(map.keys()).sort();
    for (const k of keys) {
      flat.push({ type: 'group', label: k, count: map.get(k).length });
      for (const it of map.get(k)) flat.push({ type: 'file', item: it });
    }
  }

  filteredFlat = flat;
  // adjust inner height
  updateInnerHeight();
}

function updateInnerHeight() {
  const totalRows = filteredFlat.length;
  const h = Math.max(totalRows * ROW_HEIGHT, 1);
  inner.style.height = h + 'px';
  // Also trigger a visible render
  renderVisible();
}

//////////////////////////////////////////////////////////////////////////
// Virtual rendering
function renderVisible() {
  const scrollTop = resultList.scrollTop;
  viewportHeight = resultList.clientHeight;
  visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + 6;

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2);
  const endIndex = Math.min(filteredFlat.length, startIndex + visibleCount + 4);

  // clear visible container and create nodes for range
  visible.innerHTML = '';

  for (let i = startIndex; i < endIndex; i++) {
    const row = filteredFlat[i];
    const top = i * ROW_HEIGHT;
    const node = document.createElement('div');
    node.style.position = 'absolute';
    node.style.left = '0';
    node.style.right = '0';
    node.style.top = top + 'px';
    node.style.height = ROW_HEIGHT + 'px';
    node.style.boxSizing = 'border-box';
    node.className = 'virtual-row';

    if (row.type === 'group') {
      node.classList.add('group-header');
      node.textContent = `${row.label} (${row.count})`;
      node.style.fontWeight = '700';
      node.style.padding = '8px 12px';
    } else {
      const it = row.item;
      node.classList.add('result-item');

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!it.selected;
      cb.style.marginRight = '8px';
      cb.addEventListener('change', () => {
        it.selected = cb.checked;
        if (cb.checked) selectedPaths.add(it.path); else selectedPaths.delete(it.path);
        updateStats();
        updateControlsState();
      });

      const span = document.createElement('span');
      span.className = 'item-text';
      span.textContent = ` ${it.path} ${it.sizeStr ? ' - ' + it.sizeStr : ''}`;
      span.style.fontSize = '12px';

      const reasonSpan = document.createElement('span');
      reasonSpan.className = 'skip-reason';
      reasonSpan.style.marginLeft = '8px';
      reasonSpan.style.color = '#c0392b';
      reasonSpan.style.fontSize = '12px';
      reasonSpan.textContent = it.skipped && it.skipReason ? `跳过: ${it.skipReason}` : '';
      if (!it.skipped) reasonSpan.style.display = 'none';

      node.appendChild(cb);
      node.appendChild(span);
      node.appendChild(reasonSpan);
    }

    visible.appendChild(node);
  }
}

resultList.addEventListener('scroll', () => {
  renderVisible();
});

// Controls
function updateControlsState() {
  cleanBtn.disabled = selectedPaths.size === 0;
  selectAllBtn.textContent = (selectedPaths.size === allItems.length && allItems.length>0) ? '取消全选' : '全选';
}

selectAllBtn.addEventListener('click', () => {
  const shouldSelectAll = selectedPaths.size !== allItems.length;
  selectedPaths.clear();
  allItems.forEach(it => {
    it.selected = shouldSelectAll;
    if (shouldSelectAll) selectedPaths.add(it.path);
  });
  rebuildFlatList();
  renderVisible();
  updateControlsState();
  updateStats();
});

groupBySelect.addEventListener('change', () => {
  rebuildFlatList();
  renderVisible();
});
fileTypeSelect.addEventListener('change', () => {
  rebuildFlatList();
  renderVisible();
});
sizeFiltersDiv.addEventListener('change', () => {
  rebuildFlatList();
  renderVisible();
});

//////////////////////////////////////////////////////////////////////////
// Scan / delete handlers & subscriptions
let unsubScanItem = null;
let unsubScanComplete = null;
let unsubScanError = null;
let unsubScanBusy = null;
let unsubDeleteProgress = null;
let unsubDeleteSkip = null;
let unsubDeleteComplete = null;
let unsubDeleteBusy = null;

function startScanSubscriptions() {
  // unsubscribe previous
  if (typeof unsubScanItem === 'function') unsubScanItem();
  if (typeof unsubScanComplete === 'function') unsubScanComplete();
  if (typeof unsubScanError === 'function') unsubScanError();
  if (typeof unsubScanBusy === 'function') unsubScanBusy();

  unsubScanItem = window.api.onScanItem((item) => {
    if (!item || !item.path) return;
    buffer.push(item);
    if (buffer.length >= IMMEDIATE_FLUSH_THRESHOLD) flushBuffer();
    ensureFlushTimer();
  });

  unsubScanComplete = window.api.onScanComplete(() => {
    flushBuffer();
    stopFlushTimer();
    scanBtn.disabled = false;
    updateControlsState();
  });

  unsubScanError = window.api.onScanError((err) => {
    console.error('scan error', err);
    stopFlushTimer();
    scanBtn.disabled = false;
    alert('扫描出错：' + (err || 'unknown'));
  });

  unsubScanBusy = window.api.onScanBusy(() => {
    alert('扫描任务正在运行，请稍候。');
  });
}

function startDeleteSubscriptions() {
  if (typeof unsubDeleteProgress === 'function') unsubDeleteProgress();
  if (typeof unsubDeleteSkip === 'function') unsubDeleteSkip();
  if (typeof unsubDeleteComplete === 'function') unsubDeleteComplete();
  if (typeof unsubDeleteBusy === 'function') unsubDeleteBusy();

  deleteProcessed = 0;
  unsubDeleteProgress = window.api.onDeleteProgress((count, currentPath) => {
    deleteProcessed++;
    const percent = initialDeleteTotal > 0 ? Math.min(100, Math.floor((deleteProcessed / initialDeleteTotal) * 100)) : 100;
    progressBar.style.width = `${percent}%`;
    progressBar.textContent = `${percent}%`;
    // remove deleted item from allItems
    const idx = allItems.findIndex(it => it.path === currentPath);
    if (idx >= 0) {
      allItems.splice(idx, 1);
      selectedPaths.delete(currentPath);
      totalFound = Math.max(0, totalFound - 1);
      rebuildFlatList();
      updateInnerHeight();
      renderVisible();
      updateStats();
    }
  });

  unsubDeleteSkip = window.api.onDeleteSkip((p, reason) => {
    // display in-skipped and mark in allItems
    const it = allItems.find(it => it.path === p);
    if (it) {
      it.skipped = true;
      it.skipReason = reason;
      it.selected = false;
      selectedPaths.delete(p);
      rebuildFlatList();
      renderVisible();
      updateStats();
    }
    // append to skippedList panel
    const d = document.createElement('div');
    d.className = 'skipped-item';
    d.textContent = `${p} — ${reason}`;
    skippedList.appendChild(d);
  });

  unsubDeleteComplete = window.api.onDeleteComplete(() => {
    progressBar.style.width = '100%';
    progressBar.textContent = '清理完成';
    scanBtn.disabled = false;
    // cleanup
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

//////////////////////////////////////////////////////////////////////////
// UI actions
scanBtn.addEventListener('click', () => {
  // reset
  buffer = [];
  stopFlushTimer();
  allItems = [];
  extSet.clear();
  filteredFlat = [];
  selectedPaths.clear();
  totalFound = 0;
  initialDeleteTotal = 0;
  deleteProcessed = 0;
  inner.style.height = '1px';
  visible.innerHTML = '';
  skippedList.innerHTML = '';
  updateStats();
  rebuildFileTypeOptions();
  resultList.scrollTop = 0;
  progressContainer.style.display = 'none';
  progressBar.style.width = '0%';
  progressBar.textContent = '0%';

  scanBtn.disabled = true;
  cleanBtn.disabled = true;

  startScanSubscriptions();
  window.api.scanJunk();
});

cleanBtn.addEventListener('click', () => {
  if (selectedPaths.size === 0) return alert('未选择任何要删除的项。');
  initialDeleteTotal = selectedPaths.size;
  deleteProcessed = 0;
  progressContainer.style.display = 'block';
  progressBar.style.width = '0%';
  progressBar.textContent = '0%';
  scanBtn.disabled = true;
  cleanBtn.disabled = true;

  startDeleteSubscriptions();
  window.api.deleteJunk(Array.from(selectedPaths));
});

// utility: initial size filters controls
function createSizeFiltersUI() {
  const buckets = ['>=100 MB','10 - 100 MB','1 - 10 MB','< 1 MB'];
  sizeFiltersDiv.innerHTML = '';
  for (const b of buckets) {
    const label = document.createElement('label');
    label.style.marginRight = '10px';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = b;
    cb.checked = true;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + b));
    sizeFiltersDiv.appendChild(label);
  }
}
createSizeFiltersUI();

//////////////////////////////////////////////////////////////////////////
// initial UI state
updateControlsState();
updateStats();
updateInnerHeight();
renderVisible();

// flush buffer on beforeunload
window.addEventListener('beforeunload', () => {
  stopFlushTimer();
  if (typeof unsubScanItem === 'function') unsubScanItem();
  if (typeof unsubScanComplete === 'function') unsubScanComplete();
  if (typeof unsubDeleteProgress === 'function') unsubDeleteProgress();
  if (typeof unsubDeleteSkip === 'function') unsubDeleteSkip();
});
