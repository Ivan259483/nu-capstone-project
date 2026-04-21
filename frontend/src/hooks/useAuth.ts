/**
 * useAuth — canonical auth hook
 *
 * Defined here (not in AuthContext.tsx) so that AuthContext.tsx only exports
 * the AuthProvider component, satisfying Vite react-swc Fast Refresh which
 * requires files to export either only components or only non-components.
 *
 * The underlying role value comes from the backend JWT / MongoDB user record —
 * no client-side JWT decode is performed or needed.
 */
import { useContext } from 'react';
import { AuthContext } from '@/contexts/AuthContext';

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
