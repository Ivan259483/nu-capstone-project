import type { ServiceOption } from '@/services/api/types';

const positivePrice = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
};

/** Display policy only: never change the stored SRP or the payable amount. */
export function getDisplaySavings(currentValue: unknown, originalValue: unknown): number | null {
  const current = positivePrice(currentValue);
  const original = positivePrice(originalValue);
  if (current === null || original === null) return null;
  const savings = original - current;
  return savings > 0 && savings <= current && savings < original ? savings : null;
}

/** Select original and current together, including the starting-price category. */
export function getPublishedServicePricePair(service: ServiceOption, priceKey: string | null) {
  const pricing = service.pricing as Record<string, { base?: unknown; original?: unknown }> | undefined;
  const legacy = service.prices as Record<string, unknown> | undefined;
  const keys = priceKey ? [priceKey] : Object.keys(pricing || {});
  const pairs = keys.map((key) => {
    const current = positivePrice(pricing?.[key]?.base ?? legacy?.[key === 'largeSuv' ? 'largesuv' : key]);
    const original = positivePrice(pricing?.[key]?.original);
    return { key, current, original, savings: getDisplaySavings(current, original) };
  }).filter((pair) => pair.current !== null);
  pairs.sort((a, b) => a.current! - b.current!);
  return pairs[0] ?? null;
}
