// ── Shared types for Sales Smart Calendar ────────────────────────────────────

export interface CalendarBooking {
  _id: string;
  id?: string;
  orderId?: string;
  bookingId?: string;
  orderNumber?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customer?: string | {
    _id?: string;
    id?: string;
    name?: string;
    email?: string;
    phone?: string;
  };
  vehiclePlate?: string;
  vehicleInfo?: string;
  vehicleType?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  vehicleColor?: string;
  serviceName?: string;
  serviceType?: string;
  serviceId?: string;
  bookingDate?: string;
  bookingTime?: string;
  date?: string;
  time?: string;
  status: string;
  totalPrice?: number;
  totalAmount?: number;
  paymentProofUrl?: string;
  hasPaymentProof?: boolean;
  bookingReference?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  notes?: string;
  assignedDetailer?: string | {
    _id?: string;
    id?: string;
    name?: string;
    email?: string;
  } | null;
  serviceStaffAssignments?: Array<{
    slot?: string;
    name?: string;
    role?: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
}

export type DayStatus = 'available' | 'almost_full' | 'full' | 'closed';
