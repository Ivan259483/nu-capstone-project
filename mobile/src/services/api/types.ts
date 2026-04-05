import type { UserRole } from '@/services/api/roles';

export type { UserRole } from '@/services/api/roles';

export interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface BackendUser {
  id: string;
  _id?: string;
  firebaseUid?: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  createdAt?: string;
  updatedAt?: string;
  isActive?: boolean;
}

export interface MobileProfile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  avatar_url?: string | null;
  backend_id?: string;
  firebase_uid?: string;
}

export interface ServiceOption {
  id: string;
  name: string;
  description: string;
  duration: string;
  price: number;
  tag: string;
  icon: string;
}

export interface Vehicle {
  id: string;
  _id?: string;
  year: number | string;
  make: string;
  model: string;
  color?: string;
  plateNumber: string;
  customer?: string;
}

export interface BookingRecord {
  id: string;
  _id?: string;
  status: string;
  serviceName: string;
  serviceType?: string;
  customerName?: string;
  customerPhone?: string;
  bookingDate?: string;
  bookingTime?: string;
  date?: string;
  time?: string;
  totalAmount?: number;
  totalPrice?: number;
  notes?: string;
  vehiclePlate?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  type?: string;
  isRead: boolean;
  createdAt?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}
