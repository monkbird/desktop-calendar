import type { FC, MouseEvent } from 'react';
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
  onMouseEnter: (dateKey: string, e: MouseEvent) => void;
  onMouseLeave: () => void;
  onDoubleClick: (dateKey: string) => void;
}

export const CalendarCell: FC<CalendarCellProps> = ({
  day,
  dateKey,
  isToday,
  tasks,
  term,
  lunar,
  workStatus,
  isMiniMode,
  onMouseEnter,
  onMouseLeave,
  onDoubleClick,
}) => {
  return (
    <div 
      onMouseEnter={(e) => onMouseEnter(dateKey, e)}
      onMouseLeave={onMouseLeave}
      onDoubleClick={() => onDoubleClick(dateKey)}
      className={`relative p-1 border-r border-b border-white/5 flex flex-col group select-none transition-colors overflow-hidden
        ${isToday ? 'bg-emerald-500/5 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.5)]' : 'hover:bg-white/5'}
        ${isMiniMode ? 'min-h-[40px] justify-center' : 'min-h-[80px]'}
      `}
    >
      {/* 头部区域：日期 + 农历 */}
      {/* 修改点 1: 无论是否 Mini 模式，都使用 justify-between 将左右推开 */}
      <div className={`flex flex-shrink-0 w-full justify-between items-start ${isMiniMode ? 'mb-0.5 px-0.5' : 'mb-1'}`}>
        
        {/* --- 左侧：休/班标识 + 日期数字 --- */}
        <div className="flex items-center gap-0.5 flex-shrink-0 min-w-0">
          {/* Mini模式下也显示休班，但稍微做小一点 */}
          {workStatus && (
            <span 
              className={`flex items-center justify-center rounded text-white font-normal leading-none flex-shrink-0
                ${workStatus === 'rest' ? 'bg-[#3b82f6]' : 'bg-[#ef4444]'} 
                ${isMiniMode ? 'w-3 h-3 text-[8px] mr-0.5' : 'w-4 h-4 text-[10px] mr-1'}
              `}
            >
              {workStatus === 'rest' ? '休' : '班'}
            </span>
          )}
          
          <span className={`leading-none whitespace-nowrap ${isToday ? 'text-emerald-400 font-bold' : 'text-slate-200'} ${isMiniMode ? 'text-sm font-bold' : 'text-base font-medium'}`}>
            {day}
          </span>
        </div>
        
        {/* --- 右侧：农历/节气/今天标识 --- */}
        {/* 修改点 2: 移除了 !isMiniMode 的判断，让农历在 Mini 模式下也显示 */}
        <div className="flex flex-col items-end flex-shrink-0 ml-1">
             {/* "今"字标在 Mini 模式下如果空间太挤可以选择不显示，这里保留但缩小 */}
             {isToday && <span className={`bg-emerald-500 text-black font-bold rounded-sm mb-0.5 whitespace-nowrap ${isMiniMode ? 'text-[8px] px-0.5 scale-90 origin-right' : 'text-[10px] px-1'}`}>今</span>}
             
             {/* 农历文本 */}
             <span className={`truncate text-right ${term ? 'text-emerald-400 font-bold' : 'text-slate-500'} 
               ${isMiniMode ? 'text-[9px] scale-90 origin-right max-w-[40px]' : 'text-[10px] max-w-[60px]'}
             `}>
               {term || lunar}
             </span>
        </div>
      </div>

      {/* 任务列表区域 (圆点) */}
      {isMiniMode ? (
        <div className="flex gap-0.5 flex-wrap justify-center overflow-hidden h-1.5 w-full px-1">
          {tasks.slice(0, 4).map(t => (
            <div key={t.id} className={`w-1.5 h-1.5 rounded-full ${t.completed ? 'bg-slate-600' : 'bg-yellow-400'}`} />
          ))}
        </div>
      ) : (
        <div className="flex-1 w-full flex flex-col gap-0.5 overflow-hidden min-h-0 pt-0.5">
          {tasks.slice(0, 5).map(todo => (
            <div key={todo.id} className="flex items-center gap-1 w-full flex-shrink-0">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${todo.completed ? 'bg-slate-600' : 'bg-yellow-400'}`}></div>
              <span className={`text-[10px] truncate ${todo.completed ? 'text-slate-600 line-through' : 'text-slate-300'}`}>{todo.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
