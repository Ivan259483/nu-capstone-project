import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { serviceStorage } from '@/lib/storage';
import type { Service, Appointment } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { CalendarIcon, ClockIcon, DollarSignIcon, LogOutIcon, UserIcon } from 'lucide-react';

export default function CustomerDashboard() {
    const { user, logout } = useAuth();
    const [services, setServices] = useState<Service[]>([]);
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    const [selectedService, setSelectedService] = useState<Service | null>(null);
    const [appointments, setAppointments] = useState<Appointment[]>([]);

    useEffect(() => {
        loadServices();
        loadAppointments();
    }, []);

    const loadServices = async () => {
        const data = await serviceStorage.getAll();
        setServices(data);
    };

    const loadAppointments = () => {
        // Mock appointments for demo
        setAppointments([
            {
                id: '1',
                service: 'Full Detail',
                date: new Date(2024, 2, 15).toISOString(),
                time: '10:00 AM',
                status: 'confirmed',
                price: 199.99
            },
            {
                id: '2',
                service: 'Ceramic Coating Application',
                date: new Date(2024, 1, 28).toISOString(),
                time: '2:00 PM',
                status: 'completed',
                price: 499.99
            }
        ]);
    };

    const handleBookService = () => {
        if (selectedService && selectedDate) {
            // In a real app, this would save to backend
            alert(`Booking ${selectedService.name} for ${selectedDate.toLocaleDateString()}`);
        }
    };

    const getStatusColor = (status: Appointment['status']) => {
        switch (status) {
            case 'confirmed': return 'bg-blue-500';
            case 'completed': return 'bg-green-500';
            case 'cancelled': return 'bg-red-500';
            default: return 'bg-gray-500';
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <Avatar>
                                <AvatarFallback>
                                    {user?.name?.split(' ').map((n: string) => n[0]).join('') || 'U'}
                                </AvatarFallback>
                            </Avatar>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.name}</h1>
                                <p className="text-sm text-gray-500">Manage your appointments and services</p>
                            </div>
                        </div>
                        <Button variant="outline" onClick={logout}>
                            <LogOutIcon className="w-4 h-4 mr-2" />
                            Logout
                        </Button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <Tabs defaultValue="book" className="space-y-6">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="book">Book Service</TabsTrigger>
                        <TabsTrigger value="appointments">My Appointments</TabsTrigger>
                        <TabsTrigger value="profile">Profile</TabsTrigger>
                    </TabsList>

                    {/* Book Service Tab */}
                    <TabsContent value="book" className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            {/* Services List */}
                            <div className="space-y-4">
                                <h2 className="text-xl font-semibold">Available Services</h2>
                                {services.map((service) => (
                                    <Card
                                        key={service.id}
                                        className={`cursor-pointer transition-all ${selectedService?.id === service.id ? 'ring-2 ring-blue-500' : ''
                                            }`}
                                        onClick={() => setSelectedService(service)}
                                    >
                                        <CardHeader>
                                            <CardTitle>{service.name}</CardTitle>
                                            <CardDescription>{service.description}</CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center space-x-4">
                                                    <div className="flex items-center text-sm text-gray-600">
                                                        <ClockIcon className="w-4 h-4 mr-1" />
                                                        {service.duration} min
                                                    </div>
                                                    <div className="flex items-center text-sm text-gray-600">
                                                        <DollarSignIcon className="w-4 h-4 mr-1" />
                                                        ${service.price}
                                                    </div>
                                                </div>
                                                {selectedService?.id === service.id && (
                                                    <Badge>Selected</Badge>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>

                            {/* Calendar & Booking */}
                            <div className="space-y-4">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Select Date</CardTitle>
                                        <CardDescription>Choose your preferred appointment date</CardDescription>
                                    </CardHeader>
                                    <CardContent className="flex justify-center">
                                        <Calendar
                                            mode="single"
                                            selected={selectedDate}
                                            onSelect={setSelectedDate}
                                            disabled={(date) => date < new Date()}
                                            className="rounded-md border"
                                        />
                                    </CardContent>
                                </Card>

                                {selectedService && selectedDate && (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Booking Summary</CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div>
                                                <p className="text-sm text-gray-600">Service</p>
                                                <p className="font-semibold">{selectedService.name}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-600">Date</p>
                                                <p className="font-semibold">{selectedDate.toLocaleDateString()}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-600">Duration</p>
                                                <p className="font-semibold">{selectedService.duration} minutes</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-600">Price</p>
                                                <p className="font-semibold text-lg">${selectedService.price}</p>
                                            </div>
                                            <Button className="w-full" onClick={handleBookService}>
                                                Confirm Booking
                                            </Button>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        </div>
                    </TabsContent>

                    {/* Appointments Tab */}
                    <TabsContent value="appointments" className="space-y-4">
                        <h2 className="text-xl font-semibold">Your Appointments</h2>
                        {appointments.length === 0 ? (
                            <Card>
                                <CardContent className="py-12 text-center">
                                    <CalendarIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                                    <p className="text-gray-600">No appointments yet</p>
                                    <p className="text-sm text-gray-500 mt-2">Book your first service to get started</p>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="grid gap-4">
                                {appointments.map((appointment) => (
                                    <Card key={appointment.id}>
                                        <CardContent className="py-6">
                                            <div className="flex items-center justify-between">
                                                <div className="space-y-2">
                                                    <div className="flex items-center space-x-2">
                                                        <h3 className="font-semibold text-lg">{appointment.service}</h3>
                                                        <Badge className={getStatusColor(appointment.status)}>
                                                            {appointment.status}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                                                        <div className="flex items-center">
                                                            <CalendarIcon className="w-4 h-4 mr-1" />
                                                            {new Date(appointment.date).toLocaleDateString()}
                                                        </div>
                                                        <div className="flex items-center">
                                                            <ClockIcon className="w-4 h-4 mr-1" />
                                                            {appointment.time}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-2xl font-bold">${appointment.price}</p>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </TabsContent>

                    {/* Profile Tab */}
                    <TabsContent value="profile" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Profile Information</CardTitle>
                                <CardDescription>Manage your account details</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Name</label>
                                    <p className="mt-1 text-lg">{user?.name}</p>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Email</label>
                                    <p className="mt-1 text-lg">{user?.email}</p>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Account Type</label>
                                    <p className="mt-1">
                                        <Badge variant="outline">{user?.role}</Badge>
                                    </p>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Member Since</label>
                                    <p className="mt-1">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</p>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}