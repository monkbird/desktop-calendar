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
  History,
  User as UserIcon 
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js'; // 需安装依赖
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
import { AuthModal } from './components/AuthModal'; // 需新建此组件
import { supabase } from './supabase'; // 需新建此文件

export default function App() {
  const [isLocked, setIsLocked] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false); 

  // Auth 状态
  const [session, setSession] = useState<Session | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const accountMenuCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleCloseAccountMenu = () => {
    if (accountMenuCloseRef.current) clearTimeout(accountMenuCloseRef.current);
    accountMenuCloseRef.current = setTimeout(() => setShowAccountMenu(false), 500);
  };
  const cancelCloseAccountMenu = () => {
    if (accountMenuCloseRef.current) clearTimeout(accountMenuCloseRef.current);
    accountMenuCloseRef.current = null;
  };

  // 默认宽高度
  const [winSize, setWinSize] = useState({ width: 800, height: 550 });
  const [isResizing, setIsResizing] = useState(false);
  
  const [todos, setTodos] = useState<Todo[]>(() => {
    const saved = localStorage.getItem('desktop-todos-v8');
    // 如果本地有缓存先用缓存，之后会被云端数据覆盖/合并
    return saved ? JSON.parse(saved) : [
      { id: '1', text: '欢迎使用桌面日历', completed: false, targetDate: formatDateKey(new Date()) }
    ];
  });
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nowDate, setNowDate] = useState(new Date());

  // 详细编辑模式的状态
  const [modalEditingId, setModalEditingId] = useState<string | null>(null);
  const [modalEditText, setModalEditText] = useState('');

  // --- 1. Supabase Auth & Data Sync ---
  
  // 监听登录状态变化
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchTodos();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchTodos();
    });

    return () => subscription.unsubscribe();
  }, []);

  // 拉取数据
  const fetchTodos = async () => {
    const { data, error } = await supabase.from('todos').select('*');
    if (error) {
      console.error('Fetch error:', error);
      return;
    }
    if (data) {
      // 转换数据库 snake_case 到本地 camelCase
      const cloudTodos: Todo[] = data.map(d => ({
        id: d.id,
        text: d.text,
        completed: d.completed,
        targetDate: d.target_date
      }));
      setTodos(cloudTodos);
    }
  };

  // 实时订阅 (Realtime)
  useEffect(() => {
    if (!session) return;

    const channel = supabase.channel('todos-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, (payload) => {
        const { eventType, new: newRec, old: oldRec } = payload as any;

        if (eventType === 'INSERT') {
          setTodos(prev => {
            // 防止本地乐观更新导致的重复
            if (prev.some(t => t.id === newRec.id)) return prev;
            return [...prev, {
              id: newRec.id,
              text: newRec.text,
              completed: newRec.completed,
              targetDate: newRec.target_date
            }];
          });
        } else if (eventType === 'UPDATE') {
          setTodos(prev => prev.map(t => t.id === newRec.id ? {
            ...t,
            text: newRec.text,
            completed: newRec.completed,
            targetDate: newRec.target_date
          } : t));
        } else if (eventType === 'DELETE') {
          setTodos(prev => prev.filter(t => t.id !== oldRec.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session]);


  // --- 2. 窗口逻辑 ---

  useEffect(() => {
    setWinSize({ width: window.innerWidth, height: window.innerHeight });
    const handleResize = () => {
      setWinSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 锁定/调整大小逻辑 (IPC调用)
  useEffect(() => {
    // 锁定时禁止系统调整大小
    window.desktopCalendar?.setResizable?.(!isLocked);
  }, [isLocked]);

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

  // 手动拖拽调整大小 (针对无边框窗口的右下角)
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

  // 悬浮弹窗定位
  const handleMouseEnterCell = (dateKey: string, e: ReactMouseEvent) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    if (isResizing) return;

    const tasks = getTasksForDate(dateKey);
    // 允许空弹窗出现以便添加事项，或者保持原逻辑
    if (tasks.length === 0) {
      // 这里可以根据需求决定是否显示空日期的弹窗，
      // 原逻辑是 tasks.length === 0 则不显示，这里保持原逻辑
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

  // --- CRUD 操作 (含 Supabase 同步) ---

  const handleAddTodo = async (text: string, dateKey: string) => {
    if (!text.trim()) return;
    const id = crypto.randomUUID();
    const newTodo: Todo = { id, text, completed: false, targetDate: dateKey };
    
    // 乐观更新 (Optimistic Update)
    setTodos(prev => [...prev, newTodo]);

    if (session) {
      const { error } = await supabase.from('todos').insert({
        id, // 使用本地生成的 ID 确保一致
        text,
        target_date: dateKey,
        completed: false
      });
      if (error) {
        console.error('Add failed:', error);
        // 可选：回滚状态
      }
    }
  };

  const handleToggleTodo = async (id: string) => {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    const isNowCompleted = !todo.completed;
    let newDate = todo.targetDate;
    if (isNowCompleted && todo.targetDate < todayKey) newDate = todayKey;

    // 乐观更新
    setTodos(prev => prev.map(t => t.id === id ? { ...t, completed: isNowCompleted, targetDate: newDate } : t));

    if (session) {
      const { error } = await supabase.from('todos').update({
        completed: isNowCompleted,
        target_date: newDate
      }).eq('id', id);
      if (error) console.error('Toggle failed:', error);
    }
  };

  const handleDeleteTodo = async (id: string) => {
    setTodos(prev => prev.filter(t => t.id !== id));
    if (session) {
      const { error } = await supabase.from('todos').delete().eq('id', id);
      if (error) console.error('Delete failed:', error);
    }
  };

  const handleUpdateTodoText = async (id: string, newText: string) => {
    if (!newText.trim()) return;
    setTodos(prev => prev.map(t => t.id === id ? { ...t, text: newText } : t));
    
    if (session) {
      const { error } = await supabase.from('todos').update({ text: newText }).eq('id', id);
      if (error) console.error('Update text failed:', error);
    }
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
  
  // --- 日历生成逻辑 (含邻近月份填充) ---

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const calendarCells = [];
  
  // 1. 填充上个月
  const prevMonthLastDate = new Date(year, month, 0); 
  const prevMonthDaysCount = prevMonthLastDate.getDate();
  const prevMonthYear = prevMonthLastDate.getFullYear();
  const prevMonthIdx = prevMonthLastDate.getMonth();

  for (let i = 0; i < firstDay; i++) {
    const dayNum = prevMonthDaysCount - firstDay + i + 1;
    const d = new Date(prevMonthYear, prevMonthIdx, dayNum);
    const dateKey = formatDateKey(d);
    const { lunarText, term, festival, workStatus } = getDateInfo(d);
    const highlightText = festival || term;

    calendarCells.push(
      <CalendarCell 
        key={`prev-${dateKey}`}
        day={dayNum}
        dateKey={dateKey}
        isToday={false}
        tasks={getTasksForDate(dateKey)}
        term={highlightText}
        lunar={lunarText}
        workStatus={workStatus}
        isMiniMode={isMiniMode}
        onMouseEnter={handleMouseEnterCell}
        onMouseLeave={handleMouseLeaveAnywhere}
        onDoubleClick={setSelectedDateKey}
        isOtherMonth={true} // 需在 CalendarCell 中支持此属性
      />
    );
  }
  
  // 2. 填充当月
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

  // 3. 填充下个月 (补齐最后一行)
  const totalCellsSoFar = calendarCells.length;
  const cellsNeeded = (7 - (totalCellsSoFar % 7)) % 7;
  
  for (let i = 1; i <= cellsNeeded; i++) {
    const d = new Date(year, month + 1, i);
    const dateKey = formatDateKey(d);
    const { lunarText, term, festival, workStatus } = getDateInfo(d);
    const highlightText = festival || term;

    calendarCells.push(
      <CalendarCell 
        key={`next-${dateKey}`}
        day={i}
        dateKey={dateKey}
        isToday={false}
        tasks={getTasksForDate(dateKey)}
        term={highlightText}
        lunar={lunarText}
        workStatus={workStatus}
        isMiniMode={isMiniMode}
        onMouseEnter={handleMouseEnterCell}
        onMouseLeave={handleMouseLeaveAnywhere}
        onDoubleClick={setSelectedDateKey}
        isOtherMonth={true}
      />
    );
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-transparent select-none">
      
      <div 
        className={`flex-1 flex flex-col bg-black/30 backdrop-blur-xl border rounded-xl shadow-2xl overflow-hiddenHJ ring-1 ring-black/20 transition-opacity duration-300
          ${isLocked ? 'border-red-500/30' : 'border-white/10'}
        `}
      >
        {/* --- 标题栏 --- */}
        <div 
          className={`h-7.5 flex items-center justify-between px-2 border-b border-white/10 bg-white/5 flex-shrink-0
            ${isLocked ? '' : 'drag-region'}
          `}
        >
          <div className="flex items-center gap-2 min-w-0">
            <CalendarIcon size={16} className="text-emerald-400 flex-shrink-0" />
            <span className="text-sm font-medium text-slate-200 truncate">桌面日历</span>
            {isMiniMode && !isCollapsed && <span className="text-[10px] bg-white/10 text-slate-400 px-1 rounded flex-shrink-0">Mini</span>}
          </div>

          <div className="flex items-center gap-1 no-drag flex-shrink-0">
             {/* 登录按钮 */}
             <div className="relative" onMouseEnter={cancelCloseAccountMenu} onMouseLeave={scheduleCloseAccountMenu}>
               <button 
                 onClick={() => { session ? setShowAccountMenu(v => !v) : setShowAuth(true); }} 
                 className={`p-1.5 rounded hover:bg-white/10 transition-colors ${session ? 'text-emerald-400' : 'text-slate-400'}`}
                 title={session ? `已同步: ${session.user.email}` : "登录以同步"}
               >
                 <UserIcon size={14} />
               </button>
               {session && showAccountMenu && (
                 <div className="absolute right-0 top-6 z-50 w-36 bg-[#1a1b1e] border border-white/10 rounded shadow-2xl" onMouseEnter={cancelCloseAccountMenu} onMouseLeave={scheduleCloseAccountMenu}>
                   <div className="px-3 py-2 text-xs text-slate-400 truncate">{session.user.email}</div>
                   <button 
                     onClick={async () => { setShowAccountMenu(false); await supabase.auth.signOut(); }}
                     className="w-full text-left px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-white/10"
                   >
                     退出登录
                   </button>
                 </div>
               )}
             </div>

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
          <div className="flex items-center justify-between px-2 py-0.1 bg-white/5 flex-shrink-0">
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

          <div className="grid grid-cols-7 border-b border-white/5 bg-black/10 flex-shrink-0">
            {CHINESE_NUMS.slice(0, 7).map((d,i)=>(
              <div key={i} className="text-[10px] text-slate-500 py-1 text-center">{d}</div>
            ))}
          </div>

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

      {/* 登录弹窗 */}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}
