import { useState, useEffect } from 'react'; //ivan
import { useNavigate } from 'react-router-dom';
import {
    LogOut, Package, Users, ShoppingCart, DollarSign, Activity, Settings,
    Plus, Search, AlertTriangle, Bell, Trash2, Edit
} from 'lucide-react';
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
    inventoryStorage, userStorage, supplierStorage, serviceStorage,
    activityLogStorage, settingsStorage
} from '@/lib/storage';
import type { InventoryItem, User, Supplier, Service, ActivityLog, BusinessSettings } from '@/types';

type TabType = 'inventory' | 'users' | 'suppliers' | 'pricing' | 'activity' | 'settings';

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

    const [searchTerm, setSearchTerm] = useState('');

    // Load all data on mount
    useEffect(() => {
        loadAllData();
    }, []);

    const loadAllData = async () => {
        try {
            const [inv, usr, sup, srv, logs, sett] = await Promise.all([
                inventoryStorage.getAll(),
                userStorage.getAll(),
                supplierStorage.getAll(),
                serviceStorage.getAll(),
                activityLogStorage.getAll(),
                settingsStorage.get()
            ]);

            setInventory(inv);
            setUsers(usr);
            setSuppliers(sup);
            setServices(srv);
            setActivityLogs(logs);
            setSettings(sett);
        } catch (error) {
            toast.error('Failed to load data');
            console.error(error);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const addInventoryItem = async (item: Omit<InventoryItem, 'id'>) => {
        try {
            const newItem = await inventoryStorage.add(item);
            setInventory([...inventory, newItem]);
            await activityLogStorage.add({
                action: 'add',
                itemType: 'inventory',
                itemId: newItem.id,
                userId: user?.id || '',
                timestamp: new Date().toISOString()
            });
            toast.success('Item added successfully');
        } catch (error) {
            toast.error('Failed to add item');
            console.error(error);
        }
    };

    const updateInventoryItem = async (id: string, updates: Partial<InventoryItem>) => {
        try {
            await inventoryStorage.update(id, updates);
            setInventory(inventory.map(item => item.id === id ? { ...item, ...updates } : item));
            await activityLogStorage.add({
                action: 'update',
                itemType: 'inventory',
                itemId: id,
                userId: user?.id || '',
                timestamp: new Date().toISOString()
            });
            toast.success('Item updated successfully');
        } catch (error) {
            toast.error('Failed to update item');
            console.error(error);
        }
    };

    const deleteInventoryItem = async (id: string) => {
        try {
            await inventoryStorage.delete(id);
            setInventory(inventory.filter(item => item.id !== id));
            await activityLogStorage.add({
                action: 'delete',
                itemType: 'inventory',
                itemId: id,
                userId: user?.id || '',
                timestamp: new Date().toISOString()
            });
            toast.success('Item deleted successfully');
        } catch (error) {
            toast.error('Failed to delete item');
            console.error(error);
        }
    };

    const filteredInventory = inventory.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.sku?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredUsers = users.filter(user =>
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredSuppliers = suppliers.filter(supplier =>
        supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        supplier.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const stats = {
        totalItems: inventory.length,
        lowStock: inventory.filter(item => item.quantity < (item.minStock || 10)).length,
        totalUsers: users.length,
        activeSuppliers: suppliers.filter(s => s.status === 'active').length,
        totalRevenue: services.reduce((sum, service) => sum + (service.price || 0), 0)
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-4">
                        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
                        <div className="flex items-center gap-4">
                            <Button variant="ghost" size="icon">
                                <Bell className="h-5 w-5" />
                            </Button>
                            <Button variant="outline" onClick={handleLogout}>
                                <LogOut className="h-4 w-4 mr-2" />
                                Logout
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-600">Total Items</p>
                                    <p className="text-2xl font-bold">{stats.totalItems}</p>
                                </div>
                                <Package className="h-8 w-8 text-blue-600" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-600">Low Stock</p>
                                    <p className="text-2xl font-bold text-orange-600">{stats.lowStock}</p>
                                </div>
                                <AlertTriangle className="h-8 w-8 text-orange-600" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-600">Total Users</p>
                                    <p className="text-2xl font-bold">{stats.totalUsers}</p>
                                </div>
                                <Users className="h-8 w-8 text-green-600" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-600">Suppliers</p>
                                    <p className="text-2xl font-bold">{stats.activeSuppliers}</p>
                                </div>
                                <ShoppingCart className="h-8 w-8 text-purple-600" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-600">Revenue</p>
                                    <p className="text-2xl font-bold">${stats.totalRevenue.toFixed(2)}</p>
                                </div>
                                <DollarSign className="h-8 w-8 text-yellow-600" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Tabs */}
                <div className="bg-white rounded-lg shadow">
                    <div className="border-b border-gray-200">
                        <nav className="flex space-x-8 px-6" aria-label="Tabs">
                            {[
                                { id: 'inventory', name: 'Inventory', icon: Package },
                                { id: 'users', name: 'Users', icon: Users },
                                { id: 'suppliers', name: 'Suppliers', icon: ShoppingCart },
                                { id: 'pricing', name: 'Pricing', icon: DollarSign },
                                { id: 'activity', name: 'Activity', icon: Activity },
                                { id: 'settings', name: 'Settings', icon: Settings }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as TabType)}
                                    className={`
                    flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm
                    ${activeTab === tab.id
                                            ? 'border-blue-500 text-blue-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                        }
                  `}
                                >
                                    <tab.icon className="h-5 w-5" />
                                    {tab.name}
                                </button>
                            ))}
                        </nav>
                    </div>

                    <div className="p-6">
                        {/* Search Bar */}
                        {activeTab !== 'settings' && activeTab !== 'activity' && (
                            <div className="mb-6 flex items-center gap-4">
                                <div className="flex-1 relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <Input
                                        type="text"
                                        placeholder={`Search ${activeTab}...`}
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-10"
                                    />
                                </div>
                                <Button>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add New
                                </Button>
                            </div>
                        )}

                        {/* Tab Content */}
                        {activeTab === 'inventory' && (
                            <InventoryTab
                                items={filteredInventory}
                                onUpdate={updateInventoryItem}
                                onDelete={deleteInventoryItem}
                            />
                        )}

                        {activeTab === 'users' && (
                            <UsersTab users={filteredUsers} />
                        )}

                        {activeTab === 'suppliers' && (
                            <SuppliersTab suppliers={filteredSuppliers} />
                        )}

                        {activeTab === 'pricing' && (
                            <PricingTab services={services} />
                        )}

                        {activeTab === 'activity' && (
                            <ActivityTab logs={activityLogs} />
                        )}

                        {activeTab === 'settings' && (
                            <SettingsTab settings={settings} onUpdate={setSettings} />
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}

// Inventory Tab Component
function InventoryTab({ items, onUpdate, onDelete }: {
    items: InventoryItem[];
    onUpdate: (id: string, updates: Partial<InventoryItem>) => void;
    onDelete: (id: string) => void;
}) {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {items.map(item => (
                        <tr key={item.id}>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{item.name}</div>
                                <div className="text-sm text-gray-500">{item.category}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.sku}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{item.quantity}</div>
                                {item.quantity < (item.minStock || 10) && (
                                    <Badge variant="destructive" className="text-xs">Low Stock</Badge>
                                )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${item.price?.toFixed(2)}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <Badge variant={item.status === 'active' ? 'default' : 'secondary'}>
                                    {item.status}
                                </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <Button variant="ghost" size="sm" className="mr-2">
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)}>
                                    <Trash2 className="h-4 w-4 text-red-600" />
                                </Button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// Users Tab Component
function UsersTab({ users }: { users: User[] }) {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {users.map(user => (
                        <tr key={user.id}>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{user.name}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.email}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <Badge>{user.role}</Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>
                                    {user.status}
                                </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <Button variant="ghost" size="sm">
                                    <Edit className="h-4 w-4" />
                                </Button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// Suppliers Tab Component
function SuppliersTab({ suppliers }: { suppliers: Supplier[] }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliers.map(supplier => (
                <Card key={supplier.id}>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>{supplier.name}</span>
                            <Badge variant={supplier.status === 'active' ? 'default' : 'secondary'}>
                                {supplier.status}
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2 text-sm">
                            <p className="text-gray-600">{supplier.email}</p>
                            <p className="text-gray-600">{supplier.phone}</p>
                            <p className="text-gray-500">{supplier.address}</p>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

// Pricing Tab Component
function PricingTab({ services }: { services: Service[] }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map(service => (
                <Card key={service.id}>
                    <CardHeader>
                        <CardTitle>{service.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <p className="text-3xl font-bold">${service.price?.toFixed(2)}</p>
                            <p className="text-sm text-gray-600">{service.description}</p>
                            <div className="pt-4">
                                <Button className="w-full">Edit Pricing</Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

// Activity Tab Component
function ActivityTab({ logs }: { logs: ActivityLog[] }) {
    return (
        <div className="space-y-4">
            {logs.slice(0, 50).map((log, index) => (
                <div key={index} className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                    <div className="flex-shrink-0">
                        {log.action === 'add' && <Plus className="h-5 w-5 text-green-600" />}
                        {log.action === 'update' && <Edit className="h-5 w-5 text-blue-600" />}
                        {log.action === 'delete' && <Trash2 className="h-5 w-5 text-red-600" />}
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-medium">
                            {log.action.charAt(0).toUpperCase() + log.action.slice(1)} {log.itemType}
                        </p>
                        <p className="text-xs text-gray-500">
                            {new Date(log.timestamp).toLocaleString()}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
}

// Settings Tab Component
function SettingsTab({ settings, onUpdate }: {
    settings: BusinessSettings | null;
    onUpdate: (settings: BusinessSettings) => void;
}) {
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Business Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label>Business Name</Label>
                        <Input value={settings?.businessName || ''} />
                    </div>
                    <div>
                        <Label>Email</Label>
                        <Input type="email" value={settings?.email || ''} />
                    </div>
                    <div>
                        <Label>Phone</Label>
                        <Input value={settings?.phone || ''} />
                    </div>
                    <div>
                        <Label>Address</Label>
                        <Input value={settings?.address || ''} />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Notifications</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label>Email Notifications</Label>
                        <Switch />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>Low Stock Alerts</Label>
                        <Switch />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>Order Updates</Label>
                        <Switch />
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button>Save Settings</Button>
            </div>
        </div>
    );
}