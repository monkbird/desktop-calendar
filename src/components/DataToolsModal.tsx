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

// 定义 Excel 行结构
interface ExcelRow {
  '清单名称': string;
  '计划日期': string | number;
  '待办内容': string;
  '优先级': string;
  '状态': string;
  '完成时间': Date | string | number | null;
  '创建时间': Date | string | number;
}

export const DataToolsModal = ({ isOpen, onClose, todos, onImport }: DataToolsModalProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState('');

  if (!isOpen) return null;

  // --- 导出逻辑 ---
  const handleExport = () => {
    try {
      // 1. 转换数据
      const rows = todos.map(todo => ({
        '清单名称': '默认清单',
        '计划日期': todo.targetDate,
        '待办内容': todo.text,
        '优先级': '无', 
        '状态': todo.completed ? '已完成' : '未完成',
        // 传递 Date 对象，让 Excel 处理
        '完成时间': todo.completedAt ? new Date(todo.completedAt) : null,
        '创建时间': new Date(todo.createdAt || Date.now())
      }));

      // 2. 创建工作表
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "待办事项");

      // 3. 设置列宽
      worksheet['!cols'] = [
        { wch: 15 }, // 清单名称
        { wch: 12 }, // 计划日期
        { wch: 40 }, // 待办内容
        { wch: 8 },  // 优先级
        { wch: 8 },  // 状态
        { wch: 18 }, // 完成时间 (缩短一点，因为不显示秒了)
        { wch: 18 }, // 创建时间
      ];

      // 4. [修改] 设置时间列格式为 "yyyy-mm-dd hh:mm" (不含秒)
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      for (let R = range.s.r + 1; R <= range.e.r; ++R) { // 跳过表头
        const fmt = 'yyyy-mm-dd hh:mm'; // <--- 修改这里：去掉了 :ss
        
        // F列 (索引5) = 完成时间
        const cellF = worksheet[XLSX.utils.encode_cell({ r: R, c: 5 })];
        if (cellF) cellF.z = fmt;

        // G列 (索引6) = 创建时间
        const cellG = worksheet[XLSX.utils.encode_cell({ r: R, c: 6 })];
        if (cellG) cellG.z = fmt;
      }

      // 5. 下载
      const fileName = `DesktopCalendar_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      setMsg('Excel 导出成功！');
      setTimeout(() => setMsg(''), 2000);
    } catch (error) {
      console.error(error);
      setMsg('导出失败');
    }
  };

  // --- 导入逻辑 (保持修复后的版本) ---

  const excelSerialToTimestamp = (serial: number) => {
    const utcMs = (serial - 25569) * 86400000;
    const offsetMs = new Date().getTimezoneOffset() * 60 * 1000; 
    return utcMs + offsetMs;
  };

  const parseDateTime = (val: any): number | undefined => {
    if (!val) return undefined;
    if (typeof val === 'number') {
      if (val < 1000000) return excelSerialToTimestamp(val); // 处理 Excel 序列号
      return val; 
    }
    const t = new Date(val).getTime();
    return isNaN(t) ? undefined : t;
  };

  const parseDateString = (val: any): string => {
    if (!val) return new Date().toISOString().split('T')[0];
    if (typeof val === 'number') {
       const date = new Date((val - 25569) * 86400000);
       const y = date.getUTCFullYear();
       const m = String(date.getUTCMonth() + 1).padStart(2, '0');
       const d = String(date.getUTCDate()).padStart(2, '0');
       return `${y}-${m}-${d}`;
    }
    const str = String(val).trim();
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
       const y = d.getFullYear();
       const m = String(d.getMonth() + 1).padStart(2, '0');
       const da = String(d.getDate()).padStart(2, '0');
       return `${y}-${m}-${da}`;
    }
    return str;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const jsonRows = XLSX.utils.sheet_to_json<ExcelRow>(worksheet, { raw: true });

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
          const text = (row['待办内容'] || '').trim();
          if (!text) continue; 

          const safeTargetDate = parseDateString(row['计划日期']);

          if (existingFingerprints.has(`${text}|${safeTargetDate}`)) {
            duplicateCount++;
            continue;
          }

          const isCompleted = row['状态'] === '已完成' || row['状态'] === '完成';
          const completedAt = isCompleted ? parseDateTime(row['完成时间']) : undefined;
          const createdAt = parseDateTime(row['创建时间']) || Date.now();

          newTodos.push({
            id: crypto.randomUUID(),
            text: text,
            targetDate: safeTargetDate,
            completed: isCompleted,
            completedAt: completedAt,
            createdAt: createdAt,
            updatedAt: Date.now()
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