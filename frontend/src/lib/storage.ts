import type {
    User,
    InventoryItem,
    Supplier,
    Service,
    Booking,
    Vehicle,
    Job,
    InventoryUsage,
    CustomerNote,
    ActivityLog,
    BusinessSettings,
    OTPData
} from '@/types';

const STORAGE_KEYS = {
    USERS: 'autospf_users',
    CURRENT_USER: 'autospf_current_user',
    INVENTORY: 'autospf_inventory',
    SUPPLIERS: 'autospf_suppliers',
    SERVICES: 'autospf_services',
    BOOKINGS: 'autospf_bookings',
    VEHICLES: 'autospf_vehicles',
    JOBS: 'autospf_jobs',
    INVENTORY_USAGE: 'autospf_inventory_usage',
    CUSTOMER_NOTES: 'autospf_customer_notes',
    ACTIVITY_LOGS: 'autospf_activity_logs',
    SETTINGS: 'autospf_settings',
    OTP_DATA: 'autospf_otp_data',
};

// Generic storage functions
function getItem<T>(key: string, defaultValue: T): T {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch {
        return defaultValue;
    }
}

function setItem<T>(key: string, value: T): void {
    localStorage.setItem(key, JSON.stringify(value));
}

// Initialize with seed data
export function initializeStorage(): void {
    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
        const seedUsers: User[] = [
            {
                id: 'admin-1',
                email: 'admin@autospf.com',
                password: 'Admin123!',
                name: 'John Admin',
                role: 'administrator',
                isActive: true,
                lastActive: new Date().toISOString(),
                createdAt: '2024-01-01T00:00:00Z',
            },
            {
                id: 'detailer-1',
                email: 'mike@detailshop.com',
                password: 'Detailer123!',
                name: 'Mike Johnson',
                role: 'service_staff',
                isActive: true,
                lastActive: '2026-01-30T14:32:00Z',
                jobsCompleted: 147,
                createdAt: '2024-01-15T00:00:00Z',
            },
            {
                id: 'detailer-2',
                email: 'james@detailshop.com',
                password: 'Detailer123!',
                name: 'James Wilson',
                role: 'service_staff',
                isActive: true,
                lastActive: '2026-01-30T13:15:00Z',
                jobsCompleted: 132,
                createdAt: '2024-02-01T00:00:00Z',
            },
            {
                id: 'customer-1',
                email: 'customer@test.com',
                password: 'Customer123!',
                name: 'Sarah Johnson',
                role: 'customer',
                isActive: true,
                lastActive: new Date().toISOString(),
                createdAt: '2024-03-01T00:00:00Z',
            },
        ];
        setItem(STORAGE_KEYS.USERS, seedUsers);
    }

    if (!localStorage.getItem(STORAGE_KEYS.INVENTORY)) {
        const seedInventory: InventoryItem[] = [
            { id: 'inv-1', name: 'Ceramic Coating Pro', category: 'Coatings', stock: 12, unit: 'bottles', minLevel: 5, cost: 89, supplier: 'AutoPro Supply' },
            { id: 'inv-2', name: 'Microfiber Towels (Pack)', category: 'Supplies', stock: 45, unit: 'packs', minLevel: 20, cost: 23, supplier: 'DetailWorks Inc' },
            { id: 'inv-3', name: 'Premium Wash Soap', category: 'Chemicals', stock: 8, unit: 'gallons', minLevel: 10, cost: 34, supplier: 'ChemClean Ltd' },
            { id: 'inv-4', name: 'Clay Bar Kit', category: 'Supplies', stock: 3, unit: 'kits', minLevel: 8, cost: 45, supplier: 'AutoPro Supply' },
            { id: 'inv-5', name: 'Tire Shine Premium', category: 'Chemicals', stock: 15, unit: 'bottles', minLevel: 10, cost: 19, supplier: 'ChemClean Ltd' },
            { id: 'inv-6', name: 'Polishing Pads Set', category: 'Equipment', stock: 22, unit: 'sets', minLevel: 15, cost: 65, supplier: 'DetailWorks Inc' },
            { id: 'inv-7', name: 'Glass Cleaner', category: 'Chemicals', stock: 6, unit: 'bottles', minLevel: 12, cost: 12, supplier: 'ChemClean Ltd' },
            { id: 'inv-8', name: 'Wax Sealant', category: 'Coatings', stock: 18, unit: 'jars', minLevel: 8, cost: 51, supplier: 'AutoPro Supply' },
        ];
        setItem(STORAGE_KEYS.INVENTORY, seedInventory);
    }

    if (!localStorage.getItem(STORAGE_KEYS.SUPPLIERS)) {
        const seedSuppliers: Supplier[] = [
            { id: 'sup-1', name: 'AutoPro Supply', contactPerson: 'John Smith', email: 'orders@autopro.com', phone: '(555) 123-4567', products: ['Ceramic Coatings', 'Wax', 'Clay Bars'], lastOrder: '2026-01-25', totalSpent: 15420 },
            { id: 'sup-2', name: 'DetailWorks Inc', contactPerson: 'Lisa Chen', email: 'sales@detailworks.com', phone: '(555) 234-5678', products: ['Microfiber Towels', 'Polishing Pads', 'Applicators'], lastOrder: '2026-01-28', totalSpent: 8930 },
            { id: 'sup-3', name: 'ChemClean Ltd', contactPerson: 'Robert Davis', email: 'support@chemclean.com', phone: '(555) 345-6789', products: ['Wash Soap', 'Glass Cleaner', 'Tire Shine'], lastOrder: '2026-01-29', totalSpent: 12150 },
        ];
        setItem(STORAGE_KEYS.SUPPLIERS, seedSuppliers);
    }

    if (!localStorage.getItem(STORAGE_KEYS.SERVICES)) {
        const seedServices: Service[] = [
            { id: 'svc-1', name: 'Express Wash', category: 'Basic', duration: '30 mins', basePrice: 49, status: 'Active' },
            { id: 'svc-2', name: 'Full Detail', category: 'Premium', duration: '4 hours', basePrice: 299, status: 'Active' },
            { id: 'svc-3', name: 'Ceramic Coating', category: 'Premium', duration: '8 hours', basePrice: 1299, status: 'Active' },
            { id: 'svc-4', name: 'Paint Correction', category: 'Premium', duration: '6 hours', basePrice: 699, status: 'Active' },
            { id: 'svc-5', name: 'Interior Deep Clean', category: 'Standard', duration: '3 hours', basePrice: 199, status: 'Active' },
            { id: 'svc-6', name: 'Headlight Restoration', category: 'Standard', duration: '1 hour', basePrice: 99, status: 'Active' },
        ];
        setItem(STORAGE_KEYS.SERVICES, seedServices);
    }

    if (!localStorage.getItem(STORAGE_KEYS.VEHICLES)) {
        const seedVehicles: Vehicle[] = [
            { id: 'veh-1', customerId: 'customer-1', year: '2023', make: 'Tesla', model: 'Model 3', color: 'White', plateNumber: 'ABC1234' },
            { id: 'veh-2', customerId: 'customer-1', year: '2024', make: 'Porsche', model: '911', color: 'Red', plateNumber: 'XYZ5678' },
        ];
        setItem(STORAGE_KEYS.VEHICLES, seedVehicles);
    }

    if (!localStorage.getItem(STORAGE_KEYS.JOBS)) {
        const seedJobs: Job[] = [
            {
                id: 'job-1',
                bookingId: 'book-1',
                customerId: 'customer-1',
                customerName: 'Sarah Johnson',
                customerPhone: '(555) 123-4567',
                vehicleInfo: '2023 Tesla Model 3 - White',
                serviceName: 'Full Detail',
                serviceChecklist: [
                    { id: 'chk-1', name: 'Exterior Wash', completed: false },
                    { id: 'chk-2', name: 'Interior Deep Clean', completed: false },
                    { id: 'chk-3', name: 'Wax & Seal', completed: false },
                    { id: 'chk-4', name: 'Tire Shine', completed: false },
                ],
                status: 'in-progress',
                priority: 'normal',
                scheduledTime: '09:00 AM',
                estimatedDuration: '4 hours',
                startedAt: '2026-01-30T09:00:00Z',
                notes: 'Customer requested extra attention to interior stains on rear seats',
                detailerId: 'detailer-1',
            },
            {
                id: 'job-2',
                bookingId: 'book-2',
                customerId: 'customer-2',
                customerName: 'Mike Thompson',
                customerPhone: '(555) 234-5678',
                vehicleInfo: '2022 BMW M4 - Black',
                serviceName: 'Paint Correction',
                serviceChecklist: [
                    { id: 'chk-5', name: 'Surface Inspection', completed: false },
                    { id: 'chk-6', name: 'Clay Bar Treatment', completed: false },
                    { id: 'chk-7', name: 'Compound Polish', completed: false },
                    { id: 'chk-8', name: 'Final Polish', completed: false },
                ],
                status: 'pending',
                priority: 'high',
                scheduledTime: '01:00 PM',
                estimatedDuration: '6 hours',
                detailerId: 'detailer-1',
            },
            {
                id: 'job-3',
                bookingId: 'book-3',
                customerId: 'customer-3',
                customerName: 'Jennifer Davis',
                customerPhone: '(555) 345-6789',
                vehicleInfo: '2021 Honda CR-V - Silver',
                serviceName: 'Express Detail',
                serviceChecklist: [
                    { id: 'chk-9', name: 'Quick Wash', completed: false },
                    { id: 'chk-10', name: 'Interior Vacuum', completed: false },
                ],
                status: 'pending',
                priority: 'normal',
                scheduledTime: '11:00 AM',
                estimatedDuration: '2 hours',
                detailerId: 'detailer-1',
            },
        ];
        setItem(STORAGE_KEYS.JOBS, seedJobs);
    }

    if (!localStorage.getItem(STORAGE_KEYS.BOOKINGS)) {
        const seedBookings: Booking[] = [
            {
                id: 'book-1',
                customerId: 'customer-1',
                customerName: 'Sarah Johnson',
                customerPhone: '(555) 123-4567',
                vehicleId: 'veh-1',
                vehicleInfo: '2023 Tesla Model 3 - White',
                serviceId: 'svc-2',
                serviceName: 'Full Detail',
                date: '2026-01-30',
                time: '09:00 AM',
                status: 'in-progress',
                assignedDetailer: 'Mike Johnson',
                estimatedCompletion: '01:00 PM',
                createdAt: '2026-01-28T10:00:00Z',
            },
        ];
        setItem(STORAGE_KEYS.BOOKINGS, seedBookings);
    }

    if (!localStorage.getItem(STORAGE_KEYS.INVENTORY_USAGE)) {
        const seedUsage: InventoryUsage[] = [
            { id: 'use-1', itemId: 'inv-1', itemName: 'Ceramic Coating Pro', quantity: 1, unit: 'bottle', jobId: 'job-completed-1', detailerId: 'detailer-1', usedAt: '2026-01-30T12:00:00Z' },
            { id: 'use-2', itemId: 'inv-2', itemName: 'Microfiber Towels', quantity: 8, unit: 'pieces', jobId: 'job-completed-1', detailerId: 'detailer-1', usedAt: '2026-01-30T12:00:00Z' },
            { id: 'use-3', itemId: 'inv-3', itemName: 'Premium Wash Soap', quantity: 0.5, unit: 'gallon', jobId: 'job-completed-1', detailerId: 'detailer-1', usedAt: '2026-01-30T12:00:00Z' },
        ];
        setItem(STORAGE_KEYS.INVENTORY_USAGE, seedUsage);
    }

    if (!localStorage.getItem(STORAGE_KEYS.CUSTOMER_NOTES)) {
        const seedNotes: CustomerNote[] = [
            { id: 'note-1', jobId: 'job-1', detailerId: 'detailer-1', content: 'Customer mentioned scratches on driver door - inspected and documented', createdAt: '2026-01-30T09:15:00Z' },
            { id: 'note-2', jobId: 'job-1', detailerId: 'detailer-1', content: 'Called customer to confirm ceramic coating preference - approved premium option', createdAt: '2026-01-30T09:45:00Z' },
            { id: 'note-3', jobId: 'job-1', detailerId: 'detailer-1', content: 'Customer requested photos of engine bay cleaning', createdAt: '2026-01-30T11:30:00Z' },
        ];
        setItem(STORAGE_KEYS.CUSTOMER_NOTES, seedNotes);
    }

    if (!localStorage.getItem(STORAGE_KEYS.ACTIVITY_LOGS)) {
        const seedLogs: ActivityLog[] = [
            { id: 'log-1', type: 'completed_job', title: 'Completed Job', description: 'Full Detail - Toyota Camry (APT-2024-089)', userId: 'detailer-1', userName: 'Mike Detailer', createdAt: '2026-01-30T14:32:00Z' },
            { id: 'log-2', type: 'inventory_update', title: 'Inventory Update', description: 'Restocked Wax Sealant (+10 jars)', userId: 'admin-1', userName: 'John Admin', createdAt: '2026-01-30T14:15:00Z' },
            { id: 'log-3', type: 'low_stock', title: 'Low Stock Alert', description: 'Glass Cleaner below minimum threshold', userId: 'system', userName: 'System', createdAt: '2026-01-30T13:45:00Z' },
            { id: 'log-4', type: 'new_booking', title: 'New Booking', description: 'Ceramic Coating scheduled for 2026-02-05', userId: 'customer-1', userName: 'Tom Customer', createdAt: '2026-01-30T12:20:00Z' },
            { id: 'log-5', type: 'started_job', title: 'Started Job', description: 'Paint Correction - Honda Civic (APT-2024-090)', userId: 'detailer-1', userName: 'Mike Detailer', createdAt: '2026-01-30T11:10:00Z' },
            { id: 'log-6', type: 'low_stock', title: 'Low Stock Alert', description: 'Clay Bar Kit below minimum threshold', userId: 'system', userName: 'System', createdAt: '2026-01-30T10:05:00Z' },
            { id: 'log-7', type: 'generated_report', title: 'Generated Report', description: 'Monthly Revenue Report - January 2026', userId: 'admin-1', userName: 'Sarah Owner', createdAt: '2026-01-30T09:30:00Z' },
            { id: 'log-8', type: 'completed_job', title: 'Completed Job', description: 'Express Detail - Ford F-150 (APT-2024-088)', userId: 'detailer-1', userName: 'Mike Detailer', createdAt: '2026-01-29T16:45:00Z' },
        ];
        setItem(STORAGE_KEYS.ACTIVITY_LOGS, seedLogs);
    }

    if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
        const seedSettings: BusinessSettings = {
            businessName: 'DetailPro Shop',
            contactEmail: 'info@detailpro.com',
            phoneNumber: '(555) 123-4567',
            operatingHours: {
                Monday: { open: '08:00', close: '18:00' },
                Tuesday: { open: '08:00', close: '18:00' },
                Wednesday: { open: '08:00', close: '18:00' },
                Thursday: { open: '08:00', close: '18:00' },
                Friday: { open: '08:00', close: '18:00' },
                Saturday: { open: '09:00', close: '16:00' },
                Sunday: { open: '', close: '' },
            },
            notifications: {
                emailNewBookings: true,
                lowStockAlerts: true,
                dailySummary: false,
                maintenanceAlerts: true,
            },
        };
        setItem(STORAGE_KEYS.SETTINGS, seedSettings);
    }
}

