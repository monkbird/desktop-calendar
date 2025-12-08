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

// 对应截图中的 Excel 行结构
interface ExcelRow {
  '清单名称': string;
  '计划日期': string; // YYYY-MM-DD
  '待办内容': string;
  '优先级': string;
  '状态': string;     // 未完成 | 已完成
  '完成时间': string;
  '创建时间': string;
}

export const DataToolsModal = ({ isOpen, onClose, todos, onImport }: DataToolsModalProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState('');

  if (!isOpen) return null;

  // 格式化时间戳为 YYYY-MM-DD HH:mm:ss
  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  // --- 导出逻辑 ---
  const handleExport = () => {
    try {
      // 1. 将 Todo 数据转换为 Excel 行格式
      const rows: ExcelRow[] = todos.map(todo => ({
        '清单名称': '默认清单', // 目前系统没有清单概念，暂固定
        '计划日期': todo.targetDate,
        '待办内容': todo.text,
        '优先级': '中', // 目前系统没有优先级概念，暂固定
        '状态': todo.completed ? '已完成' : '未完成',
        '完成时间': formatTime(todo.completedAt),
        '创建时间': formatTime(todo.createdAt || Date.now()) // 兼容旧数据
      }));

      // 2. 创建工作簿
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "待办事项");

      // 3. 调整列宽 (可选优化)
      worksheet['!cols'] = [
        { wch: 15 }, // 清单名称
        { wch: 12 }, // 计划日期
        { wch: 40 }, // 待办内容
        { wch: 8 },  // 优先级
        { wch: 8 },  // 状态
        { wch: 20 }, // 完成时间
        { wch: 20 }, // 创建时间
      ];

      // 4. 下载文件
      const fileName = `DesktopCalendar_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      setMsg('Excel 导出成功！');
      setTimeout(() => setMsg(''), 2000);
    } catch (error) {
      console.error(error);
      setMsg('导出失败');
    }
  };

  // --- 导入逻辑 ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        // 读取第一个 sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // 转换为 JSON
        const jsonRows = XLSX.utils.sheet_to_json<ExcelRow>(worksheet);

        if (!Array.isArray(jsonRows)) {
          setMsg('错误：文件格式无法识别');
          return;
        }

        // 将 Excel 行转换回 Todo 格式
        const newTodos: Todo[] = jsonRows.map(row => {
          const isCompleted = row['状态'] === '已完成' || row['状态'] === '完成';
          
          let completedAt: number | undefined = undefined;
          if (isCompleted && row['完成时间']) {
             const t = new Date(row['完成时间']).getTime();
             if (!isNaN(t)) completedAt = t;
          }

          let createdAt: number | undefined = undefined;
          if (row['创建时间']) {
             const t = new Date(row['创建时间']).getTime();
             if (!isNaN(t)) createdAt = t;
          }

          return {
            id: crypto.randomUUID(),
            text: row['待办内容'] || '未命名事项',
            targetDate: row['计划日期'] || new Date().toISOString().split('T')[0],
            completed: isCompleted,
            completedAt: completedAt,
            createdAt: createdAt || Date.now()
          };
        }).filter(t => t.text);

        if (newTodos.length > 0) {
          await onImport(newTodos);
          setMsg(`成功导入 ${newTodos.length} 条数据`);
          setTimeout(() => {
            setMsg('');
            onClose();
          }, 1500);
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
              accept=".xlsx, .xls" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleFileChange}
            />
            <p className="text-[10px] text-slate-500 text-center mt-1 flex items-center justify-center gap-1">
              <AlertTriangle size={10} className="text-yellow-500" />
              将合并现有数据 (自动去重)
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