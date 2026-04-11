import axios from 'axios';
import { toast } from 'sonner';

// Backend API configuration
// During development: Use /api which proxies to http://localhost:3000
// During production: Use full URL from environment variable
const isDevelopment = import.meta.env.MODE === 'development';

export const getBaseApiUrl = () => {
    if (isDevelopment) return '/api';
    let url = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
    return url.replace(/\/+$/, ''); // Strip trailing slashes safely
};

export const BACKEND_API_URL = getBaseApiUrl();

const api = axios.create({
    baseURL: BACKEND_API_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Socket connection URL
export const getBackendSocketUrl = () => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL
        || (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '') : '')
        || 'http://localhost:3001';
    return backendUrl;
};

// Request Interceptor: Attach Authorization Header
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('autospf_token');
        if (token && token !== 'undefined' && token !== 'null') {
            config.headers.Authorization = `Bearer ${token}`;
        }
        console.log(`📤 [API REQUEST] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`, {
            hasToken: !!token,
            baseURL: config.baseURL
        });
        return config;
    },
    (error) => {
        console.error('❌ [API REQUEST ERROR]:', error.message);
        return Promise.reject(error);
    }
);

// Response Interceptor: Global Error Handling & 401 Cleanup
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const { response, config } = error;
        const suppressErrorToast = Boolean((config as any)?.meta?.suppressErrorToast);

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
            console.warn('🔓 [API 401]: Session expired or invalid. Clearing session.');

            if (!suppressErrorToast) {
                toast.error('Session Expired', {
                    id: 'api-session-expired',
                    description: 'Please login again to continue.'
                });
            }

            // Clear auth data
            localStorage.removeItem('autospf_token');
            localStorage.removeItem('autospf_current_user');
            localStorage.removeItem('autospf_backend_user');
            localStorage.removeItem('autospf_session_cache'); // Also clear session cache

            // Only redirect if not already on login/home
            if (typeof window !== 'undefined' &&
                !window.location.pathname.includes('/login') &&
                window.location.pathname !== '/' &&
                !window.location.search.includes('session=expired')) {
                // Ensure we use React Router or similar if possible, but window.location.replace works
                window.location.replace('/?session=expired');
            }
        } else if (response?.status === 403) {
            // Forbidden - Access Denied
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
            toast.warning('Conflict', {
                description: message || 'This action conflicts with existing data.'
            });
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
