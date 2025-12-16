import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { CheckSquare, Square, Plus, Trash2, Loader2 } from 'lucide-react';
import type { Todo } from '../types';
import { getDateInfo } from '../utils';

export const ExternalTooltip = () => {
  const [data, setData] = useState<{ dateKey: string; tasks: Todo[] } | null>(null);
  const [localInput, setLocalInput] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  
  // [新增] 编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // --- [修改] 鼠标移出 2秒后自动关闭逻辑 ---
  const hide = () => {
    if (isInputFocused) return;
    // [关键修复] 发送 CX 指令，告知主窗口“弹窗已关闭”，从而清除 isAnyPopupOpen 状态，允许主窗口收起
    sendAction('CX', null);
  };

  const handleMouseEnter = () => {
    // 鼠标移入，清除倒计时，保持显示
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleMouseLeave = () => {
    // 鼠标移出，开始2秒倒计时关闭
    if (!isInputFocused) {
      timerRef.current = setTimeout(hide, 2000);
    }
  };

  useEffect(() => {
    // 组件卸载时清理定时器
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // 监听输入框焦点，防止输入时意外关闭
  useEffect(() => {
    if (isInputFocused && timerRef.current) {
      clearTimeout(timerRef.current);
    } else if (!isInputFocused && !timerRef.current && data) {
       // 如果失去焦点且鼠标不在窗口内（这里简单处理，依靠 onMouseLeave 触发即可，
       // 但为了保险，如果失去焦点时鼠标其实已经不在窗口里了，应该补一个计时？
       // 实际上 onBlur 不代表鼠标移出，这里保持简单，完全依赖 handleMouseLeave 即可）
    }
  }, [isInputFocused]);


  useEffect(() => {
    const removeListener = window.desktopCalendar?.onUpdateTooltip((payload) => {
      setData(payload);
      // 数据更新时，如果在倒计时中，重置它？或者保持？
      // 通常数据更新意味着用户在操作，保持显示比较好
      if (timerRef.current) clearTimeout(timerRef.current);
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

  useLayoutEffect(() => {
    if (containerRef.current) {
      const height = containerRef.current.offsetHeight;
      window.desktopCalendar?.resizeTooltip?.({ width: 300, height });
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
    setIsInputFocused(true); // 防止自动关闭
  };

  const handleFinishEdit = () => {
    if (editingId && editText.trim()) {
      // 只有内容变了才发送
      const originalTask = data?.tasks.find(t => t.id === editingId);
      if (originalTask && originalTask.text !== editText) {
         sendAction('UPDATE', { id: editingId, text: editText, dateKey: data?.dateKey });
      }
    }
    setEditingId(null);
    setEditText('');
    setIsInputFocused(false);
  };

  if (!data) {
    return (
      <div className="w-[300px] h-40 p-5 box-border select-none">
        <div className="w-full h-full bg-[#1a1b1e] border border-white/20 rounded-xl flex flex-col items-center justify-center text-slate-400 gap-2 shadow-2xl">
          <Loader2 className="animate-spin text-emerald-500" size={24} />
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
      // [修改] 绑定移入移出事件到最外层容器
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="bg-[#25262b]/95 backdrop-blur-xl border border-white/20 rounded-xl shadow-lg flex flex-col overflow-hidden">
        {/* 标题栏 */}
        <div className="px-3 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between flex-shrink-0 drag-region">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-sm font-bold text-white whitespace-nowrap">{dateKey}</span>
            {specialDayText && <span className="text-[10px] text-emerald-400 truncate">{specialDayText}</span>}
            <span className="text-[10px] text-slate-500 truncate">{dateInfo.fullLunar}</span>
            {total > 0 && (
               <div className="text-[10px] font-mono flex items-center gap-[1px] bg-black/20 px-1.5 py-0.5 rounded ml-2 flex-shrink-0">
                 <span className="text-slate-300 font-bold">{total}</span>
                 <span className={uncompleted > 0 ? "text-yellow-400 font-bold" : "text-slate-600"}>/{uncompleted}</span>
               </div>
             )}
          </div>
          {/* [已删除] 关闭按钮 X */}
        </div>

        {/* 列表 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-2 custom-scrollbar min-h-0 max-h-64 no-drag">
          {tasks.length === 0 ? (
            <div className="flex items-center justify-center text-slate-600 text-xs py-4">暂无事项</div>
          ) : (
            tasks.map(task => (
              <div key={task.id} className="group flex items-center gap-2 p-1.5 hover:bg-white/5 rounded transition-colors">
                <button 
                  onClick={() => sendAction('TOGGLE', { id: task.id, dateKey: data.dateKey })} 
                  className={`flex-shrink-0 ${task.completed ? 'text-emerald-500' : 'text-slate-500 hover:text-emerald-400'}`}
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
                    className="flex-1 min-w-0 bg-black/50 text-xs text-white px-1 py-0.5 rounded outline-none border border-emerald-500/50"
                  />
                ) : (
                  <span 
                    onDoubleClick={() => handleStartEdit(task)}
                    className={`flex-1 text-xs truncate cursor-text select-text ${task.completed ? 'text-slate-600 line-through' : 'text-slate-300'}`} 
                    title="双击编辑"
                  >
                    {task.text}
                  </span>
                )}

                <button 
                  onClick={() => sendAction('DELETE', { id: task.id, dateKey: data.dateKey })} 
                  className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-opacity"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* 输入框 */}
        <div className="p-2 border-t border-white/5 bg-white/[0.02] no-drag">
          <form onSubmit={handleAdd} className="flex items-center gap-2 relative">
            <input 
              autoFocus
              className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-500 transition-colors"
              placeholder="添加新事项..."
              value={localInput}
              onChange={e => setLocalInput(e.target.value)}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
            />
            <button type="submit" disabled={!localInput.trim()} className="absolute right-1.5 top-1.5 text-slate-500 hover:text-emerald-500 disabled:hidden">
              <Plus size={14} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