// User functions
export const userStorage = {
    getAll: (): User[] => getItem(STORAGE_KEYS.USERS, []),
    getById: (id: string): User | undefined => {
        const users = getItem<User[]>(STORAGE_KEYS.USERS, []);
        return users.find(u => u.id === id);
    },
    getByEmail: (email: string): User | undefined => {
        const users = getItem<User[]>(STORAGE_KEYS.USERS, []);
        return users.find(u => u.email.toLowerCase() === email.toLowerCase());
    },
    add: (user: User): void => {
        const users = getItem<User[]>(STORAGE_KEYS.USERS, []);
        users.push(user);
        setItem(STORAGE_KEYS.USERS, users);
    },
    update: (user: User): void => {
        const users = getItem<User[]>(STORAGE_KEYS.USERS, []);
        const index = users.findIndex(u => u.id === user.id);
        if (index !== -1) {
            users[index] = user;
            setItem(STORAGE_KEYS.USERS, users);
        }
    },
    delete: (id: string): void => {
        const users = getItem<User[]>(STORAGE_KEYS.USERS, []);
        setItem(STORAGE_KEYS.USERS, users.filter(u => u.id !== id));
    },
    getCurrentUser: (): User | null => getItem(STORAGE_KEYS.CURRENT_USER, null),
    setCurrentUser: (user: User | null): void => setItem(STORAGE_KEYS.CURRENT_USER, user),
};

