import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const applyInitialTheme = () => {
    if (typeof document === 'undefined') return;
    const storedTheme = localStorage.getItem('autospf_theme');
    const theme = storedTheme === 'light' ? 'light' : 'dark';
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    document.documentElement.style.colorScheme = theme;
};

applyInitialTheme();

createRoot(document.getElementById('root')!).render(<App />);
