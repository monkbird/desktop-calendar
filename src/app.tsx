import { useState, useEffect, useRef, useLayoutEffect, useMemo, lazy, Suspense, useCallback } from 'react';
import type { MouseEvent as ReactMouseEvent, CSSProperties } from 'react';
import {
  Calendar as CalendarIcon,
  RotateCcw, Lock, Unlock, Minus, Square,
  ChevronLeft, ChevronRight, X, Check, Trash2,
  History, User as UserIcon, Search, Database,
  ChevronDown, Sliders, Palette
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { THEMES, applyTheme, getStoredThemeId, getTheme, lerpThemeColors } from './theme';
import type { Todo, SyncAction } from './types';
import { 
  CHINESE_NUMS, getDaysInMonth, getFirstDayOfMonth, formatDateKey, getDateInfo 
} from './utils';
import { CalendarCell } from './components/CalendarCell';
import { supabase } from './supabase';

// [优化] 懒加载非首屏组件，减少初始内存占用
const AuthModal = lazy(() => import('./components/AuthModal').then(module => ({ default: module.AuthModal })));

// --- 移植自 iOS 端的逻辑函数 ---

// 辅助：计算下一个周期日期
const getNextDate = (dateStr: string, type: 'monthly' | 'yearly') => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const current = new Date(y, m - 1, d);
  let nextY = current.getFullYear();
  let nextM = current.getMonth();
  const day = current.getDate();

  if (type === 'monthly') nextM++;
  else nextY++;
  
  // 处理月底日期（如1月31日下一月无31日的情况）
  const daysInMonth = new Date(nextY, nextM + 1, 0).getDate();
  const clampedDay = Math.min(day, daysInMonth);
  
  return formatDateKey(new Date(nextY, nextM, clampedDay));
};

// 逻辑1：迁移过期任务到今天
const performMigration = (inputTodos: Todo[]) => {
  const todayKey = formatDateKey(new Date());
  let hasChanges = false;
  const newSyncActions: SyncAction[] = [];
  const now = Date.now();

  const newTodos = inputTodos.map(todo => {
      // 如果未完成且日期在今天之前（注意：这里不迁移长周期/重复任务，以免逻辑冲突，可视需求调整）
      if (!todo.completed && todo.targetDate < todayKey && todo.repeat === 'none' && !todo.isLongTerm) {
          hasChanges = true;
          const updatedTodo = {
              ...todo,
              targetDate: todayKey,
              updatedAt: now
          };
          
          newSyncActions.push({
              id: todo.id,
              type: 'UPDATE',
              payload: { targetDate: todayKey, updatedAt: now },
              timestamp: now
          });
          
          return updatedTodo;
      }
      return todo;
  });

  return { newTodos, newSyncActions, hasChanges };
};

