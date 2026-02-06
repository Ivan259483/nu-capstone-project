import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LogOut, Package, Users, ShoppingCart, DollarSign, Activity, Settings,
    Plus, Search, AlertTriangle, Bell, Trash2, Edit, Send, CheckCircle,
    Clock, FileText, ClipboardList
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
    inventoryStorage, supplierStorage, serviceStorage,
    activityLogStorage, settingsStorage
} from '@/lib/storage';
import { UserService } from '@/lib/user-service';
import { SupplierService } from '@/lib/supplier-service';
import { InventoryService } from '@/lib/inventory-service-api';
import { DetailService } from '@/lib/detail-service-api';
import { OrderService } from '@/lib/order-service';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { InventoryItem, User, Supplier, Service, ActivityLog, BusinessSettings, Booking } from '@/types';

type TabType = 'inventory' | 'users' | 'suppliers' | 'pricing' | 'activity' | 'settings' | 'bookings';

export default function AdminDashboard() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    const [activeTab, setActiveTab] = useState<TabType>('inventory');
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [services, setServices] = useState<Service[]>([]);
    const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
    const [settings, setSettings] = useState<BusinessSettings | null>(null);
    const [bookings, setBookings] = useState<Booking[]>([]);

    const [searchTerm, setSearchTerm] = useState('');

    // Booking Assignment
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
    const [selectedDetailerId, setSelectedDetailerId] = useState('');

    // Inventory Modal
    const [showInventoryModal, setShowInventoryModal] = useState(false);
    const [isEditingInventory, setIsEditingInventory] = useState(false);
    const [editingInventoryId, setEditingInventoryId] = useState<string | null>(null);
    const [itemName, setItemName] = useState('');
    const [itemCategory, setItemCategory] = useState('');
    const [itemQuantity, setItemQuantity] = useState('');
    const [itemUnit, setItemUnit] = useState('');
    const [itemMinLevel, setItemMinLevel] = useState('');
    const [itemCost, setItemCost] = useState('');
    const [itemSupplier, setItemSupplier] = useState('');

    // User Modal
    const [showUserModal, setShowUserModal] = useState(false);
    const [isEditingUser, setIsEditingUser] = useState(false);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [userName, setUserName] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [userRole, setUserRole] = useState('');
    const [userPassword, setUserPassword] = useState('');

    // Supplier Modal
    const [showSupplierModal, setShowSupplierModal] = useState(false);
    const [isEditingSupplier, setIsEditingSupplier] = useState(false);
    const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
    const [supplierName, setSupplierName] = useState('');
    const [supplierContact, setSupplierContact] = useState('');
    const [supplierEmail, setSupplierEmail] = useState('');
    const [supplierPhone, setSupplierPhone] = useState('');
    const [supplierProducts, setSupplierProducts] = useState('');

    // Service Modal
    const [showServiceModal, setShowServiceModal] = useState(false);
    const [isEditingService, setIsEditingService] = useState(false);
    const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
    const [serviceName, setServiceName] = useState('');
    const [serviceCategory, setServiceCategory] = useState('');
    const [serviceDuration, setServiceDuration] = useState('');
    const [servicePrice, setServicePrice] = useState('');

    // Supplier Order Modal
    const [showOrderModal, setShowOrderModal] = useState(false);
    const [selectedSupplierForOrder, setSelectedSupplierForOrder] = useState<Supplier | null>(null);

    // Danger Zone Modal
    const [showDangerModal, setShowDangerModal] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<{ id: string; type: 'inventory' | 'user' | 'supplier' | 'service'; name: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!user || user.role !== 'admin') {
            navigate('/');
            return;
        }

        loadData();
    }, [user, navigate]);

    const isValidDate = (date: any) => {
        if (!date) return false;
        const d = new Date(date);
        return d instanceof Date && !isNaN(d.getTime());
    };

    const loadData = async () => {
        setActivityLogs(activityLogStorage.getAll());
        setSettings(settingsStorage.get());
        setIsLoading(true);

        try {
            // Fetch all data from backend (Simplified services handle mapping)
            const [usersRes, suppliersRes, servicesRes, productsRes] = await Promise.all([
                UserService.getAllUsers(),
                SupplierService.getAllSuppliers(),
                DetailService.getAllServices(),
                InventoryService.getAllProducts()
            ]);

            if (usersRes.success) setUsers(usersRes.data);
            if (suppliersRes.success) setSuppliers(suppliersRes.data);
            if (servicesRes.success) setServices(servicesRes.data);

            const bookingsRes = await OrderService.getAllOrders();
            if (bookingsRes.success) setBookings(bookingsRes.data);

            if (productsRes.success) {
                const mappedProducts: InventoryItem[] = productsRes.data.map((p: any) => ({
                    id: p.id, // mapped by service
                    name: p.name,
                    category: p.category?.name || 'Uncategorized',
                    stock: p.inventory,
                    unit: 'units',
                    minLevel: p.minLevel || 5,
                    cost: p.price,
                    supplier: p.supplier?.name || 'Manual'
                }));
                setInventory(mappedProducts);
            }
        } catch (error: any) {
            console.error('🚨 loadData Exception:', error);
            toast.error('Failed to sync data with server');

            // Fallback to local storage
            setInventory(inventoryStorage.getAll());
            setSuppliers(supplierStorage.getAll());
            setServices(serviceStorage.getAll());
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const lowStockItems = inventory.filter(item => item.stock < item.minLevel);
    const totalInventoryValue = inventory.reduce((acc, item) => acc + (item.stock * item.cost), 0);

    // Inventory handlers
    const handleAddInventory = async () => {
        if (!itemName || !itemCategory || !itemQuantity || !itemUnit || !itemMinLevel || !itemCost) {
            toast.error('Please fill in all required fields');
            return;
        }

        setIsLoading(true);

        const payload = {
            name: itemName,
            category: itemCategory,
            inventory: parseInt(itemQuantity),
            price: parseFloat(itemCost),
            minLevel: parseInt(itemMinLevel),
            unit: itemUnit,
            supplier: itemSupplier
        };
        console.log(`🚀 ${isEditingInventory ? 'Update' : 'Add'} Inventory Payload:`, payload);

        try {
            let response;
            if (isEditingInventory && editingInventoryId) {
                response = await InventoryService.updateProduct(editingInventoryId, payload);
            } else {
                response = await InventoryService.createProduct(payload);
            }

            if (response.success) {
                toast.success(`Item ${isEditingInventory ? 'updated' : 'added'} successfully!`);
                await loadData();
                setShowInventoryModal(false);
                resetInventoryForm();
            } else {
                toast.error(response.message || `Failed to ${isEditingInventory ? 'update' : 'add'} item`);
            }
        } catch (error: any) {
            console.error('🚨 Inventory Action Exception:', error);
            toast.error(`Failed to ${isEditingInventory ? 'update' : 'add'} inventory item`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditInventory = (item: InventoryItem) => {
        setIsEditingInventory(true);
        setEditingInventoryId(item.id);
        setItemName(item.name);
        setItemCategory(item.category);
        setItemQuantity(item.stock.toString());
        setItemUnit(item.unit);
        setItemMinLevel(item.minLevel.toString());
        setItemCost(item.cost.toString());
        setItemSupplier(item.supplier || '');
        setShowInventoryModal(true);
    };

    const handleDeleteInventory = (id: string, name: string) => {
        handleOpenDangerModal(id, 'inventory', name);
    };

    const resetInventoryForm = () => {
        setItemName('');
        setItemCategory('');
        setItemQuantity('');
        setItemUnit('');
        setItemMinLevel('');
        setItemCost('');
        setItemSupplier('');
        setIsEditingInventory(false);
        setEditingInventoryId(null);
    };

    // User handlers
    const handleAddUser = async () => {
        if (!userName || !userEmail || !userRole || (!isEditingUser && !userPassword)) {
            toast.error('Please fill in all required fields');
            return;
        }

        try {
            if (isEditingUser && editingUserId) {
                const response = await UserService.updateUser(editingUserId, {
                    name: userName,
                    email: userEmail,
                    role: userRole
                });

                if (response.success) {
                    toast.success('User updated successfully!');
                    loadData();
                    setShowUserModal(false);
                    resetUserForm();
                } else {
                    toast.error(response.message || 'Failed to update user');
                }
            } else {
                const payload = {
                    name: userName,
                    email: userEmail,
                    password: userPassword,
                    role: userRole
                };
                console.log('🚀 Create User Payload:', payload);

                const response = await UserService.createUser(payload);

                if (response.success) {
                    toast.success('User added successfully!');
                    loadData();
                    setShowUserModal(false);
                    resetUserForm();
                } else {
                    toast.error(response.message || 'Failed to add user');
                }
            }
        } catch (error: any) {
            console.error('🚨 User Action Exception:', {
                action: isEditingUser ? 'update' : 'create',
                message: error.message,
                status: error.response?.status,
                data: error.response?.data
            });
            toast.error('An error occurred');
        }
    };

    const handleEditUser = (u: User) => {
        setIsEditingUser(true);
        setEditingUserId(u.id);
        setUserName(u.name);
        setUserEmail(u.email);
        setUserRole(u.role);
        setUserPassword(''); // Don't show password for editing
        setShowUserModal(true);
    };

    const handleDeleteUser = (id: string, name: string) => {
        handleOpenDangerModal(id, 'user', name);
    };

    const resetUserForm = () => {
        setUserName('');
        setUserEmail('');
        setUserRole('');
        setUserPassword('');
        setIsEditingUser(false);
        setEditingUserId(null);
    };

    // Danger Zone handlers
    const handleOpenDangerModal = (id: string, type: 'inventory' | 'user' | 'supplier' | 'service', name: string) => {
        setItemToDelete({ id, type, name });
        setShowDangerModal(true);
    };

    const handleConfirmDelete = async () => {
        if (!itemToDelete) return;

        const token = localStorage.getItem('autospf_token') || '';
        setIsDeleting(true);

        try {
            let response;
            switch (itemToDelete.type) {
                case 'inventory':
                    response = await InventoryService.deleteProduct(itemToDelete.id);
                    break;
                case 'user':
                    if (itemToDelete.id === user?.id) {
                        toast.error('Cannot delete your own account');
                        setIsDeleting(false);
                        setShowDangerModal(false);
                        return;
                    }
                    response = await UserService.deleteUser(itemToDelete.id);
                    break;
                case 'supplier':
                    response = await SupplierService.deleteSupplier(itemToDelete.id);
                    break;
                case 'service':
                    response = await DetailService.deleteService(itemToDelete.id);
                    break;
            }

            if (response && response.success) {
                toast.success(`${itemToDelete.name} deleted successfully`);
                loadData();
            } else {
                toast.error(response?.message || `Failed to delete ${itemToDelete.type}`);
            }
        } catch (error: any) {
            console.error('🚨 Delete Exception:', {
                type: itemToDelete.type,
                id: itemToDelete.id,
                message: error.message,
                status: error.response?.status,
                data: error.response?.data
            });
            const errorMsg = error.response?.data?.message || 'Delete failed';
            toast.error(errorMsg);
        } finally {
            setIsDeleting(false);
            setShowDangerModal(false);
            setItemToDelete(null);
        }
    };

    // Supplier Order handlers
    const handleOpenOrderModal = (supplier: Supplier) => {
        setSelectedSupplierForOrder(supplier);
        setShowOrderModal(true);
    };

    const handleConfirmOrder = async () => {
        if (!selectedSupplierForOrder) return;

        const token = localStorage.getItem('autospf_token') || '';

        // Optimistic UI Update
        const previousSuppliers = [...suppliers];
        setSuppliers(prev => prev.map(s =>
            s.id === selectedSupplierForOrder.id
                ? { ...s, lastOrder: new Date().toISOString().split('T')[0], totalSpent: s.totalSpent + (1000) } // Example increment
                : s
        ));

        try {
            const response = await SupplierService.placeOrder(selectedSupplierForOrder.id);
            if (response.success) {
                toast.success(`Order placed with ${selectedSupplierForOrder.name}!`);
                setShowOrderModal(false);
                loadData(); // Sync with actual data
            } else {
                setSuppliers(previousSuppliers);
                toast.error(response.message || 'Failed to place order');
            }
        } catch (error: any) {
            setSuppliers(previousSuppliers);
            toast.error('An error occurred while placing order');
        }
    };

    // Supplier handlers
    const handleAddSupplier = async () => {
        if (!supplierName || !supplierContact || !supplierEmail) {
            toast.error('Please fill in all required fields');
            return;
        }

        setIsLoading(true);

        const payload = {
            name: supplierName,
            contactPerson: supplierContact,
            email: supplierEmail,
            phone: supplierPhone,
            products: supplierProducts.split(',').map(p => p.trim())
        };
        console.log(`🚀 ${isEditingSupplier ? 'Update' : 'Add'} Supplier Payload:`, payload);

        try {
            let response;
            if (isEditingSupplier && editingSupplierId) {
                response = await SupplierService.updateSupplier(editingSupplierId, payload);
            } else {
                response = await SupplierService.createSupplier(payload);
            }

            if (response.success) {
                toast.success(`Supplier ${isEditingSupplier ? 'updated' : 'added'} successfully!`);
                await loadData();
                setShowSupplierModal(false);
                resetSupplierForm();
            } else {
                toast.error(response.message || `Failed to ${isEditingSupplier ? 'update' : 'add'} supplier`);
            }
        } catch (error: any) {
            console.error('🚨 Supplier Action Exception:', error);
            toast.error(`Failed to ${isEditingSupplier ? 'update' : 'add'} supplier`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditSupplier = (s: Supplier) => {
        setIsEditingSupplier(true);
        setEditingSupplierId(s.id);
        setSupplierName(s.name);
        setSupplierContact(s.contactPerson);
        setSupplierEmail(s.email);
        setSupplierPhone(s.phone);
        setSupplierProducts(s.products?.join(', ') || '');
        setShowSupplierModal(true);
    };

    const resetSupplierForm = () => {
        setSupplierName('');
        setSupplierContact('');
        setSupplierEmail('');
        setSupplierPhone('');
        setSupplierProducts('');
        setIsEditingSupplier(false);
        setEditingSupplierId(null);
    };

    // Service handlers
    const handleAddService = async () => {
        if (!serviceName || !serviceCategory || !serviceDuration || !servicePrice) {
            toast.error('Please fill in all required fields');
            return;
        }

        setIsLoading(true);

        const payload = {
            name: serviceName,
            category: serviceCategory as 'Basic' | 'Standard' | 'Premium',
            duration: serviceDuration,
            basePrice: parseFloat(servicePrice),
            status: 'Active' as const,
        };
        console.log(`🚀 ${isEditingService ? 'Update' : 'Add'} Service Payload:`, payload);

        try {
            let response;
            if (isEditingService && editingServiceId) {
                response = await DetailService.updateService(editingServiceId, payload);
            } else {
                response = await DetailService.createService(payload);
            }

            if (response.success) {
                toast.success(`Service ${isEditingService ? 'updated' : 'added'} successfully!`);
                await loadData();
                setShowServiceModal(false);
                resetServiceForm();
            } else {
                toast.error(response.message || `Failed to ${isEditingService ? 'update' : 'add'} service`);
            }
        } catch (error: any) {
            console.error('🚨 Service Action Exception:', error);
            toast.error(`Failed to ${isEditingService ? 'update' : 'add'} service`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditService = (s: Service) => {
        setIsEditingService(true);
        setEditingServiceId(s.id);
        setServiceName(s.name);
        setServiceCategory(s.category);
        setServiceDuration(s.duration);
        setServicePrice(s.basePrice.toString());
        setShowServiceModal(true);
    };

    const handleDeleteService = (id: string, name: string) => {
        handleOpenDangerModal(id, 'service', name);
    };

    const resetServiceForm = () => {
        setServiceName('');
        setServiceCategory('');
        setServiceDuration('');
        setServicePrice('');
        setIsEditingService(false);
        setEditingServiceId(null);
    };

    // Booking Handlers
    const handleAssignDetailer = async () => {
        if (!selectedBooking || !selectedDetailerId) return;

        try {
            const response = await OrderService.assignDetailer(selectedBooking.id, selectedDetailerId);
            if (response.success) {
                toast.success('Detailer assigned successfully');
                setShowAssignModal(false);
                setSelectedBooking(null);
                setSelectedDetailerId('');
                loadData();
            } else {
                toast.error(response.message || 'Failed to assign detailer');
            }
        } catch (error: any) {
            toast.error('Error assigning detailer');
        }
    };

    const detailers = users.filter((u) => u.role === 'detailer');

    // Settings handlers
    const handleSaveSettings = () => {
        if (settings) {
            settingsStorage.update(settings);
            toast.success('Settings saved!');
        }
    };

    const filteredInventory = inventory.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const tabs = [
        { id: 'inventory' as TabType, label: 'Inventory', icon: Package },
        { id: 'bookings' as TabType, label: 'Bookings', icon: ClipboardList },
        { id: 'users' as TabType, label: 'User Management', icon: Users },
        { id: 'suppliers' as TabType, label: 'Suppliers', icon: ShoppingCart },
        { id: 'pricing' as TabType, label: 'Pricing', icon: DollarSign },
        { id: 'activity' as TabType, label: 'Activity Logs', icon: Activity },
        { id: 'settings' as TabType, label: 'Settings', icon: Settings },
    ];

    const getActivityIcon = (type: ActivityLog['type']) => {
        switch (type) {
            case 'completed_job': return <CheckCircle className="w-5 h-5 text-green-600" />;
            case 'inventory_update': return <Clock className="w-5 h-5 text-blue-600" />;
            case 'low_stock': return <AlertTriangle className="w-5 h-5 text-orange-600" />;
            case 'new_booking': return <Clock className="w-5 h-5 text-blue-600" />;
            case 'started_job': return <Clock className="w-5 h-5 text-blue-600" />;
            case 'generated_report': return <FileText className="w-5 h-5 text-green-600" />;
            default: return <Clock className="w-5 h-5 text-gray-600" />;
        }
    };

    const getCategoryBadge = (category: string) => {
        switch (category) {
            case 'Basic': return <Badge className="bg-blue-100 text-blue-800">Basic</Badge>;
            case 'Standard': return <Badge className="bg-yellow-100 text-yellow-800">Standard</Badge>;
            case 'Premium': return <Badge className="bg-purple-100 text-purple-800">Premium</Badge>;
            default: return <Badge>{category}</Badge>;
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            {/* Header */}
            <header className="bg-zinc-900/50 backdrop-blur-xl border-b border-zinc-800 px-6 py-4 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">Admin Dashboard</h1>
                        <p className="text-zinc-400">Welcome back, {user?.name}</p>
                        <Badge variant="outline" className="mt-1 border-orange-500 text-orange-400">Admin</Badge>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <Bell className="w-6 h-6 text-zinc-400 hover:text-white transition-colors" />
                            {lowStockItems.length > 0 && (
                                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center animate-pulse">
                                    {lowStockItems.length}
                                </span>
                            )}
                        </div>
                        <Button variant="outline" onClick={handleLogout} className="flex items-center gap-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">
                            <LogOut className="w-4 h-4" />
                            Logout
                        </Button>
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto p-6 space-y-6">
                {/* Low Stock Alert */}
                {lowStockItems.length > 0 && (
                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-md p-4 flex items-center gap-3 shadow-sm">
                        <AlertTriangle className="w-5 h-5 text-orange-500" />
                        <span className="text-orange-200">
                            {lowStockItems.length} items below minimum stock level
                        </span>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex gap-2 pb-2 overflow-x-auto">
                    {tabs.map((tab) => (
                        <Button
                            key={tab.id}
                            variant={activeTab === tab.id ? 'default' : 'outline'}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 rounded-full px-6 transition-all ${activeTab === tab.id
                                ? 'bg-[#F57C00] hover:bg-[#E65100] text-white shadow-lg shadow-orange-500/20 border-transparent'
                                : 'bg-transparent border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </Button>
                    ))}
                </div>

                {/* Tab Content */}
                {activeTab === 'bookings' && (
                    <Card className="bg-zinc-900 border-zinc-800 shadow-xl overflow-hidden">
                        <CardHeader className="border-b border-zinc-800 bg-zinc-900/50">
                            <CardTitle className="text-white">Bookings Management</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-zinc-950/50 text-zinc-400 font-medium border-b border-zinc-800">
                                        <tr>
                                            <th className="p-4">Customer</th>
                                            <th className="p-4">Service & Vehicle</th>
                                            <th className="p-4">Date & Time</th>
                                            <th className="p-4">Assigned Detailer</th>
                                            <th className="p-4">Status</th>
                                            <th className="p-4">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800">
                                        {bookings.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="p-12 text-center text-zinc-500">
                                                    <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                                    No bookings found
                                                </td>
                                            </tr>
                                        ) : (
                                            bookings.map((booking) => (
                                                <tr key={booking.id} className="hover:bg-zinc-900/50 transition-colors">
                                                    <td className="p-4">
                                                        <div className="font-medium text-white">
                                                            {typeof booking.customer === 'object' ? (booking.customer as any)?.name : 'Unknown'}
                                                        </div>
                                                        <div className="text-xs text-zinc-500">
                                                            {typeof booking.customer === 'object' ? (booking.customer as any)?.email : ''}
                                                        </div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="font-medium text-zinc-300">
                                                            {booking.items?.[0]?.product?.name || booking.serviceName || 'Service'}
                                                        </div>
                                                        <div className="text-xs text-zinc-500">
                                                            {booking.vehicleYear} {booking.vehicleMake} {booking.vehicleModel}
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-zinc-300">
                                                        <div>{booking.bookingDate}</div>
                                                        <div className="text-xs text-zinc-500">{booking.bookingTime}</div>
                                                    </td>
                                                    <td className="p-4">
                                                        {booking.assignedDetailer ? (
                                                            <Badge variant="outline" className="bg-orange-900/30 text-orange-300 border-orange-500/30">
                                                                {(booking.assignedDetailer as any).name || 'Assigned'}
                                                            </Badge>
                                                        ) : (
                                                            <span className="text-zinc-600 italic">Unassigned</span>
                                                        )}
                                                    </td>
                                                    <td className="p-4">
                                                        <Badge variant={
                                                            booking.status === 'completed' ? 'secondary' :
                                                                booking.status === 'cancelled' ? 'destructive' :
                                                                    booking.status === 'pending' ? 'secondary' : 'default'
                                                        } className={
                                                            booking.status === 'completed' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800' :
                                                                booking.status === 'pending' ? 'bg-amber-900/30 text-amber-400 border-amber-800' :
                                                                    booking.status === 'in-progress' ? 'bg-blue-900/30 text-blue-400 border-blue-800' : ''
                                                        }>
                                                            {booking.status.toUpperCase()}
                                                        </Badge>
                                                    </td>
                                                    <td className="p-4">
                                                        <Dialog open={showAssignModal && selectedBooking?.id === booking.id} onOpenChange={(open) => {
                                                            setShowAssignModal(open);
                                                            if (!open) setSelectedBooking(null);
                                                        }}>
                                                            <DialogTrigger asChild>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        setSelectedBooking(booking);
                                                                        setSelectedDetailerId((booking.assignedDetailer as any)?.id || '');
                                                                        setShowAssignModal(true);
                                                                    }}
                                                                >
                                                                    <Users className="w-4 h-4 mr-2" />
                                                                    Assign
                                                                </Button>
                                                            </DialogTrigger>
                                                            <DialogContent className="bg-[#121214] border-[#27272a]">
                                                                <DialogHeader>
                                                                    <DialogTitle className="text-[#f4f4f5]">Assign Detailer</DialogTitle>
                                                                </DialogHeader>
                                                                <div className="space-y-4 py-4">
                                                                    <div>
                                                                        <Label className="text-[#f4f4f5]">Select Detailer</Label>
                                                                        <Select value={selectedDetailerId} onValueChange={setSelectedDetailerId}>
                                                                            <SelectTrigger className="mt-1 bg-[#09090b] border-zinc-700 text-[#f4f4f5] focus:border-[#F57C00] focus:ring-[#F57C00]/20">
                                                                                <SelectValue placeholder="Choose a detailer" />
                                                                            </SelectTrigger>
                                                                            <SelectContent className="bg-[#121214] border-[#27272a]">
                                                                                {detailers.length === 0 ? (
                                                                                    <div className="p-2 text-sm text-[#a1a1aa]">No detailers found. Create a detailer user first.</div>
                                                                                ) : detailers.map((detailer) => (
                                                                                    <SelectItem key={detailer.id} value={detailer.id}>{detailer.name}</SelectItem>
                                                                                ))}
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </div>
                                                                    <div className="flex gap-2">
                                                                        <Button variant="outline" onClick={() => setShowAssignModal(false)} className="flex-1 bg-transparent border-white/20 text-white hover:bg-white/10">Cancel</Button>
                                                                        <Button onClick={handleAssignDetailer} className="flex-1 bg-[#F57C00] hover:bg-[#E65100] text-white">Confirm Assignment</Button>
                                                                    </div>
                                                                </div>
                                                            </DialogContent>
                                                        </Dialog>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {activeTab === 'inventory' && (
                    <>
                        {/* Stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                            <Card className="bg-zinc-900 border-zinc-800">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="w-12 h-12 bg-orange-900/20 rounded-md flex items-center justify-center border border-orange-500/20">
                                        <Package className="w-6 h-6 text-orange-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-zinc-400">Total Items</p>
                                        <p className="text-2xl font-bold text-white">{inventory.length}</p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-zinc-900 border-zinc-800">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="w-12 h-12 bg-orange-900/20 rounded-md flex items-center justify-center border border-orange-500/20">
                                        <AlertTriangle className="w-6 h-6 text-orange-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-zinc-400">Low Stock</p>
                                        <p className="text-2xl font-bold text-orange-400">{lowStockItems.length}</p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-zinc-900 border-zinc-800">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="w-12 h-12 bg-emerald-900/20 rounded-md flex items-center justify-center border border-emerald-500/20">
                                        <DollarSign className="w-6 h-6 text-emerald-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-zinc-400">Inventory Value</p>
                                        <p className="text-2xl font-bold text-white">₱{totalInventoryValue.toLocaleString()}</p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-zinc-900 border-zinc-800">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="w-12 h-12 bg-violet-900/20 rounded-md flex items-center justify-center border border-violet-500/20">
                                        <ShoppingCart className="w-6 h-6 text-violet-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-zinc-400">Suppliers</p>
                                        <p className="text-2xl font-bold text-white">{suppliers.length}</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Search and Add */}
                        <div className="flex items-center gap-4 mb-6">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                                <Input
                                    placeholder="Search inventory..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 focus:border-orange-500 focus:ring-orange-500/20"
                                />
                            </div>
                            <Dialog open={showInventoryModal} onOpenChange={setShowInventoryModal}>
                                <DialogTrigger asChild>
                                    <Button className="bg-[#F57C00] hover:bg-[#E65100] text-white shadow-lg shadow-orange-600/20">
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add Item
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-[#121214] border-[#27272a]">
                                    <DialogHeader>
                                        <DialogTitle className="text-[#f4f4f5]">{isEditingInventory ? 'Edit Inventory Item' : 'Add Inventory Item'}</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div>
                                            <Label className="text-[#f4f4f5]">Item Name</Label>
                                            <Input value={itemName} onChange={(e) => setItemName(e.target.value)} className="mt-1 bg-[#09090b] border-zinc-700 text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20" />
                                        </div>
                                        <div>
                                            <Label className="text-[#f4f4f5]">Category</Label>
                                            <Input value={itemCategory} onChange={(e) => setItemCategory(e.target.value)} className="mt-1 bg-[#09090b] border-zinc-700 text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20" placeholder="e.g., Chemicals, Supplies, Equipment" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <Label className="text-[#f4f4f5]">Quantity</Label>
                                                <Input type="number" value={itemQuantity} onChange={(e) => setItemQuantity(e.target.value)} className="mt-1 bg-[#09090b] border-zinc-700 text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20" />
                                            </div>
                                            <div>
                                                <Label className="text-[#f4f4f5]">Unit</Label>
                                                <Input value={itemUnit} onChange={(e) => setItemUnit(e.target.value)} className="mt-1 bg-[#09090b] border-zinc-700 text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20" placeholder="e.g., bottles, packs" />
                                            </div>
                                        </div>
                                        <div>
                                            <Label className="text-[#f4f4f5]">Minimum Quantity</Label>
                                            <Input type="number" value={itemMinLevel} onChange={(e) => setItemMinLevel(e.target.value)} className="mt-1 bg-[#09090b] border-zinc-700 text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20" />
                                        </div>
                                        <div>
                                            <Label className="text-[#f4f4f5]">Cost per Unit</Label>
                                            <Input type="number" value={itemCost} onChange={(e) => setItemCost(e.target.value)} className="mt-1 bg-[#09090b] border-zinc-700 text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20" />
                                        </div>
                                        <div>
                                            <Label className="text-[#f4f4f5]">Supplier (Optional)</Label>
                                            <Input value={itemSupplier} onChange={(e) => setItemSupplier(e.target.value)} className="mt-1 bg-[#09090b] border-zinc-700 text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20" />
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="outline" onClick={() => { setShowInventoryModal(false); resetInventoryForm(); }} className="flex-1 bg-transparent border-white/20 text-white hover:bg-white/10">Cancel</Button>
                                            <Button onClick={handleAddInventory} className="flex-1 bg-[#F57C00] hover:bg-[#E65100] text-white" disabled={isLoading}>
                                                {isLoading ? 'Processing...' : (isEditingInventory ? 'Save Changes' : 'Add Item')}
                                            </Button>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>

                        {/* Inventory Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredInventory.map((item) => (
                                <Card key={item.id} className={`bg-zinc-900 border-zinc-800 ${item.stock < item.minLevel ? 'border-orange-500/50 shadow-orange-900/10' : ''}`}>
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between mb-2">
                                            <div>
                                                <h3 className="font-semibold text-white">{item.name}</h3>
                                                <Badge variant="secondary" className="mt-1 bg-zinc-800 text-zinc-300 hover:bg-zinc-700">{item.category}</Badge>
                                            </div>
                                            {item.stock < item.minLevel && (
                                                <AlertTriangle className="w-5 h-5 text-orange-500" />
                                            )}
                                        </div>
                                        <div className="space-y-1 text-sm mt-3">
                                            <div className="flex justify-between">
                                                <span className="text-zinc-500">Stock:</span>
                                                <span className={`font-medium ${item.stock < item.minLevel ? 'text-orange-400' : 'text-zinc-300'}`}>
                                                    {item.stock} {item.unit}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-zinc-500">Min Level:</span>
                                                <span className="text-zinc-300">{item.minLevel} {item.unit}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-zinc-500">Cost:</span>
                                                <span className="text-zinc-300">₱{item.cost}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-zinc-500">Supplier:</span>
                                                <span className="text-zinc-300">{item.supplier || '-'}</span>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 mt-4">
                                            <Button variant="outline" size="sm" className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white" onClick={() => handleEditInventory(item)}>
                                                <Edit className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="flex-1 text-red-400 border-zinc-700 hover:bg-red-900/20 hover:text-red-300"
                                                onClick={() => handleDeleteInventory(item.id, item.name)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </>
                )}

                {activeTab === 'users' && (
                    <>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-semibold text-white">System Users</h2>
                            <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
                                <DialogTrigger asChild>
                                    <Button className="bg-[#F57C00] hover:bg-[#E65100] text-white shadow-lg shadow-orange-600/20">
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add User
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-[#121214] border-[#27272a] text-white">
                                    <DialogHeader>
                                        <DialogTitle className="text-[#f4f4f5]">{isEditingUser ? 'Edit User' : 'Add New User'}</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div>
                                            <Label className="text-[#f4f4f5]">Full Name</Label>
                                            <Input value={userName} onChange={(e) => setUserName(e.target.value)} className="mt-1 bg-[#09090b] border-zinc-700 text-white focus:border-[#F57C00] focus:ring-[#F57C00]/20" />
                                        </div>
                                        <div>
                                            <Label className="text-[#f4f4f5]">Email Address</Label>
                                            <Input type="email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} className="mt-1 bg-[#09090b] border-zinc-700 text-white focus:border-[#F57C00] focus:ring-[#F57C00]/20" />
                                        </div>
                                        <div>
                                            <Label className="text-[#f4f4f5]">Role</Label>
                                            <Select value={userRole} onValueChange={setUserRole}>
                                                <SelectTrigger className="mt-1 bg-[#09090b] border-zinc-700 text-white focus:border-[#F57C00] focus:ring-[#F57C00]/20">
                                                    <SelectValue placeholder="Select role" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#121214] border-[#27272a] text-white">
                                                    <SelectItem value="admin" className="focus:bg-zinc-800 focus:text-white">Admin</SelectItem>
                                                    <SelectItem value="detailer" className="focus:bg-zinc-800 focus:text-white">Detailer</SelectItem>
                                                    <SelectItem value="customer" className="focus:bg-zinc-800 focus:text-white">Customer</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        {!isEditingUser && (
                                            <div>
                                                <Label className="text-[#f4f4f5]">Temporary Password</Label>
                                                <Input type="password" value={userPassword} onChange={(e) => setUserPassword(e.target.value)} className="mt-1 bg-[#09090b] border-zinc-700 text-white focus:border-[#F57C00] focus:ring-[#F57C00]/20" />
                                            </div>
                                        )}
                                        <div className="flex gap-2">
                                            <Button variant="outline" onClick={() => { setShowUserModal(false); resetUserForm(); }} className="flex-1 bg-transparent border-white/20 text-white hover:bg-white/10">Cancel</Button>
                                            <Button onClick={handleAddUser} className="flex-1 bg-[#F57C00] hover:bg-[#E65100] text-white">
                                                {isEditingUser ? 'Save Changes' : 'Create User'}
                                            </Button>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {users.map((u) => (
                                <Card key={u.id} className="bg-zinc-900 border-zinc-800">
                                    <CardContent className="p-4">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${u.role === 'admin' ? 'bg-purple-600' : u.role === 'detailer' ? 'bg-[#F57C00]' : 'bg-emerald-600'
                                                }`}>
                                                {u.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-semibold text-white">{u.name}</h3>
                                                    <Badge className={u.isActive ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'}>
                                                        {u.isActive ? 'active' : 'inactive'}
                                                    </Badge>
                                                </div>
                                                <p className="text-sm text-zinc-500">{u.email}</p>
                                            </div>
                                        </div>
                                        <div className="space-y-1 text-sm">
                                            <div className="flex items-center gap-2">
                                                <span className="text-zinc-500">Role:</span>
                                                <span className="capitalize text-zinc-300">{u.role}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Clock className="w-4 h-4 text-zinc-600" />
                                                <span className="text-zinc-500">Last Active:</span>
                                                <span className="text-zinc-300">
                                                    {isValidDate(u.lastActive)
                                                        ? `Active ${formatDistanceToNow(new Date(u.lastActive))} ago`
                                                        : 'Offline'}
                                                </span>
                                            </div>
                                            {u.jobsCompleted !== undefined && (
                                                <div className="flex items-center gap-2">
                                                    <CheckCircle className="w-4 h-4 text-zinc-600" />
                                                    <span className="text-zinc-500">Jobs Completed:</span>
                                                    <span className="font-medium text-zinc-300">{u.jobsCompleted}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex gap-2 mt-4">
                                            <Button variant="outline" size="sm" className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white" onClick={() => handleEditUser(u)}>Edit</Button>
                                            {u.role !== 'admin' && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="text-red-400 border-zinc-700 hover:bg-red-900/20 hover:text-red-300"
                                                    onClick={() => handleDeleteUser(u.id, u.name)}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </>
                )}

                {activeTab === 'suppliers' && (
                    <>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-semibold">Supplier Management</h2>
                            <Dialog open={showSupplierModal} onOpenChange={setShowSupplierModal}>
                                <DialogTrigger asChild>
                                    <Button className="bg-[#F57C00] hover:bg-[#E65100]">
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add Supplier
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-[#121214] border-[#27272a]">
                                    <DialogHeader>
                                        <DialogTitle className="text-[#f4f4f5]">{isEditingSupplier ? 'Edit Supplier' : 'Add New Supplier'}</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div>
                                            <Label className="text-[#f4f4f5]">Supplier Name</Label>
                                            <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="mt-1 bg-[#09090b] border-zinc-700 text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20" />
                                        </div>
                                        <div>
                                            <Label className="text-[#f4f4f5]">Contact Person</Label>
                                            <Input value={supplierContact} onChange={(e) => setSupplierContact(e.target.value)} className="mt-1 bg-[#09090b] border-zinc-700 text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20" />
                                        </div>
                                        <div>
                                            <Label className="text-[#f4f4f5]">Email Address</Label>
                                            <Input type="email" value={supplierEmail} onChange={(e) => setSupplierEmail(e.target.value)} className="mt-1 bg-[#09090b] border-zinc-700 text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20" />
                                        </div>
                                        <div>
                                            <Label className="text-[#f4f4f5]">Phone Number</Label>
                                            <Input value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} className="mt-1 bg-[#09090b] border-zinc-700 text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20" />
                                        </div>
                                        <div>
                                            <Label className="text-[#f4f4f5]">Products (comma separated)</Label>
                                            <Input value={supplierProducts} onChange={(e) => setSupplierProducts(e.target.value)} className="mt-1 bg-[#09090b] border-zinc-700 text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20" placeholder="e.g., Coatings, Wax, Towels" />
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="outline" onClick={() => { setShowSupplierModal(false); resetSupplierForm(); }} className="flex-1 bg-transparent border-white/20 text-white hover:bg-white/10">Cancel</Button>
                                            <Button onClick={handleAddSupplier} className="flex-1 bg-[#F57C00] hover:bg-[#E65100] text-white" disabled={isLoading}>
                                                {isLoading ? 'Processing...' : (isEditingSupplier ? 'Save Changes' : 'Add Supplier')}
                                            </Button>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {suppliers.map((supplier) => (
                                <Card key={supplier.id} className="bg-[#121214] border-zinc-800">
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between mb-3">
                                            <div>
                                                <h3 className="font-semibold text-lg text-[#f4f4f5]">{supplier.name}</h3>
                                                <p className="text-[#a1a1aa]">{supplier.contactPerson}</p>
                                                <p className="text-sm text-[#a1a1aa]">{supplier.email}</p>
                                            </div>
                                            <Send className="w-5 h-5 text-[#a1a1aa]" />
                                        </div>
                                        <div className="mb-3">
                                            <p className="text-sm text-[#a1a1aa] mb-2">Products:</p>
                                            <div className="flex flex-wrap gap-2">
                                                {supplier.products.map((product, i) => (
                                                    <Badge key={i} variant="secondary" className="bg-zinc-800 text-zinc-300">{product}</Badge>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                                            <div>
                                                <p className="text-[#a1a1aa]">Last Order</p>
                                                <p className="font-medium text-[#f4f4f5]">{supplier.lastOrder || 'N/A'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[#a1a1aa]">Total Spent</p>
                                                <p className="font-medium text-emerald-400">₱{supplier.totalSpent.toLocaleString()}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                className="flex-1 bg-[#F57C00] hover:bg-[#E65100] text-white"
                                                onClick={() => handleOpenOrderModal(supplier)}
                                                disabled={!supplier || !supplier.products || supplier.products.length === 0}
                                            >
                                                Place Order
                                            </Button>
                                            <Button variant="outline" size="icon" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white" onClick={() => handleEditSupplier(supplier)}>
                                                <Edit className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="text-red-400 border-zinc-700 hover:bg-red-900/20 hover:text-red-300"
                                                onClick={() => handleOpenDangerModal(supplier.id, 'supplier', supplier.name)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </>
                )}

                {activeTab === 'pricing' && (
                    <>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-semibold">Service Pricing Management</h2>
                            <Dialog open={showServiceModal} onOpenChange={setShowServiceModal}>
                                <DialogTrigger asChild>
                                    <Button className="bg-[#F57C00] hover:bg-[#E65100]">
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add Service
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-[#121214] border-[#27272a]">
                                    <DialogHeader>
                                        <DialogTitle className="text-[#f4f4f5]">{isEditingService ? 'Edit Service' : 'Add New Service'}</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div>
                                            <Label className="text-[#f4f4f5]">Service Name</Label>
                                            <Input value={serviceName} onChange={(e) => setServiceName(e.target.value)} className="mt-1 bg-[#09090b] border-zinc-700 text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20" />
                                        </div>
                                        <div>
                                            <Label className="text-[#f4f4f5]">Category</Label>
                                            <Select value={serviceCategory} onValueChange={setServiceCategory}>
                                                <SelectTrigger className="mt-1 bg-[#09090b] border-zinc-700 text-[#f4f4f5] focus:border-[#F57C00] focus:ring-[#F57C00]/20">
                                                    <SelectValue placeholder="Select category" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#121214] border-[#27272a]">
                                                    <SelectItem value="Basic">Basic</SelectItem>
                                                    <SelectItem value="Standard">Standard</SelectItem>
                                                    <SelectItem value="Premium">Premium</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label className="text-[#f4f4f5]">Duration</Label>
                                            <Input value={serviceDuration} onChange={(e) => setServiceDuration(e.target.value)} className="mt-1 bg-[#09090b] border-zinc-700 text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20" placeholder="e.g., 2 hours" />
                                        </div>
                                        <div>
                                            <Label className="text-[#f4f4f5]">Base Price (₱)</Label>
                                            <Input type="number" value={servicePrice} onChange={(e) => setServicePrice(e.target.value)} className="mt-1 bg-[#09090b] border-zinc-700 text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20" />
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="outline" onClick={() => { setShowServiceModal(false); resetServiceForm(); }} className="flex-1 bg-transparent border-white/20 text-white hover:bg-white/10">Cancel</Button>
                                            <Button onClick={handleAddService} className="flex-1 bg-[#F57C00] hover:bg-[#E65100] text-white" disabled={isLoading}>
                                                {isLoading ? 'Processing...' : (isEditingService ? 'Save Changes' : 'Add Service')}
                                            </Button>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>

                        <Card className="bg-[#121214] border-zinc-800">
                            <CardContent className="p-0">
                                <table className="w-full">
                                    <thead className="bg-zinc-950/50 text-zinc-400 font-medium border-b border-zinc-800">
                                        <tr>
                                            <th className="text-left p-4 font-medium text-[#f4f4f5]">Service Name</th>
                                            <th className="text-left p-4 font-medium text-[#f4f4f5]">Category</th>
                                            <th className="text-left p-4 font-medium text-[#f4f4f5]">Duration</th>
                                            <th className="text-left p-4 font-medium text-[#f4f4f5]">Base Price</th>
                                            <th className="text-left p-4 font-medium text-[#f4f4f5]">Status</th>
                                            <th className="text-left p-4 font-medium text-[#f4f4f5]">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800">
                                        {services.map((service) => (
                                            <tr key={service.id} className="hover:bg-zinc-900/50 transition-colors">
                                                <td className="p-4 text-[#f4f4f5]">{service.name}</td>
                                                <td className="p-4">{getCategoryBadge(service.category)}</td>
                                                <td className="p-4 text-zinc-300">{service.duration}</td>
                                                <td className="p-4 font-medium text-[#f4f4f5]">₱{service.basePrice}</td>
                                                <td className="p-4">
                                                    <Badge className="bg-emerald-900/30 text-emerald-400 border-emerald-800">{service.status}</Badge>
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex gap-2">
                                                        <Button variant="ghost" size="icon" className="text-orange-400 hover:text-orange-300 hover:bg-orange-900/20" onClick={() => handleEditService(service)}>
                                                            <Edit className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                                            onClick={() => handleDeleteService(service.id, service.name)}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </CardContent>
                        </Card>
                    </>
                )}

                {activeTab === 'activity' && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Activity</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {activityLogs.map((log) => (
                                    <div key={log.id} className="flex items-start gap-4 p-4 border rounded-lg">
                                        {getActivityIcon(log.type)}
                                        <div className="flex-1">
                                            <p className="font-medium">{log.title}</p>
                                            <p className="text-sm text-gray-600">{log.description}</p>
                                            <p className="text-xs text-gray-500 mt-1">by {log.userName}</p>
                                        </div>
                                        <span className="text-sm text-gray-500">
                                            {log.createdAt
                                                ? formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })
                                                : 'Unknown time'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {activeTab === 'settings' && settings && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Business Information</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label>Business Name</Label>
                                    <Input
                                        value={settings.businessName}
                                        onChange={(e) => setSettings({ ...settings, businessName: e.target.value })}
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <Label>Contact Email</Label>
                                    <Input
                                        type="email"
                                        value={settings.contactEmail}
                                        onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <Label>Phone Number</Label>
                                    <Input
                                        value={settings.phoneNumber}
                                        onChange={(e) => setSettings({ ...settings, phoneNumber: e.target.value })}
                                        className="mt-1"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Operating Hours</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
                                        <div key={day} className="flex items-center gap-4">
                                            <span className="w-24 text-sm">{day}</span>
                                            <Input
                                                type="time"
                                                value={settings.operatingHours[day]?.open || ''}
                                                onChange={(e) => setSettings({
                                                    ...settings,
                                                    operatingHours: {
                                                        ...settings.operatingHours,
                                                        [day]: { ...settings.operatingHours[day], open: e.target.value }
                                                    }
                                                })}
                                                className="w-28"
                                            />
                                            <span>-</span>
                                            <Input
                                                type="time"
                                                value={settings.operatingHours[day]?.close || ''}
                                                onChange={(e) => setSettings({
                                                    ...settings,
                                                    operatingHours: {
                                                        ...settings.operatingHours,
                                                        [day]: { ...settings.operatingHours[day], close: e.target.value }
                                                    }
                                                })}
                                                className="w-28"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Notification Settings</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span>Email notifications for new bookings</span>
                                    <Switch
                                        checked={settings.notifications.emailNewBookings}
                                        onCheckedChange={(checked) => setSettings({
                                            ...settings,
                                            notifications: { ...settings.notifications, emailNewBookings: checked }
                                        })}
                                    />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>Low stock alerts</span>
                                    <Switch
                                        checked={settings.notifications.lowStockAlerts}
                                        onCheckedChange={(checked) => setSettings({
                                            ...settings,
                                            notifications: { ...settings.notifications, lowStockAlerts: checked }
                                        })}
                                    />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>Daily summary reports</span>
                                    <Switch
                                        checked={settings.notifications.dailySummary}
                                        onCheckedChange={(checked) => setSettings({
                                            ...settings,
                                            notifications: { ...settings.notifications, dailySummary: checked }
                                        })}
                                    />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>System maintenance alerts</span>
                                    <Switch
                                        checked={settings.notifications.maintenanceAlerts}
                                        onCheckedChange={(checked) => setSettings({
                                            ...settings,
                                            notifications: { ...settings.notifications, maintenanceAlerts: checked }
                                        })}
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Data Management</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <Button className="w-full bg-[#F57C00] hover:bg-[#E65100]">Export All Data</Button>
                                <Button className="w-full bg-green-600 hover:bg-green-700">Backup Database</Button>
                                <Button className="w-full bg-orange-500 hover:bg-orange-600">Clear Cache</Button>
                                <Button className="w-full bg-red-600 hover:bg-red-700">Reset System</Button>
                            </CardContent>
                        </Card>

                        <div className="lg:col-span-2 flex justify-end gap-4">
                            <Button variant="outline">Cancel</Button>
                            <Button onClick={handleSaveSettings} className="bg-[#F57C00] hover:bg-[#E65100]">Save Changes</Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Place Order Confirmation Modal */}
            <AlertDialog open={showOrderModal} onOpenChange={setShowOrderModal}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Supplier Order</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to place an order with <strong>{selectedSupplierForOrder?.name}</strong>?
                            This will send a procurement request for all listed products: {selectedSupplierForOrder?.products.join(', ')}.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmOrder} className="bg-[#F57C00] hover:bg-[#E65100]">
                            Confirm Order
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Danger Zone Deletion Modal */}
            <AlertDialog open={showDangerModal} onOpenChange={setShowDangerModal}>
                <AlertDialogContent className="bg-[#121214] border-[#27272a]">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-red-400 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5" />
                            Danger Zone: Confirm Deletion
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-[#a1a1aa]">
                            You are about to delete <strong className="text-[#f4f4f5]">{itemToDelete?.name}</strong>. This action is irreversible and may affect associated records.
                            {itemToDelete?.type === 'user' && " All active sessions for this user will be invalidated."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting} className="bg-transparent border-white/20 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                handleConfirmDelete();
                            }}
                            className="bg-red-600 hover:bg-red-700 text-white"
                            disabled={isDeleting}
                        >
                            {isDeleting ? 'Deleting...' : 'Yes, Delete Permanently'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}