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
      base: '#12283f', card: '#183450', elevated: '#1f4060',
      line: 'rgba(255, 255, 255, 0.08)', hover: 'rgba(255, 255, 255, 0.12)',
      ink: '#e9eef5', ink2: '#a3b1c2', ink3: '#7f8ea1',
      baseRGB: '18, 40, 63',
      mint: '#7cc6f0', mintDeep: '#3ea3e0', mintInk: '#0c1e2a', mintDim: 'rgba(124, 198, 240, 0.14)',
    },
  },
  {
    id: 'jade',
    name: '墨玉绿',
    colors: {
      base: '#143327', card: '#1a4332', elevated: '#21523e',
      line: 'rgba(255, 255, 255, 0.08)', hover: 'rgba(255, 255, 255, 0.12)',
      ink: '#e9f1ec', ink2: '#a3b8ad', ink3: '#7f9489',
      baseRGB: '20, 51, 39',
      mint: '#8fe0c0', mintDeep: '#45c695', mintInk: '#0e241b', mintDim: 'rgba(143, 224, 192, 0.14)',
    },
  },
  {
    id: 'twilight',
    name: '夜幕紫',
    colors: {
      base: '#251a3d', card: '#2f2149', elevated: '#3a2958',
      line: 'rgba(255, 255, 255, 0.08)', hover: 'rgba(255, 255, 255, 0.12)',
      ink: '#eeebf7', ink2: '#b0a9c7', ink3: '#8d85a6',
      baseRGB: '37, 26, 61',
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

// --- 颜色插值：用于米白主题透明态从米白平滑渐变到曜石黑，避免阈值跳变 ---
const parseColor = (c: string): [number, number, number, number] => {
  if (c.startsWith('#')) {
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 1];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b, a] = m[1].split(',').map(s => parseFloat(s));
    return [r, g, b, Number.isNaN(a) ? 1 : a];
  }
  return [0, 0, 0, 1];
};

const mixColor = (from: string, to: string, t: number): string => {
  const [r1, g1, b1, a1] = parseColor(from);
  const [r2, g2, b2, a2] = parseColor(to);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  const a = a1 + (a2 - a1) * t;
  return a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
};

// baseRGB 是 "r, g, b" 三元组，不是完整颜色，单独插值
const mixRGBTriplet = (from: string, to: string, t: number): string => {
  const p = (s: string) => s.split(',').map(x => parseFloat(x));
  const a = p(from), b = p(to);
  return a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(', ');
};

// 按 t（0=from，1=to）插值整套主题配色
export const lerpThemeColors = (from: ThemePreset['colors'], to: ThemePreset['colors'], t: number): ThemePreset['colors'] => ({
  base: mixColor(from.base, to.base, t),
  card: mixColor(from.card, to.card, t),
  elevated: mixColor(from.elevated, to.elevated, t),
  line: mixColor(from.line, to.line, t),
  hover: mixColor(from.hover, to.hover, t),
  ink: mixColor(from.ink, to.ink, t),
  ink2: mixColor(from.ink2, to.ink2, t),
  ink3: mixColor(from.ink3, to.ink3, t),
  baseRGB: mixRGBTriplet(from.baseRGB, to.baseRGB, t),
  mint: mixColor(from.mint, to.mint, t),
  mintDeep: mixColor(from.mintDeep, to.mintDeep, t),
  mintInk: mixColor(from.mintInk, to.mintInk, t),
  mintDim: mixColor(from.mintDim, to.mintDim, t),
});

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
  // --theme-* 别名保存主题原始值，供 .theme-keep 在透明态覆盖下恢复下拉等组件配色
  root.setProperty('--theme-card', c.card);
  root.setProperty('--theme-elevated', c.elevated);
  root.setProperty('--theme-line', c.line);
  root.setProperty('--theme-hover', c.hover);
  root.setProperty('--theme-ink', c.ink);
  root.setProperty('--theme-ink2', c.ink2);
  root.setProperty('--theme-ink3', c.ink3);
  root.setProperty('--theme-mint', c.mint);
  root.setProperty('--theme-mint-deep', c.mintDeep);
  root.setProperty('--theme-mint-ink', c.mintInk);
  root.setProperty('--theme-mint-dim', c.mintDim);
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
