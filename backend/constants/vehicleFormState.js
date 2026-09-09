// Shared web/Expo state transitions. Classification values always come from the API.
const identityFields = ['vehicleId', 'brand', 'model', 'year', 'fuelType', 'generation', 'facelift', 'drivetrain'];
export const classificationIdentity = (v) => JSON.stringify(identityFields.map(key => v[key] || ''));
export function patchVehicleForm(previous, patch) {
  const next = { ...previous, ...patch };
  if ('brand' in patch && patch.brand !== previous.brand) next.model = '';
  if (['brand', 'model'].some(key => key in patch && patch[key] !== previous[key])) {
    next.generation = ''; next.facelift = ''; next.drivetrain = '';
  }
  if (classificationIdentity(previous) !== classificationIdentity(next)) {
    next.type = ''; next.pricingCategory = null;
    next.bodyType = ''; next.vehicleClass = ''; next.segment = ''; next.recommendedServiceCategory = '';
    next.classificationOptions = []; next.validClassifications = []; next.validPricingCategories = [];
    next.classificationVerified = false; next.requiresClassificationSelection = false; next.classificationRequiresReview = false;
    next.classificationStatus = next.brand && next.model ? 'loading' : undefined;
  }
  return next;
}
export function requestVehicleClassification(values, onChange, fetchClassification, onResult = () => {}) {
  const abort = new AbortController();
  const identity = classificationIdentity(values);
  const update = (patch) => {
    if (!abort.signal.aborted) onChange(previous => classificationIdentity(previous) === identity ? { ...previous, ...patch } : previous);
  };
  if (!values.brand || !values.model) {
    update({ type: '', pricingCategory: null, bodyType: '', vehicleClass: '', segment: '', recommendedServiceCategory: '',
      classificationOptions: [], validClassifications: [], validPricingCategories: [], classificationVerified: false,
      requiresClassificationSelection: false, classificationRequiresReview: false, classificationStatus: undefined });
    return { abort: () => abort.abort(), done: Promise.resolve() };
  }
  update({ type: '', pricingCategory: null, bodyType: '', vehicleClass: '', segment: '', recommendedServiceCategory: '',
    classificationOptions: [], validClassifications: [], validPricingCategories: [], classificationVerified: false,
    requiresClassificationSelection: false, classificationRequiresReview: false, classificationStatus: 'loading' });
  const done = Promise.resolve().then(() => fetchClassification(values, abort.signal)).then(result => {
    if (abort.signal.aborted) return;
    if (!result || !['classified', 'review_required'].includes(result.status)) throw new Error('Classification unavailable');
    onResult(result);
    const options = Array.isArray(result.classificationOptions) && result.classificationOptions.length
      ? result.classificationOptions
      : result.pricingCategory && result.vehicleType ? [{ code: result.pricingCategory, label: result.vehicleType }] : [];
    update({ classificationStatus: result.status, type: result.status === 'classified' ? (result.classification || result.vehicleType || '') : '',
      pricingCategory: result.pricingCategory || null, bodyType: result.bodyType || '', vehicleClass: result.vehicleClass || '',
      segment: result.segment || '', recommendedServiceCategory: result.recommendedServiceCategory || '',
      classificationOptions: options, validClassifications: result.validClassifications || options.map(option => option.label),
      validPricingCategories: result.validPricingCategories || options.map(option => option.code),
      classificationVerified: Boolean(result.verified), requiresClassificationSelection: Boolean(result.requiresSelection),
      classificationRequiresReview: Boolean(result.requiresReview) });
  }).catch(() => update({ classificationStatus: 'unavailable', type: '', pricingCategory: null,
    bodyType: '', vehicleClass: '', segment: '', recommendedServiceCategory: '', classificationOptions: [],
    validClassifications: [], validPricingCategories: [], classificationVerified: false,
    requiresClassificationSelection: false, classificationRequiresReview: true }));
  return { abort: () => abort.abort(), done };
}
