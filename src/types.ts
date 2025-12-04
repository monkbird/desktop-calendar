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

export interface HoverState {
  dateKey: string;
  x: number;
  y: number;
}