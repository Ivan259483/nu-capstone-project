import React from 'react';
import {
    Calendar,
    Clock,
    CreditCard,
    ArrowRight,
    Navigation,
    CheckCircle,
    FileText,
    Sparkles
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import type { Booking } from '@/types';

interface DashboardHomeProps {
    bookings: Booking[];
    onNavigate: (tab: string) => void;
    userName: string;
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({ bookings, onNavigate, userName }) => {
    // Logic to find upcoming and active bookings
    const activeBooking = bookings.find(b =>
        ['in-progress', 'processing', 'finishing', 'ready', 'queued', 'paid'].includes(b.status) ||
        (b.status === 'pending' && b.paymentStatus === 'paid')
    );

    const upcomingBooking = bookings.find(b =>
        ['pending', 'confirmed', 'assigned'].includes(b.status)
    );

    const completedBookings = bookings.filter(b => b.status === 'completed');
    const lastCompleted = completedBookings.length > 0 ? completedBookings[0] : null;

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Value Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">
                        Hello, {userName}
                    </h1>
                    <p className="text-zinc-400 mt-1">Welcome back to your premium service dashboard.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {bookings.find(b => b.status === 'assigned' && !b.legalCompliance?.waiverSignature) && (
                        <Button
                            onClick={() => onNavigate('dashboard')} // Waiver modal is auto-triggered when remaining on dashboard
                            className="bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-500/20 animate-pulse"
                        >
                            <FileText className="w-4 h-4 mr-2" />
                            Sign Pending Waiver
                        </Button>
                    )}
                    {bookings.find(b => b.status === 'pending' && b.paymentStatus !== 'paid') && (
                        <Button
                            onClick={() => onNavigate('payments')}
                            className="bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-500/20 animate-pulse"
                        >
                            <CreditCard className="w-4 h-4 mr-2" />
                            Pay Deposit
                        </Button>
                    )}
                    <Button
                        onClick={() => onNavigate('ai-estimator')}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20 gap-2"
                    >
                        <Sparkles className="w-4 h-4" />
                        AI Damage Scan
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => onNavigate('book')}
                        className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                    >
                        Book Standard
                    </Button>
                </div>
            </div>

            {/* Top Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Active Status Card */}
                <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-400">Current Status</CardTitle>
                        <Navigation className={`w-4 h-4 ${activeBooking ? 'text-indigo-400 animate-pulse' : 'text-zinc-600'}`} />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white">
                            {activeBooking ? (
                                ['queued', 'paid', 'pending'].includes(activeBooking.status) ? 'Service Queued' : 'Service Active'
                            ) : 'No Active Service'}
                        </div>
                        <p className="text-xs text-zinc-500 mt-1">
                            {activeBooking
                                ? `Vehicle: ${activeBooking.vehicleInfo || 'Your Vehicle'}`
                                : 'Ready for your next booking'}
                        </p>
                        {activeBooking && (
                            <Button
                                variant="link"
                                className="px-0 text-indigo-400 h-auto mt-2 text-xs"
                                onClick={() => onNavigate('tracking')}
                            >
                                Track Progress <ArrowRight className="w-3 h-3 ml-1" />
                            </Button>
                        )}
                    </CardContent>
                </Card>

                {/* Upcoming Booking Card */}
                <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-400">Next Appointment</CardTitle>
                        <Calendar className="w-4 h-4 text-emerald-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white">
                            {upcomingBooking ? (
                                new Date(upcomingBooking.date).toLocaleDateString()
                            ) : (
                                'None Scheduled'
                            )}
                        </div>
                        <p className="text-xs text-zinc-500 mt-1">
                            {upcomingBooking
                                ? `${upcomingBooking.serviceName} @ ${upcomingBooking.time}`
                                : 'Check our availability today'}
                        </p>
                        {upcomingBooking && (
                            <Button
                                variant="link"
                                className="px-0 text-emerald-400 h-auto mt-2 text-xs"
                                onClick={() => onNavigate('bookings')}
                            >
                                View Details <ArrowRight className="w-3 h-3 ml-1" />
                            </Button>
                        )}
                    </CardContent>
                </Card>

                {/* Last Payment/Total Spent Card */}
                <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-400">Last Service</CardTitle>
                        <CreditCard className="w-4 h-4 text-amber-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white">
                            {lastCompleted ? formatCurrency(lastCompleted.totalPrice || 0) : '--'}
                        </div>
                        <p className="text-xs text-zinc-500 mt-1">
                            {lastCompleted
                                ? `Paid on ${new Date(lastCompleted.date).toLocaleDateString()}`
                                : 'No payment history yet'}
                        </p>
                        <Button
                            variant="link"
                            className="px-0 text-amber-400 h-auto mt-2 text-xs"
                            onClick={() => onNavigate('payments')}
                        >
                            View History <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Actions Grid using Cards as buttons */}
            <h3 className="text-lg font-semibold text-white mt-8">Quick Actions</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div
                    onClick={() => onNavigate('book')}
                    className="cursor-pointer group relative flex flex-col items-center justify-center p-6 bg-zinc-900/30 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-all duration-300 hover:border-indigo-500/30"
                >
                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300 group-hover:bg-indigo-500/10">
                        <Calendar className="w-6 h-6 text-indigo-400" />
                    </div>
                    <span className="text-sm font-medium text-zinc-300 group-hover:text-white">Book Now</span>
                </div>

                <div
                    onClick={() => onNavigate('bookings')}
                    className="cursor-pointer group relative flex flex-col items-center justify-center p-6 bg-zinc-900/30 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-all duration-300 hover:border-emerald-500/30"
                >
                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300 group-hover:bg-emerald-500/10">
                        <Clock className="w-6 h-6 text-emerald-400" />
                    </div>
                    <span className="text-sm font-medium text-zinc-300 group-hover:text-white">My Bookings</span>
                </div>

                <div
                    onClick={() => onNavigate('tracking')}
                    className="cursor-pointer group relative flex flex-col items-center justify-center p-6 bg-zinc-900/30 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-all duration-300 hover:border-amber-500/30"
                >
                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300 group-hover:bg-amber-500/10">
                        <Navigation className="w-6 h-6 text-amber-400" />
                    </div>
                    <span className="text-sm font-medium text-zinc-300 group-hover:text-white">Live Tracking</span>
                </div>

                <div
                    onClick={() => onNavigate('settings')}
                    className="cursor-pointer group relative flex flex-col items-center justify-center p-6 bg-zinc-900/30 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-all duration-300 hover:border-purple-500/30"
                >
                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300 group-hover:bg-purple-500/10">
                        <CreditCard className="w-6 h-6 text-purple-400" />
                    </div>
                    <span className="text-sm font-medium text-zinc-300 group-hover:text-white">Payment Info</span>
                </div>
            </div>

            {/* Recent Activity Section */}
            <div className="mt-8">
                <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
                <div className="space-y-3">
                    {bookings.slice(0, 3).map((booking) => (
                        <div key={booking.id} className="flex items-center justify-between p-4 bg-zinc-900/30 border border-zinc-800 rounded-xl">
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${booking.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                                    booking.status === 'cancelled' ? 'bg-red-500/10 text-red-400' :
                                        'bg-indigo-500/10 text-indigo-400'
                                    }`}>
                                    <CheckCircle className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-white">{booking.serviceName}</p>
                                    <p className="text-xs text-zinc-500">{new Date(booking.date).toLocaleDateString()} • {booking.status}</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => onNavigate('bookings')} className="text-zinc-400 hover:text-white">
                                View
                            </Button>
                        </div>
                    ))}
                    {bookings.length === 0 && (
                        <div className="text-center py-8 text-zinc-500 bg-zinc-900/20 rounded-xl border border-dashed border-zinc-800">
                            No recent activity found.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
