import { useRef, useState } from 'react';
import { X, Download, Upload, FileSpreadsheet, Check, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { Todo } from '../types';

interface DataToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  todos: Todo[];
  onImport: (newTodos: Todo[]) => Promise<void>;
}

// 定义 Excel 行结构 (扩展以匹配 iOS/CSV 格式)
interface ExcelRow {
  '清单名称'?: string;
  '计划日期'?: string | number;
  '待办内容'?: string;
  'Content'?: string;
  'Title'?: string;
  '优先级'?: string;
  'Priority'?: string;
  '状态'?: string;
  'Status'?: string;
  '完成时间'?: Date | string | number;
  'CompletedAt'?: Date | string | number;
  '创建时间'?: Date | string | number;
  'CreatedAt'?: Date | string | number;
  '开始时间'?: Date | string | number;
  'StartDate'?: Date | string | number;
  '结束时间'?: Date | string | number;
  'EndDate'?: Date | string | number;
  '重复'?: string;
  'Repeat'?: string;
  '是否长期'?: string | boolean;
  'IsLongTerm'?: string | boolean;
  '是否置顶'?: string | boolean;
  'IsPinned'?: string | boolean;
  '全天'?: string | boolean;
  '全年'?: string | boolean;
  '本月'?: string | boolean;
  'ID'?: string;
  'id'?: string;
  [key: string]: any;
}

