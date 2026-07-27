import { createRoot } from 'react-dom/client'
import { MenuWindow } from './components/MenuWindow'
import { injectFontCss } from './fonts'
import { initTheme, watchThemeChange } from './theme'
import './style.css'

injectFontCss();
initTheme();
watchThemeChange();

// 这里的 'root' 必须对应 menu.html 里的 id
const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<MenuWindow />);
} else {
  console.error("Failed to find root element");
}
