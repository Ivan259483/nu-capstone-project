import api from './api';
import {
    getVehiclePricingCategory,
    type VehicleGarageFormValues,
} from '@/components/shared/vehicle-garage-constants';
import type { Vehicle } from '@/lib/salesData';

const ABSENT_VEHICLE_COLORS = new Set(['', 'unknown', 'unknown color', 'n/a', 'na', 'none', 'not set']);

export function normalizeVehicleColorDisplay(value: unknown): string {
    const color = String(value ?? '').trim().replace(/\s+/g, ' ');
    return ABSENT_VEHICLE_COLORS.has(color.toLowerCase()) ? 'Not specified' : color;
}

function mapVehicleId<T extends { _id?: string; id?: string }>(data: T | null | undefined) {
  if (!data) return data;
  return {
    ...data,
    id: data._id || data.id,
  };
}

export const VehicleService = {
    async getVehicles(forUserId?: string) {
        const params = forUserId ? { params: { forUserId } } : {};
        const response = await api.get('/customers/vehicles', params);
        // Map _id to id consistently
        if (response.data.success && Array.isArray(response.data.data)) {
            response.data.data = response.data.data.map((v: any) => ({
                ...v,
                id: v._id || v.id
            }));
        }
        return response.data;
    },

    /** Staff: list vehicles for a customer user id */
    async getVehiclesForUser(customerUserId: string) {
        return this.getVehicles(customerUserId);
    },

    async addVehicle(vehicleData: Record<string, unknown>) {
        const response = await api.post('/customers/vehicles', vehicleData);
        if (response.data.success && response.data.data) {
            response.data.data = mapVehicleId(response.data.data);
        }
        return response.data;
    },

    /** Staff: add vehicle to a customer's garage */
    async addVehicleForUser(customerUserId: string, vehicleData: Record<string, unknown>) {
        return this.addVehicle({ ...vehicleData, customerUserId });
    },

    async updateVehicle(id: string, vehicleData: any) {
        const response = await api.put(`/customers/vehicles/${id}`, vehicleData);
        if (response.data.success && response.data.data) {
            response.data.data = mapVehicleId(response.data.data);
        }
        return response.data;
    },

    async deleteVehicle(id: string) {
        const response = await api.delete(`/customers/vehicles/${id}`);
        return response.data;
    }
};

/** Map persisted vehicle → POS cart vehicle shape */
export function mapApiVehicleToPosVehicle(v: any): Vehicle {
    const rawY = v.year;
    const yearNum =
        typeof rawY === 'number' && !Number.isNaN(rawY)
            ? rawY
            : parseInt(String(rawY ?? '').trim(), 10);
    return {
        id: String(v._id || v.id),
        plate: v.plateNumber || '',
        make: v.make || '',
        model: v.model || '',
        year: Number.isFinite(yearNum) ? yearNum : 0,
        color: normalizeVehicleColorDisplay(v.color),
        type: v.vehicleType || '',
        pricingCategory: v.pricingCategory ?? null,
    };
}

export function mapApiVehicleToGarageForm(v: any): VehicleGarageFormValues {
    const displayColor = normalizeVehicleColorDisplay(v.color);
    return {
        vehicleId: v._id || v.id,
        plate: v.plateNumber ?? '',
        year: v.year != null && v.year !== '' ? String(v.year) : '',
        brand: v.make ?? '',
        model: v.model ?? '',
        color: displayColor === 'Not specified' ? '' : displayColor,
        type: v.vehicleType ?? '',
        pricingCategory: v.pricingCategory ?? null,
        transmission: v.transmission ?? '',
        fuelType: v.fuelType ?? '',
        generation: v.generation ?? '',
        facelift: v.facelift ?? '',
        drivetrain: v.drivetrain ?? '',
    };
}

export function garageFormToApiPayload(form: VehicleGarageFormValues, plateNorm: string) {
    return {
        plateNumber: plateNorm,
        year: form.year || '',
        make: form.brand.trim(),
        model: form.model.trim(),
        color: form.color.trim(),
        vehicleType: form.type.trim(),
        pricingCategory: form.classificationStatus ? (form.classificationStatus === 'classified' ? form.pricingCategory : null) : (getVehiclePricingCategory(form.type.trim()) || form.pricingCategory),
        transmission: form.transmission || '',
        fuelType: form.fuelType || '',
        generation: form.generation || '',
        facelift: form.facelift || '',
        drivetrain: form.drivetrain || '',
    };
}