export const DataToolsModal = ({ isOpen, onClose, todos, onImport }: DataToolsModalProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState('');

  if (!isOpen) return null;

  // --- 辅助函数：移植自 iOS fileHandler.ts ---

  const getRepeatText = (repeat?: string) => {
    switch(repeat) {
        case 'daily': return '每天';
        case 'weekly': return '每周';
        case 'monthly': return '每月';
        case 'yearly': return '每年';
        default: return '永不';
    }
  };

  const toLocalDateTimeString = (dateStrOrNum?: string | number) => {
      if (!dateStrOrNum) return '';
      const d = new Date(dateStrOrNum);
      if (isNaN(d.getTime())) return '';
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hour = String(d.getHours()).padStart(2, '0');
      const minute = String(d.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day} ${hour}:${minute}`;
  };

  const formatDate = (dateVal: any): string => {
    if (!dateVal) {
         const now = new Date();
         const year = now.getFullYear();
         const month = String(now.getMonth() + 1).padStart(2, '0');
         const day = String(now.getDate()).padStart(2, '0');
         return `${year}-${month}-${day}`;
    }
    if (typeof dateVal === 'number') {
        // 处理 Excel 序列号 (如果 XLSX 解析没转 Date)
        if (dateVal < 100000) { // 简单判断是否为 Excel 序列号
            const date = new Date((dateVal - 25569) * 86400000);
            const year = date.getUTCFullYear(); // Excel 序列号通常按 UTC 算
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
    }
    if (dateVal instanceof Date) {
        const year = dateVal.getFullYear();
        const month = String(dateVal.getMonth() + 1).padStart(2, '0');
        const day = String(dateVal.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return String(dateVal).split(' ')[0]; // 简单处理字符串
  };

  const getTimestamp = (dateVal: any): number => {
      if (!dateVal) return Date.now();
      if (typeof dateVal === 'number') {
        // 如果看起来像 Excel 序列号
        if (dateVal < 100000) return new Date((dateVal - 25569) * 86400000).getTime();
        return dateVal;
      }
      if (dateVal instanceof Date) {
          return dateVal.getTime();
      }
      if (typeof dateVal === 'string') {
          const d = new Date(dateVal);
          if (!isNaN(d.getTime())) {
              return d.getTime();
          }
      }
      return Date.now();
  };

  const parseBoolean = (val: any): boolean => {
      if (!val) return false;
      if (typeof val === 'string') {
          const lower = val.toLowerCase().trim();
          return ['是', 'true', 'yes', '1', 'y'].includes(lower);
      }
      return val === true || val === 1;
  };

  const parseRepeat = (text?: string): 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' => {
      if (!text) return 'none';
      const lower = String(text).toLowerCase().trim();
      if (lower === '每天' || lower === 'daily') return 'daily';
      if (lower === '每周' || lower === 'weekly') return 'weekly';
      if (lower === '每月' || lower === 'monthly') return 'monthly';
      if (lower === '每年' || lower === 'yearly') return 'yearly';
      return 'none';
  };

  // --- 导出逻辑 (更新为匹配 iOS) ---
  const handleExport = () => {
    try {
      const data = todos.map(todo => {
        return {
          '清单名称': '默认清单',
          '计划日期': todo.targetDate,
          '待办内容': todo.text,
          '优先级': todo.isLongTerm ? '长期' : (todo.isPinned ? '重要' : '无'),
          '开始时间': toLocalDateTimeString(todo.startDate),
          '结束时间': toLocalDateTimeString(todo.endDate),
          '重复': getRepeatText(todo.repeat),
          '状态': todo.completed ? '已完成' : '未完成',
          '完成时间': toLocalDateTimeString(todo.completedAt),
          '创建时间': toLocalDateTimeString(todo.createdAt || Date.now()),
          
          // 增加保留列
          '置顶': todo.isPinned ? '是' : '否',
          '全天': todo.isAllDay ? '是' : '否',
          '全年': todo.isAllYear ? '是' : '否',
          '本月': todo.isMonth ? '是' : '否',
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(data, {
        header: [
            '清单名称', 
            '计划日期', 
            '待办内容', 
            '优先级', 
            '开始时间',
            '结束时间',
            '重复',
            '状态',
            '完成时间', 
            '创建时间',
            '置顶',
            '全天',
            '全年',
            '本月'
        ]
      });

      // 设置列宽
      worksheet['!cols'] = [
        { wch: 10 }, // 清单名称
        { wch: 12 }, // 计划日期
        { wch: 40 }, // 待办内容
        { wch: 8 },  // 优先级
        { wch: 16 }, // 开始时间
        { wch: 16 }, // 结束时间
        { wch: 8 },  // 重复
        { wch: 8 },  // 状态
        { wch: 16 }, // 完成时间
        { wch: 16 }, // 创建时间
        { wch: 6 },  // 置顶
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "待办事项");

      const fileName = `DesktopCalendar_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      setMsg('Excel 导出成功！');
      setTimeout(() => setMsg(''), 2000);
    } catch (error) {
      console.error(error);
      setMsg('导出失败');
    }
  };

  // --- 导入逻辑 (更新为匹配 iOS 逻辑) ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const data = event.target?.result;
        // 使用 cellDates: true 让 xlsx 尽可能把日期列转为 Date 对象
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const jsonRows = XLSX.utils.sheet_to_json<ExcelRow>(worksheet);

        if (!Array.isArray(jsonRows)) {
          setMsg('错误：文件格式无法识别');
          return;
        }

        const existingFingerprints = new Set(
          todos.map(t => `${t.text}|${t.targetDate}`)
        );

        let duplicateCount = 0;
        const newTodos: Todo[] = [];
        
        for (const row of jsonRows) {
            // 基础字段提取
            const text = (row['待办内容'] || row['Content'] || row['待办事项'] || row['Title'] || '').trim();
            if (!text) continue; 

            // 提取原始值以进行逻辑判断 (移植 iOS 逻辑)
            const rawIsLongTerm = row['是否长期'] || row['IsLongTerm'] || row['isLongTerm'];
            const rawIsPinned = row['是否置顶'] || row['IsPinned'] || row['isPinned'];
            const rawPriority = row['优先级'] || row['Priority'];
            const rawRepeat = row['重复'] || row['Repeat'];
            const rawStart = row['开始时间'] || row['StartDate'] || row['StartTime'];
            const rawEnd = row['结束时间'] || row['EndDate'] || row['EndTime'];
            const rawDate = row['计划日期'] || row['TargetDate'] || row['Date'];
            const rawCompletedAt = row['完成时间'] || row['CompletedAt'];

            let isLongTerm = parseBoolean(rawIsLongTerm);
            let isPinned = parseBoolean(rawIsPinned);
            const repeat = parseRepeat(rawRepeat);
            const isCompleted = row['状态'] === '已完成' || row['Status'] === '已完成' || row['Status'] === 'Completed';

            // 智能推断：长期
            if (!isLongTerm) {
                if (rawPriority && (String(rawPriority).includes('长期') || String(rawPriority).toLowerCase().includes('long'))) {
                    isLongTerm = true;
                }
                if (repeat !== 'none') {
                    isLongTerm = true;
                }
                if (rawStart && rawEnd) {
                    isLongTerm = true;
                }
            }

            // 智能推断：置顶
            if (!isPinned && rawPriority) {
                const p = String(rawPriority).toLowerCase();
                if (p.includes('重要') || p.includes('important') || p.includes('高') || p.includes('high') || p.includes('置顶') || p.includes('pin') || p.includes('top')) {
                    isPinned = true;
                }
            }

            // 计算 Target Date (核心逻辑)
            let targetDate = '';
            
            // 规则 0: 如果已完成，且有完成时间，优先使用完成时间作为 targetDate
            if (isCompleted && rawCompletedAt) {
                targetDate = formatDate(rawCompletedAt);
            }
            else if (rawDate) {
                targetDate = formatDate(rawDate);
            } else {
                // 如果 Excel 没填计划日期
                const todayKey = formatDate(null); // Today
                
                if (isCompleted) {
                    // 规则 1: 如果已完成，但无完成时间，默认为今天
                    targetDate = todayKey;
                } else {
                    // 规则 2: 如果未完成
                    if (repeat === 'none' && rawStart) {
                        const startDateStr = formatDate(rawStart);
                        if (startDateStr > todayKey) {
                            targetDate = startDateStr;
                        } else {
                            targetDate = todayKey;
                        }
                    } else {
                        targetDate = todayKey;
                    }
                }
            }

            // 修正逻辑：对于未完成且不重复的待办，确保 targetDate 不早于 startDate
            if (!isCompleted && repeat === 'none' && rawStart) {
                const startDateStr = formatDate(rawStart);
                if (targetDate < startDateStr) {
                    targetDate = startDateStr;
                }
            }

            // 去重检查 (使用计算后的 targetDate)
            if (existingFingerprints.has(`${text}|${targetDate}`)) {
                duplicateCount++;
                continue;
            }

            // 确定 completedAt 时间
            let finalCompletedAt: number | undefined;
            if (isCompleted) {
                if (rawCompletedAt) {
                    finalCompletedAt = getTimestamp(rawCompletedAt);
                } else {
                    // 如果没有完成时间，但有计划日期，则认为是在计划日期完成的
                    if (rawDate) {
                        finalCompletedAt = getTimestamp(rawDate);
                    } else {
                        finalCompletedAt = Date.now();
                    }
                }
            }

            // 构造 Todo 对象
            const existingId = row['ID'] ? String(row['ID']) : (row['id'] ? String(row['id']) : null);

            newTodos.push({
                id: existingId || crypto.randomUUID(),
                text: text,
                completed: isCompleted,
                targetDate: targetDate,
                createdAt: getTimestamp(row['创建时间'] || row['CreatedAt']),
                updatedAt: Date.now(),
                completedAt: finalCompletedAt,
                
                // 新增字段
                isLongTerm: isLongTerm,
                isPinned: isPinned,
                startDate: rawStart ? formatDate(rawStart) : (repeat !== 'none' ? targetDate : undefined),
                endDate: rawEnd ? formatDate(rawEnd) : undefined,
                isAllDay: parseBoolean(row['全天'] || row['IsAllDay']),
                isAllYear: parseBoolean(row['全年'] || row['IsAllYear']),
                isMonth: parseBoolean(row['本月'] || row['IsMonth']),
                repeat: repeat
            });
        }

        if (newTodos.length > 0) {
          await onImport(newTodos);
          const dupMsg = duplicateCount > 0 ? ` (已过滤 ${duplicateCount} 条重复)` : '';
          setMsg(`成功导入 ${newTodos.length} 条数据${dupMsg}`);
          setTimeout(() => {
            setMsg('');
            onClose();
          }, 2500);
        } else if (duplicateCount > 0) {
          setMsg(`未导入：检测到 ${duplicateCount} 条重复数据`);
        } else {
          setMsg('未发现有效的待办数据');
        }

      } catch (err) {
        console.error(err);
        setMsg('错误：解析 Excel 失败');
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsBinaryString(file);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-80 bg-[#1a1b1e] border border-white/10 rounded-xl p-6 shadow-2xl relative animate-in zoom-in-95">
        <button onClick={onClose} className="absolute top-3 right-3 text-slate-400 hover:text-white">
          <X size={16} />
        </button>

        <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
          <FileSpreadsheet className="text-emerald-400" />
          Excel 数据管理
        </h2>

        <div className="space-y-4">
          <div className="p-3 bg-white/5 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
            <button 
              onClick={handleExport}
              className="w-full flex items-center justify-center gap-2 text-sm font-bold text-slate-200 hover:text-emerald-400 transition-colors py-2"
            >
              <Download size={16} />
              导出 Excel
            </button>
            <p className="text-[10px] text-slate-500 text-center mt-1">
              生成 .xlsx 格式文件
            </p>
          </div>

          <div className="p-3 bg-white/5 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="w-full flex items-center justify-center gap-2 text-sm font-bold text-slate-200 hover:text-emerald-400 transition-colors py-2 disabled:opacity-50"
            >
              {importing ? '处理中...' : <><Upload size={16} /> 导入 Excel</>}
            </button>
            <input 
              type="file" 
              accept=".xlsx, .xls, .csv" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleFileChange}
            />
            <p className="text-[10px] text-slate-500 text-center mt-1 flex items-center justify-center gap-1">
              <AlertTriangle size={10} className="text-yellow-500" />
              兼容日期字符串和 Excel 时间格式
            </p>
          </div>
        </div>

        {msg && (
          <div className="mt-4 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded text-center text-xs text-emerald-400 flex items-center justify-center gap-2 animate-in fade-in slide-in-from-bottom-2">
            <Check size={12} /> {msg}
          </div>
        )}
      </div>
      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>
  );
};