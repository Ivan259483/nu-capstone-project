import api from './api';
import { cachedGet, TTL, invalidate } from './queryCache';
import type { Booking } from '@/types';
import { db } from '@/config/firebase';
import { collection, query, where, onSnapshot, orderBy, doc, setDoc } from 'firebase/firestore';

const normalizeBooking = (raw: any): Booking => {
    const id = raw?.id || raw?._id || '';
    const customerId =
        raw?.customerId
        || raw?.customer?._id
        || raw?.customer?._id?.toString?.()
        || raw?.customer
        || '';

    const vehicleInfo =
        raw?.vehicleInfo
        || [raw?.vehicleYear, raw?.vehicleMake, raw?.vehicleModel]
            .filter(Boolean)
            .join(' ')
            .trim()
        || '';

    const date = raw?.date || raw?.bookingDate || '';
    const time = raw?.time || raw?.bookingTime || '';

    const serviceName =
        raw?.serviceName
        || raw?.serviceType
        || raw?.items?.[0]?.product?.name
        || 'Service';

    const customerName =
        raw?.customerName
        || raw?.customer?.name
        || 'Customer';

    const customerPhone =
        raw?.customerPhone
        || raw?.customer?.phone
        || '';

    return {
        // Required booking fields for UI components
        id: id || 'unknown',
        customerId: String(customerId || ''),
        customerName: String(customerName || ''),
        customerPhone: String(customerPhone || ''),
        vehicleId: String(raw?.vehicleId || raw?.vehicle || ''),
        vehicleInfo: String(vehicleInfo || ''),
        serviceId: String(raw?.serviceId || raw?.service || ''),
        serviceName: String(serviceName || ''),
        serviceType: raw?.serviceType,
        date: String(date || ''),
        time: String(time || ''),
        status: raw?.status || 'pending',
        totalPrice: raw?.totalPrice,
        totalAmount: raw?.totalAmount,
        invoiceId: raw?.invoiceId,
        paymentStatus: raw?.paymentStatus,
        paymentMethod: raw?.paymentMethod,
        paymentProvider: raw?.paymentProvider,
        paidAt: raw?.paidAt,
        addons: raw?.addons,
        legalCompliance: raw?.legalCompliance,
        notes: raw?.notes,

        // Preserve backend fields too (used elsewhere)
        _id: raw?._id,
        customer: raw?.customer,
        items: raw?.items,
        vehicleYear: raw?.vehicleYear,
        vehicleMake: raw?.vehicleMake,
        vehicleModel: raw?.vehicleModel,
        vehicleColor: raw?.vehicleColor,
        vehiclePlate: raw?.vehiclePlate,
        bookingDate: raw?.bookingDate,
        bookingTime: raw?.bookingTime,
        createdAt: raw?.createdAt || new Date().toISOString(),
        updatedAt: raw?.updatedAt,
        orderNumber: raw?.orderNumber,
        assignedDetailer: raw?.assignedDetailer,
        customerStatus: raw?.customerStatus,
        customerStatusUpdatedAt: raw?.customerStatusUpdatedAt,
        serviceSteps: raw?.serviceSteps,
        currentStepIndex: raw?.currentStepIndex,
        // Workflow pipeline
        workflowStep: raw?.workflowStep,
        workflowCompletedSteps: raw?.workflowCompletedSteps,
        jobOrder: raw?.jobOrder,
        ingressChecklist: raw?.ingressChecklist,
        damageAnnotations: raw?.damageAnnotations,
        damagePhotos: raw?.damagePhotos,
        damageCompletedAt: raw?.damageCompletedAt,
        customerWaiver: raw?.customerWaiver,
        serviceProper: raw?.serviceProper,
        qcChecklist: raw?.qcChecklist,
        qcCompletedAt: raw?.qcCompletedAt,
        egressData: raw?.egressData,
        operationsChecklist: raw?.operationsChecklist,
        warrantyAndReceipt: raw?.warrantyAndReceipt,
        staffNotes: raw?.staffNotes,
        photos: raw?.photos,
        // GCash payment proof — must be preserved for Sales approval flow
        downpaymentProof: raw?.downpaymentProof,
        paymentProofUrl: raw?.paymentProofUrl,
        rejectionReason: raw?.rejectionReason,
        bookingReference: raw?.bookingReference,
        // ── Live Service Tracking (QC-controlled) ──────────────────
        // These MUST be passed through — the customer tracker reads them.
        serviceTrackingStage: raw?.serviceTrackingStage ?? null,
        serviceTrackingUpdatedAt: raw?.serviceTrackingUpdatedAt ?? null,
        serviceStaffAssignments: raw?.serviceStaffAssignments ?? [],
    } as Booking;
};

