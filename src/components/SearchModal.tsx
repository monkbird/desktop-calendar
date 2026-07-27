import { useState, useMemo, useEffect, useRef } from 'react';
import { X, Search, Calendar, ArrowRight } from 'lucide-react';
import type { Todo } from '../types';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  todos: Todo[];
  onNavigate: (date: Date) => void;
  /** bare 模式：只渲染卡片本身（供侧贴菜单窗口内嵌使用），不带遮罩层 */
  bare?: boolean;
}

export const SearchModal = ({ isOpen, onClose, todos, onNavigate, bare = false }: SearchModalProps) => {
  const [query, setQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

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

  if (!isOpen) return null;

  const card = (
    <div className={`${bare ? 'w-80 h-[440px]' : 'w-full max-w-sm max-h-[80vh] animate-in slide-in-from-top-4 duration-200'} bg-elevated border border-line rounded-xl shadow-2xl flex flex-col`}>

      {/* Header with Input */}
      <div className="p-3 border-b border-line flex items-center gap-2">
        <Search size={16} className="text-ink3" />
        <input
          autoFocus
          className="flex-1 bg-transparent outline-none text-sm text-ink placeholder-ink3"
          placeholder="搜索待办事项..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button onClick={onClose} className="text-ink3 hover:text-ink">
          <X size={16} />
        </button>
      </div>

      {/* Results */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        {filteredTodos.length === 0 ? (
          <div className="text-center py-8 text-ink3 text-xs">
            {query ? '未找到相关结果' : '输入关键词开始搜索'}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredTodos.map((todo, index) => (
              <button
                key={todo.id}
                onClick={() => handleJump(String(todo.targetDate))} // 确保传递给 handleJump 的也是字符串
                className="w-full text-left p-2 rounded hover:bg-hover group flex items-center justify-between transition-colors animate-toolbar-stagger"
                style={{ animationDelay: `${Math.min(index, 10) * 110}ms` }}
              >
                <div className="min-w-0">
                  <div className="text-sm text-ink2 truncate">{todo.text}</div>
                  <div className="text-[10px] text-ink3 flex items-center gap-1 mt-0.5 font-mono">
                    <Calendar size={10} />
                    {/* 显示时也进行容错处理 */}
                    {typeof todo.targetDate === 'string' ? todo.targetDate : '未知日期'}
                    {todo.completed ? (
                      <span className="text-mint-deep ml-1">✓ 已完成</span>
                    ) : (
                      <span className="text-warn ml-1">○ 未完成</span>
                    )}
                  </div>
                </div>
                <ArrowRight size={14} className="text-ink3 group-hover:text-mint opacity-0 group-hover:opacity-100 transition-all" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // bare 模式：仅卡片（嵌入侧贴菜单窗口）
  if (bare) return card;

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center pt-10 px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      {card}
      {/* Overlay click to close */}
      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>
  );
};
