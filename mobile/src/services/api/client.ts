import axios, { type AxiosError } from 'axios';
import { API_BASE_URL } from '@/config/env';
import { authStorage } from '@/services/storage/authStorage';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await authStorage.getToken();
  if (token) {
    config.headers = config.headers || {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

import { Toast } from '@/components/ui/PremiumToast';

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message?: string }>) => {
    if (error.response?.status === 401) {
      Toast.show('Session expired. Please log in again.', 'error');
      await authStorage.clearToken();
    } else if (!error.message || error.message === 'Network Error') {
      Toast.show('Network unavailable. Check connection.', 'error');
    }
    return Promise.reject(error);
  }
);

export const getApiErrorMessage = (
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || error.message || fallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
};

export const getApiStatusCode = (error: unknown): number | null => {
  if (axios.isAxiosError(error)) {
    return error.response?.status ?? null;
  }
  return null;
};
