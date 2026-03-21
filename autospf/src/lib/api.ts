import axios from 'axios';
import { toast } from 'sonner';

// Backend API configuration
// During development: Use /api which proxies to http://localhost:3000
// During production: Use full URL from environment variable
const isDevelopment = import.meta.env.MODE === 'development';
export const BACKEND_API_URL = isDevelopment
    ? '/api'
    : (import.meta.env.VITE_API_URL || 'http://localhost:3000/api');

const api = axios.create({
    baseURL: BACKEND_API_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json'
    }
});

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
            // Enhanced 401 Handling: Check for expired or invalid tokens explicitly
            const authErrors = [
                'Invalid token',
                'No token provided',
                'No valid token provided',
                'Invalid token payload',
                'User not authenticated',
                'Token expired',
                'Not authorized - Invalid or missing user session'
            ];
            const isAuthError = authErrors.some(err => message?.includes(err));

            if (isAuthError) {
                console.warn('🔓 [API 401]: Auth failure verified. Clearing session.');

                toast.error('Session Expired', {
                    description: 'Please login again to continue.'
                });

                // Clear ALL auth-related data to prevent "zombie" sessions
                localStorage.removeItem('autospf_token');
                localStorage.removeItem('autospf_current_user');

                // Only redirect if we're not already on login/home and have a valid window
                if (typeof window !== 'undefined' &&
                    !window.location.pathname.includes('/login') &&
                    window.location.pathname !== '/' &&
                    !window.location.search.includes('session=expired')) {
                    // Use replace instead of href to prevent history issues
                    window.location.replace('/?session=expired');
                }
            } else {
                console.warn('⚠️ [API 401]: Received 401 but keeping session (might be temporary or non-critical).', message);
                toast.warning('Unauthorized', {
                    description: message || 'You do not have permission to perform this action.'
                });
            }
        } else if (response?.status === 403) {
            // Forbidden - Access Denied
            console.warn('🚫 [API 403]: Access denied.');
            toast.error('Access Denied', {
                description: message || 'You do not have permission to access this resource.'
            });
        } else if (response?.status === 404) {
            // Not Found
            console.warn('🔍 [API 404]: Resource not found.');
            toast.error('Not Found', {
                description: message || `The requested resource (${endpoint}) was not found.`
            });
        } else if (response?.status === 409) {
            // Conflict - Usually duplicate data
            console.warn('⚠️ [API 409]: Conflict detected.');
            toast.warning('Conflict', {
                description: message || 'This action conflicts with existing data.'
            });
        } else if (response?.status === 422) {
            // Unprocessable Entity - Validation Error
            console.warn('⚠️ [API 422]: Validation error.');
            toast.error('Validation Error', {
                description: message || 'Please check your input and try again.'
            });
        } else if (response?.status === 429) {
            // Too Many Requests - Rate Limiting
            console.warn('⏱️ [API 429]: Rate limit exceeded.');
            toast.warning('Too Many Requests', {
                description: 'Please slow down and try again in a moment.'
            });
        } else if (response?.status && response.status >= 500) {
            // Server Error (500, 502, 503, 504, etc.)
            console.warn('⚠️ [API 5xx]: Server error received.');
            toast.error('Server Error', {
                description: message || 'Something went wrong on our end. Please try again later.'
            });
        } else if (status === 'NETWORK_ERROR') {
            // Network Error - No response from server
            toast.error('Connection Error', {
                description: 'Please check your internet connection and try again.'
            });
        } else if (response?.status) {
            // Other HTTP errors
            toast.error(`Error ${response.status}`, {
                description: message || 'An unexpected error occurred.'
            });
        }

        return Promise.reject(error);
    }
);

export default api;
