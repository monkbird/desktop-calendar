import type { FC, MouseEvent } from 'react';
import type { Todo } from '../types';

interface CalendarCellProps {
  day: number;
  dateKey: string;
  isToday: boolean;
  tasks: Todo[];
  term?: string;
  lunar: string;
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
        ${isMiniMode ? 'min-h-[40px] justify-center items-center' : 'min-h-[80px]'}
      `}
    >
      <div className={`flex flex-shrink-0 ${isMiniMode ? 'flex-col items-center gap-0.5' : 'justify-between items-start mb-1'}`}>
        <div className={`leading-none ${isToday ? 'text-emerald-400 font-bold' : 'text-slate-200'} ${isMiniMode ? 'text-sm' : 'text-base font-medium'}`}>
          {day}
        </div>
        {!isMiniMode && (
          <div className="flex flex-col items-end">
             {isToday && <span className="text-[10px] bg-emerald-500 text-black font-bold px-1 rounded-sm mb-0.5">今</span>}
             <span className={`text-[10px] ${term ? 'text-emerald-400 font-bold' : 'text-slate-500'}`}>{term || lunar}</span>
          </div>
        )}
        {isMiniMode && term && <span className="text-[8px] text-emerald-400 scale-90">{term}</span>}
      </div>

      {isMiniMode ? (
        <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center overflow-hidden h-3">
          {tasks.slice(0, 4).map(t => (
            <div key={t.id} className={`w-1.5 h-1.5 rounded-full ${t.completed ? 'bg-slate-600' : 'bg-yellow-400'}`} />
          ))}
        </div>
      ) : (
        <div className="flex-1 w-full flex flex-col gap-0.5 overflow-hidden min-h-0">
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
