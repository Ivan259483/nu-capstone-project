export type UserRole = 'admin' | 'detailer' | 'customer';

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
}

// Inventory Types
export interface InventoryItem {
    id: string;
    _id?: string;
    name: string;
    category: string;
    stock: number;
    unit: string;
    minLevel: number;
    cost: number;
    supplier: string;
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
    category: 'Basic' | 'Standard' | 'Premium';
    duration: string;
    basePrice: number;
    status: 'Active' | 'Inactive';
}

// Booking Types
export interface Booking {
    id: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    vehicleId: string;
    vehicleInfo: string;
    serviceId: string;
    serviceName: string;
    date: string;
    time: string;
    status: 'pending' | 'in-progress' | 'completed' | 'cancelled';

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
    // Backend Integration Fields
    orderNumber?: string;
    assignedDetailer?: User | string | null; // Populated or ID
    serviceSteps?: {
        name: string;
        status: 'pending' | 'in-progress' | 'completed';
        completedAt?: string;
    }[];
    currentStepIndex?: number;
}

// Vehicle Types
export interface Vehicle {
    id: string;
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
    status: 'pending' | 'in-progress' | 'completed';
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
    type: 'completed_job' | 'inventory_update' | 'low_stock' | 'new_booking' | 'started_job' | 'generated_report';
    title: string;
    description: string;
    userId: string;
    userName: string;
    createdAt: string;
}

// Settings Types
export interface BusinessSettings {
    businessName: string;
    contactEmail: string;
    phoneNumber: string;
    operatingHours: {
        [key: string]: { open: string; close: string };
    };
    notifications: {
        emailNewBookings: boolean;
        lowStockAlerts: boolean;
        dailySummary: boolean;
        maintenanceAlerts: boolean;
    };
}

// OTP Types
export interface OTPData {
    email: string;
    otp: string;
    expiresAt: number;
}