// Inventory functions
export const inventoryStorage = {
    getAll: (): InventoryItem[] => getItem(STORAGE_KEYS.INVENTORY, []),
    add: (item: InventoryItem): void => {
        const items = getItem<InventoryItem[]>(STORAGE_KEYS.INVENTORY, []);
        items.push(item);
        setItem(STORAGE_KEYS.INVENTORY, items);
    },
    update: (item: InventoryItem): void => {
        const items = getItem<InventoryItem[]>(STORAGE_KEYS.INVENTORY, []);
        const index = items.findIndex(i => i.id === item.id);
        if (index !== -1) {
            items[index] = item;
            setItem(STORAGE_KEYS.INVENTORY, items);
        }
    },
    delete: (id: string): void => {
        const items = getItem<InventoryItem[]>(STORAGE_KEYS.INVENTORY, []);
        setItem(STORAGE_KEYS.INVENTORY, items.filter(i => i.id !== id));
    },
    getLowStock: (): InventoryItem[] => {
        const items = getItem<InventoryItem[]>(STORAGE_KEYS.INVENTORY, []);
        return items.filter(i => i.stock < i.minLevel);
    },
};

// Supplier functions
export const supplierStorage = {
    getAll: (): Supplier[] => getItem(STORAGE_KEYS.SUPPLIERS, []),
    add: (supplier: Supplier): void => {
        const suppliers = getItem<Supplier[]>(STORAGE_KEYS.SUPPLIERS, []);
        suppliers.push(supplier);
        setItem(STORAGE_KEYS.SUPPLIERS, suppliers);
    },
    update: (supplier: Supplier): void => {
        const suppliers = getItem<Supplier[]>(STORAGE_KEYS.SUPPLIERS, []);
        const index = suppliers.findIndex(s => s.id === supplier.id);
        if (index !== -1) {
            suppliers[index] = supplier;
            setItem(STORAGE_KEYS.SUPPLIERS, suppliers);
        }
    },
    delete: (id: string): void => {
        const suppliers = getItem<Supplier[]>(STORAGE_KEYS.SUPPLIERS, []);
        setItem(STORAGE_KEYS.SUPPLIERS, suppliers.filter(s => s.id !== id));
    },
};

