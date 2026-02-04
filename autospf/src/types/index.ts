export interface User {
    id: string;
    email: string;
    password?: string;
    name: string;
    role: 'admin' | 'detailer' | 'customer';
    status: 'active' | 'inactive';
    createdAt: string;
    lastActive: string;
}

export interface InventoryItem {
    id: string;
    name: string;
    category: string;
    sku: string;
    quantity: number;
    minStock: number;
    price: number;
    status: 'active' | 'inactive';
}

export interface Supplier {
    id: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    status: 'active' | 'inactive';
}

export interface Service {
    id: string;
    name: string;
    price: number;
    description: string;
    duration?: number; // in minutes
}

export interface ActivityLog {
    action: 'add' | 'update' | 'delete' | 'login' | 'logout';
    itemType: string;
    itemId: string;
    userId: string;
    timestamp: string;
}

export interface BusinessSettings {
    businessName: string;
    email: string;
    phone: string;
    address: string;
    notifications: {
        email: boolean;
        lowStock: boolean;
        orderUpdates: boolean;
    };
}

export interface Appointment {
    id: string;
    service: string;
    date: string;
    time: string;
    status: 'confirmed' | 'completed' | 'cancelled';
    price: number;
}
