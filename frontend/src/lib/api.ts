import axios from 'axios';
import { toast } from 'sonner';
import { auth } from '@/config/firebase';

// Backend API configuration — always use production Railway URL
const RAILWAY_API = 'https://nu-capstone-project-production.up.railway.app/api';
const RAILWAY_BASE = 'https://nu-capstone-project-production.up.railway.app';

export const getBaseApiUrl = () => {
    return import.meta.env.VITE_API_URL || RAILWAY_API;
};

export const BACKEND_API_URL = getBaseApiUrl();

export const getStoredAuthToken = () => {
    if (typeof window === 'undefined') return '';

    const token =
        localStorage.getItem('autospf_token') ||
        sessionStorage.getItem('autospf_token') ||
        localStorage.getItem('token') ||
        sessionStorage.getItem('token') ||
        localStorage.getItem('authToken') ||
        sessionStorage.getItem('authToken') ||
        '';

    if (token && token !== 'undefined' && token !== 'null') {
        if (!localStorage.getItem('autospf_token')) {
            localStorage.setItem('autospf_token', token);
        }
        return token;
    }

    return '';
};

export const clearStoredAuthToken = () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('autospf_token');
    sessionStorage.removeItem('autospf_token');
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    localStorage.removeItem('authToken');
    sessionStorage.removeItem('authToken');
};

/**
 * When Firebase has a session but `autospf_token` is missing (sync race, offline reload, etc.),
 * exchange Firebase identity for a backend JWT so authenticated API routes receive `Bearer`.
 */
