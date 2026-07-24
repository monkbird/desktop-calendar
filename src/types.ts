// src/types.ts

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  targetDate: string; 
  completedAt?: number;
  createdAt?: number;
  updatedAt?: number;
  order?: number;

  // --- 新增：兼容 iOS 的字段 ---
  isLongTerm?: boolean;
  startDate?: string; // ISO string (YYYY-MM-DD)
  endDate?: string;   // ISO string
  isAllDay?: boolean;
  isAllYear?: boolean;
  isMonth?: boolean;
  repeat?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  isPinned?: boolean;
}

export type SyncActionType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface SyncAction {
  id: string;
  type: SyncActionType;
  payload: Partial<Todo> | string;
  timestamp: number;
}

// ... 后面的 WindowState, HoverState 等保持不变 ...
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
      // ... 保持原有内容不变 ...
      version: string;
      resizeWindow: (size: { width: number; height: number }) => void;
      setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void;
      setResizable: (resizable: boolean) => void;
      showTooltip: (payload: { x: number; y: number; width: number; height: number; data: any }) => void;
      hideTooltip: () => void;
      onUpdateTooltip: (cb: (data: any) => void) => () => void;
      dispatchTooltipAction: (action: { type: string; payload: any }) => void;
      onTooltipAction: (cb: (action: { type: string; payload: any }) => void) => () => void;
      updateTooltipData: (data: any) => void;
      resizeTooltip: (size: { width: number; height: number }) => void;
    };
  }
}