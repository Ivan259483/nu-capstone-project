/**
 * ThemeToggle.tsx
 * Reusable Dark/Light Mode sliding toggle.
 *
 * Drop-in usage:
 *   import { ThemeToggle } from '@/components/ui/ThemeToggle';
 *   <ThemeToggle />
 *
 * Reads/writes localStorage key "autospf_global_theme" — the same key
 * App.tsx uses on startup — so theme persists across all pages and roles.
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ─────────────────────── helpers ─────────────────────── */

function getInitialTheme(): 'dark' | 'light' {
    if (typeof window === 'undefined') return 'dark';
    // Primary key used by App.tsx on startup
    const primary = localStorage.getItem('autospf_global_theme');
    if (primary === 'light' || primary === 'dark') return primary;
    // Legacy fallback
    const legacy = localStorage.getItem('autospf_theme') || localStorage.getItem('theme');
    if (legacy === 'light') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Syncs BOTH class systems used in this project:
 *  - Tailwind dark mode  → adds/removes `dark` on <html>
 *  - Admin Dashboard CSS → adds/removes `light` on <html>  (:root.light selectors)
 * Both systems are kept in sync so every page responds correctly.
 */
function applyTheme(theme: 'dark' | 'light') {
    const root = document.documentElement;
    if (theme === 'dark') {
        root.classList.add('dark');
        root.classList.remove('light');
    } else {
        root.classList.remove('dark');
        root.classList.add('light');
    }
    // Write to the key App.tsx reads on startup (persists across page reloads)
    localStorage.setItem('autospf_global_theme', theme);
    // Keep legacy keys in sync
    localStorage.setItem('autospf_theme', theme);
    localStorage.setItem('theme', theme);
}

/* ──────────────────────── SVGs ───────────────────────── */

const SunIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-4 h-4"
        aria-hidden="true"
    >
        {/* centre circle */}
        <circle cx="12" cy="12" r="4" />
        {/* rays */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <rect
                key={deg}
                x="11.25"
                y="2"
                width="1.5"
                height="3"
                rx="0.75"
                transform={`rotate(${deg} 12 12)`}
            />
        ))}
    </svg>
);

const MoonIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-4 h-4"
        aria-hidden="true"
    >
        <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
    </svg>
);

/* ──────────────────────── stars ──────────────────────── */

const STARS = [
    { x: '15%', y: '20%', size: 1.5, delay: 0 },
    { x: '30%', y: '60%', size: 1, delay: 0.3 },
    { x: '50%', y: '30%', size: 2, delay: 0.1 },
    { x: '70%', y: '70%', size: 1, delay: 0.5 },
    { x: '85%', y: '25%', size: 1.5, delay: 0.2 },
];

/* ─────────────────────── component ───────────────────── */

interface ThemeToggleProps {
    /** Optional extra class names for the outer wrapper */
    className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '' }) => {
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');

    // Hydrate from localStorage / system preference on mount
    useEffect(() => {
        const initial = getInitialTheme();
        setTheme(initial);
        applyTheme(initial);
    }, []);

    const toggle = () => {
        const next: 'dark' | 'light' = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        applyTheme(next);
    };

    const isDark = theme === 'dark';

    /* ── track / thumb colours ── */
    const trackBg = isDark
        ? 'bg-[#1a1f3c]'      // deep night blue
        : 'bg-[#7ec8e3]';     // sky blue

    return (
        <button
            type="button"
            role="switch"
            aria-checked={isDark}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggle}
            className={`relative inline-flex items-center h-8 w-16 rounded-full
                        cursor-pointer select-none border border-white/10
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                        transition-all duration-500 ${trackBg} ${className}`}
        >
            {/* ── Stars (visible in dark mode) ── */}
            <AnimatePresence>
                {isDark && STARS.map((s, i) => (
                    <motion.span
                        key={i}
                        className="absolute rounded-full bg-white"
                        style={{
                            left: s.x,
                            top: s.y,
                            width: s.size,
                            height: s.size,
                        }}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: [0, 1, 0.6, 1], scale: 1 }}
                        exit={{ opacity: 0, scale: 0 }}
                        transition={{ duration: 0.5, delay: s.delay, repeat: Infinity, repeatDelay: 2 }}
                    />
                ))}
            </AnimatePresence>

            {/* ── Small cloud (visible in light mode) ── */}
            <AnimatePresence>
                {!isDark && (
                    <motion.svg
                        className="absolute right-1 w-5 h-5 text-white/70"
                        viewBox="0 0 64 40"
                        fill="currentColor"
                        initial={{ opacity: 0, x: 4 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 4 }}
                        transition={{ duration: 0.4 }}
                        aria-hidden="true"
                    >
                        <path d="M54 20a10 10 0 0 0-19.4-3A8 8 0 1 0 18 28h36a8 8 0 0 0 0-8z" />
                    </motion.svg>
                )}
            </AnimatePresence>

            {/* ── Sliding thumb ── */}
            <motion.span
                layout
                animate={{
                    x: isDark ? 34 : 4,
                }}
                transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 28,
                }}
                className={`relative z-10 flex items-center justify-center
                            w-6 h-6 rounded-full shadow-md
                            transition-colors duration-500
                            ${isDark
                        ? 'bg-indigo-300 text-indigo-900 shadow-[0_0_10px_3px_rgba(165,180,252,0.5)]'
                        : 'bg-yellow-200 text-yellow-700 shadow-[0_0_10px_3px_rgba(253,224,71,0.6)]'
                    }`}
            >
                {/* Icon crossfade */}
                <AnimatePresence mode="wait" initial={false}>
                    {isDark ? (
                        <motion.span
                            key="moon"
                            initial={{ opacity: 0, rotate: -30, scale: 0.6 }}
                            animate={{ opacity: 1, rotate: 0, scale: 1 }}
                            exit={{ opacity: 0, rotate: 30, scale: 0.6 }}
                            transition={{ duration: 0.25 }}
                        >
                            <MoonIcon />
                        </motion.span>
                    ) : (
                        <motion.span
                            key="sun"
                            initial={{ opacity: 0, rotate: 30, scale: 0.6 }}
                            animate={{ opacity: 1, rotate: 0, scale: 1 }}
                            exit={{ opacity: 0, rotate: -30, scale: 0.6 }}
                            transition={{ duration: 0.25 }}
                        >
                            <SunIcon />
                        </motion.span>
                    )}
                </AnimatePresence>
            </motion.span>
        </button>
    );
};
