import { useState, useEffect } from 'react';
import api from '@/lib/api';

export type VehicleType = 'hatchback' | 'sedan' | 'midsized' | 'suv' | 'pickup' | 'largesuv' | 'highend';

export interface ServicePrices {
  hatchback: number | null;
  sedan: number | null;
  midsized: number | null;
  suv: number | null;
  pickup: number | null;
  largesuv: number | null;
  highend: number | null;
}

export interface BackendService {
  _id: string;
  name: string;
  category: string;
  billingGroup?: 'ceramic_spf' | 'ppf' | 'other' | 'uncategorized';
  packageCode?: 'SPF80' | 'SPF89' | 'SPF99' | 'SPF101';
  duration?: string;
  basePrice?: number;
  prices: ServicePrices;
  pricing?: Partial<Record<'hatchback' | 'sedan' | 'midsized' | 'suv' | 'pickup' | 'largeSuv' | 'highend', {
    base?: number | null;
    original?: number | null;
    addon?: number | null;
  }>>;
  catalogCard?: {
    badge?: string;
    tierLabel?: string;
    tagline?: string;
    addonLabel?: string;
    features?: string[];
    popular?: boolean;
    flagship?: boolean;
  } | null;
  memberPrice?: number | null;
  status: 'Active' | 'Inactive';
  isPublished: boolean;
}

export interface ServicePricingCategory {
  code: string;
  apiKey: string;
  legacyKey: string;
  label: string;
}

/** Returns the effective price for a service given the selected vehicle type */
export function getEffectivePrice(svc: BackendService, vehicleType: VehicleType): number | null {
  const pricingKey = vehicleType === 'largesuv' ? 'largeSuv' : vehicleType;
  const hasLegacyVehiclePrice = !!svc.prices && Object.prototype.hasOwnProperty.call(svc.prices, vehicleType);
  const pricingBase = svc.pricing?.[pricingKey]?.base;
  const typePrice = pricingBase ?? (hasLegacyVehiclePrice ? svc.prices?.[vehicleType] : undefined);
  if (typePrice != null && typePrice > 0) return typePrice;
  if (svc.billingGroup === 'ceramic_spf' || svc.packageCode) return null;
  return svc.basePrice != null && svc.basePrice > 0 ? svc.basePrice : null;
}

export function useServices() {
  const [services, setServices] = useState<BackendService[]>([]);
  const [pricingCategories, setPricingCategories] = useState<ServicePricingCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        setIsLoading(true);
        const [{ data }, catalogResponse] = await Promise.all([
          api.get('/services'),
          api.get('/services/catalog', { meta: { suppressErrorToast: true } } as any).catch(() => null),
        ]);
        if (data.success && Array.isArray(data.data)) {
          // Only show Active services in POS
          setServices(data.data.filter((s: BackendService) => s.status === 'Active'));
        }
        const categories = catalogResponse?.data?.data?.pricingCategories;
        if (Array.isArray(categories)) setPricingCategories(categories);
      } catch (err: any) {
        console.error('[useServices] Failed to fetch services:', err);
        setError(err?.response?.data?.message || 'Failed to load services');
      } finally {
        setIsLoading(false);
      }
    };
    fetchServices();
  }, []);

  return { services, pricingCategories, isLoading, error };
}
