import { apiClient } from '@/services/api/client';
import type { ApiEnvelope, Vehicle } from '@/services/api/types';

const toVehicle = (raw: any): Vehicle => ({
  id: raw?._id || raw?.id || '',
  _id: raw?._id,
  year: raw?.year ?? '',
  make: raw?.make || '',
  model: raw?.model || '',
  color: raw?.color,
  plateNumber: raw?.plateNumber || '',
  customer: raw?.customer,
});

export const vehicleService = {
  async getMyVehicles(): Promise<Vehicle[]> {
    const response = await apiClient.get<ApiEnvelope<any[]>>('/customers/vehicles');
    const items = Array.isArray(response.data.data) ? response.data.data : [];
    return items.map(toVehicle);
  },

  async addVehicle(params: {
    year: string;
    make: string;
    model: string;
    color?: string;
    plateNumber: string;
  }): Promise<Vehicle> {
    const response = await apiClient.post<ApiEnvelope<any>>('/customers/vehicles', params);
    return toVehicle(response.data.data);
  },

  async deleteVehicle(vehicleId: string): Promise<void> {
    await apiClient.delete(`/customers/vehicles/${vehicleId}`);
  },
};
