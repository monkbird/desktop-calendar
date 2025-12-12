import { useState, useEffect, useRef, useLayoutEffect } from 'react';
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
  History,
  User as UserIcon,
  Search,
  Database,
  X,
  Check,
  Trash2
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import type { Todo, SyncAction } from './types';
import { CHINESE_NUMS, getDaysInMonth, getFirstDayOfMonth, formatDateKey, getDateInfo } from './utils';
import { CalendarCell } from './components/CalendarCell';
import { HistoryModal } from './components/HistoryModal'; 
import { AuthModal } from './components/AuthModal';
import { SearchModal } from './components/SearchModal';
import { DataToolsModal } from './components/DataToolsModal';
import { supabase } from './supabase';

export default function App() {
  const [isLocked, setIsLocked] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false); 
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isDataToolsOpen, setIsDataToolsOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const accountMenuCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [winSize, setWinSize] = useState({ width: 800, height: 550 });
  
  const [todos, setTodos] = useState<Todo[]>(() => {
    const saved = localStorage.getItem('desktop-todos-v8');
    return saved ? JSON.parse(saved) : [{ id: '1', text: '欢迎使用桌面日历', completed: false, targetDate: formatDateKey(new Date()) }];
  });
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeTooltipDate, setActiveTooltipDate] = useState<string | null>(null);
  const [nowDate, setNowDate] = useState(new Date());

  const [modalEditingId, setModalEditingId] = useState<string | null>(null);
  const [modalEditText, setModalEditText] = useState('');
  const [inputValue, setInputValue] = useState(''); // 补充缺失的 inputValue 状态
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null); // 补充缺失的 selectedDateKey 状态

  const [syncQueue, setSyncQueue] = useState<SyncAction[]>(() => {
    const saved = localStorage.getItem('desktop-sync-queue');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => { localStorage.setItem('desktop-sync-queue', JSON.stringify(syncQueue)); }, [syncQueue]);

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

  const handleAddTodo = (text: string, dateKey: string) => {
    if (!text.trim()) return;
    const id = crypto.randomUUID();
    const now = Date.now();
    const newTodo: Todo = { id, text, completed: false, targetDate: dateKey, createdAt: now, updatedAt: now };
    setTodos(prev => [...prev, newTodo]);
    if (session) {
      setSyncQueue(prev => [...prev, { id, type: 'INSERT', payload: newTodo, timestamp: now }]);
      setTimeout(processSyncQueue, 0);
    }
  };

  const handleToggleTodo = (id: string) => {
    const t = todos.find(i => i.id === id); if(!t) return;
    const completed = !t.completed;
    const now = Date.now();
    setTodos(prev => prev.map(i => i.id === id ? { ...i, completed, updatedAt: now } : i));
    if (session) {
      setSyncQueue(prev => [...prev, { id, type: 'UPDATE', payload: { completed }, timestamp: now }]);
      setTimeout(processSyncQueue, 0);
    }
  };

  const handleDeleteTodo = (id: string) => {
    setTodos(prev => prev.filter(i => i.id !== id));
    if (session) {
      setSyncQueue(prev => [...prev, { id, type: 'DELETE', payload: id, timestamp: Date.now() }]);
      setTimeout(processSyncQueue, 0);
    }
  };

  const handleUpdateTodoText = (id: string, text: string) => {
    const now = Date.now();
    setTodos(prev => prev.map(i => i.id === id ? { ...i, text, updatedAt: now } : i));
    if (session) {
      setSyncQueue(prev => [...prev, { id, type: 'UPDATE', payload: { text }, timestamp: now }]);
      setTimeout(processSyncQueue, 0);
    }
  };

  useEffect(() => {
    const removeListener = window.desktopCalendar?.onDispatchAction((action) => {
      switch (action.type) {
        case 'ADD': handleAddTodo(action.payload.text, action.payload.dateKey); break;
        case 'TOGGLE': handleToggleTodo(action.payload.id); break;
        case 'DELETE': handleDeleteTodo(action.payload.id); break;
        case 'UPDATE_TEXT': handleUpdateTodoText(action.payload.id, action.payload.text); break;
      }
    });
    return () => removeListener?.();
  }, [todos, session]);

  const getTasksForDate = (dateKey: string) => {
    const isToday = dateKey === formatDateKey(nowDate);
    return todos.filter(t => {
      if (t.completed) return t.targetDate === dateKey;
      if (isToday) return t.targetDate <= dateKey;
      return t.targetDate === dateKey;
    }).sort((a, b) => (a.completed === b.completed ? 0 : a.completed ? 1 : -1));
  };

  useEffect(() => {
    if (activeTooltipDate) {
      const tasks = getTasksForDate(activeTooltipDate);
      window.desktopCalendar?.showTooltip({ dateKey: activeTooltipDate, tasks, y: 0 });
    }
  }, [todos, activeTooltipDate]);

  const processSyncQueue = async () => {
    if (!session || syncQueue.length === 0 || !navigator.onLine) return;
    const queue = [...syncQueue];
    const remaining: SyncAction[] = [];
    for (const action of queue) {
      const { type, payload, id } = action;
      let error = null;
      try {
        if (type === 'INSERT') {
           const t = payload as Todo;
           const { error: e } = await supabase.from('todos').insert({
             id: t.id, text: t.text, completed: t.completed, target_date: t.targetDate,
             created_at: new Date(t.createdAt || Date.now()).toISOString(),
             updated_at: new Date(t.updatedAt || Date.now()).toISOString()
           });
           error = e;
        } else if (type === 'UPDATE') {
           const t = payload as Partial<Todo>;
           const updates: any = { updated_at: new Date().toISOString() };
           if (t.text !== undefined) updates.text = t.text;
           if (t.completed !== undefined) { updates.completed = t.completed; updates.completed_at = t.completed ? new Date().toISOString() : null; }
           if (t.targetDate !== undefined) updates.target_date = t.targetDate;
           const { error: e } = await supabase.from('todos').update(updates).eq('id', id);
           error = e;
        } else if (type === 'DELETE') {
           const { error: e } = await supabase.from('todos').delete().eq('id', id);
           error = e;
        }
      } catch (e) { error = e; }
      if (error) remaining.push(action);
    }
    setSyncQueue(remaining);
  };

  useEffect(() => {
    const handleOnline = () => { processSyncQueue(); fetchTodos(); };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncQueue, session]);

  const fetchTodos = async () => {
    if (!session) return;
    const { data } = await supabase.from('todos').select('*');
    if (data) {
      const cloudTodos: Todo[] = data.map(d => ({
        id: d.id, text: d.text, completed: d.completed, targetDate: d.target_date,
        createdAt: d.created_at ? new Date(d.created_at).getTime() : 0,
        updatedAt: d.updated_at ? new Date(d.updated_at).getTime() : 0 
      }));
      setTodos(prev => {
        const localMap = new Map(prev.map(t => [t.id, t]));
        const merged: Todo[] = [];
        const processedIds = new Set<string>();
        for (const cTodo of cloudTodos) {
          processedIds.add(cTodo.id);
          const lTodo = localMap.get(cTodo.id);
          if (!lTodo) {
             if (!syncQueue.some(a => a.id === cTodo.id && a.type === 'DELETE')) merged.push(cTodo);
          } else {
             merged.push(syncQueue.some(a => a.id === cTodo.id) ? lTodo : ((cTodo.updatedAt||0) > (lTodo.updatedAt||0) ? cTodo : lTodo));
          }
        }
        for (const lTodo of prev) {
          if (!processedIds.has(lTodo.id)) {
             if (syncQueue.some(a => a.id === lTodo.id && a.type === 'INSERT')) merged.push(lTodo);
          }
        }
        return merged;
      });
    }
  };

  useEffect(() => {
    if (!session) return;
    const channel = supabase.channel('todos-sync').on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, () => fetchTodos()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, syncQueue]);

  useEffect(() => {
    setWinSize({ width: window.innerWidth, height: window.innerHeight });
    const handleResize = () => setWinSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => { window.desktopCalendar?.setResizable?.(!isLocked); }, [isLocked]);
  useEffect(() => { const timer = setTimeout(() => setNowDate(new Date()), 60000); return () => clearTimeout(timer); }, [nowDate]);
  useEffect(() => { localStorage.setItem('desktop-todos-v8', JSON.stringify(todos)); }, [todos]);

  // --- 之前丢失的 handleBatchImport 函数已补全 ---
  const handleBatchImport = async (importedTodos: Todo[]) => {
    const existingIds = new Set(todos.map(t => t.id));
    const newTodos = importedTodos.filter(t => !existingIds.has(t.id));
    if (newTodos.length === 0) return;
    const nowTs = Date.now();
    const preparedTodos = newTodos.map(t => ({ ...t, updatedAt: t.updatedAt || nowTs }));
    setTodos(prev => [...prev, ...preparedTodos]);
    if (session) {
        const actions: SyncAction[] = preparedTodos.map(t => ({ id: t.id, type: 'INSERT', payload: t, timestamp: nowTs }));
        setSyncQueue(prev => [...prev, ...actions]);
        setTimeout(() => processSyncQueue(), 0);
    }
  };

  const handleCellClick = (dateKey: string, e: ReactMouseEvent) => {
    setActiveTooltipDate(dateKey);
    window.desktopCalendar?.showTooltip({ dateKey, tasks: getTasksForDate(dateKey), y: e.clientY });
  };

  const startModalEdit = (task: Todo) => { if (!task.completed) { setModalEditingId(task.id); setModalEditText(task.text); } };
  const finishModalEdit = () => { if (modalEditingId) { handleUpdateTodoText(modalEditingId, modalEditText); setModalEditingId(null); } };

  const isMiniMode = winSize.width < 500 || winSize.height < 450;
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const calendarCells = [];
  
  const prevDate = new Date(year, month, 0);
  for (let i = 0; i < firstDay; i++) {
    const day = prevDate.getDate() - firstDay + i + 1;
    const d = new Date(prevDate.getFullYear(), prevDate.getMonth(), day);
    const dateKey = formatDateKey(d);
    const info = getDateInfo(d);
    calendarCells.push(<CalendarCell key={`prev-${dateKey}`} day={day} dateKey={dateKey} isToday={false} tasks={getTasksForDate(dateKey)} term={info.festival||info.term} lunar={info.lunarText} workStatus={info.workStatus} isMiniMode={isMiniMode} onClick={handleCellClick} isOtherMonth={true}/>);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    const dateKey = formatDateKey(d);
    const isToday = dateKey === formatDateKey(nowDate);
    const info = getDateInfo(d);
    calendarCells.push(<CalendarCell key={dateKey} day={i} dateKey={dateKey} isToday={isToday} tasks={getTasksForDate(dateKey)} term={info.festival||info.term} lunar={info.lunarText} workStatus={info.workStatus} isMiniMode={isMiniMode} onClick={handleCellClick}/>);
  }
  const cellsNeeded = (7 - (calendarCells.length % 7)) % 7;
  for (let i = 1; i <= cellsNeeded; i++) {
    const d = new Date(year, month + 1, i);
    const dateKey = formatDateKey(d);
    const info = getDateInfo(d);
    calendarCells.push(<CalendarCell key={`next-${dateKey}`} day={i} dateKey={dateKey} isToday={false} tasks={getTasksForDate(dateKey)} term={info.festival||info.term} lunar={info.lunarText} workStatus={info.workStatus} isMiniMode={isMiniMode} onClick={handleCellClick} isOtherMonth={true}/>);
  }

  const rowCount = calendarCells.length / 7;
  useLayoutEffect(() => {
    if (isCollapsed) { window.desktopCalendar?.resizeWindow({ width: winSize.width, height: 48 }); return; }
    if (contentRef.current) {
       const h = contentRef.current.offsetHeight;
       if (Math.abs(winSize.height - h) > 2) window.desktopCalendar?.resizeWindow({ width: winSize.width, height: h });
    }
  }, [rowCount, currentDate, isCollapsed, isMiniMode]);

  const cancelCloseAccountMenu = () => { if(accountMenuCloseRef.current) clearTimeout(accountMenuCloseRef.current); accountMenuCloseRef.current=null; };
  const scheduleCloseAccountMenu = () => { if(accountMenuCloseRef.current) clearTimeout(accountMenuCloseRef.current); accountMenuCloseRef.current=setTimeout(()=>setShowAccountMenu(false),500); };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-transparent select-none">
      <div ref={contentRef} className={`w-full h-fit flex flex-col bg-black/30 backdrop-blur-xl border rounded-xl shadow-2xl overflow-hidden ring-1 ring-black/20 transition-opacity duration-300 ${isLocked ? 'border-red-500/30' : 'border-white/10'}`}>
        <div className={`h-7.5 flex items-center justify-between px-2 border-b border-white/10 bg-white/5 flex-shrink-0 ${isLocked?'':'drag-region'}`}>
          <div className="flex items-center gap-2 min-w-0"><CalendarIcon size={16} className="text-emerald-400"/><span className="text-sm font-medium text-slate-200">桌面日历</span></div>
          <div className="flex items-center gap-1 no-drag">
             <button onClick={() => setIsSearchOpen(true)} className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-emerald-400"><Search size={14}/></button>
             <button onClick={() => setIsDataToolsOpen(true)} className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-emerald-400"><Database size={14}/></button>
             <div className="w-[1px] h-3 bg-white/10 mx-1"></div>
             <div className="relative" onMouseEnter={cancelCloseAccountMenu} onMouseLeave={scheduleCloseAccountMenu}>
               <button onClick={() => session ? setShowAccountMenu(v=>!v) : setShowAuth(true)} className={`p-1.5 rounded hover:bg-white/10 ${session?'text-emerald-400':'text-slate-400'}`}><UserIcon size={14}/></button>
               {session && showAccountMenu && <div className="absolute right-0 top-6 z-50 w-36 bg-[#1a1b1e] border border-white/10 rounded shadow-2xl"><div className="px-3 py-2 text-xs text-slate-400 truncate">{session.user.email}</div><button onClick={async()=>{setShowAccountMenu(false);await supabase.auth.signOut()}} className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-white/10">退出登录</button></div>}
             </div>
             <button onClick={() => setIsHistoryOpen(true)} className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-emerald-400"><History size={14}/></button>
             <div className="w-[1px] h-3 bg-white/10 mx-1"></div>
             <button onClick={() => setIsLocked(!isLocked)} className={`p-1.5 rounded hover:bg-white/10 ${isLocked?'text-red-400':'text-slate-400'}`}>{isLocked?<Lock size={14}/>:<Unlock size={14}/>}</button>
             <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-1.5 rounded hover:bg-white/10 text-slate-400">{isCollapsed?<Square size={14}/>:<Minus size={14}/>}</button>
          </div>
        </div>

        <div className={`flex-1 flex flex-col min-h-0 relative ${isCollapsed ? 'hidden' : 'block'}`}>
          <div className="flex items-center justify-between px-2 py-0.1 bg-white/5 flex-shrink-0">
             <h2 className="text-lg font-light text-white flex items-end gap-1"><span>{year}</span><span className="text-emerald-500">.</span><span>{String(month + 1).padStart(2, '0')}</span></h2>
             <div className="flex gap-1">
               <button onClick={() => setCurrentDate(new Date())} className="p-1 hover:bg-white/10 rounded text-emerald-400"><RotateCcw size={14}/></button>
               <div className="flex bg-white/5 rounded">
                 <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-1 hover:bg-white/10 rounded-l text-slate-300"><ChevronLeft size={16}/></button>
                 <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-1 hover:bg-white/10 rounded-r text-slate-300"><ChevronRight size={16}/></button>
               </div>
             </div>
          </div>
          <div className="grid grid-cols-7 border-b border-white/5 bg-black/10 flex-shrink-0">{CHINESE_NUMS.slice(0, 7).map((d,i)=>(<div key={i} className="text-[10px] text-slate-500 py-1 text-center">{d}</div>))}</div>
          <div className="w-full grid grid-cols-7 auto-rows-fr overflow-hidden bg-transparent">{calendarCells}</div>
          {!isLocked && <div onMouseDown={(e)=>{if(isLocked||isCollapsed)return;e.stopPropagation();}} className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-0.5 z-20 group hover:bg-white/5 rounded-tl no-drag"><svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="text-slate-600 group-hover:text-emerald-400"><path d="M11 1L11 11L1 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></div>}
        </div>
      </div>

      <HistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} todos={todos} onToggleTodo={handleToggleTodo} onDeleteTodo={handleDeleteTodo} />
      <SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} todos={todos} onNavigate={(date) => { setCurrentDate(date); setIsSearchOpen(false); }} />
      <DataToolsModal isOpen={isDataToolsOpen} onClose={() => setIsDataToolsOpen(false)} todos={todos} onImport={handleBatchImport} />
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
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
                         <input autoFocus type="text" value={modalEditText} onChange={(e) => setModalEditText(e.target.value)} onBlur={finishModalEdit} onKeyDown={(e) => e.key === 'Enter' && finishModalEdit()} className="w-full bg-black/50 text-xs text-white px-1 py-0.5 rounded outline-none border border-emerald-500/50" />
                       ) : (
                         <span onClick={() => startModalEdit(t)} className={`block text-xs break-all cursor-text ${t.completed ? 'text-slate-500 line-through' : 'text-slate-200'}`} title="点击编辑">{t.text}</span>
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
  );
}
