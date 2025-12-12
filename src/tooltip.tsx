import { createRoot } from 'react-dom/client'
import { ExternalTooltip } from './components/ExternalTooltip'
import './style.css'

// 这里的 'root' 必须对应 tooltip.html 里的 id
const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<ExternalTooltip />);
} else {
  console.error("Failed to find root element");
}