import { createRoot } from 'react-dom/client'
import App from './app'
import { injectFontCss } from './fonts'
import './style.css'

injectFontCss();

createRoot(document.getElementById('app')!).render(<App />)