// 逻辑2：检查并生成重复任务
const checkAndRegenerateRepeatingTodos = (inputTodos: Todo[]) => {
  const todayKey = formatDateKey(new Date());
  const now = Date.now();
  
  let hasChanges = false;
  const newSyncActions: SyncAction[] = [];
  const todosMap = new Map(inputTodos.map(t => [t.id, t]));
  const addedTodos: Todo[] = [];

  inputTodos.forEach(todo => {
    // 仅处理月/年重复（日/周重复通常在完成时触发，此处也可扩展）
    if (todo.repeat !== 'monthly' && todo.repeat !== 'yearly') return;

    const anchorDate = todo.startDate || todo.targetDate;
    const nextStartKey = getNextDate(anchorDate, todo.repeat as 'monthly' | 'yearly');
    let nextEndKey: string | undefined;
    if (todo.endDate) {
        nextEndKey = getNextDate(todo.endDate, todo.repeat as 'monthly' | 'yearly');
    }

    if (todo.completed) {
        // Case A: 已完成 -> 归档旧任务，生成新周期任务
        const historyId = `${todo.id}_hist_${todo.targetDate}_${now}`;
        const historyTodo: Todo = {
            ...todo,
            id: historyId,
            isLongTerm: false,
            repeat: 'none',
            startDate: undefined,
            endDate: undefined,
        };
        
        addedTodos.push(historyTodo);
        newSyncActions.push({ id: historyId, type: 'INSERT', payload: historyTodo, timestamp: now });

        const updatedTodo: Todo = {
            ...todo,
            completed: false,
            completedAt: undefined,
            targetDate: nextStartKey,
            startDate: nextStartKey,
            endDate: nextEndKey,
            updatedAt: now
        };
        
        todosMap.set(todo.id, updatedTodo);
        newSyncActions.push({ 
            id: todo.id, type: 'UPDATE', 
            payload: { completed: false, completedAt: null as any, targetDate: nextStartKey, startDate: nextStartKey, endDate: nextEndKey, updatedAt: now }, 
            timestamp: now 
        });
        hasChanges = true;

    } else {
        // Case B: 未完成但已过周期 -> 自动顺延
        let currentNextStart = nextStartKey;
        let currentNextEnd = nextEndKey;
        let shouldUpdate = false;

        // 查找覆盖今天的周期
        while (todayKey >= currentNextStart) {
            shouldUpdate = true;
            const tempNext = getNextDate(currentNextStart, todo.repeat as 'monthly' | 'yearly');
            if (todayKey >= tempNext) {
                currentNextStart = tempNext;
                if (currentNextEnd) currentNextEnd = getNextDate(currentNextEnd, todo.repeat as 'monthly' | 'yearly');
            } else {
                break;
            }
        }
        
        if (shouldUpdate) {
             const updatedTodo: Todo = {
                ...todo,
                targetDate: currentNextStart,
                startDate: currentNextStart,
                endDate: currentNextEnd,
                updatedAt: now
            };
            
            todosMap.set(todo.id, updatedTodo);
            newSyncActions.push({
                id: todo.id,
                type: 'UPDATE',
                payload: { targetDate: currentNextStart, startDate: currentNextStart, endDate: currentNextEnd, updatedAt: now },
                timestamp: now
            });
            hasChanges = true;
        }
    }
  });
  
  if (!hasChanges) return null;
  return { newTodos: [...Array.from(todosMap.values()), ...addedTodos], newSyncActions };
};

