import { type FC, type MouseEvent, memo } from 'react';
import type { Todo } from '../types';

interface CalendarCellProps {
  day: number;
  dateKey: string;
  isToday: boolean;
  tasks: Todo[];
  term?: string;
  lunar: string;
  workStatus?: 'rest' | 'work' | null;
  isMiniMode: boolean;
  /** 搜索跳转后的短暂高亮闪烁 */
  isFlashed?: boolean;
  onMouseEnter: (dateKey: string, e: MouseEvent) => void;
  onMouseLeave: () => void;
  onDoubleClick: (dateKey: string) => void;
  isOtherMonth?: boolean;
}

export const CalendarCell: FC<CalendarCellProps> = memo(({
  day,
  dateKey,
  isToday,
  tasks,
  term,
  lunar,
  workStatus,
  isMiniMode,
  isFlashed = false,
  onMouseEnter,
  onMouseLeave,
  onDoubleClick,
  isOtherMonth = false,
}) => {
  // 闪烁高亮优先于“今天”的常驻描边，避免两个 shadow 工具类冲突
  const ringClass = isFlashed
    ? 'bg-mint-dim shadow-[inset_0_0_0_2px_rgba(124,227,177,0.9)] animate-pulse'
    : isToday
      ? 'bg-mint-dim shadow-[inset_0_0_0_1px_rgba(124,227,177,0.4)]'
      : 'hover:bg-white/[0.12] hover:shadow-[inset_0_0_0_1px_rgba(124,227,177,0.45)]';

  return (
    <div
      onMouseEnter={(e) => onMouseEnter(dateKey, e)}
      onMouseLeave={onMouseLeave}
      onDoubleClick={() => onDoubleClick(dateKey)}
      className={`relative p-1 border-r border-b border-white/5 flex flex-col group select-none transition-colors overflow-hidden
        ${ringClass}
        ${isMiniMode ? 'min-h-[40px] justify-center' : 'min-h-[80px]'}
        ${isOtherMonth ? 'opacity-75 bg-black/10' : ''}
      `}
    >
      {/* 头部区域：日期 + 农历 */}
      <div className={`flex flex-shrink-0 w-full justify-between items-start ${isMiniMode ? 'mb-0.5 px-0.5' : 'mb-1'}`}>

        {/* --- 左侧：休/班标识 + 日期数字 --- */}
        <div className="flex items-center gap-0.5 flex-shrink-0 min-w-0">
          {workStatus && (
            <span
              className={`flex items-center justify-center rounded font-normal leading-none flex-shrink-0
                ${workStatus === 'rest' ? 'bg-rest/90 text-[#12203a]' : 'bg-work/90 text-[#3a1310]'}
                ${isMiniMode ? 'w-2.5 h-2.5 text-[7px] mr-0.5' : 'w-4 h-4 text-[10px] mr-1'}
              `}
            >
              {workStatus === 'rest' ? '休' : '班'}
            </span>
          )}

          {/* 日期数字：今天为 mint 圆形实底徽章 */}
          {isToday ? (
            <span className={`flex items-center justify-center rounded-full bg-mint-deep text-mint-ink font-semibold leading-none tabular-nums whitespace-nowrap
              ${isMiniMode ? 'w-4.5 h-4.5 min-w-[18px] min-h-[18px] text-[11px]' : 'min-w-[24px] min-h-[24px] text-sm'}
            `}>
              {day}
            </span>
          ) : (
            <span className={`leading-none whitespace-nowrap tabular-nums
              ${isOtherMonth ? 'text-ink3' : 'text-ink'}
              ${isMiniMode ? 'text-xs font-medium' : 'text-base font-normal'}
            `}>
              {day}
            </span>
          )}
        </div>

        {/* --- 右侧：农历/节气 --- */}
        <div className="flex flex-col items-end flex-shrink-0 ml-1 min-w-0">
             <span className={`truncate text-right ${term ? 'text-mint font-medium' : 'text-ink3'}
               ${isMiniMode ? 'text-[8px] scale-90 origin-right max-w-[35px]' : 'text-[10px] max-w-[60px]'}
             `}>
               {term || lunar}
             </span>
        </div>
      </div>

      {/* 任务列表区域 (圆点) */}
      {isMiniMode ? (
        <div className="flex gap-0.5 flex-wrap justify-center overflow-hidden h-1.5 w-full px-0.5">
          {tasks.slice(0, 4).map(t => (
            <div key={t.id} className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.completed ? 'bg-ink3/60' : 'bg-warn'}`} />
          ))}
        </div>
      ) : (
        <div className="flex-1 w-full flex flex-col gap-0.5 overflow-hidden min-h-0 pt-0.5">
          {tasks.slice(0, 5).map(todo => (
            <div key={todo.id} className="flex items-center gap-1 w-full flex-shrink-0">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${todo.completed ? 'bg-ink3/60' : 'bg-warn'}`}></div>
              <span className={`text-[10px] truncate min-w-0 ${todo.completed ? 'text-ink3 line-through' : 'text-ink2'}`}>{todo.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
