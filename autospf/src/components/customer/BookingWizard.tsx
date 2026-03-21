import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar,
    Clock,
    Car,
    CheckCircle,
    ChevronRight,
    ChevronLeft,
    CreditCard,
    Info,
    X,
    Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { OrderService } from '@/lib/order-service';
import type { Service, Vehicle, User } from '@/types';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

// Copied from original file
const SERVICE_IMAGE_MAP: Record<string, string> = {
    'body wash': 'https://img.freepik.com/free-photo/beautiful-car-washing-service_23-2149212221.jpg?semt=ais_hybrid&w=740&q=100',
    'full detailing': 'https://surfnshine.com/wp-content/uploads/2023/10/car-exterior-detailing-1024x576.jpg?q=100',
    'interior cleaning': 'https://blogs.gomechanic.com/wp-content/uploads/2025/08/Insider-_-3.jpg?q=100',
    'wax & polish': 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?q=100&auto=format&fit=crop&w=800',
    'engine cleaning': 'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?q=100&auto=format&fit=crop&w=800',
    'clothing': 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?q=100&auto=format&fit=crop&w=800',
    'diamond paint correction': 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?q=100&auto=format&fit=crop&w=800',
    'ceramic shield pro': 'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?q=100&auto=format&fit=crop&w=1200',
    'graphene gloss package': 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=100&auto=format&fit=crop&w=800',
    'headlight restoration pro': 'https://images.unsplash.com/photo-1542282088-fe8426682b8f?q=100&auto=format&fit=crop&w=1200',
    'ozone odor removal': 'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?q=100&auto=format&fit=crop&w=1200',
    'engine bay shield': 'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?q=100&auto=format&fit=crop&w=800',
    'wheel & caliper spa': 'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?q=100&auto=format&fit=crop&w=1200',
    'trim & chrome revival': 'https://images.unsplash.com/photo-1493238792000-8113da705763?q=100&auto=format&fit=crop&w=1200',
    'rain-repel glass coat': 'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?q=100&auto=format&fit=crop&w=1200',
    'odorlock cabin detox': 'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?q=100&auto=format&fit=crop&w=1200',
    fallback: 'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=800&q=100',
};

const getServiceImage = (service: Service) => {
    const lower = service.name.toLowerCase();
    return SERVICE_IMAGE_MAP[lower] || (service as any).image || SERVICE_IMAGE_MAP.fallback;
};

interface BookingWizardProps {
    services: Service[];
    vehicles: Vehicle[];
    user: User | null;
    onClose: () => void;
    onSuccess: () => void;
    onAddVehicle: () => void;
}