// Service functions
export const serviceStorage = {
    getAll: (): Service[] => getItem(STORAGE_KEYS.SERVICES, []),
    add: (service: Service): void => {
        const services = getItem<Service[]>(STORAGE_KEYS.SERVICES, []);
        services.push(service);
        setItem(STORAGE_KEYS.SERVICES, services);
    },
    update: (service: Service): void => {
        const services = getItem<Service[]>(STORAGE_KEYS.SERVICES, []);
        const index = services.findIndex(s => s.id === service.id);
        if (index !== -1) {
            services[index] = service;
            setItem(STORAGE_KEYS.SERVICES, services);
        }
    },
    delete: (id: string): void => {
        const services = getItem<Service[]>(STORAGE_KEYS.SERVICES, []);
        setItem(STORAGE_KEYS.SERVICES, services.filter(s => s.id !== id));
    },
};

// Booking functions
export const bookingStorage = {
    getAll: (): Booking[] => getItem(STORAGE_KEYS.BOOKINGS, []),
    getByCustomer: (customerId: string): Booking[] => {
        const bookings = getItem<Booking[]>(STORAGE_KEYS.BOOKINGS, []);
        return bookings.filter(b => b.customerId === customerId);
    },
    add: (booking: Booking): void => {
        const bookings = getItem<Booking[]>(STORAGE_KEYS.BOOKINGS, []);
        bookings.push(booking);
        setItem(STORAGE_KEYS.BOOKINGS, bookings);
    },
    update: (booking: Booking): void => {
        const bookings = getItem<Booking[]>(STORAGE_KEYS.BOOKINGS, []);
        const index = bookings.findIndex(b => b.id === booking.id);
        if (index !== -1) {
            bookings[index] = booking;
            setItem(STORAGE_KEYS.BOOKINGS, bookings);
        }
    },
    delete: (id: string): void => {
        const bookings = getItem<Booking[]>(STORAGE_KEYS.BOOKINGS, []);
        setItem(STORAGE_KEYS.BOOKINGS, bookings.filter(b => b.id !== id));
    },
};

