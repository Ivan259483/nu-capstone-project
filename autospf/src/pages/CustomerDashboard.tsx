import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LogOut, Calendar, Car, ClipboardList, User, Plus, Clock, CheckCircle,
    AlertCircle, Edit, Trash2, Lock, Eye, EyeOff, Star, Trophy, MapPin,
    Navigation, Sparkles, Gift, Crown, Camera, Scan, Smartphone, ChevronRight,
    Users, Check, Menu, X, Wallet, ShieldCheck, Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { bookingStorage } from '@/lib/storage';
import { OrderService } from '@/lib/order-service';
import { VehicleService } from '@/lib/vehicle-service';
import api from '@/lib/api';

import type { Booking, Vehicle, Service } from '@/types';

type TabType = 'book' | 'bookings' | 'vehicles' | 'profile' | 'tracking' | 'rewards' | 'membership' | 'ar_preview' | 'referrals';

export default function CustomerDashboard() {
    const navigate = useNavigate();
    const { user, logout, updateUser } = useAuth();

    const [activeTab, setActiveTab] = useState<TabType>('book');
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [services, setServices] = useState<Service[]>([]);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Booking form
    const [selectedVehicle, setSelectedVehicle] = useState('');
    const [selectedService, setSelectedService] = useState('');
    const [bookingDate, setBookingDate] = useState('');
    const [bookingTime, setBookingTime] = useState('');
    const [bookingNotes, setBookingNotes] = useState('');
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);

    // Vehicle form
    const [showVehicleModal, setShowVehicleModal] = useState(false);
    const [vehicleYear, setVehicleYear] = useState('');
    const [vehicleMake, setVehicleMake] = useState('');
    const [vehicleModel, setVehicleModel] = useState('');
    const [vehicleColor, setVehicleColor] = useState('');
    const [vehiclePlate, setVehiclePlate] = useState('');
    const [isEditingVehicle, setIsEditingVehicle] = useState(false);
    const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);

    // Profile form
    const [profileName, setProfileName] = useState(user?.name || '');
    const [profileEmail, setProfileEmail] = useState(user?.email || '');

    // Edit/Delete Booking
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [currentBooking, setCurrentBooking] = useState<Booking | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Password change states
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [passwordError, setPasswordError] = useState('');

    // Phase 3: new state for Rewards and AR
    const [userPoints, setUserPoints] = useState(1850);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [selectedCoating, setSelectedCoating] = useState<string | null>(null);

    useEffect(() => {
        if (!user || user.role !== 'customer') {
            navigate('/');
            return;
        }
        loadData();
    }, [user, navigate]);

    const loadData = async () => {
        if (!user) return;
        setIsLoading(true);

        try {
            const [servicesRes, bookingsRes, vehiclesRes] = await Promise.all([
                api.get('/services'),
                OrderService.getAllOrders(),
                VehicleService.getVehicles()
            ]);

            if (servicesRes.data.success) {
                const servicesData = servicesRes.data.data.map((s: any) => ({
                    ...s,
                    id: s._id || s.id
                }));
                setServices(servicesData.filter((s: any) => s.status === 'Active'));
            }

            if (bookingsRes.success) setBookings(bookingsRes.data);
            if (vehiclesRes.success) setVehicles(vehiclesRes.data);
        } catch (error: any) {
            console.error('🚨 [LOAD_DATA_FAILURE]:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const handleBookService = async () => {
        if (!selectedVehicle || !selectedService || !bookingDate || !bookingTime) {
            toast.error('Please fill in all required fields');
            return;
        }

        const selectedDate = new Date(bookingDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (selectedDate < today) {
            toast.error('Cannot book a service in the past.');
            return;
        }

        const vehicle = vehicles.find(v => v.id === selectedVehicle);
        const service = services.find(s => s.id === selectedService);
        if (!vehicle || !service || !user) return;

        setIsLoading(true);
        try {
            const newBookingData = {
                vehicle: vehicle.id,
                service: service.id,
                date: bookingDate,
                time: bookingTime,
                notes: bookingNotes,
            };

            const response = await OrderService.createOrder(newBookingData);
            if (response.success) {
                toast.success('Booking created successfully!');
                loadData();
                setSelectedVehicle('');
                setSelectedService('');
                setBookingDate('');
                setBookingTime('');
                setBookingNotes('');
            } else {
                toast.error(response.message || 'Failed to create booking');
            }
        } catch (error) {
            toast.error('An error occurred while creating the booking');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddVehicle = async () => {
        if (!vehicleYear || !vehicleMake || !vehicleModel || !vehicleColor || !vehiclePlate) {
            toast.error('Please fill in all vehicle details');
            return;
        }
        const yearNum = parseInt(vehicleYear);
        const currentYear = new Date().getFullYear();
        if (isNaN(yearNum) || vehicleYear.length !== 4 || yearNum < 1900 || yearNum > currentYear + 1) {
            toast.error(`Please enter a valid year (1900-${currentYear + 1})`);
            return;
        }

        setIsLoading(true);
        try {
            const newVehicleData = {
                year: vehicleYear,
                make: vehicleMake,
                model: vehicleModel,
                color: vehicleColor,
                plateNumber: vehiclePlate,
            };
            const response = await VehicleService.addVehicle(newVehicleData);

            if (response && response.success) {
                toast.success('Vehicle added successfully!');
                setVehicleYear('');
                setVehicleMake('');
                setVehicleModel('');
                setVehicleColor('');
                setVehiclePlate('');
                setShowVehicleModal(false);
                await loadData();
            } else {
                toast.error(response?.message || 'Failed to add vehicle');
            }
        } catch (error: any) {
            toast.error(`Failed to add vehicle: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditVehicle = (vehicle: Vehicle) => {
        setVehicleYear(vehicle.year);
        setVehicleMake(vehicle.make);
        setVehicleModel(vehicle.model);
        setVehicleColor(vehicle.color);
        setVehiclePlate(vehicle.plateNumber);
        setEditingVehicleId(vehicle.id);
        setIsEditingVehicle(true);
        setShowVehicleModal(true);
    };

    const handleUpdateVehicle = async () => {
        if (!vehicleYear || !vehicleMake || !vehicleModel || !vehicleColor || !vehiclePlate || !editingVehicleId) {
            toast.error('Please fill in all vehicle details');
            return;
        }
        setIsLoading(true);
        try {
            const updatedData = {
                year: vehicleYear,
                make: vehicleMake,
                model: vehicleModel,
                color: vehicleColor,
                plateNumber: vehiclePlate,
            };
            const response = await VehicleService.updateVehicle(editingVehicleId, updatedData);
            if (response.success) {
                toast.success('Vehicle updated successfully!');
                setShowVehicleModal(false);
                setIsEditingVehicle(false);
                setEditingVehicleId(null);
                setVehicleYear('');
                setVehicleMake('');
                setVehicleModel('');
                setVehicleColor('');
                setVehiclePlate('');
                await loadData();
            } else {
                toast.error(response.message || 'Failed to update vehicle');
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to update vehicle');
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateProfile = async () => {
        if (!user) return;
        setIsLoading(true);
        const updatedUser = { ...user, name: profileName, email: profileEmail };
        try {
            const result = await updateUser(updatedUser);
            if (result.success) toast.success('Profile updated successfully!');
            else toast.error(result.message || 'Failed to update profile');
        } catch (error) {
            toast.error('An error occurred while updating profile');
        } finally {
            setIsLoading(false);
        }
    };

    const handleChangePassword = async () => {
        if (!currentPassword || !newPassword || !confirmNewPassword) {
            toast.error('Please fill in all fields');
            return;
        }
        if (newPassword !== confirmNewPassword) {
            toast.error('New passwords do not match');
            return;
        }
        if (newPassword.length < 8) {
            toast.error('New password must be at least 8 characters');
            return;
        }
        setIsLoading(true);
        try {
            const response = await api.patch('/users/change-password', { currentPassword, newPassword });
            if (response.data.success) {
                toast.success('Password updated successfully!');
                setCurrentPassword('');
                setNewPassword('');
                setConfirmNewPassword('');
            } else {
                toast.error(response.data.message || 'Failed to update password');
            }
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditBooking = (booking: Booking) => {
        setCurrentBooking(booking);
        setSelectedService(booking.serviceId);
        setBookingDate(booking.date);
        setBookingTime(booking.time);
        setBookingNotes(booking.notes || '');
        setIsEditDialogOpen(true);
    };

    const handleUpdateBooking = async () => {
        if (!currentBooking) return;
        setIsLoading(true);
        try {
            const response = await OrderService.updateOrder(currentBooking.id, {
                date: bookingDate,
                time: bookingTime,
                notes: bookingNotes,
            });
            if (response.success) {
                toast.success('Booking updated successfully!');
                setIsEditDialogOpen(false);
                loadData();
            } else {
                toast.error(response.message || 'Failed to update booking');
            }
        } catch (error) {
            toast.error('An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirmCancel = async (booking: Booking) => {
        if (window.confirm('Are you sure you want to cancel this booking?')) {
            const previousBookings = [...bookings];
            setBookings(prev => prev.filter(b => b.id !== booking.id));
            try {
                const response = await OrderService.deleteOrder(booking.id);
                if (!response.success) {
                    setBookings(previousBookings);
                    toast.error(response.message || 'Failed to cancel booking');
                } else {
                    toast.success('Booking cancelled successfully!');
                }
            } catch (error) {
                setBookings(previousBookings);
                toast.error('An error occurred');
            }
        }
    };

    const handleRedeemReward = (cost: number, title: string) => {
        if (userPoints >= cost) {
            setUserPoints(prev => prev - cost);
            toast.success(`Successfully redeemed: ${title}!`);
        } else {
            toast.error(`Insufficient points. You need ${cost - userPoints} more points.`);
        }
    };

    const getStatusBadge = (status: Booking['status']) => {
        const styles = {
            'pending': 'bg-amber-100 text-amber-700 border-amber-200',
            'in-progress': 'bg-blue-100 text-blue-700 border-blue-200',
            'completed': 'bg-green-100 text-green-700 border-green-200',
            'cancelled': 'bg-red-100 text-red-700 border-red-200'
        };
        return <Badge className={`${styles[status] || 'bg-gray-100'} border px-3 py-1 font-medium`}>
            {status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}
        </Badge>;
    };

    const navItems = [
        { id: 'book', label: 'Book Service', icon: Sparkles },
        { id: 'bookings', label: 'My Bookings', icon: ClipboardList },
        { id: 'tracking', label: 'Live Tracking', icon: Navigation },
        { id: 'vehicles', label: 'My Vehicles', icon: Car },
        { id: 'rewards', label: 'Rewards & Points', icon: Gift },
        { id: 'membership', label: 'Membership Tier', icon: Crown },
        { id: 'ar_preview', label: 'AR Experience', icon: Camera },
        { id: 'referrals', label: 'Refer Friends', icon: Users },
        { id: 'profile', label: 'Settings', icon: User },
    ];

    const activeBookings = bookings.filter(b => b.status === 'pending' || b.status === 'in-progress').length;
    const completedBookings = bookings.filter(b => b.status === 'completed').length;

    const SidebarContent = () => (
        <div className="flex flex-col h-full bg-zinc-950 text-white border-r border-zinc-900">
            <div className="p-6 border-b border-zinc-900">
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-md bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                        <Car className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xl font-bold tracking-tight text-white">AutoSPF<span className="text-orange-500">+</span></span>
                </div>
                <div className="mt-6 flex items-center gap-3 p-3 rounded-md bg-zinc-900 border border-zinc-800">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-300 font-bold border-2 border-zinc-700">
                        {user?.name?.[0] || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-zinc-200">{user?.name || 'User'}</p>
                        <p className="text-xs text-zinc-500 truncate">Gold Member</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => {
                                setActiveTab(item.id as TabType);
                                setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-all duration-200 group relative overflow-hidden ${isActive
                                ? 'bg-zinc-900 text-white shadow-inner border border-zinc-800'
                                : 'text-zinc-500 hover:text-white hover:bg-zinc-900/50'
                                }`}
                        >
                            <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-orange-400' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                            {item.label}
                            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-orange-500 rounded-r-full" />}
                        </button>
                    );
                })}
            </div>

            <div className="p-4 border-t border-zinc-900">
                <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-zinc-500 hover:text-red-400 hover:bg-red-500/5 rounded-md transition-colors"
                >
                    <LogOut className="w-5 h-5" />
                    Sign Out
                </button>
            </div>
        </div>
    );
    return (
        <div className="flex h-screen bg-hex-pattern font-sans selection:bg-orange-500/30 selection:text-orange-200">
            {/* Desktop Sidebar */}
            <div className="hidden md:block w-[280px] flex-shrink-0 animate-in slide-in-from-left duration-300">
                <SidebarContent />
            </div>

            {/* Mobile Sidebar (Sheet) */}
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                <SheetContent side="left" className="p-0 w-[280px] bg-slate-900 border-r-slate-800">
                    <SidebarContent />
                </SheetContent>
            </Sheet>

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                {/* Mobile Header */}
                <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(true)}>
                            <Menu className="w-6 h-6 text-slate-700" />
                        </Button>
                        <span className="font-bold text-lg text-white">AutoSPF+</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-xs font-bold border border-amber-100 flex items-center gap-1">
                            <Trophy className="w-3 h-3" />
                            {userPoints.toLocaleString()}
                        </div>
                    </div>
                </div>

                {/* Dashboard Area */}
                <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 scroll-smooth">
                    {/* Header Section */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div>
                            <h1 className="text-3xl font-bold text-white tracking-tight">
                                {navItems.find(i => i.id === activeTab)?.label || 'Dashboard'}
                            </h1>
                            <p className="text-zinc-500 mt-1 flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </p>
                        </div>

                        {/* Quick Stats Widget */}
                        <div className="flex gap-3">
                            <Card className="flex-1 min-w-[140px] bg-white border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                <CardContent className="p-3 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                                        <Calendar className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 font-medium uppercase">Active</p>
                                        <p className="text-lg font-bold text-slate-900">{activeBookings}</p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="flex-1 min-w-[140px] bg-white border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                <CardContent className="p-3 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                                        <Wallet className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 font-medium uppercase">Points</p>
                                        <p className="text-lg font-bold text-slate-900">{userPoints}</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>

                    {/* Content Views */}
                    <div className="animate-in fade-in zoom-in-95 duration-300">
                        {activeTab === 'book' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {services.map((service) => (
                                        <div key={service.id}
                                            onClick={() => {
                                                setSelectedService(service.id);
                                                setIsBookingModalOpen(true);
                                            }}
                                            className="group cursor-pointer bg-zinc-900 rounded-md border border-zinc-800 overflow-hidden hover:border-orange-500/50 hover:shadow-xl hover:shadow-orange-500/10 transition-all duration-300 flex flex-col h-full relative"
                                        >
                                            <div className="h-48 bg-zinc-800 relative overflow-hidden">
                                                {/* Service Image Background */}
                                                <img
                                                    src={
                                                        service.name.toLowerCase().includes('ppf') || service.category.toLowerCase().includes('protection')
                                                            ? "https://images.unsplash.com/photo-1621685805213-3ef24da97072?auto=format&fit=crop&w=800&q=80"
                                                            : service.name.toLowerCase().includes('coating') || service.category.toLowerCase().includes('ceramic')
                                                                ? "https://images.unsplash.com/photo-1601362840469-51e4d8d58785?auto=format&fit=crop&w=800&q=80"
                                                                : "https://images.unsplash.com/photo-1605164661137-7155a64b977f?auto=format&fit=crop&w=800&q=80"
                                                    }
                                                    alt={service.name}
                                                    className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500"
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/40 to-transparent" />
                                                <div className="absolute top-4 left-4 bg-zinc-950/90 backdrop-blur-sm px-3 py-1 rounded-md text-xs font-bold text-white border border-white/10 shadow-sm">
                                                    {service.category}
                                                </div>
                                                <div className="absolute bottom-0 left-0 right-0 p-4">
                                                    <h3 className="text-white font-bold text-lg truncate drop-shadow-md">{service.name}</h3>
                                                </div>
                                            </div>

                                            <div className="p-5 flex-1 flex flex-col">
                                                <div className="flex-1">
                                                    <p className="text-zinc-400 text-sm line-clamp-2 mb-4">{service.description || 'Premium detailing service.'}</p>
                                                    <div className="flex flex-wrap gap-2 mb-4">
                                                        <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 font-normal border-zinc-700">
                                                            <Clock className="w-3 h-3 mr-1" /> {service.duration}
                                                        </Badge>
                                                        <Badge variant="secondary" className="bg-orange-900/30 text-orange-300 font-normal border-orange-500/20">
                                                            <CheckCircle className="w-3 h-3 mr-1" /> Instant Confirm
                                                        </Badge>
                                                    </div>
                                                </div>

                                                <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
                                                    <div>
                                                        <span className="text-2xl font-bold text-white">₱{service.basePrice.toLocaleString()}</span>
                                                        <span className="text-xs text-zinc-500 block">Starting price</span>
                                                    </div>
                                                    <Button className="bg-[#F57C00] hover:bg-[#E65100] shadow-lg shadow-orange-600/20 rounded-md px-6 text-white font-medium">
                                                        Book Now
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'bookings' && (
                            <div className="grid gap-6">
                                {bookings.length === 0 ? (
                                    <div className="text-center py-20 bg-zinc-900/50 rounded-3xl border border-dashed border-zinc-800">
                                        <div className="w-16 h-16 bg-zinc-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <ClipboardList className="w-8 h-8 text-zinc-600" />
                                        </div>
                                        <h3 className="text-xl font-semibold text-white">No bookings yet</h3>
                                        <p className="text-zinc-500 mt-2">Your service history will appear here.</p>
                                        <Button onClick={() => setActiveTab('book')} className="mt-6 bg-[#F57C00] rounded-full text-white hover:bg-[#E65100]">Book First Service</Button>
                                    </div>
                                ) : (
                                    bookings.map((booking) => (
                                        <div key={booking.id} className="bg-zinc-900 rounded-md p-6 border border-zinc-800 shadow-sm hover:border-zinc-700 transition-all">
                                            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-md bg-zinc-800 flex items-center justify-center text-orange-400 font-bold text-lg border border-zinc-700">
                                                        {new Date(booking.date).getDate()}
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-lg text-white">{booking.serviceName}</h3>
                                                        <p className="text-zinc-500 text-sm">{new Date(booking.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} at {booking.time}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    {getStatusBadge(booking.status)}
                                                    <div className="h-4 w-px bg-zinc-800 mx-2" />
                                                    <Button variant="ghost" size="icon" onClick={() => handleEditBooking(booking)}>
                                                        <Edit className="w-4 h-4 text-zinc-600 hover:text-orange-400" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleConfirmCancel(booking)}>
                                                        <Trash2 className="w-4 h-4 text-zinc-600 hover:text-red-400" />
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="bg-zinc-950/50 rounded-md p-4 grid grid-cols-1 md:grid-cols-2 gap-4 border border-zinc-800/50">
                                                <div className="flex items-center gap-3">
                                                    <Car className="w-5 h-5 text-zinc-600" />
                                                    <div>
                                                        <p className="text-xs text-zinc-500 uppercase font-bold">Vehicle</p>
                                                        <p className="text-sm font-medium text-zinc-300">{booking.vehicleInfo || 'N/A'}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <User className="w-5 h-5 text-zinc-600" />
                                                    <div>
                                                        <p className="text-xs text-zinc-500 uppercase font-bold">Detailer</p>
                                                        <p className="text-sm font-medium text-zinc-300">
                                                            {(typeof booking.assignedDetailer === 'object' ? (booking.assignedDetailer as any)?.name : booking.assignedDetailer) || 'Pending Assignment'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {activeTab === 'tracking' && (
                            <div className="max-w-3xl mx-auto">
                                <Card className="border border-zinc-800 shadow-2xl bg-zinc-900 overflow-hidden">
                                    {(() => {
                                        const activeBooking = bookings.find(b => b.status === 'in-progress' || b.status === 'pending');
                                        if (!activeBooking) return (
                                            <div className="p-12 text-center">
                                                <div className="w-20 h-20 bg-zinc-800/50 rounded-full flex items-center justify-center mx-auto mb-6 border border-zinc-700">
                                                    <MapPin className="w-10 h-10 text-zinc-500" />
                                                </div>
                                                <h3 className="text-xl font-bold text-white">No active service</h3>
                                                <p className="text-zinc-400 mt-2 mb-8">Ready to give your car some love?</p>
                                                <Button onClick={() => setActiveTab('book')} size="lg" className="rounded-md bg-[#F57C00] hover:bg-[#E65100] text-white">Start Booking</Button>
                                            </div>
                                        );

                                        const steps = [
                                            { title: 'Booking Confirmed', desc: 'Request received', done: true },
                                            { title: 'Detailer Assigned', desc: 'Expert matched', done: !!activeBooking.assignedDetailer },
                                            { title: 'In Progress', desc: 'Service started', done: activeBooking.status === 'in-progress' },
                                            { title: 'Final Inspection', desc: 'Quality control', done: false },
                                            { title: 'Ready', desc: 'Service completed', done: activeBooking.status === 'completed' }
                                        ];
                                        const currentStep = activeBooking.status === 'completed' ? 4 : activeBooking.status === 'in-progress' ? 2 : activeBooking.assignedDetailer ? 1 : 0;

                                        return (
                                            <div>
                                                <div className="bg-[#F57C00] p-8 text-white relative overflow-hidden">
                                                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl" />
                                                    <div className="relative z-10 flex justify-between items-start">
                                                        <div>
                                                            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-1 rounded-md text-xs font-bold mb-4 border border-white/20">
                                                                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                                                                LIVE UPDATE
                                                            </div>
                                                            <h2 className="text-2xl font-bold">{activeBooking.serviceName}</h2>
                                                            <p className="text-orange-100 mt-1">{activeBooking.vehicleInfo}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-xs text-orange-200 uppercase font-bold text-right tracking-wider mb-1">Estimated Time</p>
                                                            <p className="text-3xl font-bold">~1h 30m</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="p-8 bg-zinc-900">
                                                    <div className="space-y-8 relative pl-4 border-l-2 border-zinc-800 ml-4">
                                                        {steps.map((step, idx) => (
                                                            <div key={idx} className="relative pl-8">
                                                                <div className={`absolute -left-[37px] top-0 w-5 h-5 rounded-full border-4 transition-all duration-500 ${idx <= currentStep ? 'bg-zinc-900 border-orange-500 scale-110' : 'bg-zinc-800 border-zinc-600'
                                                                    }`} />
                                                                <h4 className={`font-bold transition-colors ${idx <= currentStep ? 'text-white' : 'text-zinc-600'}`}>{step.title}</h4>
                                                                <p className="text-sm text-zinc-500">{step.desc}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </Card>
                            </div>
                        )}

                        {activeTab === 'vehicles' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                <div onClick={() => setShowVehicleModal(true)} className="group cursor-pointer min-h-[200px] border-2 border-dashed border-zinc-800 rounded-md flex flex-col items-center justify-center text-zinc-500 hover:text-orange-400 hover:border-orange-500/50 hover:bg-zinc-900/50 transition-all">
                                    <div className="w-12 h-12 rounded-full bg-zinc-800 group-hover:bg-orange-900/20 flex items-center justify-center mb-3 transition-colors">
                                        <Plus className="w-6 h-6" />
                                    </div>
                                    <span className="font-semibold">Add New Vehicle</span>
                                </div>
                                {vehicles.map((vehicle) => (
                                    <div key={vehicle.id} className="relative group bg-zinc-900 p-6 rounded-md shadow-sm border border-zinc-800 hover:border-zinc-700 transition-all">
                                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleEditVehicle(vehicle); }}>
                                                <Edit className="w-4 h-4 text-zinc-500 hover:text-orange-400" />
                                            </Button>
                                        </div>
                                        <div className="w-14 h-14 bg-zinc-800 rounded-md flex items-center justify-center mb-4 text-zinc-400">
                                            <Car className="w-7 h-7" />
                                        </div>
                                        <h3 className="font-bold text-lg text-white">{vehicle.year} {vehicle.make} {vehicle.model}</h3>
                                        <p className="text-zinc-500 text-sm mb-4">{vehicle.color}</p>
                                        <div className="inline-block bg-zinc-800 text-zinc-300 text-xs font-mono px-3 py-1 rounded">
                                            {vehicle.plateNumber}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {activeTab === 'rewards' && (
                            <div className="space-y-8">
                                <div className="bg-gradient-to-r from-amber-600 to-orange-700 rounded-3xl p-8 md:p-12 text-white relative overflow-hidden shadow-xl border border-amber-500/20">
                                    <div className="relative z-10 max-w-lg">
                                        <h2 className="text-3xl md:text-5xl font-bold mb-4">Elite Rewards</h2>
                                        <p className="text-amber-100 text-lg mb-8">Unlock exclusive benefits and premium services with your loyalty points.</p>
                                        <div className="inline-flex items-center gap-4 bg-black/20 backdrop-blur-md px-6 py-3 rounded-md border border-white/10">
                                            <Trophy className="w-8 h-8 text-amber-400" />
                                            <div>
                                                <p className="text-xs text-amber-200 uppercase font-bold tracking-wider">Current Balance</p>
                                                <p className="text-3xl font-bold text-white">{userPoints.toLocaleString()}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {[
                                        { title: '15% Off Service', cost: 500, type: 'Discount' },
                                        { title: 'Free Express Wash', cost: 300, type: 'Service' },
                                        { title: 'Ceramic Booster', cost: 1200, type: 'Upgrade' }
                                    ].map((reward, i) => (
                                        <div key={i} className="bg-zinc-900 p-6 rounded-md border border-zinc-800 hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10 transition-all group">
                                            <div className="flex justify-between items-start mb-4">
                                                <Badge variant="outline" className="bg-zinc-800 text-zinc-300 border-zinc-700">{reward.type}</Badge>
                                                <span className="font-bold text-amber-500">{reward.cost} pts</span>
                                            </div>
                                            <h3 className="font-bold text-lg text-white mb-2">{reward.title}</h3>
                                            <Button onClick={() => handleRedeemReward(reward.cost, reward.title)} variant="outline" className="w-full mt-4 bg-transparent border-zinc-700 text-zinc-300 hover:bg-amber-600 hover:text-white hover:border-amber-600 transition-colors">Redeem</Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'profile' && (
                            <div className="max-w-2xl mx-auto space-y-8">
                                <Card className="bg-zinc-900 border-zinc-800">
                                    <CardHeader>
                                        <CardTitle className="text-white">Personal Information</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-zinc-400">Full Name</Label>
                                                <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} className="bg-zinc-950 border-zinc-700 text-white" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-zinc-400">Email</Label>
                                                <Input value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} className="bg-zinc-950 border-zinc-700 text-white" />
                                            </div>
                                        </div>
                                        <Button onClick={handleUpdateProfile} className="bg-[#F57C00] hover:bg-[#E65100] text-white">Save Changes</Button>
                                    </CardContent>
                                </Card>

                                <Card className="bg-zinc-900 border-zinc-800">
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2 text-white">
                                            <ShieldCheck className="w-5 h-5 text-orange-500" />
                                            Security
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="space-y-2">
                                            <Label className="text-zinc-400">Current Password</Label>
                                            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="bg-zinc-950 border-zinc-700 text-white" />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-zinc-400">New Password</Label>
                                                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="bg-zinc-950 border-zinc-700 text-white" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-zinc-400">Confirm Password</Label>
                                                <Input type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} className="bg-zinc-950 border-zinc-700 text-white" />
                                            </div>
                                        </div>
                                        <Button onClick={handleChangePassword} variant="outline" disabled={isLoading} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">
                                            Update Password
                                        </Button>
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        {/* Placeholder for AR and Membership to avoid cluttering this example - implementing simple placeholders for logic completeness */}
                        {activeTab === 'membership' && (
                            <div className="bg-[#9333EA] text-white rounded-3xl p-10 text-center relative overflow-hidden">
                                <div className="relative z-10">
                                    <Crown className="w-16 h-16 mx-auto mb-4 text-purple-200" />
                                    <h2 className="text-3xl font-bold mb-2">Gold Member Status</h2>
                                    <p className="text-purple-100 mb-8 max-w-lg mx-auto">You are enjoying premium benefits including 15% off all services and priority booking.</p>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto">
                                        {['Priority Support', '15% Discount', 'Free Upgrades', 'Birthday Gift'].map((b, i) => (
                                            <div key={i} className="bg-white/10 backdrop-blur-sm p-4 rounded-md text-sm font-medium">{b}</div>
                                        ))}
                                    </div>
                                </div>
                                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[#9333EA] to-[#7928CA]" />
                            </div>
                        )}

                        {activeTab === 'ar_preview' && (
                            <div className="bg-slate-900 rounded-3xl h-[500px] flex flex-col items-center justify-center text-center p-8 relative overflow-hidden">
                                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1617788138017-80ad40651399?q=80&w=2070')] bg-cover bg-center opacity-40" />
                                <div className="relative z-10 max-w-md">
                                    <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-6">
                                        <Camera className="w-8 h-8 text-white" />
                                    </div>
                                    <h2 className="text-2xl font-bold text-white mb-2">AR Visualizer</h2>
                                    <p className="text-slate-300 mb-8">See how our coatings look on your car before you buy.</p>
                                    <Button className="bg-green-500 hover:bg-green-600 text-white rounded-full px-8 py-6 text-lg">Launch Camera</Button>
                                </div>
                            </div>
                        )}

                        {activeTab === 'referrals' && (
                            <div className="text-center py-20 bg-gradient-to-br from-zinc-900 to-indigo-900/20 rounded-3xl border border-zinc-800">
                                <Gift className="w-16 h-16 text-orange-500 mx-auto mb-4" />
                                <h2 className="text-2xl font-bold text-white mb-2">Invite & Earn</h2>
                                <p className="text-zinc-400 mb-8">Share the love. Get 500 points for every friend who books.</p>
                                <div className="bg-zinc-950 inline-flex items-center gap-2 p-2 rounded-md border border-zinc-800 shadow-sm">
                                    <code className="px-4 py-2 bg-zinc-900 rounded-lg text-zinc-300 font-mono border border-zinc-800">autospf.com/ref/u8821</code>
                                    <Button size="sm" className="bg-[#F57C00] hover:bg-[#E65100] text-white">Copy Link</Button>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* Modals */}
            <Dialog open={isBookingModalOpen} onOpenChange={setIsBookingModalOpen}>
                <DialogContent className="bg-[#121214] border-[#27272a]">
                    <DialogHeader> <DialogTitle className="text-[#f4f4f5]">Complete Booking</DialogTitle> </DialogHeader>
                    <div className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Label className="text-[#f4f4f5]">Vehicle</Label>
                            <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                                <SelectTrigger className="bg-[#09090b] border-zinc-700 text-[#f4f4f5] focus:border-[#F57C00] focus:ring-[#F57C00]/20"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                                <SelectContent className="bg-[#121214] border-[#27272a]">{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.year} {v.make} {v.model}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label className="text-[#f4f4f5]">Date</Label><Input type="date" value={bookingDate} onChange={e => setBookingDate(e.target.value)} min={new Date().toISOString().split('T')[0]} className="bg-[#09090b] border-zinc-700 text-[#f4f4f5] focus:border-[#F57C00] focus:ring-[#F57C00]/20" /></div>
                            <div className="space-y-2">
                                <Label className="text-[#f4f4f5]">Time</Label>
                                <Select value={bookingTime} onValueChange={setBookingTime}>
                                    <SelectTrigger className="bg-[#09090b] border-zinc-700 text-[#f4f4f5] focus:border-[#F57C00] focus:ring-[#F57C00]/20"><SelectValue placeholder="Time" /></SelectTrigger>
                                    <SelectContent className="bg-[#121214] border-[#27272a]">{['08:00 AM', '09:00 AM', '10:00 AM', '01:00 PM', '02:00 PM', '03:00 PM'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2"><Label className="text-[#f4f4f5]">Notes</Label><Textarea value={bookingNotes} onChange={e => setBookingNotes(e.target.value)} placeholder="Special requests..." className="bg-[#09090b] border-zinc-700 text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20" /></div>
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                            <Button onClick={handleBookService} className="w-full bg-[#F57C00] hover:bg-[#E65100] text-white">Confirm Booking</Button>
                        </motion.div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={showVehicleModal} onOpenChange={setShowVehicleModal}>
                <DialogContent className="bg-[#121214] border-[#27272a]">
                    <DialogHeader><DialogTitle className="text-[#f4f4f5]">{isEditingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}</DialogTitle></DialogHeader>
                    <div className="space-y-4 pt-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label className="text-[#f4f4f5]">Year</Label><Input value={vehicleYear} onChange={e => setVehicleYear(e.target.value)} placeholder="2024" className="bg-[#09090b] border-zinc-700 text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20" /></div>
                            <div className="space-y-2"><Label className="text-[#f4f4f5]">Make</Label><Input value={vehicleMake} onChange={e => setVehicleMake(e.target.value)} placeholder="Toyota" className="bg-[#09090b] border-zinc-700 text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20" /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label className="text-[#f4f4f5]">Model</Label><Input value={vehicleModel} onChange={e => setVehicleModel(e.target.value)} placeholder="Camry" className="bg-[#09090b] border-zinc-700 text-[##f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20" /></div>
                            <div className="space-y-2"><Label className="text-[#f4f4f5]">Color</Label><Input value={vehicleColor} onChange={e => setVehicleColor(e.target.value)} placeholder="Black" className="bg-[#09090b] border-zinc-700 text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20" /></div>
                        </div>
                        <div className="space-y-2"><Label className="text-[#f4f4f5]">Plate Number</Label><Input value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value)} placeholder="ABC 1234" className="bg-[#09090b] border-zinc-700 text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20" /></div>
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                            <Button onClick={isEditingVehicle ? handleUpdateVehicle : handleAddVehicle} className="w-full bg-[#F57C00] hover:bg-[#E65100] text-white" disabled={isLoading}>
                                {isEditingVehicle ? 'Update Vehicle' : 'Add Vehicle'}
                            </Button>
                        </motion.div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="bg-[#121214] border-[#27272a]">
                    <DialogHeader><DialogTitle className="text-[#f4f4f5]">Edit Booking</DialogTitle></DialogHeader>
                    <div className="space-y-4 pt-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label className="text-[#f4f4f5]">Date</Label><Input type="date" value={bookingDate} onChange={e => setBookingDate(e.target.value)} min={new Date().toISOString().split('T')[0]} className="bg-[#09090b] border-zinc-700 text-[#f4f4f5] focus:border-[#F57C00] focus:ring-[#F57C00]/20" /></div>
                            <div className="space-y-2">
                                <Label className="text-[#f4f4f5]">Time</Label>
                                <Select value={bookingTime} onValueChange={setBookingTime}>
                                    <SelectTrigger className="bg-[#09090b] border-zinc-700 text-[#f4f4f5] focus:border-[#F57C00] focus:ring-[#F57C00]/20"><SelectValue placeholder="Time" /></SelectTrigger>
                                    <SelectContent className="bg-[#121214] border-[#27272a]">{['08:00 AM', '09:00 AM', '10:00 AM', '01:00 PM', '02:00 PM', '03:00 PM'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2"><Label className="text-[#f4f4f5]">Notes</Label><Textarea value={bookingNotes} onChange={e => setBookingNotes(e.target.value)} className="bg-[#09090b] border-zinc-700 text-[#f4f4f5] placeholder:text-[#a1a1aa] focus:border-[#F57C00] focus:ring-[#F57C00]/20" /></div>
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                            <Button onClick={handleUpdateBooking} className="w-full bg-[#F57C00] hover:bg-[#E65100] text-white" disabled={isLoading}>Save Changes</Button>
                        </motion.div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}