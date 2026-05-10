import api from './api';
import type { VehicleGarageFormValues } from '@/components/shared/vehicle-garage-constants';
import type { Vehicle } from '@/lib/salesData';

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
        color: v.color || '',
        type: v.vehicleType || 'sedan',
    };
}

export function mapApiVehicleToGarageForm(v: any): VehicleGarageFormValues {
    return {
        plate: v.plateNumber ?? '',
        year: v.year != null && v.year !== '' ? String(v.year) : '',
        brand: v.make ?? '',
        model: v.model ?? '',
        color: v.color ?? '',
        type: v.vehicleType ?? '',
        transmission: v.transmission ?? '',
        fuelType: v.fuelType ?? '',
    };
}

export function garageFormToApiPayload(form: VehicleGarageFormValues, plateNorm: string) {
    return {
        plateNumber: plateNorm,
        year: form.year || '',
        make: form.brand.trim(),
        model: form.model.trim(),
        color: form.color.trim() || 'Unknown',
        vehicleType: form.type.trim(),
        transmission: form.transmission || '',
        fuelType: form.fuelType || '',
    };
}
