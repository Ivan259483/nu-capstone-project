import axios from 'axios';

// Backend API configuration - Use localhost for local development
export const BACKEND_API_URL = 'http://localhost:3000/api';

const api = axios.create({
    baseURL: BACKEND_API_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Request Interceptor: Attach Authorization Header
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('autospf_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
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

        console.error(`🚨 [API ERROR ${status}]:`, {
            url: config?.url,
            method: config?.method,
            status: status,
            message: message,
            data: response?.data
        });

        if (response?.status === 401) {
            console.warn('🔓 [API 401]: Unauthorized. Clearing session and redirecting.');
            localStorage.removeItem('autospf_token');
            // Immediate redirect to login to prevent 'undefined' errors and stale sessions
            if (typeof window !== 'undefined') {
                window.location.href = '/';
            }
        }

        return Promise.reject(error);
    }
);

export default api;