// Vehicle functions
export const vehicleStorage = {
    getAll: (): Vehicle[] => getItem(STORAGE_KEYS.VEHICLES, []),
    getByCustomer: (customerId: string): Vehicle[] => {
        const vehicles = getItem<Vehicle[]>(STORAGE_KEYS.VEHICLES, []);
        return vehicles.filter(v => v.customerId === customerId);
    },
    add: (vehicle: Vehicle): void => {
        const vehicles = getItem<Vehicle[]>(STORAGE_KEYS.VEHICLES, []);
        vehicles.push(vehicle);
        setItem(STORAGE_KEYS.VEHICLES, vehicles);
    },
    update: (vehicle: Vehicle): void => {
        const vehicles = getItem<Vehicle[]>(STORAGE_KEYS.VEHICLES, []);
        const index = vehicles.findIndex(v => v.id === vehicle.id);
        if (index !== -1) {
            vehicles[index] = vehicle;
            setItem(STORAGE_KEYS.VEHICLES, vehicles);
        }
    },
    delete: (id: string): void => {
        const vehicles = getItem<Vehicle[]>(STORAGE_KEYS.VEHICLES, []);
        setItem(STORAGE_KEYS.VEHICLES, vehicles.filter(v => v.id !== id));
    },
};

// Job functions
export const jobStorage = {
    getAll: (): Job[] => getItem(STORAGE_KEYS.JOBS, []),
    getByDetailer: (detailerId: string): Job[] => {
        const jobs = getItem<Job[]>(STORAGE_KEYS.JOBS, []);
        return jobs.filter(j => j.detailerId === detailerId);
    },
    add: (job: Job): void => {
        const jobs = getItem<Job[]>(STORAGE_KEYS.JOBS, []);
        jobs.push(job);
        setItem(STORAGE_KEYS.JOBS, jobs);
    },
    update: (job: Job): void => {
        const jobs = getItem<Job[]>(STORAGE_KEYS.JOBS, []);
        const index = jobs.findIndex(j => j.id === job.id);
        if (index !== -1) {
            jobs[index] = job;
            setItem(STORAGE_KEYS.JOBS, jobs);
        }
    },
    delete: (id: string): void => {
        const jobs = getItem<Job[]>(STORAGE_KEYS.JOBS, []);
        setItem(STORAGE_KEYS.JOBS, jobs.filter(j => j.id !== id));
    },
};

