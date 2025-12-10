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
  User as UserIcon,
  Search,
  Database
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import type { Todo, HoverState, SyncAction } from './types'; // [已更新] 引入 SyncAction
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

  const [winSize, setWinSize] = useState({ width: 800, height: 550 });
  const [isResizing, setIsResizing] = useState(false);
  
  const [todos, setTodos] = useState<Todo[]>(() => {
    const saved = localStorage.getItem('desktop-todos-v8');
    return saved ? JSON.parse(saved) : [
      { 
        id: '1', 
        text: '欢迎使用桌面日历', 
        completed: false, 
        targetDate: formatDateKey(new Date()),
        createdAt: Date.now(),
        updatedAt: Date.now() 
      }
    ];
  });
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nowDate, setNowDate] = useState(new Date());

  const [modalEditingId, setModalEditingId] = useState<string | null>(null);
  const [modalEditText, setModalEditText] = useState('');

  // --- [新增] 同步队列状态 ---
  // 用于存储离线或请求失败时的操作
  const [syncQueue, setSyncQueue] = useState<SyncAction[]>(() => {
    const saved = localStorage.getItem('desktop-sync-queue');
    return saved ? JSON.parse(saved) : [];
  });

  // --- [新增] 持久化同步队列 ---
  useEffect(() => {
    localStorage.setItem('desktop-sync-queue', JSON.stringify(syncQueue));
  }, [syncQueue]);

  // --- [核心] Supabase Auth & Data Sync ---
  
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

  // --- [新增] 同步队列处理器 ---
  // 当网络恢复或有新操作加入时调用
  const processSyncQueue = async () => {
    if (!session || syncQueue.length === 0) return;
    if (!navigator.onLine) return; 

    const queueToProcess = [...syncQueue];
    const remainingQueue: SyncAction[] = [];

    // 逐个处理队列中的操作
    for (const action of queueToProcess) {
      const { type, payload, id } = action;
      let error = null;

      try {
        if (type === 'INSERT') {
          const t = payload as Todo;
          const dbRow = {
            id: t.id,
            text: t.text,
            completed: t.completed,
            target_date: t.targetDate,
            created_at: new Date(t.createdAt || Date.now()).toISOString(),
            completed_at: t.completedAt ? new Date(t.completedAt).toISOString() : null,
            updated_at: new Date(t.updatedAt || Date.now()).toISOString()
          };
          const res = await supabase.from('todos').insert(dbRow);
          error = res.error;
        } else if (type === 'UPDATE') {
          const t = payload as Partial<Todo>;
          const updates: any = { updated_at: new Date(Date.now()).toISOString() };
          if (t.text !== undefined) updates.text = t.text;
          if (t.completed !== undefined) {
            updates.completed = t.completed;
            updates.completed_at = t.completed ? new Date().toISOString() : null;
          }
          if (t.targetDate !== undefined) updates.target_date = t.targetDate;

          const res = await supabase.from('todos').update(updates).eq('id', id);
          error = res.error;
        } else if (type === 'DELETE') {
          const res = await supabase.from('todos').delete().eq('id', id);
          error = res.error;
        }
      } catch (e) {
        console.error("Sync action exception:", e);
        error = e;
      }

      if (error) {
        console.warn('Sync failed, keeping in queue:', action, error);
        // 如果是唯一性冲突(23505)或记录未找到，可能不需要重试，这里简单起见全部保留重试，
        // 除非是严重的网络无关错误（实际生产中可细化）。
        remainingQueue.push(action); 
      }
    }

    setSyncQueue(remainingQueue);
  };

  // --- [新增] 监听网络上线事件 ---
  useEffect(() => {
    const handleOnline = () => {
      console.log('Network online, processing sync queue...');
      processSyncQueue();
      fetchTodos(); // 网络恢复后，智能拉取最新数据
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncQueue, session]);

  // --- [修改] 智能合并拉取逻辑 ---
  const fetchTodos = async () => {
    if (!session) return;
    const { data, error } = await supabase.from('todos').select('*');
    if (error) {
      console.error('Fetch error:', error);
      return;
    }

    if (data) {
      const cloudTodos: Todo[] = data.map(d => ({
        id: d.id,
        text: d.text,
        completed: d.completed,
        targetDate: d.target_date,
        createdAt: d.created_at ? new Date(d.created_at).getTime() : 0,
        completedAt: d.completed_at ? new Date(d.completed_at).getTime() : undefined,
        updatedAt: d.updated_at ? new Date(d.updated_at).getTime() : 0 // 必须确保数据库有此字段
      }));

      setTodos(prevLocal => {
        const localMap = new Map(prevLocal.map(t => [t.id, t]));
        const merged: Todo[] = [];
        const processedIds = new Set<string>();

        // 1. 遍历云端数据，决定是否采纳
        for (const cTodo of cloudTodos) {
          processedIds.add(cTodo.id);
          const lTodo = localMap.get(cTodo.id);

          // 检查该 ID 是否有本地待同步的修改
          const isPendingSync = syncQueue.some(a => a.id === cTodo.id);

          if (!lTodo) {
            // 云端有，本地没有
            // 检查：是否是本地刚刚删除但还没同步上去？(队列里有 DELETE)
            const isPendingDelete = syncQueue.some(a => a.id === cTodo.id && a.type === 'DELETE');
            if (!isPendingDelete) {
              merged.push(cTodo); // 确实是新数据，加入
            }
          } else {
            // 两边都有
            if (isPendingSync) {
              // 本地有修改没上传，保留本地版本（相信离线操作）
              merged.push(lTodo);
            } else {
              // 都没有未决修改，比较时间戳（谁新听谁的）
              const localTime = lTodo.updatedAt || 0;
              const cloudTime = cTodo.updatedAt || 0;
              merged.push(cloudTime > localTime ? cTodo : lTodo);
            }
          }
        }

        // 2. 遍历本地数据，寻找云端没有的数据
        for (const lTodo of prevLocal) {
          if (!processedIds.has(lTodo.id)) {
            // 本地有，云端没有
            // 检查：是否是本地新建还没上传？(队列里有 INSERT)
            const isPendingInsert = syncQueue.some(a => a.id === lTodo.id && a.type === 'INSERT');
            
            if (isPendingInsert) {
              merged.push(lTodo); // 保留未上传的新建项
            }
            // 否则：说明云端已经删除了该项，本地也应该删除（不加入 merged）
          }
        }

        return merged;
      });
    }
  };

  // 实时订阅
  // 简化策略：收到任何变更通知，触发一次智能 fetchTodos，利用上面的合并逻辑处理
  useEffect(() => {
    if (!session) return;
    const channel = supabase.channel('todos-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, () => {
        fetchTodos();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, syncQueue]); // 依赖 syncQueue 以确保 fetchTodos 闭包拿到最新队列

  // --- 窗口逻辑 ---

  useEffect(() => {
    setWinSize({ width: window.innerWidth, height: window.innerHeight });
    const handleResize = () => {
      setWinSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
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

  // 全局快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        if (!isSearchOpen) {
          setIsSearchOpen(true);
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen]);

  // 拖拽逻辑
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
    if (x + tooltipW > winSize.width) x = rect.left - tooltipW - gap;
    if (x < 0) x = Math.max(0, winSize.width - tooltipW - gap);

    let y = rect.top;
    if (y + tooltipH > winSize.height) y = Math.max(0, winSize.height - tooltipH - gap);

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

  // --- [修改] CRUD 操作 (乐观更新 + 队列) ---

  const handleAddTodo = async (text: string, dateKey: string) => {
    if (!text.trim()) return;
    const id = crypto.randomUUID();
    const nowTs = Date.now();
    
    const newTodo: Todo = { 
      id, 
      text, 
      completed: false, 
      targetDate: dateKey,
      createdAt: nowTs,
      updatedAt: nowTs // 设置初始更新时间
    };
    
    // 1. 乐观更新本地
    setTodos(prev => [...prev, newTodo]);

    // 2. 加入同步队列
    if (session) {
      const action: SyncAction = { id, type: 'INSERT', payload: newTodo, timestamp: nowTs };
      setSyncQueue(prev => [...prev, action]);
      // 触发一次处理（如果是联网状态会立即发送）
      setTimeout(() => processSyncQueue(), 0);
    }
  };

  const handleToggleTodo = async (id: string) => {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    const isNowCompleted = !todo.completed;
    let newDate = todo.targetDate;
    if (isNowCompleted && todo.targetDate < todayKey) newDate = todayKey;

    const nowTs = Date.now();
    const completedAt = isNowCompleted ? nowTs : undefined;

    // 1. 乐观更新
    setTodos(prev => prev.map(t => t.id === id ? { 
      ...t, 
      completed: isNowCompleted, 
      targetDate: newDate,
      completedAt,
      updatedAt: nowTs // 更新时间戳
    } : t));

    // 2. 加入队列
    if (session) {
      const action: SyncAction = { 
        id, 
        type: 'UPDATE', 
        payload: { completed: isNowCompleted, targetDate: newDate }, 
        timestamp: nowTs 
      };
      setSyncQueue(prev => [...prev, action]);
      setTimeout(() => processSyncQueue(), 0);
    }
  };

  const handleDeleteTodo = async (id: string) => {
    // 1. 乐观更新
    setTodos(prev => prev.filter(t => t.id !== id));
    
    // 2. 加入队列
    if (session) {
      const action: SyncAction = { id, type: 'DELETE', payload: id, timestamp: Date.now() };
      setSyncQueue(prev => [...prev, action]);
      setTimeout(() => processSyncQueue(), 0);
    }
  };

  const handleUpdateTodoText = async (id: string, newText: string) => {
    if (!newText.trim()) return;
    const nowTs = Date.now();
    
    // 1. 乐观更新
    setTodos(prev => prev.map(t => t.id === id ? { ...t, text: newText, updatedAt: nowTs } : t));
    
    // 2. 加入队列
    if (session) {
      const action: SyncAction = { id, type: 'UPDATE', payload: { text: newText }, timestamp: nowTs };
      setSyncQueue(prev => [...prev, action]);
      setTimeout(() => processSyncQueue(), 0);
    }
  };

  // [修改] 批量导入逻辑也需要走队列，防止被 fetchTodos 的合并逻辑误删
  const handleBatchImport = async (importedTodos: Todo[]) => {
    const existingIds = new Set(todos.map(t => t.id));
    const newTodos = importedTodos.filter(t => !existingIds.has(t.id));
    if (newTodos.length === 0) return;

    const nowTs = Date.now();
    const preparedTodos = newTodos.map(t => ({
        ...t,
        updatedAt: t.updatedAt || nowTs // 确保有 updatedAt
    }));

    setTodos(prev => [...prev, ...preparedTodos]);

    if (session) {
        // 批量生成 INSERT 动作
        const actions: SyncAction[] = preparedTodos.map(t => ({
            id: t.id,
            type: 'INSERT',
            payload: t,
            timestamp: nowTs
        }));
        setSyncQueue(prev => [...prev, ...actions]);
        setTimeout(() => processSyncQueue(), 0);
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
  
  // --- 日历生成 ---
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const calendarCells = [];
  
  // 上个月
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
        isOtherMonth={true}
      />
    );
  }
  
  // 当月
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

  // 下个月
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
        className={`flex-1 flex flex-col bg-black/30 backdrop-blur-xl border rounded-xl shadow-2xl overflow-hidden ring-1 ring-black/20 transition-opacity duration-300
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
          </div>

          <div className="flex items-center gap-1 no-drag flex-shrink-0">
             {/* 搜索按钮 */}
             <button onClick={() => setIsSearchOpen(true)} className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-emerald-400 transition-colors" title="搜索 (Ctrl+F)">
               <Search size={14} />
             </button>

             {/* 数据工具按钮 */}
             <button onClick={() => setIsDataToolsOpen(true)} className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-emerald-400 transition-colors" title="数据导入/导出">
               <Database size={14} />
             </button>

             <div className="w-[1px] h-3 bg-white/10 mx-1"></div>

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
                 <div className="absolute right-0 top-6 z-50 w-36 bg-[#1a1b1e] border border-white/10 rounded shadow-2xl">
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


            {/* --- 👇 临时添加的清空按钮 (开始) 👇 --- */}
             <button 
               onClick={() => {
                 if (confirm('确定要清空所有本地数据吗？（仅用于测试导入）')) {
                   localStorage.removeItem('desktop-todos-v8');
                   localStorage.removeItem('desktop-sync-queue');
                   location.reload();
                 }
               }} 
               className="p-1.5 rounded hover:bg-red-500/20 text-red-500 transition-colors font-bold text-xs"
               title="清空重置"
             >
               清空
             </button>
             {/* --- 👆 临时添加的清空按钮 (结束) 👆 --- */}


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

      <SearchModal 
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        todos={todos}
        onNavigate={(date) => {
          setCurrentDate(date);
          setIsSearchOpen(false);
        }}
      />

      <DataToolsModal 
        isOpen={isDataToolsOpen}
        onClose={() => setIsDataToolsOpen(false)}
        todos={todos}
        onImport={handleBatchImport}
      />

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}
