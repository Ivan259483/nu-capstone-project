import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, LayoutDashboard } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const NAV_LINKS = [
    { label: 'HOME', href: '/' },
    { label: 'ABOUT', href: '/about' },
    { label: 'SERVICES', href: '#services' },
    { label: 'PACKAGES', href: '#pricing' },
    { label: 'GALLERY', href: '#gallery' },
    { label: 'BOOKING', href: '/booking' },
];

/* Map user role → correct dashboard path */
const DASHBOARD_MAP: Record<string, string> = {
    admin: '/admin/dashboard',
    detailer: '/detailer/dashboard',
    customer: '/customer/dashboard',
};

export default function Navbar() {
    const [scrolled, setScrolled] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const isLanding = location.pathname === '/';

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 40);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    /* Hide public Navbar on auth-only routes — placed AFTER all hooks */
    const HIDDEN_ROUTES = ['/login', '/admin', '/customer', '/detailer'];
    if (HIDDEN_ROUTES.some(r => location.pathname === r || location.pathname.startsWith(r + '/'))) {
        return null;
    }

    const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
        if (href.startsWith('#')) {
            e.preventDefault();
            if (!isLanding) {
                navigate('/');
                setTimeout(() => {
                    document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth' });
                }, 120);
            } else {
                document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth' });
            }
        }
    };

    const dashboardPath = DASHBOARD_MAP[user?.role || ''] || '/admin/dashboard';

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    return (
        <motion.header
            className={`sticky top-0 z-[100] transition-all duration-500 ${scrolled
                ? 'bg-[#0B1120]/90 backdrop-blur-xl border-b border-white/8 shadow-[0_4px_30px_rgba(0,0,0,0.4)]'
                : 'bg-transparent'
                }`}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
            <div className="max-w-7xl mx-auto px-6 lg:px-10 flex items-center justify-between h-16">

                {/* ── Logo ── */}
                <Link to="/" className="flex items-center gap-3 group translate-y-[1px]">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/30 group-hover:shadow-orange-500/50 transition-all duration-300">
                        <span className="text-white font-black text-xs leading-none">A+</span>
                    </div>
                    <span className="text-white font-semibold tracking-tight hidden sm:block leading-none translate-y-[-1px]">
                        AutoSPF<span className="text-orange-400">+</span>
                    </span>
                </Link>

                {/* ── Nav links ── */}
                <nav className="hidden md:flex items-center gap-7">
                    {NAV_LINKS.map(({ label, href }) =>
                        href.startsWith('/') ? (
                            <Link
                                key={label}
                                to={href}
                                className="text-white/40 hover:text-white text-xs uppercase tracking-widest font-medium transition-colors duration-200"
                            >
                                {label}
                            </Link>
                        ) : (
                            <a
                                key={label}
                                href={href}
                                onClick={e => handleNavClick(e, href)}
                                className="text-white/40 hover:text-white text-xs uppercase tracking-widest font-medium transition-colors duration-200 cursor-pointer"
                            >
                                {label}
                            </a>
                        )
                    )}
                </nav>

                {/* ── Auth CTA ── */}
                <AnimatePresence mode="wait">
                    {user ? (
                        /* ── Logged-in: Dashboard + Logout ── */
                        <motion.div
                            key="auth"
                            initial={{ opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -12 }}
                            transition={{ duration: 0.25 }}
                            className="flex items-center gap-2"
                        >
                            <Link to={dashboardPath}>
                                <motion.span
                                    whileHover={{ scale: 1.04 }}
                                    whileTap={{ scale: 0.96 }}
                                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold uppercase tracking-widest
                                               bg-gradient-to-r from-orange-500 to-amber-600
                                               text-white shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40
                                               transition-all duration-300 cursor-pointer"
                                >
                                    <LayoutDashboard className="w-3.5 h-3.5" />
                                    Dashboard
                                </motion.span>
                            </Link>
                            <motion.button
                                whileHover={{ scale: 1.08 }}
                                whileTap={{ scale: 0.92 }}
                                onClick={handleLogout}
                                className="w-8 h-8 rounded-xl bg-white/8 border border-white/12 hover:bg-red-500/15 hover:border-red-500/30
                                           flex items-center justify-center text-white/40 hover:text-red-400
                                           transition-all duration-200 cursor-pointer"
                                title="Sign Out"
                            >
                                <LogOut className="w-3.5 h-3.5" />
                            </motion.button>
                        </motion.div>
                    ) : (
                        /* ── Logged-out: Login button ── */
                        <motion.div
                            key="guest"
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 12 }}
                            transition={{ duration: 0.25 }}
                        >
                            <Link to="/login">
                                <motion.span
                                    whileHover={{ scale: 1.04 }}
                                    whileTap={{ scale: 0.96 }}
                                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold uppercase tracking-widest
                                               bg-white/8 hover:bg-gradient-to-r hover:from-orange-500 hover:to-amber-600
                                               border border-white/15 hover:border-transparent
                                               text-white/70 hover:text-white
                                               shadow-sm hover:shadow-lg hover:shadow-orange-500/30
                                               transition-all duration-300 cursor-pointer"
                                >
                                    Login
                                </motion.span>
                            </Link>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.header>
    );
}
