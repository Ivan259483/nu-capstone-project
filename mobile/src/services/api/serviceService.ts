import { apiClient } from '@/services/api/client';
import type { ApiEnvelope, ServiceOption } from '@/services/api/types';

const CATEGORY_ICON_MAP: Record<string, string> = {
  Exterior: 'car-sport-outline',
  Interior: 'sparkles-outline',
  Complete: 'layers-outline',
  Engine: 'construct-outline',
  Premium: 'diamond-outline',
};

const toServiceOption = (raw: any): ServiceOption => {
  const id = raw?._id || raw?.id || '';
  const category = raw?.category || 'Service';
  const price = Number(raw?.basePrice ?? raw?.price ?? 0);

  return {
    id,
    name: raw?.name || 'Service',
    description: raw?.description || `${category} detailing service`,
    duration: raw?.duration || 'TBD',
    price: Number.isFinite(price) ? price : 0,
    tag: category,
    icon: CATEGORY_ICON_MAP[category] || 'pricetag-outline',
  };
};

export const serviceService = {
  async getPublishedServices(): Promise<ServiceOption[]> {
    const response = await apiClient.get<ApiEnvelope<any[]>>('/services/published');
    const items = Array.isArray(response.data.data) ? response.data.data : [];
    return items.map(toServiceOption);
  },
};