// Inventory Usage functions
export const inventoryUsageStorage = {
    getAll: (): InventoryUsage[] => getItem(STORAGE_KEYS.INVENTORY_USAGE, []),
    add: (usage: InventoryUsage): void => {
        const usages = getItem<InventoryUsage[]>(STORAGE_KEYS.INVENTORY_USAGE, []);
        usages.push(usage);
        setItem(STORAGE_KEYS.INVENTORY_USAGE, usages);
    },
};

// Customer Notes functions
export const customerNoteStorage = {
    getAll: (): CustomerNote[] => getItem(STORAGE_KEYS.CUSTOMER_NOTES, []),
    getByJob: (jobId: string): CustomerNote[] => {
        const notes = getItem<CustomerNote[]>(STORAGE_KEYS.CUSTOMER_NOTES, []);
        return notes.filter(n => n.jobId === jobId);
    },
    add: (note: CustomerNote): void => {
        const notes = getItem<CustomerNote[]>(STORAGE_KEYS.CUSTOMER_NOTES, []);
        notes.push(note);
        setItem(STORAGE_KEYS.CUSTOMER_NOTES, notes);
    },
};

// Activity Log functions
export const activityLogStorage = {
    getAll: (): ActivityLog[] => getItem(STORAGE_KEYS.ACTIVITY_LOGS, []),
    add: (log: ActivityLog): void => {
        const logs = getItem<ActivityLog[]>(STORAGE_KEYS.ACTIVITY_LOGS, []);
        logs.unshift(log);
        setItem(STORAGE_KEYS.ACTIVITY_LOGS, logs);
    },
};

// Settings functions
export const settingsStorage = {
    get: (): BusinessSettings => getItem(STORAGE_KEYS.SETTINGS, {
        businessName: '',
        contactEmail: '',
        phoneNumber: '',
        operatingHours: {},
        notifications: {
            emailNewBookings: false,
            lowStockAlerts: false,
            dailySummary: false,
            maintenanceAlerts: false,
        },
    }),
    update: (settings: BusinessSettings): void => {
        setItem(STORAGE_KEYS.SETTINGS, settings);
    },
};

// OTP functions
export const otpStorage = {
    set: (data: OTPData): void => setItem(STORAGE_KEYS.OTP_DATA, data),
    get: (): OTPData | null => getItem(STORAGE_KEYS.OTP_DATA, null),
    clear: (): void => localStorage.removeItem(STORAGE_KEYS.OTP_DATA),
    verify: (email: string, otp: string): boolean => {
        const data = getItem<OTPData | null>(STORAGE_KEYS.OTP_DATA, null);
        if (!data) return false;
        if (data.email !== email) return false;
        if (data.otp !== otp) return false;
        if (Date.now() > data.expiresAt) return false;
        return true;
    },
};
