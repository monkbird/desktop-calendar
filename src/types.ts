export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  targetDate: string; // 格式: YYYY-MM-DD
  completedAt?: number;
}

export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 修改 HoverState，存储整个矩形信息
export interface HoverState {
  dateKey: string;
  targetRect: DOMRect; // 存储目标元素的布局信息
}

declare global {
  interface Window {
    desktopCalendar?: {
      version: string;
      resizeWindow: (size: { width: number; height: number }) => void;
      setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void;
    };
  }
}