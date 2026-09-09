export interface ClassificationFormState {
  brand: string; model: string; type: string; vehicleId?: string; year?: string; fuelType?: string;
  generation?: string; facelift?: string; drivetrain?: string; pricingCategory?: string | null;
  bodyType?: string; vehicleClass?: string; segment?: string; recommendedServiceCategory?: string;
  classificationStatus?: 'loading' | 'classified' | 'review_required' | 'unavailable';
  classificationOptions?: Array<{ code: string; label: string }>;
  validClassifications?: string[]; validPricingCategories?: string[];
  classificationVerified?: boolean; requiresClassificationSelection?: boolean; classificationRequiresReview?: boolean;
}
export interface ClassificationResult {
  status: 'classified' | 'review_required'; vehicleType: string; pricingCategory: string | null; generations?: string[];
  bodyType?: string; vehicleClass?: string; segment?: string; recommendedServiceCategory?: string;
  classification?: string | null; classificationOptions?: Array<{ code: string; label: string }>;
  validClassifications?: string[]; validPricingCategories?: string[];
  verified?: boolean; requiresSelection?: boolean; requiresReview?: boolean;
}
export function classificationIdentity(values: ClassificationFormState): string;
export function patchVehicleForm<T extends ClassificationFormState>(previous: T, patch: Partial<T>): T;
export function requestVehicleClassification<T extends ClassificationFormState>(values: T,
  onChange: (updater: (previous: T) => T) => void,
  fetchClassification: (values: T, signal: AbortSignal) => Promise<ClassificationResult>,
  onResult?: (result: ClassificationResult) => void): { abort: () => void; done: Promise<void> };
