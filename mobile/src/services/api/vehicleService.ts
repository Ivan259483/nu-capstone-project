import { apiClient, cachedGet, invalidateCache } from '@/services/api/client';
import type { ApiEnvelope, Vehicle } from '@/services/api/types';

const VEHICLES_URL = '/customers/vehicles';
// 30-second cache — vehicles change rarely, eliminates re-fetch on every screen focus
const VEHICLES_TTL = 30_000;
const ABSENT_VEHICLE_COLORS = new Set(['', 'unknown', 'unknown color', 'n/a', 'na', 'none', 'not set']);

const normalizeVehicleColorDisplay = (value: unknown): string => {
  const color = String(value ?? '').trim().replace(/\s+/g, ' ');
  return ABSENT_VEHICLE_COLORS.has(color.toLowerCase()) ? 'Not specified' : color;
};

type VehicleMutationParams = {
  year: string;
  make: string;
  model: string;
  color?: string;
  plateNumber: string;
  vehicleType?: string;
  pricingCategory?: string | null;
  generation?: string;
  facelift?: string;
  drivetrain?: string;
  transmission?: string;
  fuelType?: string;
};

const toVehicle = (raw: any): Vehicle => ({
  id: raw?._id || raw?.id || '',
  _id: raw?._id,
  year: raw?.year ?? '',
  make: raw?.make || '',
  model: raw?.model || '',
  color: normalizeVehicleColorDisplay(raw?.color),
  standardColor: raw?.standardColor,
  factoryColorName: raw?.factoryColorName || '',
  paintCode: raw?.paintCode || '',
  finishType: raw?.finishType || '',
  colorHex: raw?.colorHex || '',
  colorRgb: raw?.colorRgb,
  colorSource: raw?.colorSource,
  plateNumber: raw?.plateNumber || '',
  vehicleType: raw?.vehicleType,
  pricingCategory: raw?.pricingCategory ?? null,
  pricingCategorySource: raw?.pricingCategorySource ?? null,
  pricingCategoryNeedsReview: Boolean(raw?.pricingCategoryNeedsReview),
  generation: raw?.generation || '',
  facelift: raw?.facelift || '',
  drivetrain: raw?.drivetrain || '',
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

  async addVehicle(params: VehicleMutationParams): Promise<{ vehicle: Vehicle; alreadyOwned: boolean }> {
    const response = await apiClient.post<ApiEnvelope<any>>('/customers/vehicles', params);
    invalidateCache(VEHICLES_URL);
    // 200 = plate already belonged to this customer (idempotent return)
    // 201 = freshly created
    const alreadyOwned = response.status === 200;
    return { vehicle: toVehicle(response.data.data), alreadyOwned };
  },

  async updateVehicle(vehicleId: string, params: VehicleMutationParams): Promise<Vehicle> {
    const response = await apiClient.put<ApiEnvelope<any>>(`${VEHICLES_URL}/${vehicleId}`, params);
    invalidateCache(VEHICLES_URL);
    return toVehicle(response.data.data);
  },

  async deleteVehicle(vehicleId: string): Promise<void> {
    await apiClient.delete(`/customers/vehicles/${vehicleId}`);
    invalidateCache(VEHICLES_URL); // bust cache so next fetch is fresh
  },
};
