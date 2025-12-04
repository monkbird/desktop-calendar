import { useState } from 'react';
import type { FC, FormEvent } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import type { Todo, HoverState } from '../types';

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
      className="fixed z-50 w-[260px] bg-[#25262b] border border-white/10 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.6)] flex flex-col animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
      style={{ left: hoverState.x, top: hoverState.y }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* 标题栏 */}
      <div className="px-4 py-3 bg-white/5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
         <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">{hoverState.dateKey}</span>
            {tasks.length > 0 && <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-1.5 py-0.5 rounded-full font-medium">{tasks.length}</span>}
         </div>
         <div className="text-[10px] text-slate-500">双击日历全屏查看</div>
      </div>

      {/* 列表区 */}
      <div className="max-h-[250px] overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {tasks.length === 0 ? (
              <div className="py-6 text-center">
                  <p className="text-slate-500 text-xs mb-1">暂无待办</p>
                  <p className="text-slate-600 text-[10px]">在下方添加一个吧</p>
              </div>
          ) : (
              tasks.map(task => (
                  <div key={task.id} className="group relative flex items-start gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors">
                      <button 
                          onClick={() => onToggleTodo(task.id)}
                          className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer
                              ${task.completed ? 'bg-emerald-600 border-transparent' : 'border-slate-500 hover:border-emerald-400'}`}
                      >
                          {task.completed && <Check size={10} className="text-white" strokeWidth={3} />}
                      </button>
                      
                      <div className="flex-1 min-w-0">
                          {editingId === task.id ? (
                              <input 
                                  autoFocus
                                  type="text"
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  onBlur={() => handleFinishEdit(task.id)}
                                  onKeyDown={(e) => e.key === 'Enter' && handleFinishEdit(task.id)}
                                  className="w-full bg-black/50 text-xs text-white px-1 py-0.5 rounded outline-none border border-emerald-500/50"
                              />
                          ) : (
                              <p 
                                  className={`text-xs leading-relaxed break-words cursor-text ${task.completed ? 'text-slate-500 line-through' : 'text-slate-200'}`}
                                  onClick={() => handleStartEdit(task)}
                                  title="点击编辑文本"
                              >
                                  {task.text}
                              </p>
                          )}
                      </div>

                      {!editingId && (
                          <button 
                              onClick={() => onDeleteTodo(task.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-all absolute right-1 top-1"
                          >
                              <Trash2 size={12} />
                          </button>
                      )}
                  </div>
              ))
          )}
      </div>

      {/* 底部输入栏 */}
      <div className="p-3 border-t border-white/5 bg-white/[0.02]">
          <form onSubmit={handleLocalAdd} className="relative">
              <input
                  type="text"
                  value={localInput}
                  onChange={(e) => setLocalInput(e.target.value)}
                  placeholder="添加新事项..."
                  className="w-full bg-black/30 border border-white/10 rounded-lg py-2 pl-3 pr-8 text-xs text-white focus:outline-none focus:border-emerald-500/50 focus:bg-black/50 transition-all placeholder-slate-600"
              />
              <button 
                  type="submit" 
                  disabled={!localInput.trim()}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-emerald-500 hover:bg-emerald-500/10 rounded disabled:opacity-30 disabled:hover:bg-transparent"
              >
                  <Plus size={14} />
              </button>
          </form>
      </div>
    </div>
  );
};
