import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

// Modo app instalable (PWA): solo fuera de iframes y en https.
try {
  if ('serviceWorker' in navigator && window.self === window.top && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
} catch { /* nada */ }
