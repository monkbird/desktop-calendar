// 运行时注入 MiSans 字体样式表。
// 字体文件放在 public/fonts/misans/（不经过 vite 构建管线）——
// rolldown-vite 目前不会把 CSS 里 url() 引用的字体文件打包进 dist，
// 而 public/ 目录会被原样拷贝，浏览器按 CSS 文件所在路径相对解析分片，
// 开发（/fonts/...）与打包（file:// 相对路径）环境行为一致。
export const injectFontCss = () => {
  const id = 'misans-font-css';
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = './fonts/misans/MiSans-all.min.css';
  document.head.appendChild(link);
};
