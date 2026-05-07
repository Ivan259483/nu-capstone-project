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
  duration?: string;
  basePrice?: number;
  prices: ServicePrices;
  memberPrice?: number | null;
  status: 'Active' | 'Inactive';
  isPublished: boolean;
}

/** Returns the effective price for a service given the selected vehicle type */
export function getEffectivePrice(svc: BackendService, vehicleType: VehicleType): number {
  const typePrice = svc.prices?.[vehicleType];
  if (typePrice != null && typePrice > 0) return typePrice;
  return svc.basePrice ?? 0;
}

export function useServices() {
  const [services, setServices] = useState<BackendService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        setIsLoading(true);
        const { data } = await api.get('/services');
        if (data.success && Array.isArray(data.data)) {
          // Only show Active services in POS
          setServices(data.data.filter((s: BackendService) => s.status === 'Active'));
        }
      } catch (err: any) {
        console.error('[useServices] Failed to fetch services:', err);
        setError(err?.response?.data?.message || 'Failed to load services');
      } finally {
        setIsLoading(false);
      }
    };
    fetchServices();
  }, []);

  return { services, isLoading, error };
}
