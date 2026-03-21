import api from './api';

export const VehicleService = {
    async getVehicles() {
        const response = await api.get('/customers/vehicles');
        // Map _id to id consistently
        if (response.data.success && Array.isArray(response.data.data)) {
            response.data.data = response.data.data.map((v: any) => ({
                ...v,
                id: v._id || v.id
            }));
        }
        return response.data;
    },

    async addVehicle(vehicleData: any) {
        const response = await api.post('/customers/vehicles', vehicleData);
        // Map the returned vehicle's _id to id
        if (response.data.success && response.data.data) {
            response.data.data = {
                ...response.data.data,
                id: response.data.data._id || response.data.data.id
            };
        }
        return response.data;
    },

    async updateVehicle(id: string, vehicleData: any) {
        const response = await api.put(`/customers/vehicles/${id}`, vehicleData);
        // Map the returned vehicle's _id to id
        if (response.data.success && response.data.data) {
            response.data.data = {
                ...response.data.data,
                id: response.data.data._id || response.data.data.id
            };
        }
        return response.data;
    },

    async deleteVehicle(id: string) {
        const response = await api.delete(`/customers/vehicles/${id}`);
        return response.data;
    }
};
