import { useMemo, useEffect, useRef } from 'react';
import { X, Trash2, RotateCcw, Calendar, CheckCircle2 } from 'lucide-react';
import type { Todo } from '../types';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  todos: Todo[];
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
}

export const HistoryModal = ({ isOpen, onClose, todos, onToggleTodo, onDeleteTodo }: HistoryModalProps) => {
  // 1. 获取已完成的任务并按时间倒序排列
  // 将 useMemo 提到 if 之前，符合 React Hook 规范，避免潜在报错
  const historyGroups = useMemo(() => {
    const completed = todos.filter(t => t.completed);
    
    // 按月份分组
    const groups: Record<string, Todo[]> = {};
    
    // [修复1] 增加数据安全性检查，防止 targetDate 为空或非字符串导致崩溃
    completed.forEach(t => {
      // 确保 targetDate 是字符串，如果无效则使用空字符串
      const dateStr = typeof t.targetDate === 'string' ? t.targetDate : String(t.targetDate || '');
      
      // 只有日期格式足够长才截取前7位(YYYY-MM)，否则归类到 '未知日期'
      const month = dateStr.length >= 7 ? dateStr.slice(0, 7) : '未知日期';
      
      if (!groups[month]) groups[month] = [];
      groups[month].push(t);
    });

    // 排序月份（倒序，最近的月份在最前）
    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map(month => ({
        month,
        // [修复2] 这里的 sort 也要加防护！先转成字符串再比较，防止脏数据导致 localeCompare 报错
        tasks: groups[month].sort((a, b) => {
          const dateA = String(a.targetDate || '');
          const dateB = String(b.targetDate || '');
          return dateB.localeCompare(dateA);
        })
      }));
  }, [todos]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen]);

  // 2. 如果不显示，直接返回 null
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-[#1a1b1e] border border-white/10 rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#202124]">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 size={16} />
            <h2 className="text-sm font-bold text-slate-200">已完成事项归档</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
          {historyGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-600 gap-3">
              <Calendar size={40} className="opacity-20" />
              <p className="text-xs">暂无已完成的历史记录</p>
            </div>
          ) : (
            historyGroups.map(group => (
              <div key={group.month} className="space-y-2">
                {/* 月份标题 - 只有年份和月份变化时显示 */}
                <div className="sticky top-0 z-10 bg-[#1a1b1e]/95 backdrop-blur py-1 border-b border-white/5">
                  <h3 className="text-[11px] font-bold text-emerald-500/80 flex items-center gap-2">
                    {group.month}
                  </h3>
                </div>
                
                <div className="space-y-1">
                  {group.tasks.map(task => (
                    <div key={task.id} className="group flex items-start gap-3 p-2 rounded-lg bg-white/[0.03] hover:bg-white/5 transition-colors border border-transparent hover:border-white/5">
                      {/* 日期 Badge - 这里显示时也要防错，虽然逻辑上已经处理过 */}
                      <div className="mt-0.5 px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-slate-500 font-mono flex-shrink-0">
                        {String(task.targetDate || '').length >= 10 ? String(task.targetDate).slice(8) : '??'}日
                      </div>
                      
                      {/* 任务文本 */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-400 line-through decoration-slate-600/50 break-all">
                          {task.text}
                        </p>
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => onToggleTodo(task.id)}
                          title="撤销完成（放回日历）"
                          className="p-1 text-slate-500 hover:text-emerald-400 hover:bg-white/10 rounded"
                        >
                          <RotateCcw size={12} />
                        </button>
                        <button 
                          onClick={() => onDeleteTodo(task.id)}
                          title="永久删除"
                          className="p-1 text-slate-500 hover:text-red-400 hover:bg-white/10 rounded"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-white/5 border-t border-white/10 text-[10px] text-slate-500 flex justify-between">
          <span>共 {historyGroups.reduce((acc, g) => acc + g.tasks.length, 0)} 条历史记录</span>
        </div>
      </div>
      
      {/* 点击遮罩关闭 */}
      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>
  );
};
