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
  phone?: string;
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
  phone?: string;
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
  vehicleType?: string;
  transmission?: string;
  fuelType?: string;
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
  downPaymentAmount?: number;
  finalPaymentAmount?: number;
  legalCompliance?: {
    waiverSignature?: string;
    waiverSignedAt?: string;
    waiverPdf?: string;
    preServicePhotos?: string[];
    damageNotes?: string;
    releaseSignature?: string;
    releaseSignedAt?: string;
  };
  notes?: string;
  trackerStageMedia?: Array<{
    stage?: string;
    slot?: string;
    photoUrl?: string;
    description?: string;
    uploadedAt?: string;
    uploadedBy?: string;
  }>;
  serviceTrackingStage?: string | null;
  serviceTrackingUpdatedAt?: string;
  customerStatus?: string;
  customerStatusUpdatedAt?: string;
  paymentProofUrl?: string;
  paymentStatus?: string;
  orderNumber?: string | number;
  approvedAt?: string;
  qcCompletedAt?: string;
  paidAt?: string;
  estimatedCompletion?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  vehicleYear?: string;
  vehicleMake?: string;
  serviceStaffAssignments?: Array<{ name?: string }>;
  assignedDetailer?: { name?: string };
  rejectionReason?: string;
  vehiclePlate?: string;
  createdAt?: string;
  workflow?: {
    currentStep: number;
    completedSteps: number[];
    status: string;
  };
  jobOrder?: any;
  ingressChecklist?: any;
  customerWaiver?: any;
  damageAnnotations?: any[];
  damagePhotos?: string[];
  serviceProper?: any;
  qcChecklist?: any[];
  egressData?: any;
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
