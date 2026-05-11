import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { useEffect, lazy, Suspense, type ReactNode } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import Login from "./pages/Login";
import Home from "./pages/Home";
import About from "./pages/About";
import Contact from "./pages/Contact";
import ChatWidget from "./components/ChatWidget";
import Navbar from "./components/Navbar";
import VerifyOtpPage from "./pages/VerifyOtpPage";
import SetPasswordPage from "./pages/SetPasswordPage";
import {
    ADMIN_DASHBOARD_ROLES,
    CUSTOMER_ROLE,
    INVENTORY_DASHBOARD_ROLES,
    STAFF_ROLES,
    getDashboardPathForRole,
    getSafeUserRole,
} from "@/lib/roles";
import { useActivityHeartbeat } from "@/hooks/useActivityHeartbeat";

const Gallery = lazy(() => import("./pages/Gallery"));
const Services = lazy(() => import("./pages/Services"));
const CustomerDashboard = lazy(() => import("./pages/CustomerDashboard"));
const CustomerLiveTrackerPage = lazy(() => import("./pages/CustomerLiveTrackerPage"));
const DetailerDashboard = lazy(() => import("./pages/DetailerDashboard"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const SalesDashboard = lazy(() => import("./pages/SalesDashboard"));
const InventoryPanel = lazy(() => import("./components/inventory/InventoryPanel"));
const CreateStaffAccountPage = lazy(() => import("./pages/admin/CreateStaffAccountPage"));
const AccountRequestsPage = lazy(() => import("./pages/admin/AccountRequestsPage"));
const AIEstimatorPage = lazy(() => import("./pages/AIEstimatorPage"));

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

/** Full-page skeleton while lazy route chunks load (matches protected dashboard feel). */
function RoutePageSkeleton() {
    return (
        <div className="min-h-screen flex bg-[#0a0e1a]">
            <div className="hidden md:flex w-64 flex-col border-r border-white/5 bg-[#0d1220] p-5 gap-6">
                <div className="h-8 w-32 rounded-lg bg-white/5 animate-pulse" />
                <div className="space-y-3 mt-4">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-9 rounded-lg bg-white/[0.04] animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
                    ))}
                </div>
                <div className="mt-auto h-10 rounded-lg bg-white/[0.03] animate-pulse" />
            </div>
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

// Protected Route Component — shows skeleton loader instead of blocking spinner
function ProtectedRoute({ children, allowedRoles }: { children: ReactNode; allowedRoles: string[] }) {
    // isFirebaseAuthReady: true once Firebase's onAuthStateChanged has fired and
    // resolved (either a session was found or confirmed absent). We MUST NOT
    // redirect unauthenticated users until this is true, otherwise a brief window
    // where user=null but auth is still initialising causes a redirect loop:
    // navigate('/dashboard') → ProtectedRoute sees user=null → redirects to /login
    // → Login sees user (from useEffect post-setUser) → redirects to /dashboard → loop.
    const { user, isLoading, isFirebaseAuthReady } = useAuth();
    const location = useLocation();

    // Show skeleton while Firebase is initialising OR during any loading phase.
    // The key guard: do NOT make routing decisions until auth is confirmed.
    if (!isFirebaseAuthReady || isLoading) {
        return <RoutePageSkeleton />;
    }

    if (!user) {
        // Only save route if it's an actual protected destination, not the root
        if (location.pathname !== '/' && location.pathname !== '/login') {
            sessionStorage.setItem('redirect_after_login', location.pathname + location.search + location.hash);
        }
        return <Navigate to="/login" replace />;
    }

    const safeRole = getSafeUserRole(user.role);
    if (!allowedRoles.includes(safeRole)) {
        return <Navigate to={getDashboardPathForRole(safeRole)} replace />;
    }

    return <>{children}</>;
}

/* Scroll to top on every route change */
function ScrollToTop() {
    const { pathname } = useLocation();
    useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]);
    return null;
}

