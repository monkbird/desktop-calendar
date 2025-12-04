# 桌面日历清单（Desktop Calendar）

一个使用 React + TypeScript + Tailwind CSS v4 构建的桌面日历与待办清单应用。

## 快速开始
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

## 技术栈
- 构建工具：`vite`（通过 `rolldown-vite@7.2.5`）
- 语言与框架：`TypeScript`、`React`
- 样式：`Tailwind CSS v4`（PostCSS 插件集成）

## 目录结构（关键文件）
- `index.html`：入口 HTML，加载 `src/main.tsx`
- `src/main.tsx`：React 入口，挂载 `App`
- `src/app.tsx`：主应用逻辑（窗口拖拽、缩放、待办逻辑、悬浮 Tooltip）
- `src/components/CalendarCell.tsx`：日历单元格组件
- `src/components/InteractiveTooltip.tsx`：悬浮交互面板组件
- `src/style.css`：全局样式，包含 `@import "tailwindcss"`
- `postcss.config.mjs`：Tailwind v4 的 PostCSS 插件配置
- `tsconfig.json`：TypeScript 配置，启用 `jsx: react-jsx`

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

