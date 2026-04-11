import React, { useState } from 'react';
import {
    Calendar,
    MapPin,
    Clock,
    MoreVertical,
    AlertCircle,
    CheckCircle,
    ArrowRight,
    Shield,
    FileText
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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";

interface MyBookingsProps {
    bookings: Booking[];
    onCancelBooking: (booking: Booking) => void;
    onRescheduleBooking: (booking: Booking) => void;
    onNavigate: (tab: string) => void;
}

export const MyBookings: React.FC<MyBookingsProps> = ({ bookings, onCancelBooking, onRescheduleBooking, onNavigate }) => {
    const [selectedReceipt, setSelectedReceipt] = useState<Booking | null>(null);

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
            case 'assigned': return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
            case 'received': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
            case 'in_progress':
            case 'in-progress': return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
            case 'processing': return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
            case 'completed': return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
            case 'cancelled': return 'text-red-400 bg-red-500/10 border-red-500/20';
            default: return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
        }
    };

    const BookingCard = ({ booking }: { booking: Booking }) => (
        <Card className="glass border border-white/5 mb-4 hover:border-gold-500/30 transition-all duration-300 group hover:bg-white/5">
            <CardContent className="p-6">
                <div className="flex flex-col md:flex-row justify-between gap-6">
                    <div className="flex gap-4">
                        <div className="w-16 h-16 rounded-xl bg-black/50 shadow-inner flex items-center justify-center shrink-0 border border-white/10 group-hover:bg-gold-500/10 transition-colors">
                            <Calendar className="w-7 h-7 text-[var(--text-secondary)] group-hover:text-[var(--gold-primary)] transition-colors" />
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                <h3 className="text-lg font-semibold text-white">{booking.serviceName}</h3>
                                <Badge variant="outline" className={`${getStatusColor(booking.status)} capitalize backdrop-blur-sm`}>
                                    {booking.status === 'pending' ? 'Awaiting Admin Approval'
                                     : booking.status === 'confirmed' ? 'Confirmed — Awaiting Technician'
                                     : booking.status === 'assigned' ? 'Technician Assigned'
                                     : booking.status === 'received' ? 'Vehicle Checked In'
                                     : booking.status === 'in_progress' ? 'In Progress'
                                     : booking.status}
                                </Badge>
                            </div>
                            <div className="space-y-1.5 text-sm text-[var(--text-secondary)]">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 opacity-70" />
                                    <span>{new Date(booking.date).toLocaleDateString()} at {booking.time}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <MapPin className="w-4 h-4 opacity-70" />
                                    <span>{booking.vehicleInfo || 'No vehicle info'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-end justify-between gap-4">
                        <div className="text-right">
                            <div className="text-2xl font-bold text-white tracking-tight drop-shadow-sm">
                                {formatCurrency(booking.totalPrice || booking.totalAmount || 0)}
                            </div>
                            <span className="text-xs text-[var(--gold-primary)] opacity-70">Total Price</span>
                        </div>

                        {['pending', 'confirmed'].includes(booking.status) && (
                            <div className="flex gap-2">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm" className="bg-transparent border-white/10 text-[var(--text-secondary)] hover:text-white hover:bg-white/10 hover:border-white/20 transition-all">
                                            Manage Booking
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="glass border-white/10 text-[var(--text-secondary)] backdrop-blur-xl">
                                        <DropdownMenuItem onClick={() => onRescheduleBooking(booking)} className="focus:bg-white/10 focus:text-white cursor-pointer transition-colors">
                                            <Clock className="w-4 h-4 mr-2" /> Reschedule
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => onCancelBooking(booking)} className="text-red-400 focus:text-red-300 focus:bg-red-950/20 cursor-pointer transition-colors">
                                            <AlertCircle className="w-4 h-4 mr-2" /> Cancel Booking
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        )}
                        {booking.status === 'completed' && booking.warrantyAndReceipt && (
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-[var(--gold-primary)] hover:text-white hover:bg-white/10 transition-colors"
                                onClick={() => setSelectedReceipt(booking)}
                            >
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
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-gold">My Bookings</h1>
                    <p className="text-[var(--text-secondary)] mt-1">Manage your upcoming appointments and view history.</p>
                </div>
            </div>

            <Tabs defaultValue="upcoming" className="w-full">
                <TabsList className="glass border border-white/5 p-1 w-full md:w-auto grid grid-cols-2 md:inline-flex">
                    <TabsTrigger value="upcoming" className="data-[state=active]:bg-gold-500/10 data-[state=active]:text-[var(--gold-primary)] data-[state=active]:shadow-sm rounded-md transition-all">
                        Upcoming ({upcomingBookings.length})
                    </TabsTrigger>
                    <TabsTrigger value="history" className="data-[state=active]:bg-gold-500/10 data-[state=active]:text-[var(--gold-primary)] data-[state=active]:shadow-sm rounded-md transition-all">
                        History ({pastBookings.length})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="upcoming" className="mt-6 space-y-4">
                    {upcomingBookings.length > 0 ? (
                        upcomingBookings.map(booking => (
                            <BookingCard key={booking.id} booking={booking} />
                        ))
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 px-4 glass rounded-xl border border-dashed border-white/10">
                            <div className="w-16 h-16 rounded-full bg-black/50 border border-white/5 shadow-inner flex items-center justify-center mb-4">
                                <Calendar className="w-8 h-8 text-[var(--gold-primary)] opacity-70" />
                            </div>
                            <h3 className="text-xl font-medium text-white mb-2 tracking-wide">No upcoming bookings</h3>
                            <p className="text-[var(--text-secondary)] max-w-sm text-center mb-6">You don't have any scheduled appointments at the moment.</p>
                            <Button
                                className="bg-gold-500 hover:bg-gold-600 text-black font-semibold shadow-lg shadow-gold-500/20"
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
                        <div className="flex flex-col items-center justify-center py-16 px-4 glass rounded-xl border border-dashed border-white/10">
                            <div className="w-16 h-16 rounded-full bg-black/50 border border-white/5 shadow-inner flex items-center justify-center mb-4">
                                <Clock className="w-8 h-8 text-[var(--gold-primary)] opacity-70" />
                            </div>
                            <h3 className="text-xl font-medium text-white mb-2 tracking-wide">No past bookings</h3>
                            <p className="text-[var(--text-secondary)] max-w-sm text-center">Your completed service history will appear here once you've had your first service.</p>
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* Warranty and Receipt Dialog */}
            <Dialog open={!!selectedReceipt} onOpenChange={(open) => !open && setSelectedReceipt(null)}>
                <DialogContent className="sm:max-w-md glass border-white/10">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center text-white">
                            <Shield className="w-5 h-5 mr-2 text-[var(--gold-primary)]" />
                            Warranty & Service Receipt
                        </DialogTitle>
                        <DialogDescription className="text-[var(--text-secondary)]">
                            Official digital receipt and warranty certificate.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedReceipt?.warrantyAndReceipt && (
                        <div className="space-y-4 py-4">
                            <div className="flex justify-between items-center bg-black/40 p-3 rounded-lg border border-white/5">
                                <span className="text-sm text-[var(--text-secondary)]">Certificate ID</span>
                                <span className="font-mono text-[var(--gold-primary)] font-medium">
                                    {selectedReceipt.warrantyAndReceipt.certificateNumber}
                                </span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white/5 p-3 rounded-lg border border-white/5 flex flex-col items-center justify-center text-center">
                                    <span className="text-xs text-[var(--text-secondary)] mb-1">Issue Date</span>
                                    <span className="text-sm font-medium text-white">
                                        {selectedReceipt.warrantyAndReceipt.signedAt ? new Date(selectedReceipt.warrantyAndReceipt.signedAt).toLocaleDateString() : new Date().toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="bg-white/5 p-3 rounded-lg border border-white/5 flex flex-col items-center justify-center text-center">
                                    <span className="text-xs text-[var(--text-secondary)] mb-1">Amount Paid</span>
                                    <span className="text-sm font-bold text-white">
                                        {formatCurrency(selectedReceipt.warrantyAndReceipt.amountPaid || selectedReceipt.totalPrice || 0)}
                                    </span>
                                </div>
                            </div>
                            
                            <div className="bg-white/5 p-4 rounded-lg border border-white/5 space-y-2">
                                <h4 className="text-sm font-semibold text-[var(--gold-primary)] mb-2 flex items-center">
                                    <FileText className="w-4 h-4 mr-2" /> Coverage Details
                                </h4>
                                <div className="flex justify-between text-sm">
                                    <span className="text-[var(--text-secondary)]">Service</span>
                                    <span className="text-white text-right max-w-[200px] truncate">{selectedReceipt.serviceName}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-[var(--text-secondary)]">Vehicle</span>
                                    <span className="text-white">{selectedReceipt.vehicleInfo || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-[var(--text-secondary)]">Payment Method</span>
                                    <span className="text-white">{selectedReceipt.warrantyAndReceipt.paymentMethod || 'Card'}</span>
                                </div>
                            </div>

                            {selectedReceipt.warrantyAndReceipt.customerSignature && (
                                <div className="mt-4 flex flex-col items-center">
                                    <span className="text-xs text-[var(--text-secondary)] mb-2">Authenticated Customer Signature</span>
                                    <div className="bg-white/90 rounded-lg p-2 border border-white/20 w-[250px] flex justify-center">
                                        <img 
                                            src={selectedReceipt.warrantyAndReceipt.customerSignature} 
                                            alt="Customer Signature"
                                            className="h-16 object-contain filter contrast-125"
                                        />
                                    </div>
                                </div>
                            )}

                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};
