import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import api from '@/lib/api';
import type { VehicleGarageFormValues } from '@/components/shared/vehicle-garage-constants';

import { classificationIdentity, requestVehicleClassification } from '../../../backend/constants/vehicleFormState.js';

export function useVehicleIntelligence(v: VehicleGarageFormValues, enabled: boolean,
  onChange: Dispatch<SetStateAction<VehicleGarageFormValues>>) {
  const [generations, setGenerations] = useState<string[]>([]);
  const identity = classificationIdentity(v);
  useEffect(() => {
    setGenerations([]);
    if (!enabled) return;
    const request = requestVehicleClassification(v, onChange, async (values, signal) => {
      const { data } = await api.get('/vehicle-intelligence/classify', {
        signal, params: { brand: values.brand, model: values.model, year: values.year, fuelType: values.fuelType,
          generation: values.generation, facelift: values.facelift, drivetrain: values.drivetrain, vehicleId: values.vehicleId },
      });
      if (!data.success) throw new Error('Classification unavailable');
      return data.data;
    }, (result) => setGenerations(result.generations || []));
    return request.abort;
  }, [enabled, identity, onChange]);
  return { generations };
}
