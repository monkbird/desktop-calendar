import { useState, useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Calendar as CalendarIcon, RotateCcw, Lock, Unlock, Minus, Square, ChevronLeft, ChevronRight, X, Check, Trash2 } from 'lucide-react';
import type { Todo, WindowState, HoverState } from './types';
import { CHINESE_NUMS, SOLAR_TERMS, getDaysInMonth, getFirstDayOfMonth, formatDateKey, getLunarText } from './utils';
import { InteractiveTooltip } from './components/InteractiveTooltip';
import { CalendarCell } from './components/CalendarCell';

export default function App() {
  // --- 状态管理 ---
  const [isLocked, setIsLocked] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [winState, setWinState] = useState<WindowState>({ x: 50, y: 50, width: 800, height: 550 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const [todos, setTodos] = useState<Todo[]>(() => {
    const saved = localStorage.getItem('desktop-todos-v8');
    const todayStr = formatDateKey(new Date());
    return saved ? JSON.parse(saved) : [
      { id: '1', text: '安康杯安全竞赛准备', completed: false, targetDate: todayStr },
      { id: '2', text: '26年QC报告', completed: false, targetDate: todayStr },
      { id: '3', text: '安全隐患排查', completed: false, targetDate: todayStr },
      { id: '4', text: '历史任务归档', completed: true, targetDate: '2023-01-01' },
    ];
  });
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  
  // 悬停状态
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- 持久化 ---
  useEffect(() => {
    localStorage.setItem('desktop-todos-v8', JSON.stringify(todos));
  }, [todos]);

  // --- 窗口交互 (拖拽/缩放) ---
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isLocked) return;
      if (isDragging) {
        let newX = e.clientX - dragOffset.current.x;
        let newY = e.clientY - dragOffset.current.y;
        const snapThreshold = 20;
        if (Math.abs(newX) < snapThreshold) newX = 0;
        if (Math.abs(newY) < snapThreshold) newY = 0;
        if (Math.abs(newX + winState.width - window.innerWidth) < snapThreshold) newX = window.innerWidth - winState.width;
        setWinState(prev => ({ ...prev, x: newX, y: newY }));
      }
      if (isResizing && !isCollapsed) {
        const newWidth = Math.max(320, e.clientX - winState.x);
        const newHeight = Math.max(300, e.clientY - winState.y);
        setWinState(prev => ({ ...prev, width: newWidth, height: newHeight }));
      }
    };
    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };
    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, isLocked, isCollapsed, winState]);

  const startDrag = (e: ReactMouseEvent) => {
    if (isLocked) return;
    if ((e.target as HTMLElement).closest('button')) return;
    setIsDragging(true);
    dragOffset.current = { x: e.clientX - winState.x, y: e.clientY - winState.y };
  };

  const startResize = (e: ReactMouseEvent) => {
    if (isLocked || isCollapsed) return;
    e.stopPropagation();
    setIsResizing(true);
  };

  // --- 鼠标悬停逻辑 ---
  const handleMouseEnterCell = (dateKey: string, e: ReactMouseEvent) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    if (isDragging || isResizing) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const tooltipWidth = 260; 
    let x = rect.right + 5;
    let y = rect.top;

    if (x + tooltipWidth > window.innerWidth) x = rect.left - tooltipWidth - 5;
    if (y + 350 > window.innerHeight) y = window.innerHeight - 350;
    if (y < 0) y = 10;

    if (hoverState?.dateKey !== dateKey) {
        setHoverState({ dateKey, x, y });
    }
  };

  const handleMouseLeaveAnywhere = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
        setHoverState(null);
    }, 300);
  };

  const keepTooltipOpen = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  };

  // --- 待办逻辑 ---
  const today = new Date();
  const todayKey = formatDateKey(today);

  const getTasksForDate = (dateKey: string) => {
    const isToday = dateKey === todayKey;
    return todos.filter(todo => {
      if (todo.completed) return todo.targetDate === dateKey;
      if (isToday) return todo.targetDate <= dateKey;
      if (dateKey > todayKey) return todo.targetDate === dateKey;
      return false; 
    }).sort((a, b) => {
      // 排序：未完成在前
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return 0;
    });
  };

  const handleAddTodo = (text: string, dateKey: string) => {
    if (!text.trim()) return;
    const newTodo: Todo = { id: crypto.randomUUID(), text, completed: false, targetDate: dateKey };
    setTodos([...todos, newTodo]);
  };

  const handleToggleTodo = (id: string) => {
    setTodos(todos.map(todo => todo.id === id ? { ...todo, completed: !todo.completed } : todo));
  };

  const handleDeleteTodo = (id: string) => {
    setTodos(todos.filter(todo => todo.id !== id));
  };

  const handleUpdateTodoText = (id: string, newText: string) => {
    if (!newText.trim()) return;
    setTodos(todos.map(t => t.id === id ? { ...t, text: newText } : t));
  };

  // --- 渲染 ---
  const isMiniMode = winState.width < 500 || winState.height < 450;
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const calendarCells = [];
  
  for (let i = 0; i < firstDay; i++) calendarCells.push(<div key={`empty-${i}`} className="border-r border-b border-white/5 bg-transparent"></div>);
  
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    const dateKey = formatDateKey(d);
    const isToday = dateKey === todayKey;
    const term = SOLAR_TERMS[`${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`];
    
    calendarCells.push(
      <CalendarCell 
        key={dateKey}
        day={i}
        dateKey={dateKey}
        isToday={isToday}
        tasks={getTasksForDate(dateKey)}
        term={term}
        lunar={getLunarText(i, month)}
        isMiniMode={isMiniMode}
        onMouseEnter={handleMouseEnterCell}
        onMouseLeave={handleMouseLeaveAnywhere}
        onDoubleClick={setSelectedDateKey}
      />
    );
  }

  return (
    <div 
      className="fixed inset-0 overflow-hidden bg-cover bg-center select-none"
      style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1475274047050-1d0c0975c63e?q=80&w=2072&auto=format&fit=crop")' }}
    >
      <div 
        style={{ 
          transform: `translate(${winState.x}px, ${winState.y}px)`,
          width: winState.width,
          height: isCollapsed ? 48 : winState.height,
        }}
        className={`absolute flex flex-col bg-[#1a1b1e]/90 backdrop-blur-xl border rounded-xl shadow-2xl overflow-hidden ring-1 ring-black/20 transition-[height] duration-300 ease-in-out
          ${isLocked ? 'border-red-500/30' : 'border-white/10'}
        `}
      >
        {/* --- 标题栏 --- */}
        <div 
          onMouseDown={startDrag}
          className={`h-12 flex items-center justify-between px-3 border-b border-white/10 bg-[#202124]/80 flex-shrink-0
            ${isLocked ? 'cursor-not-allowed' : 'cursor-move'}
          `}
        >
          <div className="flex items-center gap-2">
            <CalendarIcon size={16} className="text-emerald-400" />
            <span className="text-sm font-medium text-slate-200">桌面日历</span>
            {isMiniMode && !isCollapsed && <span className="text-[10px] bg-white/10 text-slate-400 px-1 rounded">Mini</span>}
          </div>

          <div className="flex items-center gap-1">
            <button onClick={() => setIsLocked(!isLocked)} className={`p-1.5 rounded hover:bg-white/10 transition-colors ${isLocked ? 'text-red-400' : 'text-slate-400'}`}>
              {isLocked ? <Lock size={14} /> : <Unlock size={14} />}
            </button>
            <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-1.5 rounded hover:bg-white/10 text-slate-400 transition-colors">
              {isCollapsed ? <Square size={14} /> : <Minus size={14} />}
            </button>
          </div>
        </div>

        {/* --- 主体内容 --- */}
        <div className={`flex-1 flex flex-col min-h-0 relative ${isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'} transition-opacity duration-200`}>
          <div className="flex items-center justify-between px-4 py-2 bg-[#202124]/30 flex-shrink-0">
             <h2 className="text-lg font-light text-white flex items-end gap-1">
               <span>{year}</span><span className="text-emerald-500">.</span><span>{String(month + 1).padStart(2, '0')}</span>
             </h2>
             <div className="flex gap-1">
               <button onClick={() => { setCurrentDate(new Date()); setSelectedDateKey(todayKey); }} className="p-1 hover:bg-white/10 rounded text-emerald-400" title="回到今天">
                 <RotateCcw size={14} />
               </button>
               <div className="flex bg-white/5 rounded">
                 <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-1 hover:bg-white/10 rounded-l text-slate-300"><ChevronLeft size={16} /></button>
                 <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-1 hover:bg-white/10 rounded-r text-slate-300"><ChevronRight size={16} /></button>
               </div>
             </div>
          </div>

          <div className="grid grid-cols-7 border-b border-white/5 bg-black/10 flex-shrink-0">
            {CHINESE_NUMS.slice(0, 7).map((d,i)=>(
              <div key={i} className="text-[10px] text-slate-500 py-1 text-center">{d}</div>
            ))}
          </div>

          <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-hidden bg-[#1a1b1e]">
            {calendarCells}
          </div>

          {!isLocked && (
            <div 
              onMouseDown={startResize}
              className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-0.5 z-20 group hover:bg-white/5 rounded-tl"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="text-slate-600 group-hover:text-emerald-400 transition-colors">
                 <path d="M11 1L11 11L1 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
          )}
        </div>

        {/* --- 保留的双击详情弹窗 (可选) --- */}
        {selectedDateKey && !isCollapsed && (
          <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="w-full max-w-[320px] bg-[#25262b] border border-white/20 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80%]">
               <div className="p-3 border-b border-white/10 bg-white/5 flex justify-between items-center">
                 <div>
                    <div className="text-[10px] text-emerald-400 font-bold">详细编辑模式</div>
                    <div className="text-lg text-white font-medium">{selectedDateKey}</div>
                 </div>
                 <button onClick={() => setSelectedDateKey(null)} className="p-1 hover:bg-white/10 rounded-full text-slate-400"><X size={16} /></button>
               </div>
               <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                 {getTasksForDate(selectedDateKey).map(t => (
                   <div key={t.id} className="flex gap-2 items-start p-2 rounded hover:bg-white/5 group bg-black/20">
                     <button onClick={() => handleToggleTodo(t.id)} className={`mt-0.5 w-3.5 h-3.5 rounded border flex items-center justify-center ${t.completed ? 'bg-emerald-600 border-transparent' : 'border-slate-500'}`}>
                        {t.completed && <Check size={8} className="text-white"/>}
                     </button>
                     <span className={`flex-1 text-xs break-all ${t.completed ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{t.text}</span>
                     <button onClick={() => handleDeleteTodo(t.id)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400"><Trash2 size={10}/></button>
                   </div>
                 ))}
               </div>
               <div className="p-2 border-t border-white/10 bg-white/5 flex gap-2">
                 <input autoFocus value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder="添加..." className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:border-emerald-500 outline-none" />
                 <button onClick={() => { handleAddTodo(inputValue, selectedDateKey); setInputValue(''); }} disabled={!inputValue.trim()} className="bg-emerald-600 px-3 py-1.5 rounded text-white text-xs disabled:opacity-50">添加</button>
               </div>
             </div>
             <div className="absolute inset-0 -z-10" onClick={() => setSelectedDateKey(null)}></div>
          </div>
        )}
      </div>

      <InteractiveTooltip 
        hoverState={hoverState}
        tasks={hoverState ? getTasksForDate(hoverState.dateKey) : []}
        onMouseEnter={keepTooltipOpen}
        onMouseLeave={handleMouseLeaveAnywhere}
        onAddTodo={handleAddTodo}
        onToggleTodo={handleToggleTodo}
        onDeleteTodo={handleDeleteTodo}
        onUpdateTodoText={handleUpdateTodoText}
      />
    </div>
  );
}
