// 主题预设：整套界面配色（背景层级 + 文字 + 线条 + 强调色）。
// 通过覆盖 style.css @theme 里的 CSS 变量实现全局换肤，
// Tailwind v4 的 bg-elevated / text-ink 等工具类引用的是变量，:root 内联覆盖即实时生效
// （主窗口、悬停浮窗、菜单窗口通用，浮窗/菜单窗口通过 storage 事件同步）。
// baseRGB 供主窗口半透明底色使用：rgba(baseRGB, 用户透明度)。

export interface ThemePreset {
  id: string;
  name: string;
  colors: {
    base: string;      // 最底层背景
    card: string;      // 卡片背景
    elevated: string;  // 浮层背景（弹窗、下拉）
    line: string;      // 边框线
    hover: string;     // 悬停衬底
    ink: string;       // 主文字
    ink2: string;      // 次级文字
    ink3: string;      // 弱提示文字
    baseRGB: string;   // base 的 "r, g, b"，用于主窗口半透明底色
    mint: string;      // 主强调色（图标、高亮文字）
    mintDeep: string;  // 深色按钮底（bg-mint-deep）
    mintInk: string;   // 压在 mintDeep 上的文字色
    mintDim: string;   // 淡色衬底（bg-mint-dim）
  };
}

export const THEMES: ThemePreset[] = [
  {
    id: 'obsidian',
    name: '曜石黑',
    colors: {
      base: '#131418', card: '#1c1e25', elevated: '#22252e',
      line: 'rgba(255, 255, 255, 0.08)', hover: 'rgba(255, 255, 255, 0.12)',
      ink: '#e9ebf1', ink2: '#a6acbb', ink3: '#868da0',
      baseRGB: '19, 20, 24',
      mint: '#7ce3b1', mintDeep: '#3ecf8e', mintInk: '#10231b', mintDim: 'rgba(124, 227, 177, 0.14)',
    },
  },
  {
    id: 'abyss',
    name: '深海蓝',
    colors: {
      base: '#0e1622', card: '#141f2e', elevated: '#1a2839',
      line: 'rgba(255, 255, 255, 0.08)', hover: 'rgba(255, 255, 255, 0.12)',
      ink: '#e9eef5', ink2: '#a3b1c2', ink3: '#7f8ea1',
      baseRGB: '14, 22, 34',
      mint: '#7cc6f0', mintDeep: '#3ea3e0', mintInk: '#0c1e2a', mintDim: 'rgba(124, 198, 240, 0.14)',
    },
  },
  {
    id: 'jade',
    name: '墨玉绿',
    colors: {
      base: '#0f1a15', card: '#15241d', elevated: '#1b2e25',
      line: 'rgba(255, 255, 255, 0.08)', hover: 'rgba(255, 255, 255, 0.12)',
      ink: '#e9f1ec', ink2: '#a3b8ad', ink3: '#7f9489',
      baseRGB: '15, 26, 21',
      mint: '#8fe0c0', mintDeep: '#45c695', mintInk: '#0e241b', mintDim: 'rgba(143, 224, 192, 0.14)',
    },
  },
  {
    id: 'twilight',
    name: '夜幕紫',
    colors: {
      base: '#161221', card: '#1e1930', elevated: '#262040',
      line: 'rgba(255, 255, 255, 0.08)', hover: 'rgba(255, 255, 255, 0.12)',
      ink: '#eeebf7', ink2: '#b0a9c7', ink3: '#8d85a6',
      baseRGB: '22, 18, 33',
      mint: '#c8a9f5', mintDeep: '#a276e8', mintInk: '#1d1230', mintDim: 'rgba(200, 169, 245, 0.15)',
    },
  },
  {
    id: 'paper',
    name: '米白',
    colors: {
      base: '#f4f1ea', card: '#faf8f2', elevated: '#ffffff',
      line: 'rgba(0, 0, 0, 0.10)', hover: 'rgba(0, 0, 0, 0.06)',
      ink: '#2b2b31', ink2: '#5c5c68', ink3: '#8b8b97',
      baseRGB: '244, 241, 234',
      mint: '#e8934a', mintDeep: '#d97f3a', mintInk: '#2a1a0c', mintDim: 'rgba(232, 147, 74, 0.15)',
    },
  },
];

const STORAGE_KEY = 'desktop-theme';

export const getStoredThemeId = (): string => {
  const saved = localStorage.getItem(STORAGE_KEY);
  return THEMES.some(t => t.id === saved) ? (saved as string) : THEMES[0].id;
};

export const getTheme = (id: string): ThemePreset =>
  THEMES.find(t => t.id === id) ?? THEMES[0];

export const applyTheme = (id: string) => {
  const c = getTheme(id).colors;
  const root = document.documentElement.style;
  root.setProperty('--color-base', c.base);
  root.setProperty('--color-card', c.card);
  root.setProperty('--color-elevated', c.elevated);
  root.setProperty('--color-line', c.line);
  root.setProperty('--color-hover', c.hover);
  root.setProperty('--color-ink', c.ink);
  root.setProperty('--color-ink2', c.ink2);
  root.setProperty('--color-ink3', c.ink3);
  root.setProperty('--color-mint', c.mint);
  root.setProperty('--color-mint-deep', c.mintDeep);
  root.setProperty('--color-mint-ink', c.mintInk);
  root.setProperty('--color-mint-dim', c.mintDim);
  localStorage.setItem(STORAGE_KEY, getTheme(id).id);
};

// 页面加载时应用存储的主题（各窗口入口调用）
export const initTheme = () => {
  applyTheme(getStoredThemeId());
};

// 监听其他窗口（同源 localStorage）的主题变更并同步（浮窗/菜单窗口调用）
export const watchThemeChange = () => {
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) applyTheme(e.newValue);
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
};
