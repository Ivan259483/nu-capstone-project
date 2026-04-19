import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Ensure <html> is clean on initial page load.
// Public pages define their own dark aesthetic via :root CSS variables in index.css.
// Dashboard pages scope their theme inside their own wrapper elements (.admin-root, .detailer-root).
// We must NOT apply dark/light classes to <html> here — that leaks into public pages.
const ensureCleanHtml = () => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.style.removeProperty('color-scheme');
};

ensureCleanHtml();

createRoot(document.getElementById('root')!).render(<App />);
