import { apiClient, cachedGet, invalidateCache, TTL } from '@/services/api/client';
import type { ApiEnvelope, Vehicle } from '@/services/api/types';

const VEHICLES_URL = '/customers/vehicles';
// 30-second cache — vehicles change rarely, eliminates re-fetch on every screen focus
const VEHICLES_TTL = 30_000;

const toVehicle = (raw: any): Vehicle => ({
  id: raw?._id || raw?.id || '',
  _id: raw?._id,
  year: raw?.year ?? '',
  make: raw?.make || '',
  model: raw?.model || '',
  color: raw?.color,
  plateNumber: raw?.plateNumber || '',
  vehicleType: raw?.vehicleType,
  transmission: raw?.transmission,
  fuelType: raw?.fuelType,
  customer: raw?.customer,
});

export const vehicleService = {
  async getMyVehicles(): Promise<Vehicle[]> {
    const data = await cachedGet<ApiEnvelope<any[]>>(VEHICLES_URL, undefined, VEHICLES_TTL);
    const items = Array.isArray(data.data) ? data.data : [];
    return items.map(toVehicle);
  },

  async addVehicle(params: {
    year: string;
    make: string;
    model: string;
    color?: string;
    plateNumber: string;
    vehicleType?: string;
    transmission?: string;
    fuelType?: string;
  }): Promise<{ vehicle: Vehicle; alreadyOwned: boolean }> {
    const response = await apiClient.post<ApiEnvelope<any>>('/customers/vehicles', params);
    invalidateCache(VEHICLES_URL);
    // 200 = plate already belonged to this customer (idempotent return)
    // 201 = freshly created
    const alreadyOwned = response.status === 200;
    return { vehicle: toVehicle(response.data.data), alreadyOwned };
  },

  async deleteVehicle(vehicleId: string): Promise<void> {
    await apiClient.delete(`/customers/vehicles/${vehicleId}`);
    invalidateCache(VEHICLES_URL); // bust cache so next fetch is fresh
  },
};
