import { User, InventoryItem, Supplier, Service, ActivityLog, BusinessSettings } from '@/types';

const STORAGE_KEYS = {
    USERS: 'autospf_users',
    INVENTORY: 'autospf_inventory',
    SUPPLIERS: 'autospf_suppliers',
    SERVICES: 'autospf_services',
    ACTIVITY: 'autospf_activity',
    SETTINGS: 'autospf_settings',
    CURRENT_USER: 'autospf_current_user',
};

// Mock Data
const MOCK_USERS: User[] = [
    {
        id: '1',
        email: 'admin@autospf.com',
        password: 'admin',
        name: 'Admin User',
        role: 'admin',
        status: 'active',
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
    },
    {
        id: '2',
        email: 'detailer@autospf.com',
        password: 'password',
        name: 'John Detailer',
        role: 'detailer',
        status: 'active',
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
    },
];

const MOCK_INVENTORY: InventoryItem[] = [
    {
        id: '1',
        name: 'Ceramic Coating Kit',
        category: 'Coatings',
        sku: 'CC-001',
        quantity: 15,
        minStock: 5,
        price: 89.99,
        status: 'active',
    },
    {
        id: '2',
        name: 'Microfiber Towels (Pack of 10)',
        category: 'Accessories',
        sku: 'MF-010',
        quantity: 3,
        minStock: 10,
        price: 15.00,
        status: 'active',
    },
];

const MOCK_SERVICES: Service[] = [
    {
        id: '1',
        name: 'Full Detail',
        price: 199.99,
        description: 'Complete interior and exterior detailing',
        duration: 180,
    },
    {
        id: '2',
        name: 'Ceramic Coating Application',
        price: 499.99,
        description: 'Professional grade ceramic coating with 3 year warranty',
        duration: 240,
    },
];

export const initializeStorage = () => {
    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(MOCK_USERS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.INVENTORY)) {
        localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(MOCK_INVENTORY));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SERVICES)) {
        localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(MOCK_SERVICES));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({
            businessName: 'AutoSPF+',
            email: 'contact@autospf.com',
            phone: '555-0123',
            address: '123 Detailing Lane',
            notifications: { email: true, lowStock: true, orderUpdates: false }
        }));
    }
};

// Generic helper to simulate async storage operations
const getStorageItem = <T>(key: string): T[] => {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : [];
};

const setStorageItem = <T>(key: string, data: T) => {
    localStorage.setItem(key, JSON.stringify(data));
};

export const userStorage = {
    getCurrentUser: (): User | null => {
        const user = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
        return user ? JSON.parse(user) : null;
    },
    setCurrentUser: (user: User) => {
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    },
    clearCurrentUser: () => {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    },
    getAll: async (): Promise<User[]> => {
        return getStorageItem<User>(STORAGE_KEYS.USERS);
    },
    getUserByEmail: (email: string): User | undefined => {
        const users = getStorageItem<User>(STORAGE_KEYS.USERS);
        return users.find(u => u.email === email);
    },
    addUser: async (user: User): Promise<User> => {
        const users = getStorageItem<User>(STORAGE_KEYS.USERS);
        const newUsers = [...users, user];
        setStorageItem(STORAGE_KEYS.USERS, newUsers);
        return user;
    },
    updateUser: async (updatedUser: User): Promise<void> => {
        const users = getStorageItem<User>(STORAGE_KEYS.USERS);
        const newUsers = users.map(u => u.id === updatedUser.id ? updatedUser : u);
        setStorageItem(STORAGE_KEYS.USERS, newUsers);
    },
};

export const inventoryStorage = {
    getAll: async (): Promise<InventoryItem[]> => {
        return getStorageItem<InventoryItem>(STORAGE_KEYS.INVENTORY);
    },
    add: async (item: Omit<InventoryItem, 'id'>): Promise<InventoryItem> => {
        const items = getStorageItem<InventoryItem>(STORAGE_KEYS.INVENTORY);
        const newItem = { ...item, id: Date.now().toString() } as InventoryItem;
        setStorageItem(STORAGE_KEYS.INVENTORY, [...items, newItem]);
        return newItem;
    },
    update: async (id: string, updates: Partial<InventoryItem>): Promise<void> => {
        const items = getStorageItem<InventoryItem>(STORAGE_KEYS.INVENTORY);
        const newItems = items.map(item => item.id === id ? { ...item, ...updates } : item);
        setStorageItem(STORAGE_KEYS.INVENTORY, newItems);
    },
    delete: async (id: string): Promise<void> => {
        const items = getStorageItem<InventoryItem>(STORAGE_KEYS.INVENTORY);
        setStorageItem(STORAGE_KEYS.INVENTORY, items.filter(item => item.id !== id));
    }
};

export const supplierStorage = {
    getAll: async (): Promise<Supplier[]> => {
        return getStorageItem<Supplier>(STORAGE_KEYS.SUPPLIERS);
    },
    // Add methods as needed
};

export const serviceStorage = {
    getAll: async (): Promise<Service[]> => {
        return getStorageItem<Service>(STORAGE_KEYS.SERVICES);
    },
};

export const activityLogStorage = {
    getAll: async (): Promise<ActivityLog[]> => {
        return getStorageItem<ActivityLog>(STORAGE_KEYS.ACTIVITY).reverse(); // Newest first
    },
    add: async (log: ActivityLog): Promise<void> => {
        const logs = getStorageItem<ActivityLog>(STORAGE_KEYS.ACTIVITY);
        setStorageItem(STORAGE_KEYS.ACTIVITY, [...logs, log]);
    }
};

export const settingsStorage = {
    get: async (): Promise<BusinessSettings | null> => {
        const settings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        return settings ? JSON.parse(settings) : null;
    }
};