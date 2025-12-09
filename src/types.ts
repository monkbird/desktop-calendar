// src/types.ts

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  targetDate: string; 
  completedAt?: number;
  createdAt?: number;
  updatedAt?: number; // 新增：用于同步冲突判断
}

// 新增：同步动作类型
export type SyncActionType = 'INSERT' | 'UPDATE' | 'DELETE';

// 新增：队列中的单个任务结构
export interface SyncAction {
  id: string; // 任务ID
  type: SyncActionType;
  payload: Partial<Todo> | string; // 数据体或ID
  timestamp: number; // 操作产生的时间
}

// ... 保持 WindowState 等其他定义不变
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

declare global {
  interface Window {
    desktopCalendar?: {
      version: string;
      resizeWindow: (size: { width: number; height: number }) => void;
      setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void;
      setResizable: (resizable: boolean) => void;
    };
  }
}