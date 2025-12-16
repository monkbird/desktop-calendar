import { useState, useMemo, useEffect, useRef } from 'react';
import type { FC, FormEvent } from 'react';
import { CheckSquare, Square, Plus, Trash2 } from 'lucide-react';
import type { Todo } from '../types';
import { getDateInfo } from '../utils';

interface InteractiveTooltipProps {
  // 传入的是目标单元格的矩形位置，而不是简单的鼠标坐标
  targetRect: DOMRect | null; 
  containerSize: { width: number; height: number };
  tasks: Todo[];
  dateKey: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onAddTodo: (text: string, dateKey: string) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
  onUpdateTodoText: (id: string, newText: string) => void;
}

export const InteractiveTooltip: FC<InteractiveTooltipProps> = ({
  targetRect,
  containerSize,
  tasks,
  dateKey,
  onMouseEnter,
  onMouseLeave,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
  onUpdateTodoText,
}) => {
  if (!targetRect) return null;

  const tooltipRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ x: -9999, y: -9999 }); // 初始隐藏
  const [localInput, setLocalInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const TOOLTIP_WIDTH = 240;
  // 估算高度，或者通过 layoutEffect 动态获取，这里给个最大预估值
  const ESTIMATED_HEIGHT = 220; 
  const GAP = 8; // 间距

  // --- 核心算法：智能定位 ---
  useEffect(() => {
    if (!targetRect) return;

    // 默认尝试放在右侧
    let left = targetRect.right + GAP;
    // 默认尝试放在顶部对齐
    let top = targetRect.top;

    // 1. 水平方向判断
    // 如果右侧空间不足 (当前位置 + 宽 > 容器宽)
    if (left + TOOLTIP_WIDTH > containerSize.width) {
      // 尝试放在左侧
      left = targetRect.left - TOOLTIP_WIDTH - GAP;
    }

    // 2. 如果左侧也放不下 (例如窗口极窄)，强制“贴右边”或“贴左边”
    // 优先保证显示在窗口内
    if (left < 0) left = GAP; // 贴左边
    if (left + TOOLTIP_WIDTH > containerSize.width) left = containerSize.width - TOOLTIP_WIDTH - GAP; // 贴右边

    // 3. 垂直方向判断
    // 如果底部超出
    if (top + ESTIMATED_HEIGHT > containerSize.height) {
        // 尝试向上顶，底边对齐单元格底边
        top = containerSize.height - ESTIMATED_HEIGHT - GAP;
    }
    // 防止顶部溢出
    if (top < 0) top = GAP;

    setPosition({ x: left, y: top });
  }, [targetRect, containerSize.width, containerSize.height]);

  useEffect(() => {
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
  }, []);

  const { total, uncompleted, dateInfo } = useMemo(() => {
    const total = tasks.length;
    const uncompleted = tasks.filter(t => !t.completed).length;

    const [y, m, d] = dateKey.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const info = getDateInfo(dateObj);

    return { total, uncompleted, dateInfo: info };
  }, [tasks, dateKey]);

  const specialDayText = dateInfo.festival || dateInfo.term;

  const handleLocalAdd = (e: FormEvent) => {
    e.preventDefault();
    onAddTodo(localInput, dateKey);
    setLocalInput('');
  };

  const handleStartEdit = (task: Todo) => {
    if (!task.completed) {
      setEditingId(task.id);
      setEditText(task.text);
    }
  };

  const handleFinishEdit = (id: string) => {
    onUpdateTodoText(id, editText);
    setEditingId(null);
  };

  return (
    <div 
      ref={tooltipRef}
      className="fixed z-50 bg-[#25262b] border border-white/10 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden animate-in fade-in duration-150"
      style={{ 
        width: TOOLTIP_WIDTH,
        left: position.x, 
        top: position.y,
        // 加上 backdrop-blur 增强覆盖感
        backdropFilter: 'blur(12px)'
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* 标题栏 */}
      <div className="px-3 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
         <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-xs font-bold text-white whitespace-nowrap">{dateKey}</span>
            {specialDayText && (
               <span className="text-[10px] text-emerald-400 font-medium truncate">{specialDayText}</span>
            )}
            <span className="text-[10px] text-slate-500 truncate">{dateInfo.fullLunar}</span>
         </div>

         {total > 0 && (
           <div className="text-[10px] font-mono flex items-center gap-[1px] bg-black/20 px-1.5 py-0.5 rounded ml-2 flex-shrink-0">
             <span className="text-slate-300 font-bold">{total}</span>
             <span className={uncompleted > 0 ? "text-yellow-400 font-bold" : "text-slate-600"}>/{uncompleted}</span>
           </div>
         )}
      </div>

      {/* 列表区 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-1 py-1 custom-scrollbar min-h-[60px] max-h-[180px]">
          {tasks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 py-4">
                  <p className="text-[10px]">暂无事项</p>
              </div>
          ) : (
              tasks.map(task => (
                  <div key={task.id} className="group relative flex items-center gap-1.5 px-2 hover:bg-white/5 transition-colors h-6 rounded-md">
                      <button 
                          onClick={() => onToggleTodo(task.id)}
                          className={`p-0 bg-transparent border-none focus:outline-none flex-shrink-0 flex items-center justify-center cursor-pointer
                              ${task.completed ? 'text-emerald-500' : 'text-slate-600 hover:text-emerald-400'}`}
                      >
                          {task.completed ? <CheckSquare size={13} /> : <Square size={13} />}
                      </button>
                      
                      <div className="flex-1 min-w-0 flex items-center h-full">
                          {editingId === task.id ? (
                              <input 
                                  autoFocus
                                  type="text"
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  onBlur={() => handleFinishEdit(task.id)}
                                  onKeyDown={(e) => e.key === 'Enter' && handleFinishEdit(task.id)}
                                  className="w-full bg-black/50 text-[11px] text-white px-1 h-5 leading-5 rounded outline-none border border-emerald-500/50"
                              />
                          ) : (
                              <p 
                                  className={`text-[11px] leading-none truncate cursor-text w-full ${task.completed ? 'text-slate-600 line-through' : 'text-slate-300'}`}
                                  onClick={() => handleStartEdit(task)}
                                  title={task.text}
                              >
                                  {task.text}
                              </p>
                          )}
                      </div>

                      {!editingId && (
                          <button 
                              onClick={() => onDeleteTodo(task.id)}
                              className="p-0 bg-transparent border-none focus:outline-none opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-colors flex items-center justify-center h-full px-1"
                          >
                              <Trash2 size={12} />
                          </button>
                      )}
                  </div>
              ))
          )}
      </div>

      {/* 底部输入栏 */}
      <div className="px-2 py-1.5 border-t border-white/5 bg-white/[0.02]">
          <form onSubmit={handleLocalAdd} className="relative flex items-center">
              <input
                  type="text"
                  value={localInput}
                  onChange={(e) => setLocalInput(e.target.value)}
                  placeholder="添加新事项..."
                  className="w-full bg-transparent border-none text-[11px] text-white focus:outline-none placeholder-slate-600 p-0 pr-5"
              />
              <button 
                  type="submit" 
                  disabled={!localInput.trim()}
                  className="p-0 bg-transparent border-none focus:outline-none absolute right-0 text-slate-600 hover:text-emerald-500 disabled:opacity-0 transition-all flex items-center"
              >
                  <Plus size={14} />
              </button>
          </form>
      </div>
    </div>
  );
};
