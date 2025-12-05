import { useState, useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { 
  Calendar as CalendarIcon, 
  RotateCcw, 
  Lock, 
  Unlock, 
  Minus, 
  Square, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Check, 
  Trash2,
  History 
} from 'lucide-react';
import type { Todo, HoverState } from './types';
import { 
  CHINESE_NUMS, 
  getDaysInMonth, 
  getFirstDayOfMonth, 
  formatDateKey, 
  getDateInfo 
} from './utils';
import { InteractiveTooltip } from './components/InteractiveTooltip';
import { CalendarCell } from './components/CalendarCell';
import { HistoryModal } from './components/HistoryModal'; 

export default function App() {
  const [isLocked, setIsLocked] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false); 

  // 默认宽高度
  const [winSize, setWinSize] = useState({ width: 800, height: 550 });
  const [isResizing, setIsResizing] = useState(false);
  
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
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nowDate, setNowDate] = useState(new Date());

  // --- 详细编辑模式的状态 ---
  const [modalEditingId, setModalEditingId] = useState<string | null>(null);
  const [modalEditText, setModalEditText] = useState('');

  // --- 窗口大小同步逻辑 ---
  useEffect(() => {
    setWinSize({ width: window.innerWidth, height: window.innerHeight });
    const handleResize = () => {
      setWinSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 折叠逻辑
  useEffect(() => {
    if (isCollapsed) {
       window.desktopCalendar?.resizeWindow({ width: winSize.width, height: 48 });
    } else {
       if (winSize.height < 100) { 
          window.desktopCalendar?.resizeWindow({ width: winSize.width, height: 550 });
       }
    }
  }, [isCollapsed]);

  // 自动刷新日期
  useEffect(() => {
    const now = new Date();
    const night = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    const msToMidnight = night.getTime() - now.getTime();
    const timer = setTimeout(() => { setNowDate(new Date()); }, msToMidnight + 1000); 
    return () => clearTimeout(timer);
  }, [nowDate]); 

  useEffect(() => {
    localStorage.setItem('desktop-todos-v8', JSON.stringify(todos));
  }, [todos]);

  // --- 调整大小逻辑 ---
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing && !isCollapsed) {
        const newWidth = Math.max(320, e.clientX);
        const newHeight = Math.max(300, e.clientY);
        window.desktopCalendar?.resizeWindow({ width: newWidth, height: newHeight });
      }
    };
    const handleMouseUp = () => {
      setIsResizing(false);
    };
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, isCollapsed]);

  const startResize = (e: ReactMouseEvent) => {
    if (isLocked || isCollapsed) return;
    e.stopPropagation();
    setIsResizing(true);
  };

  const today = nowDate;
  const todayKey = formatDateKey(today);
  
  const getTasksForDate = (dateKey: string) => {
    const isToday = dateKey === todayKey;
    return todos.filter(todo => {
      if (todo.completed) return todo.targetDate === dateKey;
      if (isToday) return todo.targetDate <= dateKey;
      if (dateKey > todayKey) return todo.targetDate === dateKey;
      return false; 
    }).sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return 0;
    });
  };

  // --- 关键修复：弹窗定位逻辑 (Smart Clamping) ---
  const handleMouseEnterCell = (dateKey: string, e: ReactMouseEvent) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    if (isResizing) return;

    const tasks = getTasksForDate(dateKey);
    if (tasks.length === 0) {
      setHoverState(null);
      setHoverRect(null);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHoverRect(rect);
    const tooltipW = 240; 
    const tooltipH = 220; 
    const gap = 5;

    let x = rect.right + gap;
    if (x + tooltipW > winSize.width) {
        x = rect.left - tooltipW - gap;
    }
    if (x < 0) {
        x = winSize.width - tooltipW - gap;
        if (x < 0) x = 0; 
    }

    let y = rect.top;
    if (y + tooltipH > winSize.height) {
        y = winSize.height - tooltipH - gap;
    }
    if (y < 0) y = 0;

    if (hoverState?.dateKey !== dateKey) {
        setHoverState(() => ({ dateKey, x, y, targetRect: rect } as HoverState));
    }
  };

  const handleMouseLeaveAnywhere = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
        setHoverState(null);
        setHoverRect(null);
    }, 300);
  };

  const keepTooltipOpen = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  };

  const handleAddTodo = (text: string, dateKey: string) => {
    if (!text.trim()) return;
    const newTodo: Todo = { id: crypto.randomUUID(), text, completed: false, targetDate: dateKey };
    setTodos([...todos, newTodo]);
  };
  const handleToggleTodo = (id: string) => {
    setTodos(todos.map(todo => {
      if (todo.id === id) {
        const isNowCompleted = !todo.completed;
        let newDate = todo.targetDate;
        if (isNowCompleted && todo.targetDate < todayKey) newDate = todayKey;
        return { ...todo, completed: isNowCompleted, targetDate: newDate };
      }
      return todo;
    }));
  };
  const handleDeleteTodo = (id: string) => setTodos(todos.filter(todo => todo.id !== id));
  const handleUpdateTodoText = (id: string, newText: string) => {
    if (!newText.trim()) return;
    setTodos(todos.map(t => t.id === id ? { ...t, text: newText } : t));
  };

  const startModalEdit = (task: Todo) => {
    if (!task.completed) {
      setModalEditingId(task.id);
      setModalEditText(task.text);
    }
  };

  const finishModalEdit = () => {
    if (modalEditingId) {
      handleUpdateTodoText(modalEditingId, modalEditText);
      setModalEditingId(null);
    }
  };

  const isMiniMode = winSize.width < 500 || winSize.height < 450;
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const calendarCells = [];
  
  for (let i = 0; i < firstDay; i++) calendarCells.push(<div key={`empty-${i}`} className="border-r border-b border-white/5 bg-transparent min-w-0"></div>);
  
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    const dateKey = formatDateKey(d);
    const isToday = dateKey === todayKey;
    const { lunarText, term, festival, workStatus } = getDateInfo(d);
    const highlightText = festival || term; 
    
    calendarCells.push(
      <CalendarCell 
        key={dateKey}
        day={i}
        dateKey={dateKey}
        isToday={isToday}
        tasks={getTasksForDate(dateKey)}
        term={highlightText}
        lunar={lunarText}
        workStatus={workStatus}
        isMiniMode={isMiniMode}
        onMouseEnter={handleMouseEnterCell}
        onMouseLeave={handleMouseLeaveAnywhere}
        onDoubleClick={setSelectedDateKey}
      />
    );
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-transparent select-none">
      
      {/* 修改点：背景改为更透明的 bg-black/30 (原为 bg-[#1a1b1e]/95) */}
      <div 
        className={`flex-1 flex flex-col bg-black/30 backdrop-blur-xl border rounded-xl shadow-2xl overflow-hidden ring-1 ring-black/20 transition-opacity duration-300
          ${isLocked ? 'border-red-500/30' : 'border-white/10'}
        `}
      >
        {/* --- 标题栏 --- */}
        {/* 修改点：标题栏背景改为 bg-white/5 (原为 bg-[#202124]/80) */}
        <div 
          className={`h-12 flex items-center justify-between px-3 border-b border-white/10 bg-white/5 flex-shrink-0
            ${isLocked ? '' : 'drag-region'}
          `}
        >
          <div className="flex items-center gap-2 min-w-0">
            <CalendarIcon size={16} className="text-emerald-400 flex-shrink-0" />
            <span className="text-sm font-medium text-slate-200 truncate">桌面日历</span>
            {isMiniMode && !isCollapsed && <span className="text-[10px] bg-white/10 text-slate-400 px-1 rounded flex-shrink-0">Mini</span>}
          </div>

          <div className="flex items-center gap-1 no-drag flex-shrink-0">
             <button 
              onClick={() => setIsHistoryOpen(true)} 
              className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-emerald-400 transition-colors"
              title="历史清单"
            >
              <History size={14} />
            </button>
            <div className="w-[1px] h-3 bg-white/10 mx-1"></div>
            <button onClick={() => setIsLocked(!isLocked)} className={`p-1.5 rounded hover:bg-white/10 transition-colors ${isLocked ? 'text-red-400' : 'text-slate-400'}`}>
              {isLocked ? <Lock size={14} /> : <Unlock size={14} />}
            </button>
            <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-1.5 rounded hover:bg-white/10 text-slate-400 transition-colors">
              {isCollapsed ? <Square size={14} /> : <Minus size={14} />}
            </button>
          </div>
        </div>

        {/* --- 主体内容 --- */}
        <div className={`flex-1 flex flex-col min-h-0 relative ${isCollapsed ? 'hidden' : 'block'}`}>
          {/* 修改点：控制栏背景更透明 bg-white/5 */}
          <div className="flex items-center justify-between px-4 py-2 bg-white/5 flex-shrink-0">
             <h2 className="text-lg font-light text-white flex items-end gap-1">
               <span>{year}</span><span className="text-emerald-500">.</span><span>{String(month + 1).padStart(2, '0')}</span>
             </h2>
             <div className="flex gap-1">
               <button onClick={() => setCurrentDate(new Date())} className="p-1 hover:bg-white/10 rounded text-emerald-400" title="回到今天"><RotateCcw size={14} /></button>
               <div className="flex bg-white/5 rounded">
                 <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-1 hover:bg-white/10 rounded-l text-slate-300"><ChevronLeft size={16} /></button>
                 <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-1 hover:bg-white/10 rounded-r text-slate-300"><ChevronRight size={16} /></button>
               </div>
             </div>
          </div>

          {/* 修改点：星期栏背景改为透明 bg-transparent 或 bg-black/10 */}
          <div className="grid grid-cols-7 border-b border-white/5 bg-black/10 flex-shrink-0">
            {CHINESE_NUMS.slice(0, 7).map((d,i)=>(
              <div key={i} className="text-[10px] text-slate-500 py-1 text-center">{d}</div>
            ))}
          </div>

          {/* 修改点：日历网格背景改为 bg-transparent (原为 bg-[#1a1b1e]) */}
          <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-hidden bg-transparent">
            {calendarCells}
          </div>

          {!isLocked && (
            <div 
              onMouseDown={startResize}
              className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-0.5 z-20 group hover:bg-white/5 rounded-tl no-drag"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="text-slate-600 group-hover:text-emerald-400 transition-colors">
                 <path d="M11 1L11 11L1 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
          )}
        </div>

        {/* --- 双击详情弹窗 --- */}
        {selectedDateKey && !isCollapsed && (
          <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
             {/* 详情弹窗可以保持一定的遮挡性，或者也稍微透明 */}
             <div className="w-full max-w-[320px] bg-[#25262b]/90 backdrop-blur border border-white/20 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80%]">
               <div className="p-3 border-b border-white/10 bg-white/5 flex justify-between items-center">
                 <div>
                    <div className="text-[10px] text-emerald-400 font-bold">详细编辑模式</div>
                    <div className="text-lg text-white font-medium">{selectedDateKey}</div>
                 </div>
                 <button onClick={() => setSelectedDateKey(null)} className="p-1 hover:bg-white/10 rounded-full text-slate-400"><X size={16} /></button>
               </div>
               <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                 {getTasksForDate(selectedDateKey).map(t => (
                   <div key={t.id} className="flex gap-2 items-center p-2 rounded hover:bg-white/5 group bg-black/20">
                     <button onClick={() => handleToggleTodo(t.id)} className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${t.completed ? 'bg-emerald-600 border-transparent' : 'border-slate-500'}`}>
                        {t.completed && <Check size={8} className="text-white"/>}
                     </button>
                     
                     <div className="flex-1 min-w-0">
                       {modalEditingId === t.id ? (
                         <input 
                            autoFocus
                            type="text"
                            value={modalEditText}
                            onChange={(e) => setModalEditText(e.target.value)}
                            onBlur={finishModalEdit}
                            onKeyDown={(e) => e.key === 'Enter' && finishModalEdit()}
                            className="w-full bg-black/50 text-xs text-white px-1 py-0.5 rounded outline-none border border-emerald-500/50"
                         />
                       ) : (
                         <span 
                            onClick={() => startModalEdit(t)}
                            className={`block text-xs break-all cursor-text ${t.completed ? 'text-slate-500 line-through' : 'text-slate-200'}`}
                            title="点击编辑"
                         >
                            {t.text}
                         </span>
                       )}
                     </div>

                     <button onClick={() => handleDeleteTodo(t.id)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 flex-shrink-0"><Trash2 size={10}/></button>
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
        targetRect={hoverRect}
        containerSize={winSize}
        tasks={hoverState ? getTasksForDate(hoverState.dateKey) : []}
        dateKey={hoverState ? hoverState.dateKey : todayKey}
        onMouseEnter={keepTooltipOpen}
        onMouseLeave={handleMouseLeaveAnywhere}
        onAddTodo={handleAddTodo}
        onToggleTodo={handleToggleTodo}
        onDeleteTodo={handleDeleteTodo}
        onUpdateTodoText={handleUpdateTodoText}
      />

      <HistoryModal 
        isOpen={isHistoryOpen} 
        onClose={() => setIsHistoryOpen(false)}
        todos={todos}
        onToggleTodo={handleToggleTodo}
        onDeleteTodo={handleDeleteTodo}
      />
    </div>
  );
}
