import { apiClient } from '@/services/api/client';
import type { ApiEnvelope } from '@/services/api/types';

export interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
  bookingConfirmation: boolean;
  jobStatusUpdates: boolean;
  paymentReminders: boolean;
  vehicleReminders: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  pushEnabled: true,
  emailEnabled: true,
  bookingConfirmation: true,
  jobStatusUpdates: true,
  paymentReminders: true,
  vehicleReminders: true,
};

function normalizePreferences(raw: Partial<NotificationPreferences> | null | undefined) {
  return Object.fromEntries(
    Object.entries(DEFAULT_NOTIFICATION_PREFERENCES).map(([key, fallback]) => [
      key,
      typeof raw?.[key as keyof NotificationPreferences] === 'boolean'
        ? raw[key as keyof NotificationPreferences]
        : fallback,
    ])
  ) as unknown as NotificationPreferences;
}

export const notificationPreferenceService = {
  async get(): Promise<NotificationPreferences> {
    const response = await apiClient.get<ApiEnvelope<NotificationPreferences>>(
      '/customers/me/notification-preferences'
    );
    return normalizePreferences(response.data.data);
  },

  async update(preferences: NotificationPreferences): Promise<NotificationPreferences> {
    const response = await apiClient.patch<ApiEnvelope<NotificationPreferences>>(
      '/customers/me/notification-preferences',
      { notificationPreferences: preferences },
      { _skipOfflineQueue: true } as never
    );
    if ((response.data as ApiEnvelope<NotificationPreferences> & { offline?: boolean }).offline) {
      throw new Error('Notification preferences were not saved.');
    }
    return normalizePreferences(response.data.data);
  },
};