/**
 * Service for managing orders and bookings within the AutoSPF platform.
 * Handles communication with the backend /orders endpoints.
 */
export const OrderService = {
    /**
     * Fetches all orders from the system.
     * Maps MongoDB _id to frontend id for consistency.
     * @returns {Promise<{success: boolean, data: Booking[]}>}
     */
    async getAllOrders(options?: { suppressErrorToast?: boolean }) {
        const requestConfig: any = {
            params: {
                limit: 1000,
                skip: 0,
            },
            meta: {
                suppressErrorToast: Boolean(options?.suppressErrorToast),
            },
        };
        const data = await cachedGet('/bookings', requestConfig, TTL.SHORT);
        if (data.success && Array.isArray(data.data)) {
            data.data = data.data.map((o: any) => normalizeBooking(o));
            // 🔍 DEBUG: Verify queue data has vehicle fields (remove after verification)
            console.log('🔍 [QUEUE_DATA] Sample:', data.data.slice(0, 3).map((d: any) => ({
                id: d.id,
                customerName: d.customerName,
                vehicleInfo: d.vehicleInfo,
                vehicleYear: d.vehicleYear,
                vehicleMake: d.vehicleMake,
                vehicleModel: d.vehicleModel,
                serviceName: d.serviceName,
            })));
        }
        return data;
    },

    /**
     * Fetches the detailer staff queue (currently maps to all orders, backend filters by role).
     */
    async getStaffQueue() {
        return this.getAllOrders();
    },

    /**
     * Retrieves a single order by its unique ID.
     * @param {string} id - The order ID.
     * @returns {Promise<{success: boolean, data: Booking}>}
     */
    async getOrderById(id: string) {
        const response = await api.get(`/bookings/${id}`);
        if (response.data.success && response.data.data) {
            response.data.data = normalizeBooking(response.data.data);
        }
        return response.data;
    },

    /**
     * Creates a new service booking order.
     * @param {any} orderData - The booking details (vehicle, service, date, etc).
     * @returns {Promise<{success: boolean, data: Booking}>}
     */
    async createOrder(orderData: any) {
        const response = await api.post('/bookings', orderData);

        if (!response.data.success) {
            throw new Error(response.data.message || 'Failed to create booking');
        }

        if (response.data.data) {
            const booking = normalizeBooking(response.data.data);
            // Sync to Firestore for real-time updates (fire-and-forget to prevent UI blocking)
            this.syncBookingToFirestore(booking).catch(e => {
                console.error("Firestore sync failed (background):", e);
            });
        }
        return response.data;
    },

    /**
     * Syncs a booking object to Firestore to enable real-time updates.
     */
    async syncBookingToFirestore(booking: Booking) {
        if (!db) return;
        try {
            // Ensure Firestore doc has a stable `customerId` field for queries
            const normalized = normalizeBooking(booking);
            await setDoc(doc(db, 'bookings', normalized.id), normalized, { merge: true });
        } catch (e) {
            console.error("Error syncing to Firestore:", e);
        }
    },

    /**
     * Updates an existing order.
     * @param {string} id - The order ID to update.
     * @param {any} orderData - The updated fields.
     */
    async updateOrder(id: string, orderData: any) {
        const response = await api.put(`/bookings/${id}`, orderData);
        if (response.data.success && response.data.data) {
            const booking = { ...response.data.data };
            booking.id = booking._id || booking.id;
            this.syncBookingToFirestore(booking).catch(console.error);
        }
        return response.data;
    },

    /**
     * Removes an order from the database.
     * @param {string} id - The order ID to delete.
     */
    async deleteOrder(id: string) {
        const response = await api.delete(`/bookings/${id}`);
        return response.data;
    },

    /**
     * Assigns a specific detailer to a booking.
     * This method triggers the status update to 'assigned'.
     * @param {string} orderId - The target booking.
     * @param {string} detailerId - The user ID of the detailer staff.
     */
    async assignDetailer(orderId: string, detailerId: string) {
        const response = await api.put(`/bookings/${orderId}/assign`, { detailerId });
        if (response.data.success && response.data.data) {
            const booking = { ...response.data.data };
            booking.id = booking._id || booking.id;
            this.syncBookingToFirestore(booking).catch(console.error);
        }
        return response.data;
    },

    /**
     * Unified admin operation: assign a detailer AND optionally mark the booking as paid
     * in a single backend transaction.
     */
    async assignDetailerAndMarkPaid(
        orderId: string,
        payload: { detailerId: string; markPaid?: boolean; paymentMethod?: string }
    ) {
        const response = await api.put(`/bookings/${orderId}/assign-and-pay`, payload);
        if (response.data.success && response.data.data) {
            const booking = { ...response.data.data };
            booking.id = booking._id || booking.id;
            this.syncBookingToFirestore(booking).catch(console.error);
        }
        return response.data;
    },

    /**
     * Updates the granular progress of a service (checklist steps).
     * @param {string} orderId - Target booking.
     * @param {number} [stepIndex] - Index of the checklist step being updated.
     * @param {string} [status] - New status of the step.
     * @param {boolean} [completed] - Whether the overall job is marked complete.
     * @param {string} [orderStatus] - Global status update for the booking.
     */
    async updateProgress(orderId: string, stepIndex?: number, status?: string, completed: boolean = false, orderStatus?: string) {
        const response = await api.put(`/bookings/${orderId}/progress`, {
            stepIndex,
            status,
            completed,
            orderStatus
        });
        if (response.data.success && response.data.data) {
            const booking = { ...response.data.data };
            booking.id = booking._id || booking.id;
            this.syncBookingToFirestore(booking).catch(console.error);
        }
        return response.data;
    },

    /**
     * For Detailers: Fetches only the orders assigned to the logged-in user.
     */
    async getDetailerOrders() {
        const response = await api.get('/bookings/detailer/my-orders');
        // Normalize: backend may return raw Mongoose docs with _id but no id
        if (response.data?.success && Array.isArray(response.data.data)) {
            response.data.data = response.data.data.map((order: any) => ({
                ...order,
                id: order.id || order._id,
            }));
        }
        return response.data;
    },

    /**
     * Submit rating for a completed booking.
     * @param {string} orderId - The order ID to rate.
     * @param {number} score - Rating score from 1-5.
     * @param {string} [comment] - Optional feedback text.
     */
    async submitRating(orderId: string, score: number, comment?: string) {
        const response = await api.post(`/bookings/${orderId}/rating`, { score, comment });
        return response.data;
    },

    /**
     * Customer signs waiver.
     */
    async signWaiver(orderId: string, waiverSignature: string, waiverPdf?: string) {
        const response = await api.post(`/bookings/${orderId}/waiver`, { waiverSignature, waiverPdf });
        if (response.data.success && response.data.data) {
            const booking = { ...response.data.data };
            booking.id = booking._id || booking.id;
            this.syncBookingToFirestore(booking).catch(console.error);
        }
        return response.data;
    },

    /**
     * Download Waiver PDF.
     */
    async downloadWaiverPdf(orderId: string) {
        const response = await api.get(`/orders/${orderId}/waiver-pdf`, {
            responseType: 'blob'
        });
        return response.data;
    },

    /**
     * Send waiver reminder.
     */
    async sendWaiverReminder(orderId: string) {
        const response = await api.post(`/orders/${orderId}/waiver-reminder`);
        return response.data;
    },

    /**
     * Detailer uploads pre-service inspection.
     */
    async uploadInspection(orderId: string, payload: { preServicePhotos: string[]; damageNotes?: string }) {
        const response = await api.post(`/bookings/${orderId}/inspection`, payload);
        if (response.data.success && response.data.data) {
            const booking = { ...response.data.data };
            booking.id = booking._id || booking.id;
            this.syncBookingToFirestore(booking).catch(console.error);
        }
        return response.data;
    },

    /**
     * Update customer-facing booking status (Queued/In Progress/Finishing/Ready).
     */
    async updateCustomerStatus(orderId: string, status: string) {
        const response = await api.put(`/bookings/${orderId}/status`, { status });
        if (response.data.success && response.data.data) {
            const booking = { ...response.data.data };
            booking.id = booking._id || booking.id;
            this.syncBookingToFirestore(booking).catch(console.error);
        }
        return response.data;
    },

    /**
     * Add a note to the order (for service staff).
     * @param {string} orderId - The order ID.
     * @param {string} content - The note text.
     */
    async addNote(orderId: string, content: string) {
        const response = await api.patch(`/bookings/${orderId}/notes`, { content });
        if (response.data.success && response.data.data) {
            // We just update firestore blindly to cause UI reload
            this.syncBookingToFirestore({ id: orderId, staffNotes: response.data.data.staffNotes } as any).catch(console.error);
        }
        return response.data;
    },

    /**
     * Add a before/after photo to the order (for service staff).
     * @param {string} orderId - The order ID.
     * @param {'before' | 'after'} phase - The photo phase.
     * @param {string} photoUrl - The photo data URL or external URL.
     */
    async addPhoto(orderId: string, phase: 'before' | 'after', photoUrl: string) {
        const response = await api.patch(`/bookings/${orderId}/photos`, { phase, photoUrl });
        if (response.data.success && response.data.data) {
            // We just update firestore blindly to cause UI reload
            this.syncBookingToFirestore({ id: orderId, photos: response.data.data.photos } as any).catch(console.error);
        }
        return response.data;
    },

    /**
     * Archive stale bookings with missing labels or processing status.
     */
    async cleanupStaleBookings() {
        const response = await api.post('/bookings/cleanup-stale');
        return response.data;
    },

    /**
     * Fetch occupied time slots for a specific date
     * @param {string} date - The date to check (YYYY-MM-DD)
     */
    async getAvailableSlots(date: string) {
        const data = await cachedGet(
            `/orders/available-slots?date=${date}`,
            undefined,
            TTL.MEDIUM
        );
        return data;
    },

    /**
     * Archive completed order (move to past bookings).
     * @param {string} orderId - The order ID to archive.
     */
    async archiveOrder(orderId: string) {
        const response = await api.patch(`/bookings/${orderId}`, {
            archived: true,
            archivedAt: new Date().toISOString(),
            archivedReason: 'customer_pickup_confirmed'
        });
        return response.data;
    },

    /**
     * Update a workflow step with strict locking.
     * @param orderId - The target order ID.
     * @param step - Step number (1-7).
     * @param data - Step-specific payload.
     */
    async updateWorkflowStep(orderId: string, step: number, data: any) {
        const response = await api.patch(`/bookings/${orderId}/workflow`, { step, data });
        if (response.data.success && response.data.data) {
            const booking = { ...response.data.data };
            booking.id = booking._id || booking.id;
            this.syncBookingToFirestore(booking).catch(console.error);
        }
        return response.data;
    },

    /**
     * Get archived orders (past bookings).
     * @param {number} [page=1] - Page number for pagination.
     * @param {number} [limit=20] - Number of items per page.
     */
    async getArchivedOrders(page: number = 1, limit: number = 20) {
        const response = await api.get('/bookings', {
            params: {
                includeArchived: 'only',
                page,
                limit
            }
        });
        return response.data;
    },

    /**
     * Subscribes to real-time updates for a customer's bookings.
     * @param {string} customerId - The unique ID of the customer (Firebase UID).
     * @param {function} callback - Function to call with the updated bookings.
     * @returns {function} - Unsubscribe function.
     */
    subscribeToCustomerBookings(customerId: string, callback: (bookings: Booking[]) => void) {
        if (!db || !customerId) return () => { };

        try {
            const q = query(
                collection(db, 'bookings'),
                where('customerId', '==', customerId)
            );

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const bookings: Booking[] = [];
                snapshot.forEach((doc) => {
                    bookings.push(normalizeBooking({ id: doc.id, ...doc.data() }));
                });
                // Sort client-side to avoid index requirement errors initially
                bookings.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
                callback(bookings);
            }, (error) => {
                console.error("Firestore subscription error:", error);
            });

            return unsubscribe;
        } catch (e) {
            console.error("Failed to subscribe to bookings:", e);
            return () => { };
        }
    },

    /**
     * Subscribes to real-time updates for ALL bookings (Admin/Staff view).
     * @param {function} callback - Function to call with the updated bookings.
     * @returns {function} - Unsubscribe function.
     */
    subscribeToAllOrders(callback: (bookings: Booking[]) => void) {
        if (!db) return () => { };

        try {
            const q = query(collection(db, 'bookings'));

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const bookings: Booking[] = [];
                snapshot.forEach((doc) => {
                    bookings.push(normalizeBooking({ id: doc.id, ...doc.data() }));
                });
                bookings.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
                callback(bookings);
            }, (error) => {
                console.error("Firestore global subscription error:", error);
            });

            return unsubscribe;
        } catch (e) {
            console.error("Failed to subscribe to all bookings:", e);
            return () => { };
        }
    },

    // -------------------------------------------------------------
    // NEW OPERATIONAL WORKFLOW ENDPOINTS (7-STEP)
    // -------------------------------------------------------------
    
    /**
     * @route POST /api/orders/:id/checkin
     * Performs check-in with a down payment and Terms and Conditions signature.
     */
    async operateCheckIn(orderId: string, payload: { paymentMethod: string, downPaymentAmount: number, signature: string }) {
        const response = await api.post(`/orders/${orderId}/checkin`, payload);
        if (response.data.success && response.data.data) {
            const booking = { ...response.data.data };
            booking.id = booking._id || booking.id;
            this.syncBookingToFirestore(booking).catch(console.error);
        }
        return response.data;
    },

    /**
     * @route POST /api/orders/:id/start
     * Marks the service as physically started by the detailer.
     */
    async operateStartService(orderId: string) {
        const response = await api.post(`/orders/${orderId}/start`);
        if (response.data.success && response.data.data) {
            const booking = { ...response.data.data };
            booking.id = booking._id || booking.id;
            this.syncBookingToFirestore(booking).catch(console.error);
        }
        return response.data;
    },

    /**
     * @route POST /api/orders/:id/qc
     * Marks the service as completed and passes Quality Control.
     */
    async operateQCComplete(orderId: string, payload: { qcNotes?: string } = {}) {
        const response = await api.post(`/orders/${orderId}/qc`, payload);
        if (response.data.success && response.data.data) {
            const booking = { ...response.data.data };
            booking.id = booking._id || booking.id;
            this.syncBookingToFirestore(booking).catch(console.error);
        }
        return response.data;
    },

    /**
     * @route POST /api/orders/:id/pay
     * Receives final payment for the service.
     */
    async operateFinalPayment(orderId: string, payload: { paymentMethod: string, finalPaymentAmount: number }) {
        const response = await api.post(`/orders/${orderId}/pay`, payload);
        if (response.data.success && response.data.data) {
            const booking = { ...response.data.data };
            booking.id = booking._id || booking.id;
            this.syncBookingToFirestore(booking).catch(console.error);
        }
        return response.data;
    },

    /**
     * @route POST /api/orders/:id/release
     * Releases the vehicle to the customer.
     */
    async operateRelease(orderId: string, payload?: { releaseSignature?: string }) {
        const response = await api.post(`/orders/${orderId}/release`, payload || {});
        if (response.data.success && response.data.data) {
            const booking = { ...response.data.data };
            booking.id = booking._id || booking.id;
            this.syncBookingToFirestore(booking).catch(console.error);
        }
        return response.data;
    }
};
