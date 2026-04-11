import type { UserRole } from '@/lib/roles';

export type { UserRole } from '@/lib/roles';

export interface User {
    id: string;
    _id?: string;
    email: string;
    password: string;
    name: string;
    role: UserRole;
    isActive: boolean;
    lastActive: string;
    jobsCompleted?: number;
    createdAt: string;
    avatar?: string;
    phone?: string;
    displayName?: string;
    photoURL?: string;
}

// Inventory Types
export interface InventoryItem {
    id: string;
    _id?: string;
    name: string;
    category: string;
    categoryId?: string;
    stock: number;
    unit: string;
    minLevel: number;
    cost: number;
    supplier: string;
    supplierId?: string;
    image?: string;
}

// Supplier Types
export interface Supplier {
    id: string;
    _id?: string;
    name: string;
    contactPerson: string;
    email: string;
    phone: string;
    products: string[];
    lastOrder: string;
    totalSpent: number;
}

// Service/Pricing Types
export interface Service {
    id: string;
    _id?: string;
    name: string;
    description?: string;
    category: 'Exterior' | 'Interior' | 'Complete' | 'Engine' | 'Premium' | 'Basic' | 'Standard';
    duration: string;
    basePrice: number;
    memberPrice?: number | null;
    recipe?: Array<{
        product?: string;
        productName?: string;
        quantity: number;
        unit?: string;
    }>;
    status: 'Active' | 'Inactive';
    isPublished?: boolean;
    bookingCount?: number;
    lastUpdatedBy?: string;
    lastUpdatedAt?: string;
    createdAt?: string;
    updatedAt?: string;
}

// Booking Types
export interface Booking {
    id: string;
    _id?: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    vehicleId: string;
    vehicleInfo: string;
    serviceId: string;
    serviceName: string;
    serviceType?: string;
    date: string;
    time: string;
    status: 'pending' | 'confirmed' | 'assigned' | 'received' | 'in_progress' | 'completed' | 'paid' | 'released' | 'cancelled' | 'failed';
    totalPrice?: number;
    totalAmount?: number;
    invoiceId?: string;
    paymentStatus?: 'unpaid' | 'paid' | 'failed' | 'refunded';
    paymentMethod?: string;
    paymentProvider?: string;
    paidAt?: string;
    addons?: string[];
    legalCompliance?: {
        waiverSignature?: string;
        waiverSignedAt?: string;
        waiverPdf?: string;
        preServicePhotos?: string[];
        damageNotes?: string;
    };

    notes?: string;
    // Backend Populated Fields
    customer?: User;
    items?: { product: InventoryItem; quantity: number }[];

    // assignedDetailer moved below with updated type
    estimatedCompletion?: string;
    vehicleYear?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleColor?: string;
    vehiclePlate?: string;
    bookingDate?: string;
    bookingTime?: string;
    createdAt: string;
    updatedAt?: string;
    // Backend Integration Fields
    orderNumber?: string;
    assignedDetailer?: User | string | null; // Populated or ID
    customerStatus?: 'received' | 'washing' | 'detailing' | 'ready' | 'queued' | 'in-progress' | 'finishing';
    customerStatusUpdatedAt?: string;
    serviceSteps?: {
        name: string;
        status: 'pending' | 'in-progress' | 'completed';
        completedAt?: string;
    }[];
    operationsChecklist?: {
        ingress: {
            name: string;
            isMustExplain: boolean;
            isRequired: boolean;
            completed: boolean;
            completedAt?: string;
            _id?: string;
        }[];
        egress: {
            name: string;
            isMustExplain: boolean;
            isRequired: boolean;
            completed: boolean;
            completedAt?: string;
            _id?: string;
        }[];
    };
    warrantyAndReceipt?: {
        certificateNumber?: string;
        warrantyType?: string;
        warrantyPeriod?: string;
        customerSignature?: string;
        amountPaid?: number;
        paymentMethod?: 'cash' | 'others';
        paymentExtent?: 'partial' | 'full';
        checkerName?: string;
        installationDate?: string;
        existingFwsAndShade?: string;
        reasonForChanging?: string;
        signedAt?: string;
    };
    currentStepIndex?: number;
    staffNotes?: {
        _id?: string;
        detailerId: string;
        detailerName?: string;
        content: string;
        timestamp: string;
    }[];
    photos?: {
        before: string[];
        after: string[];
    };
    // ═══ Workflow Pipeline ═══
    workflowStep?: number;
    workflowCompletedSteps?: number[];
    jobOrder?: {
        contactNumber?: string;
        ingressDateTime?: string;
        targetReleaseDate?: string;
        estimatedDays?: number;
        serviceCategory?: string;
        completedAt?: string;
        completedBy?: string;
    };
    ingressChecklist?: {
        items?: { category: string; name: string; checked: boolean; note?: string }[];
        beforeServiceNotes?: string;
        preExistingConditions?: string;
        completedAt?: string;
    };
    damageAnnotations?: {
        x: number;
        y: number;
        view: 'top' | 'left' | 'right';
        type: string;
        note?: string;
        addedBy?: string;
        addedAt?: string;
    }[];
    damagePhotos?: string[];
    damageCompletedAt?: string;
    customerWaiver?: {
        termsAccepted?: { label: string; accepted: boolean }[];
        customerFullName?: string;
        digitalSignature?: string;
        dateSigned?: string;
        completedAt?: string;
    };
    serviceProper?: {
        checklist?: { name: string; status: string; completedAt?: string }[];
        materialsUsed?: { productId: string; productName: string; quantity: number; unit: string }[];
        technicianNotes?: string;
        progressPercentage?: number;
        completedAt?: string;
    };
    qcChecklist?: { item: string; passed: boolean; note?: string; checkedAt?: string }[];
    qcCompletedAt?: string;
    egressData?: {
        aftercareChecklist?: { item: string; checked: boolean }[];
        paymentConfirmed?: boolean;
        customerSignature?: string;
        detailerName?: string;
        releaseTimestamp?: string;
        completedAt?: string;
    };
}

