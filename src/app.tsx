import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { 
  Calendar as CalendarIcon, 
  RotateCcw, Lock, Unlock, Minus, Square, 
  ChevronLeft, ChevronRight, X, Check, Trash2,
  History, User as UserIcon, Search, Database,
  ChevronDown, Sliders 
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import type { Todo, SyncAction } from './types';
import { 
  CHINESE_NUMS, getDaysInMonth, getFirstDayOfMonth, formatDateKey, getDateInfo 
} from './utils';
import { CalendarCell } from './components/CalendarCell';
import { HistoryModal } from './components/HistoryModal'; 
import { AuthModal } from './components/AuthModal';
import { SearchModal } from './components/SearchModal';
import { DataToolsModal } from './components/DataToolsModal';
import { supabase } from './supabase';

export default function App() {
  const [isLocked, setIsLocked] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false); 
  const [isHoverExpanded, setIsHoverExpanded] = useState(false); 
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false); 

  // 年份和月份选择器的显示状态
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  // 透明度调节状态
  const [isOpacityMenuOpen, setIsOpacityMenuOpen] = useState(false);
  const [bgOpacity, setBgOpacity] = useState(() => {
    const saved = localStorage.getItem('desktop-bg-opacity');
    return saved ? parseFloat(saved) : 0.5; 
  });

  const [isHistoryOpen, setIsHistoryOpen] = useState(false); 
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isDataToolsOpen, setIsDataToolsOpen] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const detailScrollRef = useRef<HTMLDivElement | null>(null);

  // 鼠标追踪与延时收起 Ref
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMouseInsideRef = useRef(false);

  // Auth 状态
  const [session, setSession] = useState<Session | null>(null);
  const [showAuth, setShowAuth] = useState(false);

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
  
  // 默认日期初始化为 2025年 12月
  const [currentDate, setCurrentDate] = useState(new Date(2025, 11, 1));

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  
  const [nowDate, setNowDate] = useState(new Date());

  const [modalEditingId, setModalEditingId] = useState<string | null>(null);
  const [modalEditText, setModalEditText] = useState('');
  const [activeTooltipDate, setActiveTooltipDate] = useState<string | null>(null);

  // --- 同步队列状态 ---
  const [syncQueue, setSyncQueue] = useState<SyncAction[]>(() => {
    const saved = localStorage.getItem('desktop-sync-queue');
    return saved ? JSON.parse(saved) : [];
  });

  // 汇总所有弹窗/交互状态。只要这里有一个为 true，就不允许自动收起
  const isAnyPopupOpen = useMemo(() => {
    return isToolsMenuOpen || 
           isOpacityMenuOpen || 
           !!selectedDateKey || 
           isHistoryOpen || 
           isSearchOpen || 
           isDataToolsOpen || 
           showAuth || 
           !!activeTooltipDate ||
           showYearPicker || 
           showMonthPicker;   
  }, [isToolsMenuOpen, isOpacityMenuOpen, selectedDateKey, isHistoryOpen, isSearchOpen, isDataToolsOpen, showAuth, activeTooltipDate, showYearPicker, showMonthPicker]);

  useEffect(() => {
    localStorage.setItem('desktop-sync-queue', JSON.stringify(syncQueue));
  }, [syncQueue]);

  useEffect(() => {
    localStorage.setItem('desktop-bg-opacity', bgOpacity.toString());
  }, [bgOpacity]);

  useEffect(() => {
    if (activeTooltipDate) {
      const tasks = getTasksForDate(activeTooltipDate);
      window.desktopCalendar?.updateTooltipData?.({ dateKey: activeTooltipDate, tasks });
    }
  }, [todos, activeTooltipDate]);

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

  const processSyncQueue = async () => {
    if (!session || syncQueue.length === 0) return;
    if (!navigator.onLine) return; 

    const queueToProcess = [...syncQueue];
    const remainingQueue: SyncAction[] = [];

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
        remainingQueue.push(action); 
      }
    }
    setSyncQueue(remainingQueue);
  };

  useEffect(() => {
    const handleOnline = () => {
      processSyncQueue();
      fetchTodos();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncQueue, session]);

  const fetchTodos = async () => {
    if (!session) return;
    const { data, error } = await supabase.from('todos').select('*');
    if (error) return;

    if (data) {
      const cloudTodos: Todo[] = data.map(d => ({
        id: d.id,
        text: d.text,
        completed: d.completed,
        targetDate: d.target_date,
        createdAt: d.created_at ? new Date(d.created_at).getTime() : 0,
        completedAt: d.completed_at ? new Date(d.completed_at).getTime() : undefined,
        updatedAt: d.updated_at ? new Date(d.updated_at).getTime() : 0 
      }));

      setTodos(prevLocal => {
        const localMap = new Map(prevLocal.map(t => [t.id, t]));
        const merged: Todo[] = [];
        const processedIds = new Set<string>();

        for (const cTodo of cloudTodos) {
          processedIds.add(cTodo.id);
          const lTodo = localMap.get(cTodo.id);
          const isPendingSync = syncQueue.some(a => a.id === cTodo.id);

          if (!lTodo) {
            const isPendingDelete = syncQueue.some(a => a.id === cTodo.id && a.type === 'DELETE');
            if (!isPendingDelete) merged.push(cTodo); 
          } else {
            if (isPendingSync) merged.push(lTodo);
            else {
              const localTime = lTodo.updatedAt || 0;
              const cloudTime = cTodo.updatedAt || 0;
              merged.push(cloudTime > localTime ? cTodo : lTodo);
            }
          }
        }

        for (const lTodo of prevLocal) {
          if (!processedIds.has(lTodo.id)) {
            const isPendingInsert = syncQueue.some(a => a.id === lTodo.id && a.type === 'INSERT');
            if (isPendingInsert) merged.push(lTodo); 
          }
        }
        return merged;
      });
    }
  };

  useEffect(() => {
    if (!session) return;
    const channel = supabase.channel('todos-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, () => {
        fetchTodos();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, syncQueue]);

  // --- 窗口收起/展开逻辑 (核心修改) ---

  const isEffectivelyOpen = !isCollapsed || isHoverExpanded || isAnyPopupOpen;

  // 调度收起
  const scheduleCollapse = () => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    
    // 0.2秒后尝试收起
    collapseTimerRef.current = setTimeout(() => {
      // 再次检查：如果有弹窗，或者鼠标又回来了，就不收起
      if (isAnyPopupOpen || isMouseInsideRef.current) return;
      
      setIsHoverExpanded(false);
      // 同时关闭可能还开着的非模态菜单（双重保险）
      setIsToolsMenuOpen(false);
      setIsOpacityMenuOpen(false);
      setShowYearPicker(false);
      setShowMonthPicker(false);
    }, 200);
  };

  // 取消收起
  const cancelCollapse = () => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  };

  // 监听弹窗状态变化：如果弹窗关闭了，且鼠标不在界面内，开始倒计时收起
  useEffect(() => {
    if (!isAnyPopupOpen && !isMouseInsideRef.current && isHoverExpanded) {
      scheduleCollapse();
    }
    // 如果弹窗打开了，取消任何 pending 的收起任务
    if (isAnyPopupOpen) {
      cancelCollapse();
    }
  }, [isAnyPopupOpen, isHoverExpanded]);


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
    const now = new Date();
    const night = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    const msToMidnight = night.getTime() - now.getTime();
    const timer = setTimeout(() => { setNowDate(new Date()); }, msToMidnight + 1000); 
    return () => clearTimeout(timer);
  }, [nowDate]); 

  useEffect(() => {
    localStorage.setItem('desktop-todos-v8', JSON.stringify(todos));
  }, [todos]);

  useEffect(() => {
    if (!selectedDateKey || isCollapsed) return;
    const el = detailScrollRef.current;
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
  }, [selectedDateKey, isCollapsed]);

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

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing && isEffectivelyOpen) {
        const newWidth = Math.max(320, e.clientX);
        const newHeight = Math.max(300, e.clientY);
        window.desktopCalendar?.resizeWindow({ width: newWidth, height: newHeight });
      }
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, isEffectivelyOpen]); 

  const startResize = (e: ReactMouseEvent) => {
    if (isLocked || !isEffectivelyOpen) return;
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

  // --- 统计辅助函数 ---
  const getYearlyCompleted = (y: number) => {
    const prefix = `${y}-`;
    return todos.filter(t => t.completed && t.targetDate.startsWith(prefix)).length;
  };

  const getMonthlyCompleted = (y: number, m: number) => {
    const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
    return todos.filter(t => t.completed && t.targetDate.startsWith(prefix)).length;
  };

  // --- CRUD 操作 ---

  const handleAddTodo = async (text: string, dateKey: string) => {
    if (!text.trim()) return;
    const id = crypto.randomUUID();
    const nowTs = Date.now();
    const newTodo: Todo = { 
      id, text, completed: false, targetDate: dateKey, createdAt: nowTs, updatedAt: nowTs 
    };
    setTodos(prev => [...prev, newTodo]);
    if (session) {
      const action: SyncAction = { id, type: 'INSERT', payload: newTodo, timestamp: nowTs };
      setSyncQueue(prev => [...prev, action]);
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
    
    setTodos(prev => prev.map(t => t.id === id ? { 
      ...t, completed: isNowCompleted, targetDate: newDate, completedAt: isNowCompleted ? nowTs : undefined, updatedAt: nowTs 
    } : t));

    if (session) {
      const action: SyncAction = { 
        id, type: 'UPDATE', payload: { completed: isNowCompleted, targetDate: newDate }, timestamp: nowTs 
      };
      setSyncQueue(prev => [...prev, action]);
      setTimeout(() => processSyncQueue(), 0);
    }
  };

  const handleDeleteTodo = async (id: string) => {
    setTodos(prev => prev.filter(t => t.id !== id));
    if (session) {
      const action: SyncAction = { id, type: 'DELETE', payload: id, timestamp: Date.now() };
      setSyncQueue(prev => [...prev, action]);
      setTimeout(() => processSyncQueue(), 0);
    }
  };

  const handleUpdateTodoText = async (id: string, newText: string) => {
    if (!newText.trim()) return;
    const nowTs = Date.now();
    setTodos(prev => prev.map(t => t.id === id ? { ...t, text: newText, updatedAt: nowTs } : t));
    if (session) {
      const action: SyncAction = { id, type: 'UPDATE', payload: { text: newText }, timestamp: nowTs };
      setSyncQueue(prev => [...prev, action]);
      setTimeout(() => processSyncQueue(), 0);
    }
  };
  
  const handleBatchImport = async (importedTodos: Todo[]) => {
    const existingIds = new Set(todos.map(t => t.id));
    const newTodos = importedTodos.filter(t => !existingIds.has(t.id));
    if (newTodos.length === 0) return;
    const nowTs = Date.now();
    const preparedTodos = newTodos.map(t => ({ ...t, updatedAt: t.updatedAt || nowTs }));
    setTodos(prev => [...prev, ...preparedTodos]);
    if (session) {
        const actions: SyncAction[] = preparedTodos.map(t => ({
            id: t.id, type: 'INSERT', payload: t, timestamp: nowTs
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

  // --- 监听 Tooltip 子窗口的操作 ---
  useEffect(() => {
    const removeListener = window.desktopCalendar?.onTooltipAction?.((action) => {
      const { type, payload } = action;
      if (payload && payload.dateKey) {
        setActiveTooltipDate(payload.dateKey);
      }

      if (type === 'ADD') {
        handleAddTodo(payload.text, payload.dateKey);
      } 
      else if (type === 'TOGGLE') {
        handleToggleTodo(payload.id); 
      } 
      else if (type === 'DELETE') {
        handleDeleteTodo(payload.id); 
      } 
      else if (type === 'CX') {
         window.desktopCalendar?.hideTooltip?.();
         setActiveTooltipDate(null);
      }
    });
    return () => removeListener?.();
  }, [todos]); 

  // --- 鼠标交互 (核心修改) ---

  const handleContainerMouseEnter = () => {
    isMouseInsideRef.current = true;
    cancelCollapse();
    
    // 如果是卷起状态，移入即展开
    if (isCollapsed) {
      setIsHoverExpanded(true);
    }
  };

  const handleContainerMouseLeave = () => {
    isMouseInsideRef.current = false;
    
    // 如果是卷起模式下触发的展开，才需要考虑收起
    if (isCollapsed && isHoverExpanded) {
      scheduleCollapse();
    }
  };

  const handleMouseEnterCell = (dateKey: string, e: ReactMouseEvent) => {
    if (isResizing) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const tasks = getTasksForDate(dateKey);

    if (tasks.length === 0) {
      window.desktopCalendar?.hideTooltip?.();
      setActiveTooltipDate(null);
      return;
    }

    setActiveTooltipDate(dateKey);

    window.desktopCalendar?.showTooltip?.({
      x: rect.right,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      data: { dateKey, tasks }
    });
  };

  const handleMouseLeaveAnywhere = () => {};

  const handleAppClick = () => {
    // 点击空白处，关闭一些轻量级菜单
    window.desktopCalendar?.hideTooltip?.();
    setActiveTooltipDate(null);
    setIsToolsMenuOpen(false); 
    setIsOpacityMenuOpen(false); 
    // [新增] 关闭日期选择器
    setShowYearPicker(false);
    setShowMonthPicker(false);
  };

  // --- 日历生成 ---
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const calendarCells = [];
  
  const prevMonthLastDate = new Date(year, month, 0); 
  const prevMonthDaysCount = prevMonthLastDate.getDate();
  const prevMonthYear = prevMonthLastDate.getFullYear();
  const prevMonthIdx = prevMonthLastDate.getMonth();

  const isMiniMode = winSize.width < 500 || winSize.height < 450;

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

  const rowCount = calendarCells.length / 7;

  // --- 窗口高度控制 Effect ---
  useLayoutEffect(() => {
    // 1. 如果处于“完全卷起”状态
    if (!isEffectivelyOpen) {
       window.desktopCalendar?.resizeWindow({ width: winSize.width, height: 32 });
       return;
    }
    
    // 2. 如果处于展开状态
    if (contentRef.current) {
       const actualContentHeight = contentRef.current.offsetHeight;
       if (winSize.height < 100 || Math.abs(winSize.height - actualContentHeight) > 5) {
          window.desktopCalendar?.resizeWindow({ 
             width: winSize.width, 
             height: actualContentHeight 
          });
       }
    }
  }, [rowCount, currentDate, isCollapsed, isHoverExpanded, isAnyPopupOpen]); 
  
  // 辅助数据：年份列表和月份列表
  const startYear = 2020;
  const yearsList = Array.from({ length: 20 }, (_, i) => startYear + i); // 2020-2039
  const monthsList = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div 
      // 绑定鼠标事件到最外层
      onMouseEnter={handleContainerMouseEnter}
      onMouseLeave={handleContainerMouseLeave}
      onClick={handleAppClick}
      className="w-full h-full flex flex-col overflow-hidden bg-transparent select-none"
    >
      <div 
        ref={contentRef} 
        // [核心修改] 动态背景 + 锁定时移除所有框体效果(border, shadow, ring, blur)
        style={{ backgroundColor: `rgba(0, 0, 0, ${bgOpacity})` }}
        className={`w-full h-fit flex flex-col transition-all duration-300 rounded-xl overflow-hidden
          ${isLocked 
            ? 'border-transparent shadow-none backdrop-blur-none ring-0' 
            : 'border border-white/10 ring-1 ring-black/20 shadow-2xl backdrop-blur-xl'
          }
          ${!isEffectivelyOpen ? 'rounded-b-xl' : ''} 
        `}
      >
        {/* --- 标题栏 --- */}
        <div 
          onMouseEnter={() => { if (isCollapsed) setIsHoverExpanded(true); }}
          className={`h-8 flex items-center justify-between px-3 bg-white/5 flex-shrink-0 relative 
            ${isEffectivelyOpen ? 'border-b' : ''} 
            ${isLocked ? 'border-transparent' : 'border-white/10'}
          `}
        >
          {!isLocked && <div className="absolute inset-0 drag-region pointer-events-none" />}
          {/* 左侧：图标 + 下拉菜单触发器 */}
          <div className="flex items-center gap-1 min-w-0">
            <CalendarIcon size={16} className="text-emerald-400 flex-shrink-0" />
            <button 
               onClick={(e) => { e.stopPropagation(); setIsToolsMenuOpen(!isToolsMenuOpen); setIsOpacityMenuOpen(false); setShowYearPicker(false); setShowMonthPicker(false); }}
               className="flex items-center gap-1 hover:bg-white/10 px-1.5 py-0.5 rounded transition-colors no-drag group"
            >
               <span className="text-sm font-medium text-slate-200">桌面日历</span>
               <ChevronDown size={12} className={`text-slate-400 transition-transform duration-200 ${isToolsMenuOpen ? 'rotate-180 text-emerald-400' : 'group-hover:text-emerald-400'}`} />
            </button>
          </div>

          {/* 右侧：功能按钮区 */}
          <div className="flex items-center gap-1 no-drag flex-shrink-0">
             {/* 透明度调节按钮 */}
             <div className="relative">
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsOpacityMenuOpen(!isOpacityMenuOpen); setIsToolsMenuOpen(false); }}
                  className={`p-1.5 rounded hover:bg-white/10 transition-colors ${isOpacityMenuOpen ? 'text-emerald-400' : 'text-slate-400 hover:text-white'}`}
                  title="调节透明度"
                >
                  <Sliders size={14} />
                </button>
                {/* 透明度调节条弹窗 */}
                {isOpacityMenuOpen && (
                  <div 
                    onClick={(e) => e.stopPropagation()} 
                    className="absolute top-full right-0 mt-2 p-2 bg-[#25262b] border border-white/10 rounded-lg w-32 shadow-xl z-50 flex flex-col gap-1 animate-in fade-in slide-in-from-top-2"
                  >
                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                      <span>透明度</span>
                      <span>{Math.round(bgOpacity * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.1" 
                      max="0.9" 
                      step="0.05" 
                      value={bgOpacity}
                      onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
                      className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-emerald-400" 
                    />
                  </div>
                )}
             </div>

             <button onClick={() => setIsLocked(!isLocked)} className={`p-1.5 rounded hover:bg-white/10 transition-colors ${isLocked ? 'text-red-400' : 'text-slate-400 hover:text-white'}`} title={isLocked ? "解锁窗口" : "锁定位置"}>
               {isLocked ? <Lock size={14} /> : <Unlock size={14} />}
             </button>
             <button onClick={() => setIsCollapsed(!isCollapsed)} className={`p-1.5 rounded hover:bg-white/10 transition-colors ${isCollapsed ? 'text-emerald-400' : 'text-slate-400 hover:text-white'}`} title={isCollapsed ? "展开" : "卷起"}>
               {isCollapsed ? <Square size={14} /> : <Minus size={14} />}
             </button>
          </div>

          {/* --- 下拉菜单 --- */}
          {isToolsMenuOpen && (
            <div className="absolute top-full left-2 mt-1 z-50 bg-[#25262b] border border-white/10 rounded-lg shadow-xl p-1.5 flex flex-col gap-1 min-w-[130px] animate-in fade-in slide-in-from-top-2 no-drag">
               <button onClick={() => { setIsSearchOpen(true); setIsToolsMenuOpen(false); }} className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-300 hover:bg-white/10 hover:text-emerald-400 rounded text-left transition-colors">
                 <Search size={14} /> 搜索事项
               </button>
               <button onClick={() => { setIsDataToolsOpen(true); setIsToolsMenuOpen(false); }} className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-300 hover:bg-white/10 hover:text-emerald-400 rounded text-left transition-colors">
                 <Database size={14} /> 数据管理
               </button>
               <button onClick={() => { setIsHistoryOpen(true); setIsToolsMenuOpen(false); }} className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-300 hover:bg-white/10 hover:text-emerald-400 rounded text-left transition-colors">
                 <History size={14} /> 历史归档
               </button>
               
               <div className="h-[1px] bg-white/10 my-0.5"></div>
               
               <button 
                 onClick={() => { if (!session) { setShowAuth(true); setIsToolsMenuOpen(false); } }}
                 className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded text-left transition-colors ${session ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-300 hover:bg-white/10 hover:text-emerald-400'}`}
               >
                 <UserIcon size={14} />
                 {session ? '已同步' : '登录/注册'}
               </button>
               {session && (
                  <button 
                    onClick={async () => { await supabase.auth.signOut(); setIsToolsMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-red-400 hover:bg-white/10 rounded text-left transition-colors mt-1"
                  >
                    退出登录
                  </button>
               )}
            </div>
          )}
        </div>

        {/* --- 主体内容 --- */}
        <div className={`flex-1 flex flex-col min-h-0 relative transition-opacity duration-200 ${isEffectivelyOpen ? 'opacity-100' : 'opacity-0 pointer-events-none h-0'}`}>
          <div className="flex items-center justify-between px-2 py-0.1 bg-white/5 flex-shrink-0">
             {/* [修改] 网格选择器布局 */}
             <div className="flex items-center gap-0.5 text-lg font-light text-white relative">
               
               {/* 年份触发器 */}
               <button 
                 onClick={(e) => { e.stopPropagation(); setShowYearPicker(!showYearPicker); setShowMonthPicker(false); }}
                 className="hover:text-emerald-400 hover:bg-white/10 px-0.6 rounded transition-colors no-drag"
               >
                 {year}
               </button>
               <span className="px-0.3 text-white font-light">年</span>
               
               {/* 年份网格弹窗 (修改：去除间距 gap-0，最大化字体) */}
               {showYearPicker && (
                 <div 
                   onClick={(e) => e.stopPropagation()}
                   className="absolute top-full left-0 mt-2 p-2 bg-[#25262b] border border-white/10 rounded-lg shadow-xl z-50 w-72 animate-in fade-in slide-in-from-top-2 no-drag"
                 >
                   {/* 修改：gap-0 */}
                   <div className="grid grid-cols-4 gap-0">
                     {yearsList.map(y => {
                       const count = getYearlyCompleted(y);
                       return (
                         <button
                           key={y}
                           onClick={() => {
                             setCurrentDate(new Date(y, month, 1));
                             setShowYearPicker(false);
                           }}
                           // 修改：w-full, h-full, py-3, text-1xl
                           className={`w-full flex flex-col items-center justify-center py-2 rounded hover:bg-white/10 transition-colors ${y === year ? 'bg-emerald-600/20 text-emerald-400 font-bold' : 'text-slate-300'}`}
                         >
                           <span className="text-1xl leading-none">{y}</span>
                           <span className="text-[12px] text-slate-500 scale-90 mt-0.5">完成: {count}</span>
                         </button>
                       );
                     })}
                   </div>
                 </div>
               )}
               
               {/* 月份触发器 */}
               <button 
                 onClick={(e) => { e.stopPropagation(); setShowMonthPicker(!showMonthPicker); setShowYearPicker(false); }}
                 className="hover:text-emerald-400 hover:bg-white/10 px-0.6 rounded transition-colors no-drag ml-1"
               >
                 {String(month + 1).padStart(2, '0')}
               </button>
               <span className="px-0.3 text-white font-light">月</span>

               {/* 月份网格弹窗 (修改：去除间距 gap-0，最大化字体) */}
               {showMonthPicker && (
                 <div 
                   onClick={(e) => e.stopPropagation()}
                   className="absolute top-full left-10 mt-2 p-2 bg-[#25262b] border border-white/10 rounded-lg shadow-xl z-50 w-64 animate-in fade-in slide-in-from-top-2 no-drag"
                 >
                   {/* 修改：gap-0 */}
                   <div className="grid grid-cols-3 gap-0">
                     {monthsList.map(m => {
                        const count = getMonthlyCompleted(year, m);
                        return (
                         <button
                           key={m}
                           onClick={() => {
                             setCurrentDate(new Date(year, m, 1));
                             setShowMonthPicker(false);
                           }}
                           // 修改：w-full, h-full, py-2, text-1xl
                           className={`w-full flex flex-col items-center justify-center py-1 rounded hover:bg-white/10 transition-colors ${m === month ? 'bg-emerald-600/20 text-emerald-400 font-bold' : 'text-slate-300'}`}
                         >
                           <span className="text-1xl leading-none">{m + 1}月</span>
                           <span className="text-[12px] text-slate-500 scale-90 mt-0.5">完成: {count}</span>
                         </button>
                       );
                     })}
                   </div>
                 </div>
               )}
             </div>

             <div className="flex gap-1 no-drag">
               <button onClick={() => setCurrentDate(new Date())} className="p-1 hover:bg-white/10 rounded text-emerald-400" title="回到今天"><RotateCcw size={14} /></button>
               <div className="flex bg-white/5 rounded">
                 <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-1 hover:bg-white/10 rounded-l text-slate-300"><ChevronLeft size={16} /></button>
                 <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-1 hover:bg-white/10 rounded-r text-slate-300"><ChevronRight size={16} /></button>
               </div>
             </div>
          </div>

          <div className="grid grid-cols-7 border-b border-white/5 bg-black/10 flex-shrink-0">
            {CHINESE_NUMS.slice(0, 7).map((d,i)=>(
              <div key={i} className="text-[10px] text-slate-200 py-1 text-center">{d}</div>
            ))}
          </div>

          <div className="w-full grid grid-cols-7 auto-rows-fr overflow-hidden bg-transparent">
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
                 <button onClick={() => setSelectedDateKey(null)} className="p-1 hover:bg-white/10 rounded-full text-slate-200"><X size={16} /></button>
               </div>
               <div ref={detailScrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                 {getTasksForDate(selectedDateKey).map(t => (
                   <div key={t.id} className="flex gap-2 items-center p-2 rounded hover:bg-white/5 group bg-black/20">
                     <button onClick={() => handleToggleTodo(t.id)} className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${t.completed ? 'bg-emerald-600 border-transparent' : 'border-slate-200'}`}>
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
                            className={`block text-xs break-all cursor-text ${t.completed ? 'text-slate-200 line-through' : 'text-slate-200'}`}
                            title="点击编辑"
                         >
                            {t.text}
                         </span>
                       )}
                     </div>

                     <button onClick={() => handleDeleteTodo(t.id)} className="opacity-0 group-hover:opacity-100 text-slate-200 hover:text-red-400 flex-shrink-0"><Trash2 size={10}/></button>
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
