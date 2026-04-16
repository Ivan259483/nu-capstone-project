import { apiClient, cachedGet, TTL } from '@/services/api/client';
import type { ApiEnvelope, ServiceOption } from '@/services/api/types';

const CATEGORY_ICON_MAP: Record<string, string> = {
  Exterior: 'car-sport-outline',
  Interior: 'sparkles-outline',
  Complete: 'layers-outline',
  Engine: 'construct-outline',
  Premium: 'diamond-outline',
};

const SPF_ICON_MAP: Record<string, string> = {
  'SPF 80': 'sparkles-outline',
  'SPF 89': 'shield-checkmark-outline',
  'SPF 99': 'shield-outline',
  'SPF 101': 'diamond-outline',
};

const toServiceOption = (raw: any): ServiceOption => {
  const id = raw?._id || raw?.id || '';
  const category = raw?.category || 'Service';
  const price = Number(raw?.basePrice ?? raw?.price ?? 0);
  const name = raw?.name || 'Service';

  // Determine icon: try SPF-specific icons first, then category-based
  const spfKey = Object.keys(SPF_ICON_MAP).find(k => name.includes(k));
  const icon = spfKey
    ? SPF_ICON_MAP[spfKey]
    : CATEGORY_ICON_MAP[category] || 'pricetag-outline';

  return {
    id,
    name,
    description: raw?.description || `${name} — ${category} service`,
    duration: raw?.duration || 'TBD',
    price: Number.isFinite(price) ? price : 0,
    tag: category,
    icon,
  };
};

export const serviceService = {
  async getPublishedServices(): Promise<ServiceOption[]> {
    const data = await cachedGet<ApiEnvelope<any[]>>('/services/published', undefined, TTL.MEDIUM);
    const items = Array.isArray(data.data) ? data.data : [];
    return items.map(toServiceOption);
  },
};