export const BookingWizard: React.FC<BookingWizardProps> = ({ services, vehicles, user, onClose, onSuccess, onAddVehicle }) => {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [selectedService, setSelectedService] = useState<Service | null>(null);
    const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [phone, setPhone] = useState(user?.phone || '');
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bookedSlots, setBookedSlots] = useState<string[]>([]);
    const [isLoadingSlots, setIsLoadingSlots] = useState(false);

    // Fetch available slots when date changes
    useEffect(() => {
        if (!date) {
            setBookedSlots([]);
            return;
        }

        const fetchSlots = async () => {
            setIsLoadingSlots(true);
            try {
                const response = await OrderService.getAvailableSlots(date);
                if (response.success && response.bookedSlots) {
                    setBookedSlots(response.bookedSlots);
                    // If currently selected time is now booked, clear it
                    if (time && response.bookedSlots.includes(time)) {
                        setTime('');
                        toast.error('The selected time slot is no longer available.', { id: 'slot-taken' });
                    }
                }
            } catch (error) {
                console.error('Failed to fetch booked slots:', error);
                toast.error('Could not verify time slot availability.', { id: 'slot-error' });
            } finally {
                setIsLoadingSlots(false);
            }
        };

        fetchSlots();
    }, [date]);

    // Filter active services
    const activeServices = services.filter(s => s.status === 'Active');

    const handleNext = () => {
        if (step === 1 && !selectedService) return toast.error("Please select a service");
        if (step === 2 && !selectedVehicleId) return toast.error("Please select a vehicle");
        if (step === 3 && (!date || !time)) return toast.error("Please select date and time");
        setStep(prev => prev + 1);
    };

    const handleBack = () => setStep(prev => prev - 1);

    const handleSubmit = async () => {
        if (!user) {
            toast.error("You must be logged in to book a service");
            return;
        }
        if (!phone) {
            toast.error("Please provide a phone number for the booking.");
            return;
        }
        if (!selectedService) {
            toast.error("Please select a service");
            return;
        }

        // Placeholder for a validation function, if needed.
        // If validateBooking() returns true, it means there's an error and we should stop.
        const validateBooking = () => {
            // Add any additional validation logic here
            return false; // No errors
        };

        if (validateBooking()) {
            return;
        }

        console.log('Booking Started');

        setIsSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('customer', user.id);
            formData.append('customerName', user.name || user.displayName || 'Guest User');
            formData.append('vehicle', selectedVehicleId); // ID for relationship

            // We also send the manual vehicle details in case it's a guest or custom entry
            const vData = vehicles.find(v => v._id === selectedVehicleId || v.id === selectedVehicleId);
            if (vData) {
                formData.append('vehicleYear', vData.year?.toString() || '');
                formData.append('vehicleMake', vData.make || '');
                formData.append('vehicleModel', vData.model || '');
                formData.append('vehicleColor', vData.color || '');
                formData.append('vehiclePlate', vData.plateNumber || '');
            }

            formData.append('service', selectedService.id || ''); // Explicit reference
            formData.append('serviceType', selectedService.name || '');
            formData.append('serviceName', selectedService.name || '');
            formData.append('price', selectedService.basePrice?.toString() || '0');
            formData.append('totalPrice', selectedService.basePrice?.toString() || '0');
            formData.append('bookingDate', date);
            formData.append('bookingTime', time);
            formData.append('shippingAddress', 'In-Store Service');
            formData.append('notes', notes);

            // Important for the new generic Order flow
            formData.append('items', JSON.stringify([{
                product: selectedService.id,
                quantity: 1,
                price: selectedService.basePrice || 0
            }]));

            const response = await OrderService.createOrder(formData);

            console.log('✅ Booking Success:', response);
            toast.success("Booking confirmed! Redirecting...");

            onSuccess();
            onClose();
            navigate('/customer/dashboard');

        } catch (error: any) {
            console.error("❌ Error submitting booking:", error);
            const message = error.response?.data?.message || error.message || "An error occurred while booking";
            toast.error(message);
        } finally {
            setIsSubmitting(false);
        }
    };


    // --- STEP 1: SERVICE SELECTION ---
    if (step === 1) {
        return (
            <div className="h-full flex flex-col">
                <div className="flex-1 overflow-y-auto p-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
                        {activeServices.map((service, index) => (
                            <div
                                key={service._id || service.id || index}
                                onClick={() => setSelectedService(service)}
                                className={`cursor-pointer group relative overflow-hidden rounded-xl border-2 transition-all duration-300 ${selectedService?.id === service.id
                                    ? 'border-indigo-500 bg-zinc-900 shadow-[0_0_20px_rgba(99,102,241,0.3)] scale-[1.02]'
                                    : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-800 hover:scale-[1.01]'
                                    }`}
                            >
                                <div className="aspect-[16/9] relative">
                                    <img
                                        src={getServiceImage(service)}
                                        alt={service.name}
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                    />
                                    {/* Overlay */}
                                    <div className={`absolute inset-0 transition-opacity duration-300 ${selectedService?.id === service.id
                                        ? 'bg-indigo-900/20'
                                        : 'bg-gradient-to-t from-black/90 to-transparent'
                                        }`} />

                                    <div className="absolute bottom-3 left-3 right-3">
                                        <h3 className="font-bold text-white text-lg leading-tight drop-shadow-md">{service.name}</h3>
                                        <p className="text-indigo-400 font-semibold mt-1 drop-shadow-md">{formatCurrency(service.basePrice)}</p>
                                    </div>

                                    {/* Selection Indicator */}
                                    <div className={`absolute top-3 right-3 transition-all duration-300 ${selectedService?.id === service.id
                                        ? 'opacity-100 scale-100'
                                        : 'opacity-0 scale-75'
                                        }`}>
                                        <div className="bg-indigo-600 text-white p-2 rounded-full shadow-lg shadow-indigo-600/40 transform transition-transform duration-300">
                                            <Check className="w-5 h-5 stroke-[3]" />
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 relative">
                                    {/* Active State Glow Overlay in Content */}
                                    {selectedService?.id === service.id && (
                                        <div className="absolute inset-0 bg-indigo-500/5 pointer-events-none" />
                                    )}
                                    <p className="text-sm text-zinc-400 line-clamp-2 relative z-10">{service.description}</p>
                                    <div className="flex items-center gap-2 mt-3 text-xs text-zinc-500 relative z-10">
                                        <Clock className="w-3.5 h-3.5" />
                                        <span>{service.duration}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="pt-4 border-t border-zinc-800 flex justify-end gap-2 shrink-0">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleNext} disabled={!selectedService} className="bg-indigo-600 text-white hover:bg-indigo-700">
                        Select Vehicle <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                </div>
            </div>
        );
    }

    // --- STEP 2: VEHICLE SELECTION ---
    if (step === 2) {
        return (
            <div className="h-full flex flex-col">
                <div className="flex-1 overflow-y-auto p-1 space-y-6">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-white">Select a Vehicle</h2>
                            {vehicles.length > 0 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onAddVehicle}
                                    className="border-indigo-500/50 text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300"
                                >
                                    <Car className="w-4 h-4 mr-2" />
                                    Add Vehicle
                                </Button>
                            )}
                        </div>
                        {vehicles.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {vehicles.map((vehicle, index) => (
                                    <div
                                        key={vehicle._id || vehicle.id || index}
                                        onClick={() => setSelectedVehicleId(vehicle.id)}
                                        className={`cursor-pointer p-4 rounded-xl border-2 transition-all duration-300 ${selectedVehicleId === vehicle.id
                                            ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                                            : 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-600'
                                            }`}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                                                    <Car className="w-5 h-5 text-white" />
                                                </div>
                                                <div>
                                                    <h3 className="font-semibold text-white">{vehicle.year} {vehicle.make} {vehicle.model}</h3>
                                                    <p className="text-sm text-zinc-500">{vehicle.plateNumber}</p>
                                                </div>
                                            </div>
                                            {selectedVehicleId === vehicle.id && (
                                                <div className="bg-indigo-600 rounded-full p-1">
                                                    <Check className="w-4 h-4 text-white stroke-[3]" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl">
                                <Car className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                                <h3 className="text-lg font-medium text-white">No vehicles found</h3>
                                <p className="text-zinc-500 mb-4">Please add a vehicle to your profile first.</p>
                                <Button
                                    variant="outline"
                                    onClick={onAddVehicle}
                                    className="border-indigo-500 text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300"
                                >
                                    <Car className="w-4 h-4 mr-2" />
                                    Add Vehicle
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
                <div className="pt-4 border-t border-zinc-800 flex justify-between shrink-0">
                    <Button variant="ghost" onClick={handleBack}><ChevronLeft className="w-4 h-4 mr-2" /> Back</Button>
                    <Button onClick={handleNext} disabled={!selectedVehicleId} className="bg-indigo-600 text-white hover:bg-indigo-700">
                        Schedule <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                </div>
            </div>
        );
    }

    // --- STEP 3: SCHEUDLING ---
    if (step === 3) {
        return (
            <div className="h-full flex flex-col">
                <div className="flex-1 overflow-y-auto p-1 space-y-6">
                    <div className="space-y-4">
                        <Label htmlFor="date" className="text-white">Select Date</Label>
                        <Input
                            id="date"
                            name="date"
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="bg-zinc-900 border-zinc-700 text-white focus:ring-indigo-500"
                            min={new Date().toISOString().split('T')[0]}
                        />
                    </div>
                    <div className="space-y-4">
                        <Label htmlFor="time" className="text-white">Select Time</Label>
                        <Select value={time} onValueChange={setTime} name="time" disabled={isLoadingSlots || !date}>
                            <SelectTrigger id="time" className="bg-zinc-900 border-zinc-700 text-white focus:ring-indigo-500">
                                <SelectValue placeholder={isLoadingSlots ? "Loading availability..." : (date ? "Select time slot" : "Select a date first")} />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                                {['09:00 AM', '10:00 AM', '11:00 AM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM'].map(t => {
                                    const isBooked = bookedSlots.includes(t);
                                    return (
                                        <SelectItem 
                                            key={t} 
                                            value={t} 
                                            disabled={isBooked}
                                            className={isBooked ? "opacity-50 text-zinc-500" : ""}
                                        >
                                            {t} {isBooked && "(Booked)"}
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-4">
                        <Label htmlFor="phone" className="text-white">Phone Number</Label>
                        <Input
                            id="phone"
                            name="phone"
                            type="tel"
                            placeholder="e.g. 09123456789"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="bg-zinc-900 border-zinc-700 text-white focus:ring-indigo-500"
                        />
                    </div>
                    <div className="space-y-4">
                        <Label htmlFor="notes" className="text-white">Special Instructions (Optional)</Label>
                        <Textarea
                            id="notes"
                            name="notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Gate code, specific focus areas, etc."
                            className="bg-zinc-900 border-zinc-700 text-white min-h-[100px] focus:ring-indigo-500"
                        />
                    </div>
                </div>
                <div className="pt-4 border-t border-zinc-800 flex justify-between shrink-0">
                    <Button variant="ghost" onClick={handleBack}><ChevronLeft className="w-4 h-4 mr-2" /> Back</Button>
                    <Button onClick={handleNext} disabled={!date || !time} className="bg-indigo-600 text-white hover:bg-indigo-700">
                        Review <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                </div>
            </div>
        );
    }

    // --- STEP 4: REVIEW ---
    if (step === 4) {
        return (
            <div className="h-full flex flex-col">
                <div className="flex-1 overflow-y-auto p-1 space-y-6">
                    <div className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800 space-y-4">
                        <div className="flex justify-between items-start border-b border-zinc-800 pb-4">
                            <div>
                                <p className="text-sm text-zinc-500">Service</p>
                                <h3 className="font-bold text-white text-lg">{selectedService?.name}</h3>
                                <p className="text-sm text-zinc-400">{selectedService?.duration}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-zinc-500">Price</p>
                                <p className="font-bold text-indigo-400 text-xl">{formatCurrency(selectedService?.basePrice || 0)}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-zinc-500">Vehicle</p>
                                <p className="font-medium text-white">
                                    {vehicles.find(v => v.id === selectedVehicleId)?.make} {vehicles.find(v => v.id === selectedVehicleId)?.model}
                                </p>
                                <p className="text-sm text-zinc-400">{vehicles.find(v => v.id === selectedVehicleId)?.plateNumber}</p>
                            </div>
                            <div>
                                <p className="text-sm text-zinc-500">Date & Time</p>
                                <p className="font-medium text-white">{new Date(date).toLocaleDateString()}</p>
                                <p className="text-sm text-zinc-400">{time}</p>
                            </div>
                        </div>

                        {notes && (
                            <div>
                                <p className="text-sm text-zinc-500">Notes</p>
                                <p className="text-sm text-zinc-300 bg-zinc-900 p-2 rounded mt-1">{notes}</p>
                            </div>
                        )}
                    </div>

                    <div className="flex items-start gap-3 p-4 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
                        <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-indigo-300">
                            Please review all details before proceeding to payment.
                        </p>
                    </div>
                </div>
                <div className="pt-4 border-t border-zinc-800 flex justify-between shrink-0">
                    <Button variant="ghost" onClick={handleBack} disabled={isSubmitting}>
                        <ChevronLeft className="w-4 h-4 mr-2" /> Back
                    </Button>
                    <Button onClick={handleNext} disabled={isSubmitting} className="bg-indigo-600 text-white hover:bg-indigo-700">
                        Proceed to Payment <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                </div>
            </div>
        );
    }

    // --- STEP 5: BOOKING CONFIRMATION ---
    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 overflow-y-auto p-1 space-y-5">
                {/* Header */}
                <div className="text-center mb-2">
                    <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-3 border border-indigo-500/30">
                        <CheckCircle className="w-8 h-8 text-indigo-400" />
                    </div>
                    <h2 className="text-xl font-bold text-white">Booking Confirmation</h2>
                    <p className="text-zinc-400 text-sm mt-1">Your appointment is almost set. Please review and confirm.</p>
                </div>

                {/* Booking Summary Card */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
                    <div className="flex justify-between items-start border-b border-zinc-800 pb-4">
                        <div>
                            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Service</p>
                            <h3 className="font-bold text-white">{selectedService?.name}</h3>
                            <p className="text-sm text-zinc-400 mt-0.5">{selectedService?.duration}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Date & Time</p>
                            <p className="font-semibold text-white">{new Date(date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                            <p className="text-sm text-zinc-400">{time}</p>
                        </div>
                    </div>

                    {/* Total Amount Row */}
                    <div className="flex items-center justify-between pt-1">
                        <span className="text-zinc-400 font-medium">Total Amount</span>
                        <span className="text-2xl font-extrabold text-white tracking-tight">
                            {formatCurrency(selectedService?.basePrice || 0)}
                        </span>
                    </div>
                </div>

                {/* Info / Policy Box */}
                <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/25 rounded-xl">
                    <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-200/80 leading-relaxed">
                        <span className="font-semibold text-amber-300">Note:</span> To avoid cancellation, please arrive <span className="font-semibold text-amber-300">15 minutes before</span> your scheduled time. Payment will be collected strictly <span className="font-semibold text-amber-300">on-site via Cash or GCash</span>.
                    </p>
                </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-zinc-800 flex items-center justify-between gap-3 shrink-0">
                <Button variant="ghost" onClick={handleBack} disabled={isSubmitting} className="text-zinc-400 hover:text-white">
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="bg-green-600 text-white hover:bg-green-700 flex-1 font-semibold shadow-lg shadow-green-900/30"
                >
                    {isSubmitting ? (
                        <span className="flex items-center gap-2">
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                            Confirming...
                        </span>
                    ) : (
                        <span className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            Confirm Appointment
                        </span>
                    )}
                </Button>
            </div>
        </div>
    );
};
