import { apiClient } from '@/services/api/client';

export type SystemMode = 'development' | 'demo' | 'production' | 'archived';

export interface PublicSystemStatus {
  mode: SystemMode;
  phase: 'none' | 'draining' | 'ready_to_archive';
  registrationEnabled: boolean;
  bookingEnabled: boolean;
  operationalDataEpoch: number;
  revision: number;
  updatedAt?: string | null;
}

export const DEFAULT_SYSTEM_STATUS: PublicSystemStatus = {
  mode: 'development',
  phase: 'none',
  registrationEnabled: true,
  bookingEnabled: true,
  operationalDataEpoch: 0,
  revision: 0,
  updatedAt: null,
};

export const systemStatusService = {
  async getStatus(): Promise<PublicSystemStatus> {
    const response = await apiClient.get('/system/status', {
      meta: { suppressExpectedErrorLog: true },
    } as any);
    const payload = response.data?.data || response.data || {};
    return {
      mode: ['development', 'demo', 'production', 'archived'].includes(payload.mode)
        ? payload.mode
        : DEFAULT_SYSTEM_STATUS.mode,
      phase: ['none', 'draining', 'ready_to_archive'].includes(payload.phase)
        ? payload.phase
        : DEFAULT_SYSTEM_STATUS.phase,
      registrationEnabled: payload.registrationEnabled !== false,
      bookingEnabled: payload.bookingEnabled !== false,
      operationalDataEpoch: Number(payload.operationalDataEpoch) || 0,
      revision: Number(payload.revision) || 0,
      updatedAt: payload.updatedAt || null,
    };
  },
};