/** Legacy /ops/dashboard — QC → Detailer (`components/technician`), ops/admin → Admin Hub live tab */
function OpsDashboardRedirect() {
    const { user, isFirebaseAuthReady } = useAuth();
    if (!isFirebaseAuthReady) return <RoutePageSkeleton />;
    if (!user) return <Navigate to="/login" replace />;
    const safeRole = getSafeUserRole(user.role);
    if (safeRole === 'staff_quality_checker') {
        return <Navigate to="/detailer/dashboard" replace />;
    }
    return <Navigate to="/admin/dashboard?tab=live_tracking" replace />;
}

/** Bookmark /admin/live-tracking — QC uses Detailer portal; others stay on Admin Hub */
function AdminLiveTrackingRoleRedirect() {
    const { user } = useAuth();
    const safeRole = getSafeUserRole(user?.role);
    if (safeRole === 'staff_quality_checker') {
        return <Navigate to="/detailer/dashboard" replace />;
    }
    return <Navigate to="/admin/dashboard?tab=live_tracking" replace />;
}

function ActivityHeartbeatHost() {
    useActivityHeartbeat();
    return null;
}

function AppRoutes() {
    // NOTE: Role-based redirect after login is handled by AuthContext + Login.tsx useEffect.
    // Do NOT add a separate auth.onAuthStateChanged here — it causes race conditions and
    // reads stale/wrong localStorage keys, sending admin users to the wrong dashboard.
    const location = useLocation();

    // Hide the public Navbar on dashboard routes — they have their own navigation
    const isDashboardRoute = /^\/(customer|detailer|admin|sales|inventory|ops)/.test(location.pathname);
    const isStandaloneRoute = /^\/(verify-otp|set-password)/.test(location.pathname);

    return (
        <ErrorBoundary>
            <ScrollToTop />
            <ActivityHeartbeatHost />
            {!isDashboardRoute && !isStandaloneRoute && <Navbar />}
            <Suspense fallback={<RoutePageSkeleton />}>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/gallery" element={<Gallery />} />
                    <Route path="/services" element={<Services />} />
                    <Route path="/booking" element={<Navigate to="/login" replace />} />
                    <Route path="/ar-estimator" element={<AIEstimatorPage />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/verify-otp" element={<VerifyOtpPage />} />
                    <Route path="/set-password" element={<SetPasswordPage />} />
                    <Route
                        path="/customer/dashboard"
                        element={
                            <ProtectedRoute allowedRoles={[CUSTOMER_ROLE]}>
                                <CustomerDashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/customer/live-tracker"
                        element={
                            <ProtectedRoute allowedRoles={[CUSTOMER_ROLE]}>
                                <CustomerLiveTrackerPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/customer/book"
                        element={
                            <ProtectedRoute allowedRoles={[CUSTOMER_ROLE]}>
                                <CustomerDashboard />
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
                    <Route
                        path="/sales/dashboard"
                        element={
                            <ProtectedRoute allowedRoles={['administrator', 'sales', 'office_admin']}>
                                <SalesDashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/inventory/dashboard"
                        element={
                            <ProtectedRoute allowedRoles={INVENTORY_DASHBOARD_ROLES}>
                                <InventoryPanel />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/admin/live-tracking"
                        element={
                            <ProtectedRoute allowedRoles={ADMIN_DASHBOARD_ROLES}>
                                <AdminLiveTrackingRoleRedirect />
                            </ProtectedRoute>
                        }
                    />
                    <Route path="/ops/dashboard" element={<OpsDashboardRedirect />} />
                    {/* Backward compatibility for old routes */}
                    <Route path="/customer" element={<Navigate to="/customer/dashboard" replace />} />
                    <Route path="/detailer" element={<Navigate to="/detailer/dashboard" replace />} />
                    <Route path="/sales" element={<Navigate to="/sales/dashboard" replace />} />
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
            </Suspense>
        </ErrorBoundary>
    );
}

// Only show the floating ChatWidget on public pages — not inside any dashboard
function _ConditionalChatWidget() {
    const { pathname } = useLocation();
    const isDashboardRoute = /^\/(customer|detailer|admin|ops)/.test(pathname);
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
