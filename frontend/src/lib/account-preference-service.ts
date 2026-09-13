import api from './api';
import { isAxiosError } from 'axios';
import type { NotificationPreferences, RegionalPreferences } from './customer-account-settings';
import type { PreferenceAdapter } from './account-preference-store';

function preferenceAdapter<T extends object>(path: string): PreferenceAdapter<T> {
  // Each section owns one useful error message; suppress the global HTTP toast.
  const config = { timeout: 15_000, meta: { suppressErrorToast: true } };
  const data = (response: { data: { success: boolean; data?: T; message?: string } }) => {
    if (!response.data.success || !response.data.data) throw new Error(response.data.message || 'Could not load your preferences. Please try again.');
    return response.data.data;
  };
  const request = async (pending: Parameters<typeof data>[0] | Promise<Parameters<typeof data>[0]>) => {
    try { return data(await pending); }
    catch (error) {
      if (isAxiosError(error)) {
        const message = error.response?.data?.message;
        throw new Error(typeof message === 'string' ? message : 'Could not reach your account. Please try again.');
      }
      throw error;
    }
  };
  return {
    load: () => request(api.get(path, config)),
    save: (patch) => request(api.patch(path, patch, config)),
  };
}

export const notificationPreferenceAdapter = preferenceAdapter<NotificationPreferences>('/customers/me/notification-preferences');
export const regionalPreferenceAdapter = preferenceAdapter<RegionalPreferences>('/customers/me/regional-preferences');
