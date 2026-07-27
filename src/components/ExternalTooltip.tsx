import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { CheckSquare, Square, Plus, Trash2, Loader2, GripVertical } from 'lucide-react';
import type { Todo } from '../types';
import { getDateInfo } from '../utils';

export const ExternalTooltip = () => {
  const [data, setData] = useState<{ dateKey: string; tasks: Todo[]; freshShow?: boolean } | null>(null);
  const [localInput, setLocalInput] = useState('');

  // 编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isInputFocusedRef = useRef(false);
  const isMouseInsideRef = useRef(false);

  // 入场动画控制：弹窗直接显示，窗口可见 100ms 后列表项逐条翻入
  const [animateReady, setAnimateReady] = useState(false);

  const clearHideTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const scheduleHide = (delay = 2000) => {
    clearHideTimer();
    timerRef.current = setTimeout(() => {
      if (!isMouseInsideRef.current && !isInputFocusedRef.current) {
        sendAction('CX', null);
      }
    }, delay);
  };

  const handleMouseEnter = () => {
    isMouseInsideRef.current = true;
    clearHideTimer();
  };

  const handleMouseLeave = () => {
    isMouseInsideRef.current = false;
    scheduleHide();
  };

  useEffect(() => {
    return () => clearHideTimer();
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) isMouseInsideRef.current = false;
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // 每次窗口从隐藏变为可见时：100ms 后触发列表逐条翻入。
  // 注意：animateReady 的重置在收到 freshShow 数据时就完成（窗口还隐藏），
  // 不能等这里再重置——否则窗口先以旧状态可见，再重播动画，看起来像弹了两次。
  useEffect(() => {
    let itemTimer: ReturnType<typeof setTimeout> | null = null;
    const remove = window.desktopCalendar?.onTooltipVisible?.(() => {
      if (itemTimer) clearTimeout(itemTimer);
      itemTimer = setTimeout(() => setAnimateReady(true), 100);
    });
    return () => {
      remove?.();
      if (itemTimer) clearTimeout(itemTimer);
    };
  }, []);

  useEffect(() => {
    const removeListener = window.desktopCalendar?.onUpdateTooltip((payload) => {
      if (payload?.freshShow) {
        // 全新弹出：窗口还隐藏，先把列表重置为"未翻入"（opacity-0，避免静态先显示一遍）
        setAnimateReady(false);
      }
      setData(payload);
      if (!isMouseInsideRef.current) scheduleHide();
    });
    return () => removeListener?.();
  }, []);

  useEffect(() => {
    if (!data) return;
    const el = scrollRef.current;
    if (!el) return;
    let timeoutId: number | null = null;

    const show = () => {
      el.classList.add('scrollbar-visible');
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        el.classList.remove('scrollbar-visible');
      }, 800);
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY !== 0 || event.deltaX !== 0) show();
    };

    const handleScroll = () => {
      show();
    };

    el.addEventListener('wheel', handleWheel);
    el.addEventListener('scroll', handleScroll);

    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('scroll', handleScroll);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [data]);

  // 尺寸上报：ResizeObserver 逐帧上报容器高度（高度过渡动画期间窗口逐帧跟随内容）。
  // 依赖 data：挂载初期是加载态、containerRef 未挂载，数据到达后才需要重新建立观察。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      window.desktopCalendar?.resizeTooltip?.({ width: 300, height: el.offsetHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  // 高度过渡：内容自然高度变化时（增删任务、切换日期），从当前视觉高度缓动到新的自然高度。
  // 窗口尺寸由上面的 ResizeObserver 逐帧同步，内容和窗口始终一致，不会出现"被拉开"的错位感。
  // 注意：窗口隐藏时 Chromium 暂停绘制，RO 回调不会下发，所以起始/结束尺寸必须同步上报。
  useLayoutEffect(() => {
    const card = cardRef.current;
    const container = containerRef.current;
    if (!card || !container || !data) return;

    const report = () => {
      window.desktopCalendar?.resizeTooltip?.({ width: 300, height: container.offsetHeight });
    };

    // 过渡中被打断时，offsetHeight 是当前帧的实际视觉高度，作为新动画的起点
    const currentH = card.offsetHeight;
    // 恢复 auto 测量内容自然高度（只动 height 相关的 transition，不碰卡片的 opacity 渐显）
    card.style.transitionProperty = 'none';
    card.style.height = '';
    const naturalH = card.offsetHeight;

    if (Math.abs(naturalH - currentH) > 2) {
      card.style.height = `${currentH}px`;
      report(); // 同步上报起始尺寸：隐藏窗口下也能触发主进程的 showInactive
      void card.offsetHeight; // 强制 reflow，确保起点生效
      card.style.transitionProperty = 'height';
      card.style.transitionDuration = '240ms';
      card.style.transitionTimingFunction = 'cubic-bezier(0.22, 1, 0.36, 1)';
      card.style.height = `${naturalH}px`;
      const onEnd = () => {
        card.style.removeProperty('transition-property');
        card.style.removeProperty('transition-duration');
        card.style.removeProperty('transition-timing-function');
        card.style.height = '';
        card.removeEventListener('transitionend', onEnd);
        report(); // 兜底：即使可见后 RO 漏帧，也保证窗口停在最终尺寸
      };
      card.addEventListener('transitionend', onEnd);
    } else {
      card.style.removeProperty('transition-property');
      report();
    }
  }, [data, localInput]);

  const sendAction = (type: string, payload: any) => {
    window.desktopCalendar?.dispatchTooltipAction({ type, payload });
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!localInput.trim() || !data) return;
    sendAction('ADD', { text: localInput, dateKey: data.dateKey });
    setLocalInput('');
  };

  const handleStartEdit = (task: Todo) => {
    setEditingId(task.id);
    setEditText(task.text);
    isInputFocusedRef.current = true;
  };

  const handleFinishEdit = () => {
    if (editingId && editText.trim()) {
      const originalTask = data?.tasks.find(t => t.id === editingId);
      if (originalTask && originalTask.text !== editText) {
         sendAction('UPDATE', { id: editingId, text: editText, dateKey: data?.dateKey });
      }
    }
    setEditingId(null);
    setEditText('');
    isInputFocusedRef.current = false;
  };

  const [draggedItem, setDraggedItem] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (editingId) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    setDraggedItem(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === id || !data) return;

    const newTasks = [...data.tasks];
    const draggedIndex = newTasks.findIndex(t => t.id === draggedItem);
    const hoverIndex = newTasks.findIndex(t => t.id === id);

    if (draggedIndex === -1 || hoverIndex === -1) return;

    const [removed] = newTasks.splice(draggedIndex, 1);
    newTasks.splice(hoverIndex, 0, removed);

    setData({ ...data, tasks: newTasks });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggedItem(null);
    if (!data) return;
    const reorderedIds = data.tasks.map(t => t.id);
    sendAction('REORDER', { dateKey: data.dateKey, reorderedIds });
  };

  if (!data) {
    return (
      <div className="w-[300px] h-40 p-5 box-border select-none">
        <div className="w-full h-full bg-elevated border border-line rounded-xl flex flex-col items-center justify-center text-ink3 gap-2 shadow-2xl">
          <Loader2 className="animate-spin text-mint-deep" size={24} />
          <div className="text-xs font-bold">窗口已加载</div>
          <div className="text-[10px] opacity-70">等待数据...</div>
        </div>
      </div>
    );
  }

  const { dateKey, tasks } = data;
  const [y, m, d] = dateKey.split('-').map(Number);
  const dateInfo = getDateInfo(new Date(y, m - 1, d));
  const specialDayText = dateInfo.festival || dateInfo.term;
  const total = tasks.length;
  const uncompleted = tasks.filter(t => !t.completed).length;

  return (
    <div
      ref={containerRef}
      className="w-[300px] h-fit p-5 box-border select-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div ref={cardRef} className="bg-elevated/95 backdrop-blur-xl border border-line rounded-xl shadow-lg flex flex-col overflow-hidden">
        {/* 标题栏 */}
        <div className="px-3 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between flex-shrink-0 drag-region">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-sm font-semibold text-ink whitespace-nowrap tabular-nums">{dateKey}</span>
            {specialDayText && <span className="text-[10px] text-mint truncate bg-mint-dim px-1.5 py-0.5 rounded-full flex-shrink-0">{specialDayText}</span>}
            <span className="text-[10px] text-ink3 truncate">{dateInfo.fullLunar}</span>
            {total > 0 && (
               <div className="text-[10px] font-mono flex items-center gap-[1px] bg-mint-dim px-1.5 py-0.5 rounded-full ml-2 flex-shrink-0">
                 <span className="text-mint font-bold">{total}</span>
                 <span className={uncompleted > 0 ? "text-warn font-bold" : "text-ink3"}>/{uncompleted}</span>
               </div>
             )}
          </div>
        </div>

        {/* 列表 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-2 custom-scrollbar min-h-0 max-h-64 no-drag">
          {tasks.length === 0 ? (
            <div className="flex items-center justify-center text-ink3 text-xs py-4">暂无事项</div>
          ) : (
            tasks.map((task, index) => (
              <div
                key={task.id}
                className={`group flex items-center gap-2 p-1.5 hover:bg-hover rounded transition-colors ${animateReady ? 'animate-toolbar-stagger' : 'opacity-0'} ${draggedItem === task.id ? 'opacity-30' : ''}`}
                style={animateReady ? { animationDelay: `${Math.min(index, 12) * 110}ms` } : undefined}
                draggable={editingId !== task.id}
                onDragStart={(e) => handleDragStart(e, task.id)}
                onDragOver={(e) => handleDragOver(e, task.id)}
                onDrop={handleDrop}
              >
                <div className="cursor-grab active:cursor-grabbing text-ink3 hover:text-mint opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" title="拖拽排序">
                  <GripVertical size={12} />
                </div>

                <button
                  onClick={() => sendAction('TOGGLE', { id: task.id, dateKey: data.dateKey })}
                  className={`flex-shrink-0 ${task.completed ? 'text-mint-deep' : 'text-ink3 hover:text-mint'}`}
                >
                  {task.completed ? <CheckSquare size={14} /> : <Square size={14} />}
                </button>

                {editingId === task.id ? (
                  <input
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={handleFinishEdit}
                    onKeyDown={(e) => e.key === 'Enter' && handleFinishEdit()}
                    className="flex-1 min-w-0 bg-black/50 text-xs text-ink px-1 py-0.5 rounded outline-none border border-mint/50"
                  />
                ) : (
                  <span
                    onDoubleClick={() => handleStartEdit(task)}
                    className={`flex-1 text-xs truncate cursor-text select-text ${task.completed ? 'text-ink3 line-through' : 'text-ink2'}`}
                    title={task.text}
                  >
                    {task.text}
                  </span>
                )}

                <button
                  onClick={() => sendAction('DELETE', { id: task.id, dateKey: data.dateKey })}
                  className="opacity-0 group-hover:opacity-100 text-ink3 hover:text-danger transition-opacity"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )))}
        </div>

        {/* 输入框 */}
        <div className="p-2 border-t border-white/5 bg-white/[0.02] no-drag">
          <form onSubmit={handleAdd} className="flex items-center gap-2 relative">
            <input
              className="flex-1 bg-black/30 border border-line rounded px-2 py-1.5 text-xs text-ink outline-none focus:border-mint transition-colors"
              placeholder="添加新事项..."
              value={localInput}
              onChange={e => setLocalInput(e.target.value)}
              onFocus={() => { isInputFocusedRef.current = true; }}
              onBlur={() => { isInputFocusedRef.current = false; }}
            />
            <button type="submit" disabled={!localInput.trim()} className="absolute right-1.5 top-1.5 text-ink3 hover:text-mint-deep disabled:hidden">
              <Plus size={14} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
