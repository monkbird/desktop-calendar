// src/types.ts

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  targetDate: string; 
  completedAt?: number;
  createdAt?: number;
  updatedAt?: number;
}

export type SyncActionType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface SyncAction {
  id: string;
  type: SyncActionType;
  payload: Partial<Todo> | string;
  timestamp: number;
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

declare global {
  interface Window {
    desktopCalendar?: {
      // --- 1. 原有窗口控制 API ---
      version: string;
      resizeWindow: (size: { width: number; height: number }) => void;
      setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void;
      setResizable: (resizable: boolean) => void;

      // --- 2. 双窗口通信 API ---
      showTooltip: (payload: { x: number; y: number; width: number; height: number; data: any }) => void;
      hideTooltip: () => void;
      onUpdateTooltip: (cb: (data: any) => void) => () => void;
      dispatchTooltipAction: (action: { type: string; payload: any }) => void;
      onTooltipAction: (cb: (action: { type: string; payload: any }) => void) => () => void;
      
      // [新增] 子窗口自我调整大小
      resizeTooltip: (size: { width: number; height: number }) => void;
    };
  }
}