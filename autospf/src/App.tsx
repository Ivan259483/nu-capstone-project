import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Login from "./pages/Login";
import LandingPage from "./pages/LandingPage";
import CustomerDashboard from "./pages/CustomerDashboard";
import DetailerDashboard from "./pages/DetailerDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import ScanPreviewPage from "./pages/ScanPreviewPage";
import ChatWidget from "./components/ChatWidget";
import AboutPage from "./pages/AboutPage";
import BookingPage from "./pages/BookingPage";
import Navbar from "./components/Navbar";
import AIEstimatorPage from "./pages/AIEstimatorPage";

const queryClient = new QueryClient();

const applyStoredTheme = () => {
    if (typeof document === 'undefined') return;
    const storedGlobal = localStorage.getItem('autospf_global_theme');
    const storedLegacy = localStorage.getItem('autospf_theme');
    const theme = storedGlobal === 'light' || storedGlobal === 'dark'
        ? storedGlobal
        : (storedLegacy === 'light' ? 'light' : 'dark');
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    document.documentElement.style.colorScheme = theme;
};

applyStoredTheme();
window.addEventListener('DOMContentLoaded', applyStoredTheme);
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyStoredTheme);
} else {
    applyStoredTheme();
}

// Protected Route Component
function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: string[] }) {
    const { user, isLoading } = useAuth();

    if (isLoading && !user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                    <p className="text-muted-foreground animate-pulse">Loading AutoSPF+...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (!allowedRoles.includes(user.role)) {
        // Redirect to appropriate dashboard based on role
        switch (user.role) {
            case 'admin':
                return <Navigate to="/admin/dashboard" replace />;
            case 'detailer':
                return <Navigate to="/detailer/dashboard" replace />;
            case 'customer':
                return <Navigate to="/customer/dashboard" replace />;
            default:
                return <Navigate to="/" replace />;
        }
    }

    return <>{children}</>;
}

import ErrorBoundary from "./components/ErrorBoundary";

import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { auth } from "@/config/firebase";

/* Scroll to top on every route change */
function ScrollToTop() {
    const { pathname } = useLocation();
    useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]);
    return null;
}

function AppRoutes() {
    // Global Auth Observer to force redirect if user is already logged in & on login page
    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            // Auto-redirect already-authenticated users away from the login page
            if (user && window.location.pathname === '/login') {
                const storedUser = localStorage.getItem('user');
                let role = 'customer';
                if (storedUser) {
                    try {
                        const parsed = JSON.parse(storedUser);
                        role = parsed.role || 'customer';
                    } catch (e) { }
                }
                if (role === 'admin') window.location.replace('/admin/dashboard');
                else if (role === 'detailer') window.location.replace('/detailer/dashboard');
                else window.location.replace('/customer/dashboard');
            }
        });
        return () => unsubscribe();
    }, []);

    return (
        <ErrorBoundary>
            <ScrollToTop />
            <Navbar />
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/booking" element={<BookingPage />} />
                <Route path="/ar-estimator" element={<AIEstimatorPage />} />
                <Route path="/login" element={<Login />} />
                <Route
                    path="/customer/dashboard"
                    element={
                        <ProtectedRoute allowedRoles={['customer']}>
                            <CustomerDashboard />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/scan-preview"
                    element={
                        <ProtectedRoute allowedRoles={['customer', 'detailer', 'admin']}>
                            <ScanPreviewPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/detailer/dashboard"
                    element={
                        <ProtectedRoute allowedRoles={['detailer']}>
                            <DetailerDashboard />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/admin/dashboard"
                    element={
                        <ProtectedRoute allowedRoles={['admin', 'detailer']}>
                            <AdminDashboard />
                        </ProtectedRoute>
                    }
                />
                {/* Backward compatibility for old routes */}
                <Route path="/customer" element={<Navigate to="/customer/dashboard" replace />} />
                <Route path="/detailer" element={<Navigate to="/detailer/dashboard" replace />} />
                <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </ErrorBoundary>
    );
}

const App = () => (
    <QueryClientProvider client={queryClient}>
        <AuthProvider>
            <TooltipProvider>
                <Toaster position="top-center" />
                <BrowserRouter>
                    <AppRoutes />
                    <ChatWidget />
                </BrowserRouter>
            </TooltipProvider>
        </AuthProvider>
    </QueryClientProvider>
);

export default App;
