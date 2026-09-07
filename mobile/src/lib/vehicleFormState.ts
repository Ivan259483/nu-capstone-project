import type { Dispatch, SetStateAction } from 'react';
import type { VehicleGarageFormValues } from '@/lib/vehicleGarageForm';

const IDENTITY_FIELDS = [
  'vehicleId',
  'brand',
  'model',
  'year',
  'fuelType',
  'generation',
  'facelift',
  'drivetrain',
] as const satisfies readonly (keyof VehicleGarageFormValues)[];

export type VehicleClassificationResult = {
  status: 'classified' | 'review_required';
  pricingCategory?: string | null;
  vehicleType?: string | null;
  bodyType?: string | null;
  vehicleClass?: string | null;
  segment?: string | null;
  recommendedServiceCategory?: string | null;
  generations?: string[];
};

export const classificationIdentity = (value: VehicleGarageFormValues): string =>
  JSON.stringify(IDENTITY_FIELDS.map((key) => value[key] || ''));

export function patchVehicleForm(
  previous: VehicleGarageFormValues,
  patch: Partial<VehicleGarageFormValues>,
): VehicleGarageFormValues {
  const next = { ...previous, ...patch };

  if ('brand' in patch && patch.brand !== previous.brand) next.model = '';
  if (['brand', 'model'].some((key) => key in patch && patch[key as 'brand' | 'model'] !== previous[key as 'brand' | 'model'])) {
    next.generation = '';
    next.facelift = '';
    next.drivetrain = '';
  }

  if (classificationIdentity(previous) !== classificationIdentity(next)) {
    next.type = '';
    next.pricingCategory = null;
    next.bodyType = '';
    next.vehicleClass = '';
    next.segment = '';
    next.recommendedServiceCategory = '';
    next.classificationStatus = next.brand && next.model ? 'loading' : undefined;
  }

  return next;
}

export function requestVehicleClassification(
  values: VehicleGarageFormValues,
  onChange: Dispatch<SetStateAction<VehicleGarageFormValues>>,
  fetchClassification: (
    values: VehicleGarageFormValues,
    signal: AbortSignal,
  ) => Promise<VehicleClassificationResult>,
  onResult: (result: VehicleClassificationResult) => void = () => {},
) {
  const abortController = new AbortController();
  const identity = classificationIdentity(values);
  const update = (patch: Partial<VehicleGarageFormValues>) => {
    if (!abortController.signal.aborted) {
      onChange((previous) => classificationIdentity(previous) === identity
        ? { ...previous, ...patch }
        : previous);
    }
  };

  if (!values.brand || !values.model) {
    update({
      type: '',
      pricingCategory: null,
      bodyType: '',
      vehicleClass: '',
      segment: '',
      recommendedServiceCategory: '',
      classificationStatus: undefined,
    });
    return { abort: () => abortController.abort(), done: Promise.resolve() };
  }

  update({
    type: '',
    pricingCategory: null,
    bodyType: '',
    vehicleClass: '',
    segment: '',
    recommendedServiceCategory: '',
    classificationStatus: 'loading',
  });

  const done = Promise.resolve()
    .then(() => fetchClassification(values, abortController.signal))
    .then((result) => {
      if (abortController.signal.aborted) return;
      if (!result || !['classified', 'review_required'].includes(result.status)) {
        throw new Error('Classification unavailable');
      }
      onResult(result);
      update({
        classificationStatus: result.status,
        type: result.status === 'classified' ? result.vehicleType || '' : 'Other',
        pricingCategory: result.pricingCategory || null,
        bodyType: result.bodyType || '',
        vehicleClass: result.vehicleClass || '',
        segment: result.segment || '',
        recommendedServiceCategory: result.recommendedServiceCategory || '',
      });
    })
    .catch(() => update({
      classificationStatus: 'unavailable',
      type: 'Other',
      pricingCategory: null,
      bodyType: '',
      vehicleClass: '',
      segment: '',
      recommendedServiceCategory: '',
    }));

  return { abort: () => abortController.abort(), done };
}
