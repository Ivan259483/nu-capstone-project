/**
 * Unified Status Constants
 * 
 * This file defines all status values used across the application
 * to ensure consistency between frontend and backend.
 */

// Order/Booking Status
export const ORDER_STATUS = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    ASSIGNED: 'assigned',
    IN_PROGRESS: 'in-progress',
    PROCESSING: 'processing', // Alias for in-progress
    FINISHING: 'finishing',
    READY: 'ready',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
} as const;

// Payment Status
export const PAYMENT_STATUS = {
    PENDING: 'pending',
    PAID: 'paid',
    FAILED: 'failed',
    REFUNDED: 'refunded',
} as const;

// Customer-Facing Status (simplified for customer view)
export const CUSTOMER_STATUS = {
    QUEUED: 'queued',
    IN_PROGRESS: 'in-progress',
    FINISHING: 'finishing',
    READY: 'ready',
} as const;

// Type exports for TypeScript
export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];
export type PaymentStatus = typeof PAYMENT_STATUS[keyof typeof PAYMENT_STATUS];
export type CustomerStatus = typeof CUSTOMER_STATUS[keyof typeof CUSTOMER_STATUS];

// Status transition rules (what statuses can transition to what)
export const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    [ORDER_STATUS.PENDING]: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.CONFIRMED]: [ORDER_STATUS.ASSIGNED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.ASSIGNED]: [ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.IN_PROGRESS]: [ORDER_STATUS.FINISHING, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.PROCESSING]: [ORDER_STATUS.FINISHING, ORDER_STATUS.CANCELLED], // Alias
    [ORDER_STATUS.FINISHING]: [ORDER_STATUS.READY, ORDER_STATUS.IN_PROGRESS],
    [ORDER_STATUS.READY]: [ORDER_STATUS.COMPLETED],
    [ORDER_STATUS.COMPLETED]: [],
    [ORDER_STATUS.CANCELLED]: [],
};

// Helper function to check if a status transition is valid
export const isValidTransition = (from: OrderStatus, to: OrderStatus): boolean => {
    const allowedTransitions = STATUS_TRANSITIONS[from] || [];
    return allowedTransitions.includes(to);
};

// Helper function to get the next possible statuses
export const getNextStatuses = (currentStatus: OrderStatus): OrderStatus[] => {
    return STATUS_TRANSITIONS[currentStatus] || [];
};

// Status display labels (for UI)
export const STATUS_LABELS: Record<OrderStatus, string> = {
    [ORDER_STATUS.PENDING]: 'Pending',
    [ORDER_STATUS.CONFIRMED]: 'Confirmed',
    [ORDER_STATUS.ASSIGNED]: 'Assigned',
    [ORDER_STATUS.IN_PROGRESS]: 'In Progress',
    [ORDER_STATUS.PROCESSING]: 'Processing',
    [ORDER_STATUS.FINISHING]: 'Finishing',
    [ORDER_STATUS.READY]: 'Ready for Pickup',
    [ORDER_STATUS.COMPLETED]: 'Completed',
    [ORDER_STATUS.CANCELLED]: 'Cancelled',
};

// Status colors (for UI badges)
export const STATUS_COLORS: Record<OrderStatus, string> = {
    [ORDER_STATUS.PENDING]: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/20',
    [ORDER_STATUS.CONFIRMED]: 'bg-blue-500/20 text-blue-400 border-blue-500/20',
    [ORDER_STATUS.ASSIGNED]: 'bg-purple-500/20 text-purple-400 border-purple-500/20',
    [ORDER_STATUS.IN_PROGRESS]: 'bg-orange-500/20 text-orange-400 border-orange-500/20',
    [ORDER_STATUS.PROCESSING]: 'bg-orange-500/20 text-orange-400 border-orange-500/20',
    [ORDER_STATUS.FINISHING]: 'bg-amber-500/20 text-amber-400 border-amber-500/20',
    [ORDER_STATUS.READY]: 'bg-green-500/20 text-green-400 border-green-500/20',
    [ORDER_STATUS.COMPLETED]: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20',
    [ORDER_STATUS.CANCELLED]: 'bg-red-500/20 text-red-400 border-red-500/20',
};

// Payment status labels
export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
    [PAYMENT_STATUS.PENDING]: 'Payment Pending',
    [PAYMENT_STATUS.PAID]: 'Paid',
    [PAYMENT_STATUS.FAILED]: 'Payment Failed',
    [PAYMENT_STATUS.REFUNDED]: 'Refunded',
};

// Payment status colors
export const PAYMENT_COLORS: Record<PaymentStatus, string> = {
    [PAYMENT_STATUS.PENDING]: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/20',
    [PAYMENT_STATUS.PAID]: 'bg-green-500/20 text-green-400 border-green-500/20',
    [PAYMENT_STATUS.FAILED]: 'bg-red-500/20 text-red-400 border-red-500/20',
    [PAYMENT_STATUS.REFUNDED]: 'bg-gray-500/20 text-gray-400 border-gray-500/20',
};

// Customer status labels (simplified)
export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
    [CUSTOMER_STATUS.QUEUED]: 'In Queue',
    [CUSTOMER_STATUS.IN_PROGRESS]: 'Being Worked On',
    [CUSTOMER_STATUS.FINISHING]: 'Final Touches',
    [CUSTOMER_STATUS.READY]: 'Ready for Pickup',
};

// Helper function to map order status to customer status
export const mapToCustomerStatus = (orderStatus: OrderStatus): CustomerStatus => {
    switch (orderStatus) {
        case ORDER_STATUS.PENDING:
        case ORDER_STATUS.CONFIRMED:
        case ORDER_STATUS.ASSIGNED:
            return CUSTOMER_STATUS.QUEUED;
        case ORDER_STATUS.IN_PROGRESS:
        case ORDER_STATUS.PROCESSING:
            return CUSTOMER_STATUS.IN_PROGRESS;
        case ORDER_STATUS.FINISHING:
            return CUSTOMER_STATUS.FINISHING;
        case ORDER_STATUS.READY:
        case ORDER_STATUS.COMPLETED:
            return CUSTOMER_STATUS.READY;
        default:
            return CUSTOMER_STATUS.QUEUED;
    }
};

// Helper function to check if order is active (not completed or cancelled)
export const isActiveOrder = (status: OrderStatus): boolean => {
    return status !== ORDER_STATUS.COMPLETED && status !== ORDER_STATUS.CANCELLED;
};

// Helper function to check if order is in progress
export const isInProgress = (status: OrderStatus): boolean => {
    return status === ORDER_STATUS.IN_PROGRESS || status === ORDER_STATUS.PROCESSING;
};

// Helper function to check if order is ready for pickup
export const isReadyForPickup = (status: OrderStatus): boolean => {
    return status === ORDER_STATUS.READY;
};

// Helper function to check if payment is completed
export const isPaymentCompleted = (paymentStatus: PaymentStatus): boolean => {
    return paymentStatus === PAYMENT_STATUS.PAID;
};
