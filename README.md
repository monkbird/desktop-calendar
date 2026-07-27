# 桌面日历清单（Desktop Calendar）

一个使用 React + TypeScript + Tailwind CSS v4 + Electron 构建的桌面日历与待办清单应用。

## 快速开始（Web）
- 环境：建议 `Node.js >= 18`（当前项目在 `v22.x` 下验证）
- 安装依赖：
  ```bash
  npm install
  ```
- 启动开发：
  ```bash
  npm run dev
  ```
- 生产构建：
  ```bash
  npm run build
  ```
- 预览构建：
  ```bash
  npm run preview
  ```

## 桌面应用（Electron）
- 启动桌面开发：
  ```bash
  npm run electron:dev
  ```
  说明：自动启动 Vite 开发服务器并以 Electron 加载，开发模式下会打开 DevTools。
- 启动已构建的桌面应用：
  ```bash
  npm run electron:start
  ```
- 打包 Windows 安装包（NSIS）：
  ```bash
  npm run electron:build
  ```
  特性：可选择安装目录、创建桌面/开始菜单快捷方式、支持开机自启动。

## 技术栈
- 构建工具：`vite`（通过 `rolldown-vite@7.2.5`）
- 语言与框架：`TypeScript`、`React`
- 样式：`Tailwind CSS v4`（PostCSS 插件集成）
- 桌面：`Electron 31.x`、`electron-builder`（NSIS）

## 目录结构（关键文件）
- `index.html`：入口 HTML，加载 `src/main.tsx`
- `src/main.tsx`：React 入口，挂载 `App`
- `src/app.tsx`：主应用逻辑（窗口拖拽、缩放、待办逻辑、悬浮 Tooltip）
- `src/components/CalendarCell.tsx`：日历单元格组件
- `src/components/ExternalTooltip.tsx`：悬停任务浮窗（独立 Electron 窗口，`tooltip.html`）
- `src/components/MenuWindow.tsx`：侧贴菜单窗口（年/月选择器、搜索、历史归档、数据管理，`menu.html`）
- `src/components/AuthModal.tsx`：登录/注册弹窗（Supabase）
- `src/theme.ts`：主题换肤预设与应用逻辑（覆盖 CSS 变量 + localStorage 持久化）
- `src/style.css`：全局样式，包含 `@import "tailwindcss"` 与自定义动画定义
- `postcss.config.mjs`：Tailwind v4 的 PostCSS 插件配置
- `tsconfig.json`：TypeScript 配置，启用 `jsx: react-jsx`
- `electron/main.js`：Electron 主进程（边缘吸附、托盘、窗口透明度）
- `public/icon.png`：应用图标资源（当前为 500×500）

## Tailwind v4 集成说明
- 已使用 PostCSS 方式集成：
  - `postcss.config.mjs`
    ```js
    export default {
      plugins: {
        "@tailwindcss/postcss": {},
      },
    }
    ```
  - 在 `src/style.css` 顶部导入：
    ```css
    @import "tailwindcss";
    ```
- v4 不再需要 `tailwind.config.js`，如需自定义主题可在 CSS 中使用 `@theme` 声明变量。
  ```css
  @theme {
    --color-brand-500: oklch(0.72 0.11 178);
  }
  /* 使用：bg-brand-500 */
  ```

## TypeScript 与 React 配置要点
- `tsconfig.json`：
  - `"jsx": "react-jsx"` 启用新 JSX 运行时
  - `"verbatimModuleSyntax": true` 下使用 `import type` 导入类型
- 事件类型区分：
  - 组件事件使用 `React.MouseEvent`
  - 全局 `window.addEventListener` 使用 DOM `MouseEvent`
- 定时器类型：使用 `ReturnType<typeof setTimeout>`，避免依赖 `@types/node`

## 账号与同步（Supabase）
- 入口：标题栏右侧账号图标
- 未登录：点击弹出登录/注册弹窗
- 已登录：点击显示账号下拉菜单（邮箱展示、退出登录），并添加悬停延迟避免误关闭
- 环境变量（推荐）：
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  在 `src/supabase.ts` 中读取；请勿将私密 Key 提交到仓库。