export async function ensureBackendAuthToken(): Promise<string | null> {
    const existing = getStoredAuthToken();
    if (existing) return existing;

    const firebaseUser = auth.currentUser;
    if (!firebaseUser?.email) return null;

    try {
        await firebaseUser.getIdToken(true);
    } catch {
        /* non-fatal */
    }

    try {
        const syncResp = await fetch(`${BACKEND_API_URL}/auth/social-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: firebaseUser.email,
                name: firebaseUser.displayName || firebaseUser.email.split('@')[0] || 'User',
                provider: 'google',
                providerId: firebaseUser.uid,
                photoURL: firebaseUser.photoURL || undefined,
            }),
            signal: AbortSignal.timeout(15_000),
        });
        if (!syncResp.ok) return null;
        const syncJson = (await syncResp.json().catch(() => ({}))) as { data?: { token?: string } };
        const backendToken = syncJson?.data?.token;
        if (backendToken && backendToken !== 'undefined' && backendToken !== 'null') {
            localStorage.setItem('autospf_token', backendToken);
            return backendToken;
        }
    } catch (e) {
        console.warn('[ensureBackendAuthToken] social-login failed:', e);
    }
    return null;
}

const api = axios.create({
    baseURL: BACKEND_API_URL,
    headers: {
        'Content-Type': 'application/json'
    },
    /** Prevent indefinite hangs when the API or network stalls */
    timeout: 45_000,
});

// Socket connection URL — always use production Railway URL
export const getBackendSocketUrl = () => {
    return import.meta.env.VITE_BACKEND_URL || RAILWAY_BASE;
};

// Request Interceptor: Attach Authorization Header
api.interceptors.request.use(
    (config) => {
        const token = getStoredAuthToken();
        if (token && token !== 'undefined' && token !== 'null') {
            config.headers.Authorization = `Bearer ${token}`;
        }
        if (import.meta.env.DEV) {
            (config as { _reqStarted?: number })._reqStarted = typeof performance !== 'undefined' ? performance.now() : 0;
            const path = `${config.baseURL || ''}${config.url || ''}`;
            console.debug(`📤 [API REQUEST] ${config.method?.toUpperCase()} ${path}`, { hasToken: !!token });
        }
        return config;
    },
    (error) => {
        console.error('❌ [API REQUEST ERROR]:', error.message);
        return Promise.reject(error);
    }
);

// Response Interceptor: Global Error Handling & 401 Cleanup
api.interceptors.response.use(
    (response) => {
        if (import.meta.env.DEV) {
            const cfg = response.config as { _reqStarted?: number; method?: string; url?: string };
            if (cfg._reqStarted != null && typeof performance !== 'undefined') {
                const ms = performance.now() - cfg._reqStarted;
                console.debug(`[perf api] ${cfg.method?.toUpperCase()} ${cfg.url} ${ms.toFixed(0)}ms`);
            }
        }
        return response;
    },
    async (error) => {
        const { response, config } = error;
        const suppressErrorToast = Boolean((config as any)?.meta?.suppressErrorToast);
        const suppressCancelLog = Boolean((config as any)?.meta?.suppressCancelLog);
        const isCanceled =
            error?.code === 'ERR_CANCELED' ||
            error?.name === 'CanceledError' ||
            error?.message === 'canceled';

        if (suppressCancelLog && isCanceled) {
            return Promise.reject(error);
        }

        // Log precise error details for debugging
        const status = response?.status || 'NETWORK_ERROR';
        const message = response?.data?.message || error.message;
        const endpoint = config?.url || 'unknown';

        console.error(`🚨 [API ERROR ${status}]:`, {
            url: config?.url,
            method: config?.method,
            status: status,
            message: message,
            data: response?.data
        });

        // Global Error Handler with Toast Notifications
        if (response?.status === 401) {
            console.warn('🔓 [API 401]: Backend token rejected for', endpoint);

            // Only clear the backend JWT — do NOT touch Firebase auth.
            // Firebase auth state is exclusively managed by AuthContext.
            // Calling signOut(auth) here would fire onAuthStateChanged(null)
            // and nuke the entire session, even for freshly-logged-in users.
            clearStoredAuthToken();

            // Try silent refresh if Firebase user exists
            const firebaseUser = auth.currentUser;
            if (firebaseUser && !(config as any)?._retry) {
                (config as any)._retry = true;
                try {
                    const refreshRes = await axios.post(
                        `${BACKEND_API_URL}/auth/social-login`,
                        {
                            email: firebaseUser.email,
                            name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                            provider: 'google',
                            providerId: firebaseUser.uid,
                            photoURL: firebaseUser.photoURL,
                        }
                    );
                    const newToken = refreshRes.data?.data?.token;
                    if (newToken) {
                        localStorage.setItem('autospf_token', newToken);
                        (config as any).headers.Authorization = `Bearer ${newToken}`;
                        return api(config as any);
                    }
                } catch (refreshError) {
                    console.warn('[API] Silent token refresh failed:', refreshError);
                }
            }

            // If we reach here, refresh failed or no Firebase user — just reject silently.
            // AuthContext's onAuthStateChanged will handle the actual logout flow.
        } else if (response?.status === 403) {
            const code = response?.data?.code;

            // ── Deactivated / archived account → force full logout ──────────────
            if (code === 'ACCOUNT_INACTIVE') {
                console.warn('🔒 [API 403 ACCOUNT_INACTIVE]: Account deactivated — forcing logout.');
                clearStoredAuthToken();
                // Sign out of Firebase so social-login bypass is also blocked
                try {
                    const { signOut } = await import('firebase/auth');
                    await signOut(auth);
                } catch (fbErr) {
                    console.warn('[API] Firebase signOut failed during deactivation logout:', fbErr);
                }
                toast.error('This account is disabled', {
                    id: 'account-inactive',
                    description: 'This account is disabled. Please try to contact the administrator.',
                    duration: 6000,
                });
                // Give the toast a moment to render before redirecting
                setTimeout(() => {
                    window.location.href = '/login';
                }, 1500);
                return Promise.reject(error);
            }

            // Generic 403 — Forbidden
            console.warn('🚫 [API 403]: Access denied.');
            if (!suppressErrorToast) {
                toast.error('Access Denied', {
                    id: `api-403:${message || endpoint}`,
                    description: message || 'You do not have permission to access this resource.'
                });
            }
        } else if (response?.status === 404) {
            // Not Found
            console.warn('🔍 [API 404]: Resource not found.');
            if (!suppressErrorToast) {
                toast.error('Not Found', {
                    id: `api-404:${endpoint}`,
                    description: message || `The requested resource (${endpoint}) was not found.`
                });
            }
        } else if (response?.status === 409) {
            // Conflict - Usually duplicate data
            console.warn('⚠️ [API 409]: Conflict detected.');
            if (!suppressErrorToast) {
                toast.warning('Conflict', {
                    description: message || 'This action conflicts with existing data.'
                });
            }
        } else if (response?.status === 422) {
            // Unprocessable Entity - Validation Error
            console.warn('⚠️ [API 422]: Validation error.');
            if (!suppressErrorToast) {
                toast.error('Validation Error', {
                    id: `api-422:${endpoint}`,
                    description: message || 'Please check your input and try again.'
                });
            }
        } else if (response?.status === 429) {
            // Too Many Requests - Rate Limiting
            console.warn('⏱️ [API 429]: Rate limit exceeded.');
            if (!suppressErrorToast) {
                toast.warning('Too Many Requests', {
                    id: 'api-429',
                    description: 'Please slow down and try again in a moment.'
                });
            }
        } else if (response?.status && response.status >= 500) {
            // Server Error (500, 502, 503, 504, etc.)
            console.warn('⚠️ [API 5xx]: Server error received.');
            if (!suppressErrorToast) {
                toast.error('Server Error', {
                    id: `api-5xx:${endpoint}`,
                    description: message || 'Something went wrong on our end. Please try again later.'
                });
            }
        } else if (status === 'NETWORK_ERROR') {
            // Network Error - No response from server
            if (!suppressErrorToast) {
                toast.error('Connection Error', {
                    id: 'api-network-error',
                    description: 'Please check your internet connection and try again.'
                });
            }
        } else if (response?.status) {
            // Other HTTP errors
            if (!suppressErrorToast) {
                toast.error(`Error ${response.status}`, {
                    id: `api-${response.status}:${endpoint}`,
                    description: message || 'An unexpected error occurred.'
                });
            }
        }

        return Promise.reject(error);
    }
);

export default api;
