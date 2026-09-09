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
  classification?: string | null;
  validClassifications?: string[];
  validPricingCategories?: string[];
  classificationOptions?: Array<{ code: string; label: string }>;
  verified?: boolean;
  requiresSelection?: boolean;
  requiresReview?: boolean;
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
    next.classificationOptions = [];
    next.validClassifications = [];
    next.validPricingCategories = [];
    next.classificationVerified = false;
    next.requiresClassificationSelection = false;
    next.classificationRequiresReview = false;
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
      classificationOptions: [],
      validClassifications: [],
      validPricingCategories: [],
      classificationVerified: false,
      requiresClassificationSelection: false,
      classificationRequiresReview: false,
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
    classificationOptions: [],
    validClassifications: [],
    validPricingCategories: [],
    classificationVerified: false,
    requiresClassificationSelection: false,
    classificationRequiresReview: false,
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
      const options = Array.isArray(result.classificationOptions) && result.classificationOptions.length
        ? result.classificationOptions
        : result.pricingCategory && result.vehicleType
          ? [{ code: result.pricingCategory, label: result.vehicleType }]
          : [];
      update({
        classificationStatus: result.status,
        type: result.status === 'classified' ? result.classification || result.vehicleType || '' : '',
        pricingCategory: result.pricingCategory || null,
        bodyType: result.bodyType || '',
        vehicleClass: result.vehicleClass || '',
        segment: result.segment || '',
        recommendedServiceCategory: result.recommendedServiceCategory || '',
        classificationOptions: options,
        validClassifications: result.validClassifications || options.map((option) => option.label),
        validPricingCategories: result.validPricingCategories || options.map((option) => option.code),
        classificationVerified: Boolean(result.verified),
        requiresClassificationSelection: Boolean(result.requiresSelection),
        classificationRequiresReview: Boolean(result.requiresReview),
      });
    })
    .catch(() => update({
      classificationStatus: 'unavailable',
      type: '',
      pricingCategory: null,
      bodyType: '',
      vehicleClass: '',
      segment: '',
      recommendedServiceCategory: '',
      classificationOptions: [],
      validClassifications: [],
      validPricingCategories: [],
      classificationVerified: false,
      requiresClassificationSelection: false,
      classificationRequiresReview: true,
    }));

  return { abort: () => abortController.abort(), done };
}

export function getVehicleClassificationCorrection(error: unknown): Partial<VehicleGarageFormValues> | null {
  const data = (error as { response?: { data?: any } })?.response?.data;
  const code = data?.details?.expectedPricingCategory;
  const label = data?.details?.expectedClassification;
  if (data?.code !== 'VEHICLE_CLASSIFICATION_MISMATCH' || !code || !label) return null;
  return {
    pricingCategory: code,
    type: label,
    classificationStatus: 'classified',
    classificationVerified: true,
    requiresClassificationSelection: false,
    classificationRequiresReview: false,
    classificationOptions: [{ code, label }],
    validPricingCategories: [code],
    validClassifications: [label],
  };
}