## 桌面特性与最近改动
- 透明度：窗口背景由 0% 改为约 10%（`electron/main.js`）
- 托盘与图标：统一使用 `public/icon.png`，打包配置指向该图标；托盘按开发/生产路径自动切换
- 边缘吸附：窗口拖动靠近屏幕边缘自动对齐（主进程实现）
- 开机自启：集成 `auto-launch`，安装后自动设置
- 交互优化：
  - 账号菜单增加悬停延迟（移出后约 500ms 关闭）
  - 已登录时点击账号图标不再弹出登录/注册
  - 非当月日期格淡化程度降低（更易读）
  - 标题栏与月份栏水平内边距收窄，整体更紧凑

## 2026-07-27 更新

### 悬停任务浮窗：入场动效与闪烁修复
- **修复"弹两次/闪一下"**：
  - 浮窗可见时切换格子，主进程曾先用旧高度定位、渲染完再用新高度定位，窗口跳两次；现在可见状态下不预定位，只由 resize 回调一次性定位（`electron/main.js` 的 `show-tooltip-window`）
  - 去掉显示时冗余的 `setAlwaysOnTop(true)`（窗口创建时已是 `alwaysOnTop`），消除 Windows 上的层级闪烁
- **高度变化平滑过渡**：内容自然高度变化（切换日期、增删任务）时，卡片高度做 240ms CSS 过渡，`ResizeObserver` 逐帧上报、窗口即时跟随，内容与窗口始终同高
- **关键坑：隐藏窗口下 `ResizeObserver` 不下发回调**（Chromium 暂停绘制）。因此数据到达时在 layout effect 里**同步**上报起始尺寸触发 `showInactive`，可见后再靠 RO 逐帧跟随，`transitionend` 兜底最终尺寸
- **修复"任务出现两次"**：动画类只在 `animateReady` 时添加，导致任务先静态显示一遍、动画开始时再消失重播；现在未就绪时列表项 `opacity-0`
- **修复"渐显状态残留导致淡出再淡入"**：`freshShow` 标记（主进程随数据下发）在窗口还隐藏时就重置入场状态，`tooltip-visible` 只负责启动动画
- **最终入场时序**：弹窗直接显示 → 100ms 后任务逐条"翻下"（绕顶边 rotateX 翻转，逐条间隔 110ms，动画定义 `src/style.css` 的 `toolbar-stagger-in`）

### 逐项翻入动效统一
以下位置的列表项统一为翻转级联入场（`animate-toolbar-stagger`，110ms 间隔）：
- 标题栏"桌面日历"工具下拉菜单（`src/app.tsx`）
- 搜索结果列表（`src/components/SearchModal.tsx`）、历史归档列表（`src/components/HistoryModal.tsx`）
- 侧贴菜单窗口切换面板时通过 `key={menu.mode}` 重挂载重播（`src/components/MenuWindow.tsx`，原整体果冻动画已移除）
- 年/月选择器格子**不使用**逐项动画，直接整体显示

### 主题换肤
- 标题栏右侧新增主题按钮（调色板图标），下拉选择 5 套完整配色：曜石黑（默认）、深海蓝、墨玉绿、夜幕紫、米白
- 实现：`src/theme.ts` 定义预设，通过覆盖 `@theme` 的全部 CSS 变量（背景三层、文字三级、线条、悬停色、强调色）实时换肤；选择持久化到 `localStorage`（`desktop-theme`）
- 主窗口半透明底色跟随主题（`rgba(baseRGB, 用户透明度)`，替换原写死的黑色）
- 浮窗/菜单窗口入口（`src/tooltip.tsx`、`src/menu.tsx`）通过 `initTheme()` + `storage` 事件监听同步换肤

## 常见问题
- 运行 `npx tailwindcss init -p` 报错：Tailwind v4 已不再提供旧 CLI，该命令不可用。
  - 解决：使用 `@tailwindcss/postcss` 插件 + 在 CSS 中 `@import "tailwindcss"`（项目已配置）。
  - 如需 CLI 构建方式，安装 `@tailwindcss/cli` 并使用：
    ```bash
    npx @tailwindcss/cli -i ./src/style.css -o ./dist/output.css --watch
    ```

## 开发提示
- 组件中使用 Tailwind 工具类即可，无需额外配置内容路径（v4 自动检测）。
- 若引入新类型，优先使用 `import type` 以配合当前 `tsconfig` 设置。

## 许可
本项目包含 `LICENSE` 文件，详见仓库根目录。
