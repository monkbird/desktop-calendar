import { useState, useMemo } from 'react';
import { X, Search, Calendar, ArrowRight } from 'lucide-react';
import type { Todo } from '../types';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  todos: Todo[];
  onNavigate: (date: Date) => void;
}

export const SearchModal = ({ isOpen, onClose, todos, onNavigate }: SearchModalProps) => {
  const [query, setQuery] = useState('');

  const filteredTodos = useMemo(() => {
    if (!query.trim()) return [];
    
    return todos.filter(t => 
      // 增加防护：确保 text 存在且为字符串再调用 toLowerCase
      (t.text ? String(t.text) : '').toLowerCase().includes(query.toLowerCase())
    ).sort((a, b) => {
      // [关键修复] 强制转换为字符串，防止脏数据(如数字)导致 localeCompare 崩溃
      const dateA = String(a.targetDate || '');
      const dateB = String(b.targetDate || '');
      return dateB.localeCompare(dateA);
    });
  }, [todos, query]);

  const handleJump = (dateString: string) => {
    // 同样增加防护，防止传入非字符串
    if (typeof dateString !== 'string') return;
    
    const [y, m, d] = dateString.split('-').map(Number);
    if (y && m && d) {
        onNavigate(new Date(y, m - 1, d));
        onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center pt-10 px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-[#1a1b1e] border border-white/10 rounded-xl shadow-2xl flex flex-col max-h-[80vh] animate-in slide-in-from-top-4 duration-200">
        
        {/* Header with Input */}
        <div className="p-3 border-b border-white/10 flex items-center gap-2">
          <Search size={16} className="text-slate-400" />
          <input 
            autoFocus
            className="flex-1 bg-transparent outline-none text-sm text-white placeholder-slate-500"
            placeholder="搜索待办事项..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
          {filteredTodos.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              {query ? '未找到相关结果' : '输入关键词开始搜索'}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredTodos.map(todo => (
                <button
                  key={todo.id}
                  onClick={() => handleJump(String(todo.targetDate))} // 确保传递给 handleJump 的也是字符串
                  className="w-full text-left p-2 rounded hover:bg-white/5 group flex items-center justify-between transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-slate-200 truncate">{todo.text}</div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5 font-mono">
                      <Calendar size={10} />
                      {/* 显示时也进行容错处理 */}
                      {typeof todo.targetDate === 'string' ? todo.targetDate : '未知日期'}
                      {todo.completed ? (
                        <span className="text-emerald-500 ml-1">✓ 已完成</span>
                      ) : (
                        <span className="text-yellow-500 ml-1">○ 未完成</span>
                      )}
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-slate-600 group-hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition-all" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Overlay click to close */}
      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>
  );
};