// Vehicle Types
export interface Vehicle {
    id: string;
    _id?: string;
    customerId: string;
    year: string;
    make: string;
    model: string;
    color: string;
    plateNumber: string;
}

// Job Types (for Detailer)
export interface Job {
    id: string;
    bookingId: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    vehicleInfo: string;
    serviceName: string;
    serviceChecklist: ServiceChecklistItem[];
    status: 'pending' | 'in_progress' | 'completed';
    priority: 'high' | 'normal' | 'low';
    scheduledTime: string;
    estimatedDuration: string;
    startedAt?: string;
    completedAt?: string;
    notes?: string;
    detailerId: string;
}

export interface ServiceChecklistItem {
    id: string;
    name: string;
    completed: boolean;
}

// Inventory Usage Types
export interface InventoryUsage {
    id: string;
    itemId: string;
    itemName: string;
    quantity: number;
    unit: string;
    jobId: string;
    detailerId: string;
    usedAt: string;
}

// Photo Types
export interface JobPhoto {
    id: string;
    jobId: string;
    type: 'before' | 'after';
    url: string;
    uploadedAt: string;
}

// Customer Note Types
export interface CustomerNote {
    id: string;
    jobId: string;
    detailerId: string;
    content: string;
    createdAt: string;
}

// Activity Log Types
export interface ActivityLog {
    id: string;
    _id?: string;
    type: 'completed_job' | 'inventory_update' | 'low_stock' | 'new_booking' | 'started_job' | 'generated_report' | 'status_change' | 'customer_status_change' | 'payment_completed' | 'inventory_deduction' | 'price_override' | 'pos_transaction' | 'maintenance' | 'settings' | 'login' | 'logout' | 'booking_created' | 'booking_updated' | 'booking_cancelled' | 'booking_completed' | 'user_created' | 'user_edited' | 'role_changed' | 'access_denied' | 'system_error';
    title: string;
    description: string;
    userId: string;
    userName: string;
    createdAt: string;
    metadata?: Record<string, any>;
    // Extended audit trail fields
    userRole?: string;
    module?: string;
    action?: string;
    status?: 'success' | 'warning' | 'error' | 'info';
}

// Settings Types
export interface BusinessSettings {
    // Shop Profile
    businessName: string;
    contactEmail: string;
    phoneNumber: string;
    address?: string;
    logoUrl?: string;
    businessRegistrationNo?: string;
    taxId?: string;
    country?: string;

    // System Config
    currency?: 'PHP' | 'USD' | string;
    timezone?: string;
    language?: string;
    dateFormat?: string;
    timeFormat?: string;
    taxRate?: number;
    systemTheme?: 'light' | 'dark';
    
    // Sliders
    membershipDiscount?: number;
    serviceCapacity?: number;
    inventoryThreshold?: number;
    auditLogRetention?: number; // Days

    operatingHours: {
        [key: string]: { open: string; close: string };
    };

    notifications: {
        emailNewBookings: boolean;
        lowStockAlerts: boolean;
        dailySummary: boolean;
        maintenanceAlerts: boolean;
    };

    // Security
    twoFactorAuth?: boolean;
    emailVerificationOnSignup?: boolean;
    loginAttemptLimit?: boolean;
    sessionTimeout?: string;
    emailAlerts?: boolean;
    smsAlerts?: boolean;

    landingDetails?: {
        services: any[];
        packages: any[];
        stats: any[];
        gallery: any[];
        team: any[];
    };
}

// OTP Types
export interface OTPData {
    email: string;
    otp: string;
    expiresAt: number;
}
