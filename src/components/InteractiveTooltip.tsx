import { useState, useMemo } from 'react';
import type { FC, FormEvent } from 'react';
import { CheckSquare, Square, Plus, Trash2 } from 'lucide-react';
import type { Todo, HoverState } from '../types';
import { getDateInfo } from '../utils';

interface InteractiveTooltipProps {
  hoverState: HoverState | null;
  tasks: Todo[];
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onAddTodo: (text: string, dateKey: string) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
  onUpdateTodoText: (id: string, newText: string) => void;
}

export const InteractiveTooltip: FC<InteractiveTooltipProps> = ({
  hoverState,
  tasks,
  onMouseEnter,
  onMouseLeave,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
  onUpdateTodoText,
}) => {
  if (!hoverState) return null;

  const [localInput, setLocalInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const { total, uncompleted, completed, dateInfo } = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const uncompleted = total - completed;

    const [y, m, d] = hoverState.dateKey.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const info = getDateInfo(dateObj);

    return { total, uncompleted, completed, dateInfo: info };
  }, [tasks, hoverState.dateKey]);

  const specialDayText = dateInfo.festival || dateInfo.term;

  const handleLocalAdd = (e: FormEvent) => {
    e.preventDefault();
    onAddTodo(localInput, hoverState.dateKey);
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
      className="fixed z-50 w-[240px] bg-[#25262b] border border-white/10 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.6)] flex flex-col animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
      style={{ left: hoverState.x, top: hoverState.y }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* 标题栏 */}
      <div className="px-3 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
         <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-xs font-bold text-white whitespace-nowrap">{hoverState.dateKey}</span>
            {specialDayText && (
               <span className="text-[10px] text-emerald-400 font-medium truncate">{specialDayText}</span>
            )}
            <span className="text-[10px] text-slate-500 truncate">{dateInfo.fullLunar}</span>
         </div>

         {total > 0 && (
           <div className="text-[10px] font-mono flex items-center gap-[1px] bg-black/20 px-1.5 py-0.5 rounded ml-2 flex-shrink-0">
             <span className="text-slate-300 font-bold">{total}</span>
             <span className="text-slate-600">(</span>
             <span className={uncompleted > 0 ? "text-yellow-400 font-bold" : "text-slate-600"}>{uncompleted}</span>
             <span className="text-slate-600">,</span>
             <span className="text-slate-500">{completed}</span>
             <span className="text-slate-600">)</span>
           </div>
         )}
      </div>

      {/* 列表区 - 修改：py-0 去除上下内边距 */}
      <div className="max-h-[200px] overflow-y-auto px-1 py-0 custom-scrollbar">
          {tasks.length === 0 ? (
              <div className="py-4 text-center">
                  <p className="text-slate-600 text-[10px]">暂无事项</p>
              </div>
          ) : (
              tasks.map(task => (
                  <div key={task.id} className="group relative flex items-center gap-1.5 px-2 py-0 hover:bg-white/5 transition-colors h-5">
                      {/* 修改重点：
                          1. 外层 div 加上 h-5 固定高度 (20px)，非常紧凑
                          2. py-0 去除所有垂直内边距 
                          3. 按钮和文本垂直居中 
                      */}
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
                                  className="w-full bg-black/50 text-[11px] text-white px-1 py-0 h-4 leading-4 rounded outline-none border border-emerald-500/50"
                              />
                          ) : (
                              <p 
                                  className={`text-[11px] leading-none truncate cursor-text pt-[1px] ${task.completed ? 'text-slate-600 line-through' : 'text-slate-300'}`}
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
                              className="p-0 bg-transparent border-none focus:outline-none opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-colors flex items-center justify-center h-full"
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
                  placeholder="添加..."
                  className="w-full bg-transparent border-none text-[11px] text-white focus:outline-none placeholder-slate-700 p-0 pr-5"
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
