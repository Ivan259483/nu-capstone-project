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
  description?: string;
  duration?: string;
  price: number;
  tag: string;
  icon: string;
  basePrice?: number | null;
  displayOrder?: number | null;
  packageCode?: 'SPF80' | 'SPF89' | 'SPF99' | 'SPF101';
  tier?: 'Essential' | 'Advanced' | 'Premium' | 'Flagship';
  protectionYears?: number | null;
  durationNeedsClientVerification?: boolean;
  catalogVersion?: string;
  available?: boolean;
  promoPrice?: number | null;
  srp?: number | null;
  savings?: number | null;
  tintBundlePrice?: number | null;
  vehiclePricingCategory?: VehiclePricingCategory;
  prices?: Partial<Record<'hatchback' | 'sedan' | 'midsized' | 'suv' | 'pickup' | 'largesuv' | 'largeSuv' | 'highend', number | null>>;
  pricing?: Partial<Record<'hatchback' | 'sedan' | 'midsized' | 'suv' | 'pickup' | 'largeSuv' | 'highend', {
    base?: number | null;
    original?: number | null;
    addon?: number | null;
  }>>;
  catalogCard?: {
    badge?: string;
    warrantyLabel?: string;
    tagline?: string;
    tierLabel?: string;
    features?: string[];
    fullInclusions?: {
      group: string;
      title: string;
      detail?: string | null;
      savingsLabel?: string | null;
    }[];
    highlighted?: string[];
    ppfCoverage?: string[];
    tintIncluded?: boolean;
    tintDetails?: string;
    undercoatingIncluded?: boolean;
    undercoatingDetails?: string;
    undercoatingSavingsLabel?: string;
    addonLabel?: string;
    discountBadge?: string;
    iconKey?: 'sparkles' | 'shield' | 'star' | 'crown' | 'zap';
    accentFrom?: string;
    accentTo?: string;
    accentMid?: string;
    popular?: boolean;
    flagship?: boolean;
  } | null;
}

export interface ServicePricingCategory {
  code: VehiclePricingCategory;
  apiKey: 'hatchback' | 'sedan' | 'midsized' | 'suv' | 'pickup' | 'largeSuv' | 'highend';
  legacyKey: 'hatchback' | 'sedan' | 'midsized' | 'suv' | 'pickup' | 'largesuv' | 'highend';
  label: string;
}

export interface ServiceCatalog {
  catalogVersion: string;
  pricingCategories: ServicePricingCategory[];
  packages: ServiceOption[];
}

export interface Vehicle {
  generation?: string;
  facelift?: string;
  drivetrain?: string;
  id: string;
  _id?: string;
  year: number | string;
  make: string;
  model: string;
  color?: string;
  standardColor?: 'Black' | 'White' | 'Gray' | 'Silver' | 'Red' | 'Blue' | 'Green' | 'Yellow' | 'Orange' | 'Brown' | 'Gold' | 'Purple' | 'Pink' | 'Beige' | 'Bronze' | 'Two-Tone' | 'Custom';
  factoryColorName?: string;
  paintCode?: string;
  finishType?: string;
  colorHex?: string;
  colorRgb?: { r: number; g: number; b: number };
  colorSource?: 'oem_database' | 'user_selected' | 'not_specified' | 'legacy';
  plateNumber: string;
  vehicleType?: string;
  pricingCategory?: VehiclePricingCategory | null;
  pricingCategorySource?: 'vehicle_database' | 'customer_selected' | 'admin_assigned' | 'legacy_migration' | null;
  pricingCategoryNeedsReview?: boolean;
  transmission?: string;
  fuelType?: string;
  customer?: string;
}

export type VehiclePricingCategory =
  | 'HATCHBACK_SMALL_CAR'
  | 'SEDAN'
  | 'MIDSIZED'
  | 'SUV'
  | 'PICKUP'
  | 'LARGE_SUV_VAN'
  | 'HIGH_END_SEDAN';

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
  serviceTotal?: number;
  amountCollected?: number;
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
  trackerStageMedia?: {
    stage?: string;
    slot?: string;
    photoUrl?: string;
    description?: string;
    uploadedAt?: string;
    uploadedBy?: string;
  }[];
  serviceTrackingStage?: string | null;
  serviceTrackingUpdatedAt?: string;
  customerStatus?: string;
  customerStatusUpdatedAt?: string;
  paymentProofUrl?: string;
  downpaymentProof?: string;
  hasPaymentProof?: boolean;
  paymentStatus?: string;
  paymentMethod?: string | null;
  reservationPayment?: CustomerPaymentTransaction | null;
  balancePayment?: CustomerPaymentTransaction | null;
  orderNumber?: string | number;
  bookingReference?: string;
  invoiceId?: string;
  approvedAt?: string;
  rejectedAt?: string;
  qcCompletedAt?: string;
  paidAt?: string;
  estimatedCompletion?: string;
  updatedAt?: string;
  vehicleInfo?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  vehicleYear?: string;
  vehicleMake?: string;
  serviceStaffAssignments?: { slot?: string; name?: string; role?: string }[];
  assignedDetailer?: { name?: string; role?: string };
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

export interface CustomerPaymentTransaction {
  _id?: string;
  invoiceId?: string;
  amount?: number | null;
  amountSubmitted?: number | null;
  amountVerified?: number | null;
  status?: string | null;
  transactionType?: string | null;
  method?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewReason?: string | null;
  createdAt?: string | null;
}

export interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  type?: string;
  event?: string;
  category?: string;
  priority?: 'low' | 'normal' | 'high';
  isRead: boolean;
  createdAt?: string;
  updatedAt?: string;
  link?: string;
  action?: { label?: string; link?: string };
  actionType?: string;
  actionId?: string;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface NotificationPage {
  notifications: NotificationRecord[];
  unreadCount: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  facets: {
    categories: Record<string, number>;
    unreadCategories: Record<string, number>;
  };
}