export default function App() {
  const [isLocked, setIsLocked] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHoverExpanded, setIsHoverExpanded] = useState(false);

  // 窗口内下拉菜单（桌面日历）
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  // 主题色选择下拉
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [themeId, setThemeId] = useState(getStoredThemeId);
  // 侧贴菜单弹窗（选择器 + 数据面板），同一时间只开一个
  const [activeMenu, setActiveMenu] = useState<'year' | 'month' | 'opacity' | 'search' | 'history' | 'datatools' | null>(null);

  // 透明度调节状态
  const [bgOpacity, setBgOpacity] = useState(() => {
    const saved = localStorage.getItem('desktop-bg-opacity');
    return saved ? parseFloat(saved) : 0.5; 
  });

  // 搜索/历史归档/数据管理已迁移到侧贴菜单窗口（activeMenu），不再使用窗口内弹窗状态

  const contentRef = useRef<HTMLDivElement>(null);
  const detailScrollRef = useRef<HTMLDivElement | null>(null);

  // 鼠标追踪与延时收起 Ref
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMouseInsideRef = useRef(false);
  // [新增] Tooltip 防抖定时器，减少 IPC 通信频率，优化内存和 CPU
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  
  // 默认显示当月
  const [currentDate, setCurrentDate] = useState(new Date());

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');

  // 搜索跳转后的目标日期高亮（2 秒闪烁后自动消除）
  const [flashDateKey, setFlashDateKey] = useState<string | null>(null);
  
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
    return !!activeMenu ||
           isToolsMenuOpen ||
           isThemeMenuOpen ||
           !!selectedDateKey ||
           showAuth ||
           !!activeTooltipDate;
  }, [activeMenu, isToolsMenuOpen, isThemeMenuOpen, selectedDateKey, showAuth, activeTooltipDate]);

  // 启动时应用存储的主题色
  useEffect(() => { applyTheme(themeId); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [todos, activeTooltipDate]); // tooltip 打开时推送数据，todos 变化时同步更新

  // todos 变化时实时同步到打开的数据面板（搜索/历史归档/数据管理）
  useEffect(() => {
    if (activeMenu === 'search' || activeMenu === 'history' || activeMenu === 'datatools') {
      window.desktopCalendar?.updateMenuData?.({ mode: activeMenu, data: { todos } });
    }
  }, [todos, activeMenu]);

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
            updated_at: new Date(t.updatedAt || Date.now()).toISOString(),
            // [新增] 字段映射
            is_long_term: t.isLongTerm,
            start_date: t.startDate,
            end_date: t.endDate,
            is_all_day: t.isAllDay,
            is_all_year: t.isAllYear,
            is_month: t.isMonth,
            repeat: t.repeat,
            order: t.order,
            is_pinned: t.isPinned
          };
          let res = await supabase.from('todos').insert(dbRow);
          // [容错] 云端表若缺少可选列（order / is_pinned），PostgREST 会报 PGRST204。
          // 剔除可选列重试一次，避免该操作永久卡在同步队列里反复重试
          if (res.error?.code === 'PGRST204') {
            delete (dbRow as any).order;
            delete (dbRow as any).is_pinned;
            res = await supabase.from('todos').insert(dbRow);
          }
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
          
          // [新增] 字段更新映射
          if (t.isLongTerm !== undefined) updates.is_long_term = t.isLongTerm;
          if (t.startDate !== undefined) updates.start_date = t.startDate;
          if (t.endDate !== undefined) updates.end_date = t.endDate;
          if (t.isAllDay !== undefined) updates.is_all_day = t.isAllDay;
          if (t.isAllYear !== undefined) updates.is_all_year = t.isAllYear;
          if (t.isMonth !== undefined) updates.is_month = t.isMonth;
          if (t.repeat !== undefined) updates.repeat = t.repeat;
          if (t.order !== undefined) updates.order = t.order;
          if (t.isPinned !== undefined) updates.is_pinned = t.isPinned;

          let res = await supabase.from('todos').update(updates).eq('id', id);
          // [容错] 同上：云端缺少 order / is_pinned 列时剔除后重试一次
          if (res.error?.code === 'PGRST204') {
            delete updates.order;
            delete updates.is_pinned;
            res = await supabase.from('todos').update(updates).eq('id', id);
          }
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
        updatedAt: d.updated_at ? new Date(d.updated_at).getTime() : 0,
        // [新增] 读取字段
        isLongTerm: d.is_long_term,
        startDate: d.start_date,
        endDate: d.end_date,
        isAllDay: d.is_all_day,
        isAllYear: d.is_all_year,
        isMonth: d.is_month,
        repeat: d.repeat,
        order: d.order,
        isPinned: d.is_pinned
      }));

      // 合并云端与本地数据：同一条目按 updatedAt 取较新者；有未推送的本地操作时以本地为准
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

  // 关闭侧贴菜单弹窗（IPC 隐藏窗口 + 清本地状态）
  const closeMenu = () => {
    window.desktopCalendar?.hideMenu?.();
    setActiveMenu(null);
  };

  // 打开侧贴数据面板（搜索/历史归档/数据管理）
  const openMenuPanel = (mode: 'search' | 'history' | 'datatools') => {
    // 与任务子窗口、窗口内下拉互斥
    window.desktopCalendar?.hideTooltip?.();
    setActiveTooltipDate(null);
    setIsToolsMenuOpen(false);
    setIsThemeMenuOpen(false);
    window.desktopCalendar?.showMenu?.({ mode, data: { todos } });
    setActiveMenu(mode);
  };

  // 调度收起
  const scheduleCollapse = () => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);

    // 0.2秒后尝试收起
    collapseTimerRef.current = setTimeout(() => {
      // 再次检查：如果有弹窗，或者鼠标又回来了，就不收起
      if (isAnyPopupOpen || isMouseInsideRef.current) return;

      setIsHoverExpanded(false);
      // 同时关闭可能还开着的菜单（双重保险）
      setIsToolsMenuOpen(false);
      closeMenu();
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

  // 搜索跳转的目标日期高亮 2 秒后自动消除
  useEffect(() => {
    if (!flashDateKey) return;
    const timer = setTimeout(() => setFlashDateKey(null), 2000);
    return () => clearTimeout(timer);
  }, [flashDateKey]);

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
        if (activeMenu !== 'search') {
          openMenuPanel('search');
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeMenu, todos]);

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

  // [优化] 预计算渲染任务映射，确保引用稳定，减少子组件重渲染
  const EMPTY_TASKS: Todo[] = [];
  
  const tasksForRender = useMemo(() => {
    const map: Record<string, Todo[]> = {};
    const sortFn = (a: Todo, b: Todo) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return (a.order || 0) - (b.order || 0);
    };

    todos.forEach(t => {
      // 1. 已完成任务：始终显示在目标日期
      if (t.completed) {
        if (!map[t.targetDate]) map[t.targetDate] = [];
        map[t.targetDate].push(t);
      } else {
        // 2. 未完成任务
        if (t.targetDate < todayKey) {
          // 过期未完成 -> 归到今天
          if (!map[todayKey]) map[todayKey] = [];
          map[todayKey].push(t);
        } else {
          // 今天及未来的未完成 -> 显示在目标日期
          if (!map[t.targetDate]) map[t.targetDate] = [];
          map[t.targetDate].push(t);
        }
      }
    });

    // 排序
    Object.keys(map).forEach(k => {
      map[k].sort(sortFn);
    });

    return map;
  }, [todos, todayKey]);
  
  const getTasksForDate = useCallback((dateKey: string) => {
    return tasksForRender[dateKey] || EMPTY_TASKS;
  }, [tasksForRender]);

  // --- 统计辅助函数 ---
  const getYearlyCompleted = (y: number) => {
    const prefix = `${y}-`;
    return todos.filter(t => t.completed && t.targetDate.startsWith(prefix)).length;
  };

  const getMonthlyCompleted = (y: number, m: number) => {
    const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
    return todos.filter(t => t.completed && t.targetDate.startsWith(prefix)).length;
  };

  // 年份/月份选择器数据
  const startYear = 2020;
  const yearsList = Array.from({ length: 20 }, (_, i) => startYear + i); // 2020-2039
  const monthsList = Array.from({ length: 12 }, (_, i) => i);

  // --- 侧贴菜单弹窗：打开/切换（选择器类） ---
  const toggleMenu = (mode: 'year' | 'month' | 'opacity') => {
    if (activeMenu === mode) {
      closeMenu();
      return;
    }
    // 与任务子窗口、窗口内下拉互斥
    window.desktopCalendar?.hideTooltip?.();
    setActiveTooltipDate(null);
    setIsToolsMenuOpen(false);
    setIsThemeMenuOpen(false);

    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    let data: any = null;
    if (mode === 'year') {
      data = { current: y, items: yearsList.map(yy => ({ value: yy, count: getYearlyCompleted(yy) })) };
    } else if (mode === 'month') {
      data = { current: m, items: monthsList.map(mm => ({ value: mm, count: getMonthlyCompleted(y, mm) })) };
    } else if (mode === 'opacity') {
      data = { value: bgOpacity };
    }
    window.desktopCalendar?.showMenu?.({ mode, data });
    setActiveMenu(mode);
  };

  // --- CRUD 操作 ---

  const handleAddTodo = async (text: string, dateKey: string) => {
    if (!text.trim()) return;
    const id = crypto.randomUUID();
    const nowTs = Date.now();
    const newTodo: Todo = { 
      id, text, completed: false, targetDate: dateKey, createdAt: nowTs, updatedAt: nowTs, order: nowTs 
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

  const handleReorderTodo = async (reorderedIds: string[]) => {
    const nowTs = Date.now();
    setTodos(prev => {
      const prevMap = new Map(prev.map(t => [t.id, t]));
      const updates: Todo[] = [];
      reorderedIds.forEach((id, index) => {
        const t = prevMap.get(id);
        if (t && t.order !== index) {
          updates.push({ ...t, order: index, updatedAt: nowTs });
        }
      });
      if (updates.length === 0) return prev;
      return prev.map(t => {
        const update = updates.find(u => u.id === t.id);
        return update || t;
      });
    });

    if (session) {
       reorderedIds.forEach((id, index) => {
          const action: SyncAction = { 
             id, type: 'UPDATE', payload: { order: index }, timestamp: nowTs 
          };
          setSyncQueue(prev => [...prev, action]);
       });
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

  // --- [新增] 自动处理规则：迁移过期任务与生成重复任务 ---
  useEffect(() => {
    if (todos.length === 0) return;

    let currentTodos = todos;
    let hasAnyChanges = false;
    let combinedSyncActions: SyncAction[] = [];

    // 1. 迁移过期
    const migrationResult = performMigration(currentTodos);
    if (migrationResult.hasChanges) {
        currentTodos = migrationResult.newTodos;
        combinedSyncActions.push(...migrationResult.newSyncActions);
        hasAnyChanges = true;
    }

    // 2. 生成重复
    const regenResult = checkAndRegenerateRepeatingTodos(currentTodos);
    if (regenResult) {
        currentTodos = regenResult.newTodos;
        combinedSyncActions.push(...regenResult.newSyncActions);
        hasAnyChanges = true;
    }

    // 如果有变化，更新状态并触发同步
    if (hasAnyChanges) {
        console.log('Desktop: Auto-processing todos rules triggered.');
        setTodos(currentTodos);
        setSyncQueue(prev => [...prev, ...combinedSyncActions]);
        // 触发一次同步
        setTimeout(() => processSyncQueue(), 0);
    }
  }, [todos]); // 依赖 todos，当数据变化时重新检查

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
      else if (type === 'UPDATE') {
        handleUpdateTodoText(payload.id, payload.text);
      }
      else if (type === 'REORDER') {
        handleReorderTodo(payload.reorderedIds);
      }
      else if (type === 'CX') {
         window.desktopCalendar?.hideTooltip?.();
         setActiveTooltipDate(null);
      }
    });
    return () => removeListener?.();
  }, [todos]);

  // --- 监听菜单窗口的操作 ---
  useEffect(() => {
    const removeListener = window.desktopCalendar?.onMenuAction?.((action) => {
      const { type, payload } = action;

      // 菜单侧自动关闭（鼠标移出超时）
      if (type === 'CX') {
        closeMenu();
        return;
      }

      if (type === 'SELECT_YEAR') {
        setCurrentDate(new Date(payload.year, currentDate.getMonth(), 1));
        closeMenu();
      }
      else if (type === 'SELECT_MONTH') {
        setCurrentDate(new Date(currentDate.getFullYear(), payload.month, 1));
        closeMenu();
      }
      else if (type === 'NAVIGATE') {
        const d = new Date(payload.y, payload.m, payload.d);
        setCurrentDate(d);
        // 跳转后高亮闪烁目标日期，让落点可见
        setFlashDateKey(formatDateKey(d));
        closeMenu();
      }
      else if (type === 'TOGGLE_TODO') {
        handleToggleTodo(payload.id);
      }
      else if (type === 'DELETE_TODO') {
        handleDeleteTodo(payload.id);
      }
      else if (type === 'IMPORT_TODOS') {
        handleBatchImport(payload.todos);
      }
      else if (type === 'SET_OPACITY') {
        // 拖动滑块时实时生效，不关闭菜单
        setBgOpacity(payload.value);
      }
    });
    return () => removeListener?.();
  }, [currentDate, todos]);

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

  const handleMouseEnterCell = useCallback((dateKey: string, e: ReactMouseEvent) => {
    if (isResizing) return;

    // [优化] 清除之前的防抖定时器
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const tasks = getTasksForDate(dateKey);

    if (tasks.length === 0) {
      // 即使是隐藏，也稍微防抖一下，避免快速划过时频繁触发 IPC
      tooltipTimerRef.current = setTimeout(() => {
        window.desktopCalendar?.hideTooltip?.();
        setActiveTooltipDate(null);
      }, 100);
      return;
    }

    // [优化] 延迟 150ms 显示，避免鼠标快速划过时触发大量计算和通信
    tooltipTimerRef.current = setTimeout(() => {
      setActiveTooltipDate(dateKey);

      // showTooltip 携带数据（主进程附加 freshShow 标记后推送，用于重置入场动画状态）；
      // 后续 todos 变化由 useEffect [todos, activeTooltipDate] 经 updateTooltipData 增量推送
      window.desktopCalendar?.showTooltip?.({
        x: rect.right,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        data: { dateKey, tasks }
      });
    }, 240);
  }, [isResizing, getTasksForDate]);

  const handleMouseLeaveAnywhere = useCallback(() => {
    // [优化] 鼠标移出格子时，清除待执行的显示/隐藏任务
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
  }, []);

  const handleAppClick = () => {
    // 点击空白处，关闭任务子窗口与菜单
    window.desktopCalendar?.hideTooltip?.();
    setActiveTooltipDate(null);
    setIsToolsMenuOpen(false);
    setIsThemeMenuOpen(false);
    closeMenu();
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
        isFlashed={dateKey === flashDateKey}
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
        isFlashed={dateKey === flashDateKey}
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
        isFlashed={dateKey === flashDateKey}
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
        // [核心修改] 动态背景（跟随主题底色） + 锁定时移除所有框体效果(border, shadow, ring, blur)
        // 米白主题透明态：60% 以上保持纯米白（与其他主题界限对齐），60%→20% 连续渐变到曜石黑配色
        style={(() => {
          const t = themeId === 'paper' ? Math.min(1, Math.max(0, (0.6 - bgOpacity) / 0.4)) : 0;
          // 渐变终点在曜石黑基础上把悬停衬底加强到 0.22，与 .text-legible 的透明态增强一致
          const colors = t > 0 ? lerpThemeColors(getTheme('paper').colors, { ...getTheme('obsidian').colors, hover: 'rgba(255, 255, 255, 0.22)' }, t) : getTheme(themeId).colors;
          return {
            backgroundColor: `rgba(${colors.baseRGB}, ${bgOpacity})`,
            ...(t > 0 ? {
              '--color-card': colors.card,
              '--color-elevated': colors.elevated,
              '--color-line': colors.line,
              '--color-hover': colors.hover,
              '--color-ink': colors.ink,
              '--color-ink2': colors.ink2,
              '--color-ink3': colors.ink3,
              '--color-mint': colors.mint,
              '--color-mint-deep': colors.mintDeep,
              '--color-mint-ink': colors.mintInk,
              '--color-mint-dim': colors.mintDim,
              fontWeight: t > 0.3 ? 500 : 400,
              textShadow: `0 1px 2px rgba(0, 0, 0, ${0.9 * t}), 0 0 8px rgba(0, 0, 0, ${0.55 * t})`,
            } : {}),
          } as CSSProperties;
        })()}
        className={`w-full h-fit flex flex-col transition-all duration-300 rounded-xl overflow-hidden
          ${isLocked 
            ? 'border-transparent shadow-none backdrop-blur-none ring-0' 
            : 'border border-line ring-1 ring-black/20 shadow-2xl backdrop-blur-xl'
          }
          ${!isEffectivelyOpen ? 'rounded-b-xl' : ''}
          ${bgOpacity < 0.6 ? 'text-legible' : ''}
        `}
      >
        {/* --- 标题栏 --- */}
        <div 
          onMouseEnter={() => { if (isCollapsed) setIsHoverExpanded(true); }}
          className={`h-8 flex items-center justify-between px-3 bg-white/5 flex-shrink-0 relative 
            ${isEffectivelyOpen ? 'border-b' : ''} 
            ${isLocked ? 'border-transparent' : 'border-line'}
          `}
        >
          {!isLocked && <div className="absolute inset-0 drag-region pointer-events-none" />}
          {/* 左侧：图标 + 下拉菜单触发器 */}
          <div className="flex items-center gap-1 min-w-0">
            <CalendarIcon size={16} className="text-mint flex-shrink-0" />
            <button
               onClick={(e) => { e.stopPropagation(); setIsToolsMenuOpen(!isToolsMenuOpen); setIsThemeMenuOpen(false); closeMenu(); }}
               className="flex items-center gap-1 hover:bg-hover px-1.5 py-0.5 rounded transition-colors no-drag group"
            >
               <span className="text-sm font-medium text-ink">桌面日历</span>
               <ChevronDown size={12} className={`text-ink3 transition-transform duration-200 ${isToolsMenuOpen ? 'rotate-180 text-mint' : 'group-hover:text-mint'}`} />
            </button>
          </div>

          {/* 右侧：功能按钮区 */}
          <div className="flex items-center gap-1 no-drag flex-shrink-0">
             {/* 主题色按钮 */}
             <button
               onClick={(e) => { e.stopPropagation(); setIsThemeMenuOpen(!isThemeMenuOpen); setIsToolsMenuOpen(false); closeMenu(); }}
               className={`p-1.5 rounded hover:bg-hover transition-colors ${isThemeMenuOpen ? 'text-mint' : 'text-ink3 hover:text-ink'}`}
               title="主题颜色"
             >
               <Palette size={14} />
             </button>

             {/* 透明度调节按钮 */}
             <button
               onClick={(e) => { e.stopPropagation(); toggleMenu('opacity'); }}
               className={`p-1.5 rounded hover:bg-hover transition-colors ${activeMenu === 'opacity' ? 'text-mint' : 'text-ink3 hover:text-ink'}`}
               title="调节透明度"
             >
               <Sliders size={14} />
             </button>

             <button onClick={() => setIsLocked(!isLocked)} className={`p-1.5 rounded hover:bg-hover transition-colors ${isLocked ? 'text-danger' : 'text-ink3 hover:text-ink'}`} title={isLocked ? "解锁窗口" : "锁定位置"}>
               {isLocked ? <Lock size={14} /> : <Unlock size={14} />}
             </button>
             <button onClick={() => setIsCollapsed(!isCollapsed)} className={`p-1.5 rounded hover:bg-hover transition-colors ${isCollapsed ? 'text-mint' : 'text-ink3 hover:text-ink'}`} title={isCollapsed ? "展开" : "卷起"}>
               {isCollapsed ? <Square size={14} /> : <Minus size={14} />}
             </button>
          </div>

          {/* --- 下拉菜单（窗口内，保持旧样式） --- */}
          {isToolsMenuOpen && (
            <div
              // 阻止冒泡：否则点击项会冒泡到根节点 handleAppClick，刚打开的侧贴面板会被立刻关闭
              onClick={(e) => e.stopPropagation()}
              className="theme-keep absolute top-full left-2 mt-1 z-50 bg-elevated border border-line rounded-lg shadow-xl p-1.5 flex flex-col gap-1 min-w-[130px] no-drag"
            >
               <button onClick={() => openMenuPanel('search')} className="flex items-center gap-2 px-2 py-1.5 text-xs text-ink2 hover:bg-hover hover:text-mint rounded text-left transition-colors animate-toolbar-stagger" style={{ animationDelay: '0ms' }}>
                 <Search size={14} /> 搜索事项
               </button>
               <button onClick={() => openMenuPanel('datatools')} className="flex items-center gap-2 px-2 py-1.5 text-xs text-ink2 hover:bg-hover hover:text-mint rounded text-left transition-colors animate-toolbar-stagger" style={{ animationDelay: '110ms' }}>
                 <Database size={14} /> 数据管理
               </button>
               <button onClick={() => openMenuPanel('history')} className="flex items-center gap-2 px-2 py-1.5 text-xs text-ink2 hover:bg-hover hover:text-mint rounded text-left transition-colors animate-toolbar-stagger" style={{ animationDelay: '220ms' }}>
                 <History size={14} /> 历史归档
               </button>

               <div className="h-[1px] bg-line my-0.5"></div>

               <button
                 onClick={() => { if (!session) { setShowAuth(true); setIsToolsMenuOpen(false); } }}
                 className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded text-left transition-colors animate-toolbar-stagger ${session ? 'text-mint bg-mint-dim' : 'text-ink2 hover:bg-hover hover:text-mint'}`}
                 style={{ animationDelay: '330ms' }}
               >
                 <UserIcon size={14} />
                 {session ? '已同步' : '登录/注册'}
               </button>
               {session && (
                  <button
                    onClick={async () => { await supabase.auth.signOut(); setIsToolsMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-danger hover:bg-hover rounded text-left transition-colors animate-toolbar-stagger mt-1"
                    style={{ animationDelay: '440ms' }}
                  >
                    退出登录
                  </button>
               )}
            </div>
          )}

          {/* --- 主题色下拉（窗口内） --- */}
          {isThemeMenuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="theme-keep absolute top-full right-2 mt-1 z-50 bg-elevated border border-line rounded-lg shadow-xl p-1.5 flex flex-col gap-1 min-w-[120px] no-drag"
            >
              {THEMES.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => { setThemeId(t.id); applyTheme(t.id); }}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded text-left transition-colors hover:bg-hover animate-toolbar-stagger"
                  style={{ animationDelay: `${i * 110}ms` }}
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-white/20"
                    style={{ background: `linear-gradient(135deg, ${t.colors.mint} 0%, ${t.colors.mintDeep} 100%)` }}
                  />
                  <span className={t.id === themeId ? 'text-mint font-medium' : 'text-ink2'}>{t.name}</span>
                  {t.id === themeId && <Check size={12} className="ml-auto text-mint" />}
                </button>
              ))}
            </div>
          )}

        </div>

        {/* --- 主体内容 --- */}
        <div className={`flex-1 flex flex-col min-h-0 relative transition-opacity duration-200 ${isEffectivelyOpen ? 'opacity-100' : 'opacity-0 pointer-events-none h-0'}`}>
          <div className="flex items-center justify-between px-2 py-0.1 bg-white/5 flex-shrink-0">
             {/* [修改] 网格选择器布局 */}
             <div className="flex items-center gap-0.5 text-xl font-medium text-ink tabular-nums relative">
               
               {/* 年份触发器 */}
               <button
                 onClick={(e) => { e.stopPropagation(); toggleMenu('year'); }}
                 className={`hover:text-mint hover:bg-hover px-0.6 rounded transition-colors no-drag ${activeMenu === 'year' ? 'text-mint' : ''}`}
               >
                 {year}
               </button>
               <span className="px-0.5 text-sm text-ink3">年</span>

               {/* 月份触发器 */}
               <button
                 onClick={(e) => { e.stopPropagation(); toggleMenu('month'); }}
                 className={`hover:text-mint hover:bg-hover px-0.6 rounded transition-colors no-drag ml-1 ${activeMenu === 'month' ? 'text-mint' : ''}`}
               >
                 {String(month + 1).padStart(2, '0')}
               </button>
               <span className="px-0.5 text-sm text-ink3">月</span>
             </div>

             <div className="flex gap-1 no-drag">
               <button onClick={() => setCurrentDate(new Date())} className="p-1 hover:bg-hover rounded text-mint" title="回到今天"><RotateCcw size={14} /></button>
               <div className="flex bg-white/5 rounded">
                 <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-1 hover:bg-hover rounded-l text-ink2"><ChevronLeft size={16} /></button>
                 <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-1 hover:bg-hover rounded-r text-ink2"><ChevronRight size={16} /></button>
               </div>
             </div>
          </div>

          <div className="grid grid-cols-7 border-b border-white/5 bg-black/10 flex-shrink-0">
            {CHINESE_NUMS.slice(0, 7).map((d,i)=>(
              <div key={i} className="text-[10px] text-ink2 tracking-wider py-1 text-center">{d}</div>
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
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="text-ink3 group-hover:text-mint transition-colors">
                 <path d="M11 1L11 11L1 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
          )}
        </div>

        {/* --- 双击详情弹窗 --- */}
        {selectedDateKey && (!isCollapsed || isHoverExpanded) && (
          <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="w-full max-w-[320px] bg-elevated/95 backdrop-blur border border-line rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80%] animate-jelly">
               <div className="p-3 border-b border-line bg-white/5 flex justify-between items-center">
                 <div>
                    <div className="text-[10px] text-mint font-bold">详细编辑模式</div>
                    <div className="text-lg text-ink font-medium">{selectedDateKey}</div>
                 </div>
                 <button onClick={() => setSelectedDateKey(null)} className="p-1 hover:bg-hover rounded-full text-ink"><X size={16} /></button>
               </div>
               <div ref={detailScrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                 {getTasksForDate(selectedDateKey).map((t, index) => (
                   <div key={t.id} className="flex gap-2 items-center p-2 rounded hover:bg-white/5 group bg-black/20 animate-stagger" style={{ animationDelay: `${Math.min(index, 10) * 50}ms` }}>
                     <button onClick={() => handleToggleTodo(t.id)} className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${t.completed ? 'bg-mint-deep border-transparent' : 'border-ink3'}`}>
                        {t.completed && <Check size={8} className="text-mint-ink"/>}
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
                            className="w-full bg-black/40 text-xs text-ink px-1 py-0.5 rounded outline-none border border-mint/50"
                         />
                       ) : (
                         <span 
                            onClick={() => startModalEdit(t)}
                            className={`block text-xs break-all cursor-text ${t.completed ? 'text-ink line-through' : 'text-ink'}`}
                            title="点击编辑"
                         >
                            {t.text}
                         </span>
                       )}
                     </div>

                     <button onClick={() => handleDeleteTodo(t.id)} className="opacity-0 group-hover:opacity-100 text-ink hover:text-danger flex-shrink-0"><Trash2 size={10}/></button>
                   </div>
                 ))}
               </div>
               <div className="p-2 border-t border-line bg-white/5 flex gap-2">
                 <input autoFocus value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder="添加..." className="flex-1 bg-card border border-line rounded px-2 py-1.5 text-xs text-ink focus:border-mint outline-none" />
                 <button onClick={() => { handleAddTodo(inputValue, selectedDateKey); setInputValue(''); }} disabled={!inputValue.trim()} className="bg-mint-deep px-3 py-1.5 rounded-lg text-mint-ink font-semibold text-xs disabled:opacity-50">添加</button>
               </div>
             </div>
             <div className="absolute inset-0 -z-10" onClick={() => setSelectedDateKey(null)}></div>
          </div>
        )}
      </div>

      <Suspense fallback={null}>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </Suspense>
    </div>
  );
}
