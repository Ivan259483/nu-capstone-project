import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import Login from "./pages/Login";
import Home from "./pages/Home";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Gallery from "./pages/Gallery";
import Services from "./pages/Services";
import BookingPage from "./pages/BookingPage";
import CustomerDashboard from "./pages/CustomerDashboard";
import DetailerDashboard from "./pages/DetailerDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import ScanPreviewPage from "./pages/ScanPreviewPage";
import CreateStaffAccountPage from "./pages/admin/CreateStaffAccountPage";
import AccountRequestsPage from "./pages/admin/AccountRequestsPage";
import ChatWidget from "./components/ChatWidget";
import Navbar from "./components/Navbar";
import AIEstimatorPage from "./pages/AIEstimatorPage";
import {
    ADMIN_DASHBOARD_ROLES,
    CUSTOMER_ROLE,
    SERVICE_STAFF_ROLE,
    STAFF_ROLES,
    USER_ROLES,
    getDashboardPathForRole,
} from "@/lib/roles";

const queryClient = new QueryClient();

// Public pages use the :root CSS variables in index.css for their premium dark aesthetic.
// Dashboard-specific themes are scoped inside their own wrapper components (admin-root, detailer-root).
// We intentionally do NOT apply any stored theme to <html> here — that caused the bug where
// logging in as any user would flip the public site to system dark mode unexpectedly.
const cleanGlobalTheme = () => {
    if (typeof document === 'undefined') return;
    // Remove any stale dark/light classes that dashboards may have leaked onto <html>
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.style.removeProperty('color-scheme');
    // Clean up the global theme key so it can't affect future page loads
    localStorage.removeItem('autospf_global_theme');
};

cleanGlobalTheme();

// Protected Route Component — shows skeleton loader instead of blocking spinner
function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: string[] }) {
    // isFirebaseAuthReady: true once Firebase's onAuthStateChanged has fired and
    // resolved (either a session was found or confirmed absent). We MUST NOT
    // redirect unauthenticated users until this is true, otherwise a brief window
    // where user=null but auth is still initialising causes a redirect loop:
    // navigate('/dashboard') → ProtectedRoute sees user=null → redirects to /login
    // → Login sees user (from useEffect post-setUser) → redirects to /dashboard → loop.
    const { user, isLoading, isFirebaseAuthReady } = useAuth();
    const location = useLocation();

    // Show skeleton while Firebase is initialising OR during any loading phase.
    // This is the key guard: do NOT make routing decisions until auth is confirmed.
    if (!isFirebaseAuthReady || isLoading) {
        return (
            <div className="min-h-screen flex bg-[#0a0e1a]">
                {/* Skeleton sidebar */}
                <div className="hidden md:flex w-64 flex-col border-r border-white/5 bg-[#0d1220] p-5 gap-6">
                    <div className="h-8 w-32 rounded-lg bg-white/5 animate-pulse" />
                    <div className="space-y-3 mt-4">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="h-9 rounded-lg bg-white/[0.04] animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
                        ))}
                    </div>
                    <div className="mt-auto h-10 rounded-lg bg-white/[0.03] animate-pulse" />
                </div>
                {/* Skeleton main content */}
                <div className="flex-1 p-8 space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
                        <div className="h-8 w-8 rounded-full bg-white/5 animate-pulse" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="h-28 rounded-2xl bg-white/[0.04] animate-pulse" style={{ animationDelay: `${i * 120}ms` }} />
                        ))}
                    </div>
                    <div className="h-64 rounded-2xl bg-white/[0.03] animate-pulse" style={{ animationDelay: '400ms' }} />
                    <div className="grid grid-cols-2 gap-5">
                        <div className="h-40 rounded-2xl bg-white/[0.03] animate-pulse" style={{ animationDelay: '520ms' }} />
                        <div className="h-40 rounded-2xl bg-white/[0.03] animate-pulse" style={{ animationDelay: '640ms' }} />
                    </div>
                </div>
            </div>
        );
    }

    if (!user) {
        // Only save route if it's an actual protected destination, not the root
        if (location.pathname !== '/' && location.pathname !== '/login') {
            sessionStorage.setItem('redirect_after_login', location.pathname + location.search + location.hash);
        }
        return <Navigate to="/login" replace />;
    }

    if (!allowedRoles.includes(user.role)) {
        return <Navigate to={getDashboardPathForRole(user.role)} replace />;
    }

    return <>{children}</>;
}

/* Scroll to top on every route change */
function ScrollToTop() {
    const { pathname } = useLocation();
    useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]);
    return null;
}

function AppRoutes() {
    // NOTE: Role-based redirect after login is handled by AuthContext + Login.tsx useEffect.
    // Do NOT add a separate auth.onAuthStateChanged here — it causes race conditions and
    // reads stale/wrong localStorage keys, sending admin users to the wrong dashboard.
    const location = useLocation();

    // Hide the public Navbar on dashboard routes — they have their own navigation
    const isDashboardRoute = /^\/(customer|detailer|admin|scan-preview)/.test(location.pathname);

    return (
        <ErrorBoundary>
            <ScrollToTop />
            {!isDashboardRoute && <Navbar />}
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/about" element={<About />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/gallery" element={<Gallery />} />
                <Route path="/services" element={<Services />} />
                <Route path="/booking" element={<BookingPage />} />
                <Route path="/ar-estimator" element={<AIEstimatorPage />} />
                <Route path="/login" element={<Login />} />
                <Route
                    path="/customer/dashboard"
                    element={
                        <ProtectedRoute allowedRoles={[CUSTOMER_ROLE]}>
                            <CustomerDashboard />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/scan-preview"
                    element={
                        <ProtectedRoute allowedRoles={[...USER_ROLES]}>
                            <ScanPreviewPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/detailer/dashboard"
                    element={
                        <ProtectedRoute allowedRoles={STAFF_ROLES}>
                            <DetailerDashboard />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/admin/dashboard"
                    element={
                        <ProtectedRoute allowedRoles={ADMIN_DASHBOARD_ROLES}>
                            <AdminDashboard />
                        </ProtectedRoute>
                    }
                />
                {/* Backward compatibility for old routes */}
                <Route path="/customer" element={<Navigate to="/customer/dashboard" replace />} />
                <Route path="/detailer" element={<Navigate to="/detailer/dashboard" replace />} />
                <Route
                    path="/admin/create-staff"
                    element={<CreateStaffAccountPage />}
                />
                <Route
                    path="/admin/account-requests"
                    element={<AccountRequestsPage />}
                />
                {/* Backward compatibility for old routes */}
                <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </ErrorBoundary>
    );
}

// Only show the floating ChatWidget on public pages — not inside any dashboard
function _ConditionalChatWidget() {
    const { pathname } = useLocation();
    const isDashboardRoute = /^\/(customer|detailer|admin|scan-preview)/.test(pathname);
    if (isDashboardRoute) return null;
    return <ChatWidget />;
}

const App = () => (
    <QueryClientProvider client={queryClient}>
        <LanguageProvider>
            <AuthProvider>
                <TooltipProvider>
                    <Toaster position="top-center" />
                    <BrowserRouter>
                        <AppRoutes />
                        {/* ChatWidget: public site only — dashboards have their own chat */}
                        <_ConditionalChatWidget />
                    </BrowserRouter>
                </TooltipProvider>
            </AuthProvider>
        </LanguageProvider>
    </QueryClientProvider>
);

export default App;
