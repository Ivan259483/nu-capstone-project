/**
 * Keep in sync with frontend/src/components/shared/vehicle-garage-constants.ts
 * and frontend/src/lib/plate.ts (normalizePlateNumber).
 */
import { normalizePlateNumber } from '@/lib/plate';

export type VehicleGarageFormValues = {
  plate: string;
  year: string;
  brand: string;
  model: string;
  color: string;
  type: string;
  transmission: string;
  fuelType: string;
};

export const emptyVehicleGarageForm = (): VehicleGarageFormValues => ({
  plate: '',
  year: '',
  brand: '',
  model: '',
  color: '',
  type: '',
  transmission: '',
  fuelType: '',
});

/** Field validation for add/edit garage — same rules as CustomerDashboard */
export function validateVehicleGarageForm(v: VehicleGarageFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  const plateRaw = v.plate.trim();
  const plateNorm = normalizePlateNumber(plateRaw);
  const brand = v.brand.trim();
  const model = v.model.trim();
  const type = v.type.trim();

  if (!plateRaw) errors.plate = 'Plate number is required.';
  else if (plateNorm.length < 4 || plateNorm.length > 9) {
    errors.plate = 'Use 4–9 letters and numbers (spaces are ignored).';
  }
  if (!brand) errors.brand = 'Select a brand.';
  if (!model) {
    errors.model = 'Model is required (e.g. Vios, Civic).';
  } else if (model.length < 2) {
    errors.model = 'Too short — enter the model name.';
  }
  if (!type) errors.type = 'Please select a vehicle type.';

  return errors;
}
