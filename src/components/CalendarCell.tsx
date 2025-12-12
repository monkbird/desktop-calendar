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
  isOtherMonth?: boolean; 
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
  isOtherMonth = false, // [新增] 默认为 false
}) => {
  return (
    <div 
      onMouseEnter={(e) => onMouseEnter(dateKey, e)}
      onMouseLeave={onMouseLeave}
      onDoubleClick={() => onDoubleClick(dateKey)}
      // [修改] className 中添加 isOtherMonth 的样式判断 (opacity-30 bg-black/10)
      className={`relative p-1 border-r border-b border-white/5 flex flex-col group select-none transition-colors overflow-hidden
        ${isToday ? 'bg-emerald-500/5 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.5)]' : 'hover:bg-white/5'}
        ${isMiniMode ? 'min-h-[40px] justify-center' : 'min-h-[80px]'}
        ${isOtherMonth ? 'opacity-60 bg-black/10' : ''} 
      `}
    >
      {/* 头部区域：日期 + 农历 */}
      <div className={`flex flex-shrink-0 w-full justify-between items-start ${isMiniMode ? 'mb-0.5 px-0.5' : 'mb-1'}`}>
        
        {/* --- 左侧：休/班标识 + 日期数字 --- */}
        <div className="flex items-center gap-0.5 flex-shrink-0 min-w-0">
          {workStatus && (
            <span 
              className={`flex items-center justify-center rounded text-white font-normal leading-none flex-shrink-0
                ${workStatus === 'rest' ? 'bg-[#3b82f6]' : 'bg-[#ef4444]'} 
                ${isMiniMode ? 'w-2.5 h-2.5 text-[7px] mr-0.5' : 'w-4 h-4 text-[10px] mr-1'}
              `}
            >
              {workStatus === 'rest' ? '休' : '班'}
            </span>
          )}
          
          {/* [修改] 文字颜色逻辑：如果是其他月份，强制显示为灰色 */}
          <span className={`leading-none whitespace-nowrap 
            ${isToday ? 'text-emerald-400 font-bold' : isOtherMonth ? 'text-slate-300' : 'text-slate-200'} 
            ${isMiniMode ? 'text-xs font-bold' : 'text-base font-medium'}
          `}>
            {day}
          </span>
        </div>
        
        {/* --- 右侧：农历/节气/今天标识 --- */}
        <div className="flex flex-col items-end flex-shrink-0 ml-1 min-w-0">
             {isToday && <span className={`bg-emerald-500 text-black font-bold rounded-sm mb-0.5 whitespace-nowrap ${isMiniMode ? 'text-[7px] px-0.5 scale-90 origin-right' : 'text-[10px] px-1'}`}>今</span>}
             <span className={`truncate text-right ${term ? 'text-emerald-400 font-bold' : 'text-slate-200'} 
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
            <div key={t.id} className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.completed ? 'bg-slate-600' : 'bg-yellow-400'}`} />
          ))}
        </div>
      ) : (
        <div className="flex-1 w-full flex flex-col gap-0.5 overflow-hidden min-h-0 pt-0.5">
          {tasks.slice(0, 5).map(todo => (
            <div key={todo.id} className="flex items-center gap-1 w-full flex-shrink-0">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${todo.completed ? 'bg-slate-600' : 'bg-yellow-400'}`}></div>
              <span className={`text-[10px] truncate min-w-0 ${todo.completed ? 'text-slate-600 line-through' : 'text-slate-300'}`}>{todo.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
