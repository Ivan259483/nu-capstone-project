import { apiClient, cachedGet, TTL } from '@/services/api/client';
import type { ApiEnvelope, BookingRecord, ServiceOption } from '@/services/api/types';
import { isBookingCountedAsActiveOnHome } from '@/utils/customerBookingLifecycle';

const normalizeBooking = (raw: any): BookingRecord => {
  const id = raw?.id || raw?._id || '';
  return {
    ...raw,
    id,
    _id: raw?._id,
    status: raw?.status || 'pending',
    serviceName: raw?.serviceName || raw?.serviceType || raw?.items?.[0]?.product?.name || 'Service',
    serviceType: raw?.serviceType,
    customerName: raw?.customerName,
    bookingDate: raw?.bookingDate,
    bookingTime: raw?.bookingTime,
    date: raw?.date || raw?.bookingDate,
    time: raw?.time || raw?.bookingTime,
    totalAmount: raw?.totalAmount,
    totalPrice: raw?.totalPrice,
    createdAt: raw?.createdAt,
  };
};

const isActiveBookingStatus = (status: string): boolean => {
  return isBookingCountedAsActiveOnHome(status);
};

export const bookingService = {
  async getMyBookings(): Promise<BookingRecord[]> {
    const data = await cachedGet<ApiEnvelope<any[]>>('/bookings', {
      params: {
        limit: 1000,
        skip: 0,
      },
    }, TTL.SHORT);

    const rows = Array.isArray(data.data) ? data.data : [];
    return rows.map(normalizeBooking);
  },

  async getLatestActiveBooking(): Promise<BookingRecord | null> {
    const bookings = await this.getMyBookings();
    const active = bookings
      .filter((booking) => isActiveBookingStatus(booking.status))
      .sort((a, b) => {
        const aTime = new Date(a.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
      });

    return active[0] || null;
  },

  async createBooking(params: {
    service: ServiceOption;
    date: string;
    time: string;
    customerName?: string;
    customerPhone?: string;
    notes?: string;
    vehiclePlate?: string;
    vehicleYear?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleColor?: string;
    downpaymentProof?: string;
  }): Promise<BookingRecord> {
    const bookingDate = params.date.includes(',')
      ? params.date
      : `${params.date}, ${new Date().getFullYear()}`;

    const payload = {
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      serviceType: params.service.name,
      serviceName: params.service.name,
      totalPrice: params.service.price,
      price: params.service.price,
      bookingDate,
      bookingTime: params.time,
      notes: params.notes,
      vehiclePlate: params.vehiclePlate,
      vehicleYear: params.vehicleYear,
      vehicleMake: params.vehicleMake,
      vehicleModel: params.vehicleModel,
      vehicleColor: params.vehicleColor,
      downpaymentProof: params.downpaymentProof,
      items: [],
    };

    const response = await apiClient.post<ApiEnvelope<any>>('/bookings', payload);
    return normalizeBooking(response.data.data);
  },

  /**
   * Fetch a single booking by ID
   */
  async getBookingById(bookingId: string): Promise<BookingRecord> {
    const response = await apiClient.get<ApiEnvelope<any>>(`/bookings/${bookingId}`);
    return normalizeBooking(response.data.data);
  },

  /**
   * Submit digital waiver signature for a booking.
   * Backend: POST /api/orders/:id/waiver
   */
  async signWaiver(bookingId: string, waiverSignature: string): Promise<BookingRecord> {
    const response = await apiClient.post<ApiEnvelope<any>>(
      `/bookings/${bookingId}/waiver`,
      { waiverSignature }
    );
    return normalizeBooking(response.data.data);
  },

  /**
   * Upload pre-service inspection photos and optional damage notes.
   * Backend: POST /api/orders/:id/inspection
   */
  async uploadInspection(
    bookingId: string,
    preServicePhotos: string[],
    damageNotes?: string
  ): Promise<BookingRecord> {
    const response = await apiClient.post<ApiEnvelope<any>>(
      `/bookings/${bookingId}/inspection`,
      { preServicePhotos, damageNotes }
    );
    return normalizeBooking(response.data.data);
  },

  /**
   * Update the Mobile App specific 9-Step Operations Workflow state.
   * Preserves backend sequence logic securely.
   */
  async updateMobileWorkflow(
    bookingId: string,
    payload: {
      workflow?: { currentStep: number; completedSteps: number[]; status: string };
      step?: number;
      stepData?: any;
    }
  ): Promise<BookingRecord> {
    const response = await apiClient.patch<ApiEnvelope<any>>(
      `/bookings/${bookingId}/mobile-workflow`,
      payload
    );
    return normalizeBooking(response.data.data);
  },

  /**
   * Cancel a booking. Only allowed for pending/confirmed bookings.
   * Uses PUT /bookings/:id to update the status field.
   */
  async cancelBooking(bookingId: string, reason?: string): Promise<BookingRecord> {
    const response = await apiClient.put<ApiEnvelope<any>>(
      `/bookings/${bookingId}`,
      { status: 'cancelled', cancellationReason: reason }
    );
    return normalizeBooking(response.data.data);
  },
  /**
   * Upload GCash payment proof (base64 image)
   * Backend: POST /api/orders/:id/payment-proof
   */
  async uploadPaymentProof(bookingId: string, paymentProofUrl: string): Promise<BookingRecord> {
    const response = await apiClient.post<ApiEnvelope<any>>(
      `/orders/${bookingId}/payment-proof`,
      { paymentProofUrl }
    );
    return normalizeBooking(response.data.data);
  },

  /**
   * Operational endpoints mapped directly to the Backend
   */
  async operateCheckIn(bookingId: string, payload: { downPaymentAmount: number; releaseSignature: string }): Promise<BookingRecord> {
    const response = await apiClient.post<ApiEnvelope<any>>(`/orders/${bookingId}/checkin`, payload);
    return normalizeBooking(response.data.data);
  },

  async operateStartService(bookingId: string): Promise<BookingRecord> {
    const response = await apiClient.post<ApiEnvelope<any>>(`/orders/${bookingId}/start`);
    return normalizeBooking(response.data.data);
  },

  async operateQCComplete(bookingId: string): Promise<BookingRecord> {
    const response = await apiClient.post<ApiEnvelope<any>>(`/orders/${bookingId}/qc`);
    return normalizeBooking(response.data.data);
  },

  async operateFinalPayment(bookingId: string, payload: { finalPaymentAmount: number; paymentMethod: string }): Promise<BookingRecord> {
    const response = await apiClient.post<ApiEnvelope<any>>(`/orders/${bookingId}/pay`, payload);
    return normalizeBooking(response.data.data);
  },

  async operateRelease(bookingId: string, payload: { releaseSignature: string }): Promise<BookingRecord> {
    const response = await apiClient.post<ApiEnvelope<any>>(`/orders/${bookingId}/release`, payload);
    return normalizeBooking(response.data.data);
  },
};
