import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import type { Todo } from '../types';
import { SearchModal } from './SearchModal';
import { HistoryModal } from './HistoryModal';
import { DataToolsModal } from './DataToolsModal';

interface MenuPayload {
  mode: 'year' | 'month' | 'opacity' | 'search' | 'history' | 'datatools';
  data: any;
}

export const MenuWindow = () => {
  const [menu, setMenu] = useState<MenuPayload | null>(null);
  // 透明度滑块的本地值（拖动时即时反馈，不等主窗口回传）
  const [opacityValue, setOpacityValue] = useState(0.5);

  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMouseInsideRef = useRef(false);

  const sendAction = (type: string, payload: any) => {
    window.desktopCalendar?.dispatchMenuAction({ type, payload });
  };

  const clearHideTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // 鼠标移出 2 秒后自动关闭；计时触发时校验实时状态
  const scheduleHide = (delay = 2000) => {
    clearHideTimer();
    timerRef.current = setTimeout(() => {
      if (!isMouseInsideRef.current) {
        sendAction('CX', null);
      }
    }, delay);
  };

  const handleMouseEnter = () => {
    isMouseInsideRef.current = true;
    clearHideTimer();
  };

  const handleMouseLeave = () => {
    isMouseInsideRef.current = false;
    scheduleHide();
  };

  useEffect(() => {
    return () => clearHideTimer();
  }, []);

  useEffect(() => {
    // 窗口被程序隐藏时复位鼠标状态，防止下次显示沿用旧状态
    const onVisibilityChange = () => {
      if (document.hidden) isMouseInsideRef.current = false;
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    const removeListener = window.desktopCalendar?.onUpdateMenu((payload) => {
      const next = payload as MenuPayload;
      setMenu(next);
      if (next.mode === 'opacity' && typeof next.data?.value === 'number') {
        setOpacityValue(next.data.value);
      }
      // 鼠标不在窗口内时启动自动关闭兜底
      if (!isMouseInsideRef.current) scheduleHide();
    });
    return () => removeListener?.();
  }, []);

  // 内容渲染后向主进程上报实际尺寸，窗口高度随内容自适应（可向下伸展）。
  // 每次渲染都测量：搜索结果增减、面板切换都会改变高度
  useLayoutEffect(() => {
    if (containerRef.current) {
      window.desktopCalendar?.resizeMenu({
        width: containerRef.current.offsetWidth,
        height: containerRef.current.offsetHeight,
      });
    }
  });

  if (!menu) {
    return (
      <div className="w-40 h-24 p-5 box-border select-none">
        <div className="w-full h-full bg-elevated border border-line rounded-xl shadow-2xl" />
      </div>
    );
  }

  const panelTodos: Todo[] = menu.data?.todos ?? [];

  return (
    <div
      ref={containerRef}
      className="w-fit h-fit p-5 box-border select-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 模式切换时重挂载以重播逐项翻入动画（key 变化触发；同模式内数据更新不重放） */}
      <div key={menu.mode}>
      {/* --- 年份选择器 --- */}
      {menu.mode === 'year' && (
        <div className="p-2 bg-elevated border border-line rounded-lg shadow-xl w-72">
          <div className="grid grid-cols-4 gap-0">
            {(menu.data.items as { value: number; count: number }[]).map(({ value, count }) => (
              <button
                key={value}
                onClick={() => sendAction('SELECT_YEAR', { year: value })}
                className={`w-full flex flex-col items-center justify-center py-2 rounded hover:bg-hover transition-colors ${value === menu.data.current ? 'bg-mint-dim text-mint font-bold' : 'text-ink2'}`}
              >
                <span className="text-1xl leading-none tabular-nums">{value}</span>
                <span className="text-[12px] text-ink3 scale-90 mt-0.5">完成: {count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* --- 月份选择器 --- */}
      {menu.mode === 'month' && (
        <div className="p-2 bg-elevated border border-line rounded-lg shadow-xl w-64">
          <div className="grid grid-cols-3 gap-0">
            {(menu.data.items as { value: number; count: number }[]).map(({ value, count }) => (
              <button
                key={value}
                onClick={() => sendAction('SELECT_MONTH', { month: value })}
                className={`w-full flex flex-col items-center justify-center py-1 rounded hover:bg-hover transition-colors ${value === menu.data.current ? 'bg-mint-dim text-mint font-bold' : 'text-ink2'}`}
              >
                <span className="text-1xl leading-none">{value + 1}月</span>
                <span className="text-[12px] text-ink3 scale-90 mt-0.5">完成: {count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* --- 透明度调节 --- */}
      {menu.mode === 'opacity' && (
        <div className="p-2 bg-elevated border border-line rounded-lg w-32 shadow-xl flex flex-col gap-1">
          <div className="flex justify-between text-[10px] text-ink3 mb-1">
            <span>透明度</span>
            <span className="tabular-nums">{Math.round(opacityValue * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={opacityValue}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setOpacityValue(v);
              sendAction('SET_OPACITY', { value: v });
            }}
            className="w-full h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-mint"
          />
        </div>
      )}

      {/* --- 数据面板（搜索/历史归档/数据管理） --- */}
      {menu.mode === 'search' && (
        <SearchModal
          bare
          isOpen
          onClose={() => sendAction('CX', null)}
          todos={panelTodos}
          onNavigate={(date) => sendAction('NAVIGATE', { y: date.getFullYear(), m: date.getMonth(), d: date.getDate() })}
        />
      )}
      {menu.mode === 'history' && (
        <HistoryModal
          bare
          isOpen
          onClose={() => sendAction('CX', null)}
          todos={panelTodos}
          onToggleTodo={(id) => sendAction('TOGGLE_TODO', { id })}
          onDeleteTodo={(id) => sendAction('DELETE_TODO', { id })}
        />
      )}
      {menu.mode === 'datatools' && (
        <DataToolsModal
          bare
          isOpen
          onClose={() => sendAction('CX', null)}
          todos={panelTodos}
          onImport={async (imported) => sendAction('IMPORT_TODOS', { todos: imported })}
        />
      )}
      </div>
    </div>
  );
};
