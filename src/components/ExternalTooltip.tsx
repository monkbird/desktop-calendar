import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { CheckSquare, Square, Plus, Trash2, X, Loader2 } from 'lucide-react';
import type { Todo } from '../types';
import { getDateInfo } from '../utils';

export const ExternalTooltip = () => {
  const [data, setData] = useState<{ dateKey: string; tasks: Todo[] } | null>(null);
  const [localInput, setLocalInput] = useState('');
  
  const [isInputFocused, setIsInputFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- [新增] 2秒无操作自动关闭逻辑 ---
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const hide = () => {
      if (isInputFocused) return;
      window.desktopCalendar?.hideTooltip?.();
    };

    const resetActivity = () => {
      clearTimeout(timer);
      if (!isInputFocused) {
        timer = setTimeout(hide, 2000); // 2秒无操作则隐藏
      }
    };

    // 初始启动计时
    resetActivity();

    // 监听各种用户操作，有操作就重置计时
    window.addEventListener('mousemove', resetActivity);
    window.addEventListener('mousedown', resetActivity);
    window.addEventListener('keydown', resetActivity);
    window.addEventListener('wheel', resetActivity);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', resetActivity);
      window.removeEventListener('mousedown', resetActivity);
      window.removeEventListener('keydown', resetActivity);
      window.removeEventListener('wheel', resetActivity);
    };
  }, [data, isInputFocused]); // 依赖 data，确保每次切换日期时也重置计时

  useEffect(() => {
    const removeListener = window.desktopCalendar?.onUpdateTooltip((payload) => {
      setData(payload);
    });
    return () => removeListener?.();
  }, []);

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

  if (!data) {
    return (
      <div ref={containerRef} className="w-[300px] h-40 p-5 box-border select-none">
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
    <div ref={containerRef} className="w-[300px] h-fit p-5 box-border select-none">
      <div className="bg-[#25262b]/95 backdrop-blur-xl border border-white/20 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* 标题栏 */}
        <div className="px-3 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between flex-shrink-0 drag-region">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-sm font-bold text-white whitespace-nowrap">{dateKey}</span>
            {specialDayText && <span className="text-[10px] text-emerald-400 truncate">{specialDayText}</span>}
            <span className="text-[10px] text-slate-500 truncate">{dateInfo.fullLunar}</span>

            {/* [新增] 修复点2：统计 Badge UI */}
            {total > 0 && (
               <div className="text-[10px] font-mono flex items-center gap-[1px] bg-black/20 px-1.5 py-0.5 rounded ml-2 flex-shrink-0">
                 <span className="text-slate-300 font-bold">{total}</span>
                 <span className={uncompleted > 0 ? "text-yellow-400 font-bold" : "text-slate-600"}>/{uncompleted}</span>
               </div>
             )}

          </div>
          <button onClick={() => sendAction('CX', null)} className="text-slate-500 hover:text-white transition-colors cursor-pointer no-drag">
             <X size={14}/>
          </button>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto px-2 py-2 custom-scrollbar min-h-0 max-h-64 no-drag">
          {tasks.length === 0 ? (
            <div className="flex items-center justify-center text-slate-600 text-xs py-4">暂无事项</div>
          ) : (
            tasks.map(task => (
              <div key={task.id} className="group flex items-center gap-2 p-1.5 hover:bg-white/5 rounded transition-colors">
                <button 
                  // [修改] Payload 改为对象，包含 id 和 dateKey
                  onClick={() => sendAction('TOGGLE', { id: task.id, dateKey: data.dateKey })} 
                  className={`flex-shrink-0 ${task.completed ? 'text-emerald-500' : 'text-slate-500 hover:text-emerald-400'}`}
                >
                  {task.completed ? <CheckSquare size={14} /> : <Square size={14} />}
                </button>
                <span className={`flex-1 text-xs truncate cursor-default ${task.completed ? 'text-slate-600 line-through' : 'text-slate-300'}`} title={task.text}>
                  {task.text}
                </span>
                <button 
                  // [修改] Payload 改为对象，包含 id 和 dateKey
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