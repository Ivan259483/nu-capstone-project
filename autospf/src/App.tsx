import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Login from "./pages/Login";
import CustomerDashboard from "./pages/CustomerDashboard";
import DetailerDashboard from "./pages/DetailerDashboard";
import AdminDashboard from "./pages/AdminDashboard";

const queryClient = new QueryClient();

// Protected Route Component
function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: string[] }) {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/" replace />;
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

function AppRoutes() {
    return (
        <Routes>
            <Route path="/" element={<Login />} />
            <Route
                path="/customer/dashboard"
                element={
                    <ProtectedRoute allowedRoles={['customer']}>
                        <CustomerDashboard />
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
                    <ProtectedRoute allowedRoles={['admin']}>
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
    );
}

const App = () => (
    <QueryClientProvider client={queryClient}>
        <AuthProvider>
            <TooltipProvider>
                <Toaster position="top-center" />
                <BrowserRouter>
                    <AppRoutes />
                </BrowserRouter>
            </TooltipProvider>
        </AuthProvider>
    </QueryClientProvider>
);

export default App;