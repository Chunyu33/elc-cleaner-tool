import React, { useEffect, useRef, useState, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
import { Button, Space, message, Select, Checkbox } from 'antd';
import './Main.css';

// 可调参数
const ROW_HEIGHT = 36;
const FLUSH_INTERVAL_MS = 120;
const IMMEDIATE_FLUSH_THRESHOLD = 200;

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
function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return bytes + ' B';
}
function parentFolderName(p) {
  const s = p.replace(/\\/g, '/');
  const parts = s.split('/');
  return parts.length >= 2 ? parts[parts.length - 2] : '';
}

export default function Main() {
  // 主数据
  const [items, setItems] = useState([]); // {path,size,sizeStr,ext,selected,skipped,skipReason,parent,sizeBucket}
  const seen = useRef(new Set());
  const extSet = useRef(new Set());
  const bufferRef = useRef([]);
  const [totalFound, setTotalFound] = useState(0);
  const [totalSizeFoundBytes, setTotalSizeFoundBytes] = useState(0); // 总大小（字节）
  const [totalSizeSelectedBytes, setTotalSizeSelectedBytes] = useState(0); // 已选大小（字节）
  const [deletedCount, setDeletedCount] = useState(0);

  // 一键打开磁盘清理工具state
  const [cleanmgrAvailable, setCleanmgrAvailable] = useState(false);
  const [cleanmgrRunning, setCleanmgrRunning] = useState(false);

  
  // 使用 ref 跟踪删除过程中的数据
  const deletedSizeRef = useRef(0);
  const skippedCountRef = useRef(0);

  // UI state
  const [groupBy, setGroupBy] = useState('none'); // none | size | path
  const [fileType, setFileType] = useState('__all__');
  const [sizeFilters, setSizeFilters] = useState(new Set(['>=100 MB','10 - 100 MB','1 - 10 MB','< 1 MB']));

  // delete / progress state
  const [initialDeleteTotal, setInitialDeleteTotal] = useState(0);
  const [deleteProcessed, setDeleteProcessed] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [deleting, setDeleting] = useState(false);

  // 跳过的 UI
  const [skippedList, setSkippedList] = useState([]);

  // 刷新的定时器
  const flushTimerRef = useRef(null);

  // 选中的文件集合
  const selectedPaths = useMemo(() => new Set(items.filter(it => it.selected).map(it => it.path)), [items]);

  // 动态文件类型选项
  const fileTypeOptions = useMemo(() => {
    const arr = Array.from(extSet.current).filter(e => e).sort();
    return ['__all__', ...arr];
  }, [items.length]);

  // 缓冲区刷新 function
  const flushBuffer = () => {
    if (bufferRef.current.length === 0) return;
    const incoming = bufferRef.current.splice(0, bufferRef.current.length);
    const newOnes = [];
    for (const item of incoming) {
      if (seen.current.has(item.path)) continue;
      seen.current.add(item.path);
      const ext = extOf(item.path);
      extSet.current.add(ext);
      newOnes.push({
        path: item.path,
        size: item.size,
        sizeStr: item.sizeStr || '',
        ext,
        selected: true,
        skipped: false,
        skipReason: null,
        parent: parentFolderName(item.path),
        sizeBucket: sizeBucket(item.size),
      });
    }
    if (newOnes.length > 0) {
      setItems(prev => {
        const merged = prev.concat(newOnes);
        setTotalFound(merged.length);
        return merged;
      });
    }
  };

  const ensureFlushTimer = () => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setInterval(() => {
      if (bufferRef.current.length > 0) flushBuffer();
    }, FLUSH_INTERVAL_MS);
  };
  const stopFlushTimer = () => {
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  };

  // 订阅：扫描（onScanItem/onScanComplete）
  useEffect(() => {
    const unsubItem = window.api.onScanItem((item) => {
      if (!item || !item.path) return;
      // 累加总大小
      setTotalSizeFoundBytes(prev => prev + item.size);
      // 累加已选大小（因为新扫描的文件默认被选中）
      setTotalSizeSelectedBytes(prev => prev + item.size);
      bufferRef.current.push(item);
      if (bufferRef.current.length >= IMMEDIATE_FLUSH_THRESHOLD) {
        // immediate flush
        const itemsNow = bufferRef.current.splice(0, bufferRef.current.length);
        const newOnes = [];
        for (const it of itemsNow) {
          if (seen.current.has(it.path)) continue;
          seen.current.add(it.path);
          const ext = extOf(it.path);
          extSet.current.add(ext);
          newOnes.push({
            path: it.path,
            size: it.size,
            sizeStr: it.sizeStr || '',
            ext,
            selected: true,
            skipped: false,
            skipReason: null,
            parent: parentFolderName(it.path),
            sizeBucket: sizeBucket(it.size),
          });
        }
        if (newOnes.length > 0) {
          setItems(prev => {
            const merged = prev.concat(newOnes);
            setTotalFound(merged.length);
            return merged;
          });
        }
      } else {
        ensureFlushTimer();
      }
    });

    const unsubComplete = window.api.onScanComplete(() => {
      flushBuffer();
      stopFlushTimer();
    });

    const unsubError = window.api.onScanError((err) => {
      stopFlushTimer();
      alert('扫描出错: ' + (err || 'unknown'));
    });

    const unsubBusy = window.api.onScanBusy(() => {
      alert('扫描任务正在运行，请稍候');
    });

    return () => {
      unsubItem && unsubItem();
      unsubComplete && unsubComplete();
      unsubError && unsubError();
      unsubBusy && unsubBusy();
      stopFlushTimer();
    };
  }, []);

  // 订阅：删除进度/跳过/完成
  useEffect(() => {
    const unsubProgress = window.api.onDeleteProgress((count, currentPath) => {
      // count 是从 main 中累积的；使用它来计算与 initialDeleteTotal 相关的百分比
      setDeleteProcessed(count);
      setProgressPct(initialDeleteTotal > 0 ? Math.min(100, Math.floor((count / initialDeleteTotal) * 100)) : 100);
      // 如果存在，则删除已删除的项目
      setItems(prev => {
        const idx = prev.findIndex(it => it.path === currentPath);
        if (idx >= 0) {
          const deletedItem = prev[idx];
          // 更新总大小（减去已删除文件的大小）
          setTotalSizeFoundBytes(prevSize => prevSize - deletedItem.size);
          // 更新已选大小（如果被选中，则减去）
          if (deletedItem.selected) {
            setTotalSizeSelectedBytes(prevSize => prevSize - deletedItem.size);
          }

          const copy = prev.slice();
          copy.splice(idx, 1);
          setTotalFound(copy.length);
          return copy;
        }
        return prev;
      })
    });

    const unsubSkip = window.api.onDeleteSkip((p, reason) => {
      // 在项目中标记为已跳过并附加到 skippedList
      setItems(prev => prev.map(it => it.path === p ? { ...it, skipped: true, skipReason: reason, selected: false } : it));
      setSkippedList(prev => [...prev, { path: p, reason }]);

      // 添加到跳过列表
      skippedCountRef.current += 1;
    });

    const unsubComplete = window.api.onDeleteComplete((count) => {
      setDeletedCount(count);
      // 显示简洁的消息提示
      if (skippedCountRef.current > 0) {
        message.warning(`已删除 ${count} 个文件，${skippedCountRef.current} 个文件被跳过（系统占用/无权限）`);
        // console.warn(`已删除 ${count} 个文件（${formatSize(deletedSizeRef.current)}），${skippedCountRef.current} 个文件被跳过`)
      } else {
        // console.warn(`已成功删除 ${count} 个文件，释放空间 ${formatSize(deletedSizeRef.current)}`)
        message.success(`已成功删除 ${count} 个文件`);
      }
      setDeleting(false);
      // 清除垃圾文件 进度条完成
      setProgressPct(100);
      setTimeout(() => setProgressPct(0), 900);
      setTotalSizeFoundBytes(0);
      setTotalSizeSelectedBytes(0);
    });

    const unsubBusy = window.api.onDeleteBusy(() => {
      // alert('删除任务正在运行，请稍候。');
      message.warning('删除任务正在运行，请稍候。');
    });

    return () => {
      unsubProgress && unsubProgress();
      unsubSkip && unsubSkip();
      unsubComplete && unsubComplete();
      unsubBusy && unsubBusy();
    };
  }, [initialDeleteTotal]);

  // 磁盘清理工具可用性检查订阅
  useEffect(() => {
    const checkAvailability = async () => {
      const available = await window.api.onCleanmgrAvailable();
      setCleanmgrAvailable(available);
    };
    
    checkAvailability();
  }, []);

  // 过滤器和分组：生成带有组标题的扁平列表
  const filteredFlat = useMemo(() => {
    const ft = fileType === '__all__' ? null : fileType;
    const sizes = sizeFilters;

    const filtered = items.filter(it => {
      if (it.skipped) return true; // 保持跳过可见 但取消选择
      if (ft && it.ext !== ft) return false;
      if (sizes.size > 0 && !sizes.has(it.sizeBucket)) return false;
      return true;
    });

    const flat = [];
    if (groupBy === 'none') {
      for (const it of filtered) flat.push({ type: 'file', item: it });
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
      const keys = Array.from(map.keys()).sort();
      for (const k of keys) {
        flat.push({ type: 'group', label: k, count: map.get(k).length });
        for (const it of map.get(k)) flat.push({ type: 'file', item: it });
      }
    }
    return flat;
  }, [items, groupBy, fileType, sizeFilters]);

  // 虚拟列表的参数
  const listHeight = 360;
  const itemCount = filteredFlat.length;
  const itemSize = ROW_HEIGHT;

  // UI控件绑定的动作
  const startScan = () => {
    // 重置
    bufferRef.current = [];
    stopFlushTimer();
    deletedSizeRef.current = 0;
    skippedCountRef.current = 0;
    seen.current = new Set();
    extSet.current = new Set();
    setTotalSizeFoundBytes(0);
    setTotalSizeSelectedBytes(0);
    setItems([]);
    setSkippedList([]);
    setTotalFound(0);
    setProgressPct(0);
    setInitialDeleteTotal(0);
    setDeleteProcessed(0);
    // 开始扫描
    window.api.scanJunk();
  };

  const toggleSelectAll = () => {
    const shouldSelectAll = items.some(it => !it.selected && !it.skipped);
    setItems(prev => {
      // 计算要改变的文件
      const filesToChange = prev.filter(it => 
        !it.skipped && 
        it.selected !== shouldSelectAll
      );
      
      // 计算总大小变化
      const delta = filesToChange.reduce((sum, it) => {
        return shouldSelectAll ? sum + it.size : sum - it.size;
      }, 0);
      
      // 更新已选大小
      setTotalSizeSelectedBytes(prevSize => prevSize + delta);
      
      // 更新items状态
      return prev.map(it => 
        it.skipped 
          ? {...it, selected: false} 
          : {...it, selected: shouldSelectAll}
      );
    });
  };

  const toggleSizeFilter = (bucket) => {
    setSizeFilters(prev => {
      const next = new Set(prev);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
      return next;
    });
  };

  const startDelete = () => {
    const toDelete = items.filter(it => it.selected).map(it => it.path);
    if (toDelete.length === 0) {
      alert('未选择任何要删除的项。');
      return;
    }
    // 清空UI中的跳过列表
    setSkippedList([]);
    // 重置数据
    skippedCountRef.current = 0;
    setInitialDeleteTotal(toDelete.length);
    setDeleteProcessed(0);
    setProgressPct(0);
    setDeleting(true);
    window.api.deleteJunk(toDelete);
  };

  // 一键打开磁盘清理工具
  const runCleanmgr = async () => {
    setCleanmgrRunning(true);
    try {
      // const result = await window.api.runCleanmgr();
      // console.log(result, '-=------res')
      // if (result.success) {
      //   message.success('Windows 磁盘清理工具已启动');
      // } else {
      //   message.error(`启动失败: ${result.error}`);
      // }
      window.api.runCleanmgr();
      message.success('Windows 磁盘清理工具已启动');
    } catch (error) {
      message.error(`启动失败: ${error.message || '未知错误'}`);
    } finally {
      setCleanmgrRunning(false);
    }
  };

  // 打开日志所在文件夹
  const openSkipLog = async () => {
    const ok = await window.api.openSkipLog();
    if (!ok) {
      const content = await window.api.readSkipLog();
      alert(content || '日志为空或无法读取');
    }
  };

  // 用于 react-window 的行渲染器（行组件）
  const Row = ({ index, style }) => {
    const row = filteredFlat[index];
    if (!row) return null;
    if (row.type === 'group') {
      return (
        <div style={{ ...style, display: 'flex', alignItems: 'center', padding: '6px 12px', background: '#f4f6f8', fontWeight: 700 }}>
          {row.label} ({row.count})
        </div>
      );
    }
    const it = row.item;
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', boxSizing: 'border-box' }}>
        <Checkbox
          checked={!!it.selected}
          disabled={it.skipped}
          onChange={(e) => {
            const checked = e.target.checked;
            setItems(prev => {
              const updatedItems = prev.map(x => 
                x.path === it.path ? {...x, selected: checked} : x
              );
              
              // 计算文件大小变化
              const delta = checked ? it.size : -it.size;
              
              // 更新已选大小
              setTotalSizeSelectedBytes(prevSize => prevSize + delta);
              
              return updatedItems;
            });
          }}
        />
        <div style={{ fontSize: 12, flex: 1, wordBreak: 'break-all' }}>
          {it.path}
          {it.sizeStr ? <span style={{ color: '#666', marginLeft: 8 }}>{it.sizeStr}</span> : null}
          {it.skipped && it.skipReason ? <span style={{ color: '#c0392b', marginLeft: 8 }}>跳过: {it.skipReason}</span> : null}
        </div>
      </div>
    );
  };

  // 卸载时的清理工作
  useEffect(() => {
    return () => {
      stopFlushTimer();
    };
  }, []);

  return (
    <div className="container">

      <div className='operator'>
        <Space>
          <Button type="primary" onClick={startScan}>扫描垃圾</Button>
          <Button 
            type="primary" 
            danger 
            onClick={startDelete} 
            disabled={deleting || selectedPaths.size === 0}
          >
            清理已选 ({selectedPaths.size})
          </Button>
          <Button onClick={toggleSelectAll}>全选 / 取消全选</Button>
          <Button onClick={openSkipLog}>打开跳过日志</Button>
          <Button onClick={runCleanmgr}>一键磁盘清理</Button>
        </Space>

        <div className='filter-row'>
          <label>
            分组:
            <Select
              defaultValue="none"
              style={{ marginLeft: 10, width: 80 }}
              onChange={setGroupBy}
              options={[
                { value: 'none', label: '无' },
                { value: 'size', label: '按大小' },
                { value: 'path', label: '按路径' },
              ]}
            />
          </label>

          <label style={{ marginLeft: 8 }}>
            文件类型:
            <Select
              value={fileType}
              onChange={setFileType}
              style={{ marginLeft: 6, width: 120 }}
              options={fileTypeOptions.map(ft => ({
                value: ft,
                label: ft === '__all__' ? '全部' : '.' + ft
              }))}
            />
          </label>

          <div style={{ marginLeft: 8 }}>
            大小:
            {['>=100 MB','10 - 100 MB','1 - 10 MB','< 1 MB'].map(b => (
              <Checkbox
                key={b}
                style={{ marginLeft: 6 }}
                checked={sizeFilters.has(b)}
                onChange={(e) => toggleSizeFilter(b)}
              >
                {b}
              </Checkbox>
            ))}
          </div>
        </div>
      </div>

      <div className='total-found'>
        已发现: {totalFound} 项，总大小 {formatSize(totalSizeFoundBytes)}；已选: {selectedPaths.size} 项，总大小 {formatSize(totalSizeSelectedBytes)}
      </div>

      <div className='list-container'>
        <div>
          <List
            height={listHeight}
            itemCount={itemCount}
            itemSize={itemSize}
            width="100%"
            style={{ overflowX: 'hidden' }}
          >
            {Row}
          </List>
        </div>
      </div>

      {/* <div style={{ marginTop: 12 }}>
        <h4>已跳过（系统占用/无权限等）{skippedList.length}&nbsp;项</h4>
        <div className='pass'>
          {skippedList.length === 0 ? <div className='pass-none'>暂无</div> : skippedList.map((s, idx) => (
            <div key={idx} className='pass-line'>
              {s.path} — {s.reason}
            </div>
          ))}
        </div>
      </div> */}

      <div className='progress'>
        <div className='progress-ctx'>
          {progressPct > 0 ? <div className='progress-bar' style={{ width: `${progressPct}%` }}>
            {progressPct}% {deleting ? '' : ''}
          </div> : <div></div>}
          
        </div>
      </div>
    </div>
  );
}
