/**
 * ProtectedRoute
 *
 * Route guard component that enforces role-based access at the route level.
 *
 * Behaviour:
 *  1. Loading  → shows skeleton loader (matches existing App.tsx skeleton)
 *  2. No user  → redirects to /login (saves intended destination in sessionStorage)
 *  3. Role not in allowedRoles → redirects to the user's own dashboard
 *  4. Authenticated + role allowed → renders children
 *
 * Usage:
 *   <ProtectedRoute allowedRoles={['office_admin']}>
 *     <CreateStaffAccountPage />
 *   </ProtectedRoute>
 */
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getDashboardPathForRole, getSafeUserRole } from '@/lib/roles';

interface ProtectedRouteProps {
  /** Roles that are allowed to render children. Pass empty array for "all authenticated". */
  allowedRoles: string[];
  children: React.ReactNode;
}

export default function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { user, isLoading, isFirebaseAuthReady } = useAuth();
  const location = useLocation();

  // ── Loading state — show skeleton rather than blank/flicker ──────────────
  if (!isFirebaseAuthReady || isLoading) {
    return (
      <div className="min-h-screen flex bg-[#0a0e1a]">
        {/* Skeleton sidebar */}
        <div className="hidden md:flex w-64 flex-col border-r border-white/5 bg-[#0d1220] p-5 gap-6">
          <div className="h-8 w-32 rounded-lg bg-white/5 animate-pulse" />
          <div className="space-y-3 mt-4">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-9 rounded-lg bg-white/[0.04] animate-pulse"
                style={{ animationDelay: `${i * 80}ms` }}
              />
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
              <div
                key={i}
                className="h-28 rounded-2xl bg-white/[0.04] animate-pulse"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
          <div className="h-64 rounded-2xl bg-white/[0.03] animate-pulse" style={{ animationDelay: '400ms' }} />
        </div>
      </div>
    );
  }

  // ── Not authenticated → redirect to login ──────────────────────────────
  if (!user) {
    const redirectPath = location.pathname + location.search + location.hash;
    if (location.pathname !== '/' && location.pathname !== '/login') {
      sessionStorage.setItem(
        'redirect_after_login',
        redirectPath
      );
    }
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirectPath)}`} replace />;
  }

  // ── Authenticated but role not permitted → own dashboard ────────────────
  const safeRole = getSafeUserRole(user.role);
  const normalizedAllowedRoles = allowedRoles.map((role) => getSafeUserRole(role));
  if (allowedRoles.length > 0 && !normalizedAllowedRoles.includes(safeRole)) {
    return <Navigate to={getDashboardPathForRole(safeRole)} replace />;
  }

  // ── Authenticated + role allowed → render children ─────────────────────
  return <>{children}</>;
}
