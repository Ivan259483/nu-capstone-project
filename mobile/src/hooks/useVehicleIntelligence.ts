import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { apiClient } from '@/services/api/client';
import type { VehicleGarageFormValues } from '@/lib/vehicleGarageForm';
import { classificationIdentity, requestVehicleClassification } from '@/lib/vehicleFormState';

export function useVehicleIntelligence(values: VehicleGarageFormValues, enabled: boolean,
  onChange: Dispatch<SetStateAction<VehicleGarageFormValues>>) {
  const [generations, setGenerations] = useState<string[]>([]);
  const identity = classificationIdentity(values);
  useEffect(() => {
    setGenerations([]);
    if (!enabled) return;
    const request = requestVehicleClassification(values, onChange, async (v, signal) => {
      const { data } = await apiClient.get('/vehicle-intelligence/classify', { signal,
        params: { brand: v.brand, model: v.model, year: v.year, fuelType: v.fuelType,
          generation: v.generation, facelift: v.facelift, drivetrain: v.drivetrain, vehicleId: v.vehicleId } });
      if (!data.success) throw new Error('Classification unavailable');
      return data.data;
    }, (result) => setGenerations(result.generations || []));
    return request.abort;
  }, [enabled, identity, onChange]);
  return { generations };
}
