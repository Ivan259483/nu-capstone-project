import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Apply site-wide theme on boot (public marketing site, admin/customer dashboards).
// The Detailing Portal is self-contained and manages its own 'autospf_detailer_theme' key.
const applyInitialTheme = () => {
    if (typeof document === 'undefined') return;
    // Intentionally reads ONLY the global key, never autospf_detailer_theme
    const storedTheme = localStorage.getItem('autospf_global_theme') || localStorage.getItem('autospf_theme');
    const theme = storedTheme === 'light' ? 'light' : 'dark';
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    document.documentElement.style.colorScheme = theme;
};

applyInitialTheme();

createRoot(document.getElementById('root')!).render(<App />);
