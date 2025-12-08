export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  targetDate: string; // 格式: YYYY-MM-DD
  completedAt?: number; // 完成时间戳 (毫秒)
  createdAt?: number;   // 创建时间戳 (毫秒)
}

export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HoverState {
  dateKey: string;
  x: number;
  y: number;
}

// 扩展 window 对象，增加 resizeWindow 方法
declare global {
  interface Window {
    desktopCalendar?: {
      version: string;
      resizeWindow: (size: { width: number; height: number }) => void;
      setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void;
      // [新增] 允许 React 告诉 Electron 是否可调整大小
      setResizable: (resizable: boolean) => void;
    };
  }
}
