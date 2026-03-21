import React, { useState } from 'react';
import {
    Calendar,
    MapPin,
    Clock,
    MoreVertical,
    AlertCircle,
    CheckCircle,
    ArrowRight
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from '@/lib/utils';
import type { Booking } from '@/types';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MyBookingsProps {
    bookings: Booking[];
    onCancelBooking: (booking: Booking) => void;
    onRescheduleBooking: (booking: Booking) => void;
    onNavigate: (tab: string) => void;
}

export const MyBookings: React.FC<MyBookingsProps> = ({ bookings, onCancelBooking, onRescheduleBooking, onNavigate }) => {

    const upcomingBookings = bookings.filter(b =>
        ['pending', 'confirmed', 'assigned', 'in-progress', 'processing', 'finishing', 'ready', 'queued', 'paid'].includes(b.status) ||
        (b.status === 'pending' && b.paymentStatus === 'paid')
    ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const pastBookings = bookings.filter(b =>
        ['completed', 'cancelled'].includes(b.status)
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
            case 'queued': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
            case 'paid': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            case 'confirmed': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
            case 'in-progress': return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
            case 'processing': return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
            case 'completed': return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
            case 'cancelled': return 'text-red-400 bg-red-500/10 border-red-500/20';
            default: return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
        }
    };

    const BookingCard = ({ booking }: { booking: Booking }) => (
        <Card className="bg-zinc-900/40 border-zinc-800 mb-4 hover:border-zinc-700 transition-colors group">
            <CardContent className="p-6">
                <div className="flex flex-col md:flex-row justify-between gap-6">
                    <div className="flex gap-4">
                        <div className="w-16 h-16 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-700">
                            <Calendar className="w-7 h-7 text-zinc-400 group-hover:text-white transition-colors" />
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                <h3 className="text-lg font-semibold text-white">{booking.serviceName}</h3>
                                <Badge variant="outline" className={`${getStatusColor(booking.status)} capitalize`}>
                                    {booking.status === 'pending' ? 'Awaiting Admin Approval' : booking.status}
                                </Badge>
                            </div>
                            <div className="space-y-1.5 text-sm text-zinc-400">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-zinc-500" />
                                    <span>{new Date(booking.date).toLocaleDateString()} at {booking.time}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-zinc-500" />
                                    <span>{booking.vehicleInfo || 'No vehicle info'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-end justify-between gap-4">
                        <div className="text-right">
                            <div className="text-2xl font-bold text-white tracking-tight">
                                {formatCurrency(booking.totalPrice || booking.totalAmount || 0)}
                            </div>
                            <span className="text-xs text-zinc-500">Total Price</span>
                        </div>

                        {['pending', 'confirmed'].includes(booking.status) && (
                            <div className="flex gap-2">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm" className="bg-transparent border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800">
                                            Manage Booking
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 text-zinc-300">
                                        <DropdownMenuItem onClick={() => onRescheduleBooking(booking)} className="focus:bg-zinc-800 focus:text-white cursor-pointer">
                                            <Clock className="w-4 h-4 mr-2" /> Reschedule
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => onCancelBooking(booking)} className="text-red-400 focus:text-red-300 focus:bg-red-950/20 cursor-pointer">
                                            <AlertCircle className="w-4 h-4 mr-2" /> Cancel Booking
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        )}
                        {booking.status === 'completed' && (
                            <Button variant="ghost" size="sm" className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/20">
                                View Receipt <ArrowRight className="w-4 h-4 ml-1" />
                            </Button>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );

    return (
        <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">My Bookings</h1>
                    <p className="text-zinc-400 mt-1">Manage your upcoming appointments and view history.</p>
                </div>
            </div>

            <Tabs defaultValue="upcoming" className="w-full">
                <TabsList className="bg-zinc-900/50 border border-zinc-800 p-1 w-full md:w-auto grid grid-cols-2 md:inline-flex">
                    <TabsTrigger value="upcoming" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white">
                        Upcoming ({upcomingBookings.length})
                    </TabsTrigger>
                    <TabsTrigger value="history" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white">
                        History ({pastBookings.length})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="upcoming" className="mt-6 space-y-4">
                    {upcomingBookings.length > 0 ? (
                        upcomingBookings.map(booking => (
                            <BookingCard key={booking.id} booking={booking} />
                        ))
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 px-4 bg-zinc-900/20 rounded-xl border border-dashed border-zinc-800">
                            <div className="w-16 h-16 rounded-full bg-zinc-800/50 flex items-center justify-center mb-4">
                                <Calendar className="w-8 h-8 text-zinc-600" />
                            </div>
                            <h3 className="text-xl font-medium text-white mb-2">No upcoming bookings</h3>
                            <p className="text-zinc-500 max-w-sm text-center mb-6">You don't have any scheduled appointments at the moment.</p>
                            <Button
                                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                onClick={() => onNavigate('book')}
                            >
                                Book a Service
                            </Button>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="history" className="mt-6 space-y-4">
                    {pastBookings.length > 0 ? (
                        pastBookings.map(booking => (
                            <BookingCard key={booking.id} booking={booking} />
                        ))
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 px-4 bg-zinc-900/20 rounded-xl border border-dashed border-zinc-800">
                            <div className="w-16 h-16 rounded-full bg-zinc-800/50 flex items-center justify-center mb-4">
                                <Clock className="w-8 h-8 text-zinc-600" />
                            </div>
                            <h3 className="text-xl font-medium text-white mb-2">No past bookings</h3>
                            <p className="text-zinc-500 max-w-sm text-center">Your completed service history will appear here once you've had your first service.</p>
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
};
