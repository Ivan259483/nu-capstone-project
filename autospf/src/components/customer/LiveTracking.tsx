import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CheckCircle,
    Wrench,
    Sparkles,
    Flag,
    MapPin,
    Clock,
    AlertCircle
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Booking, User } from '@/types';
import { format } from 'date-fns';
import { doc, onSnapshot, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';

interface LiveTrackingProps {
    activeBooking: Booking | null;
}

export const LiveTracking: React.FC<LiveTrackingProps> = ({ activeBooking: initialBooking }) => {
    const { user } = useAuth();
    const [activeBooking, setActiveBooking] = useState<Booking | null>(initialBooking);
    const [detailerName, setDetailerName] = useState<string>('');
    const [isValidating, setIsValidating] = useState(false);

    // EFFECT: Validation & Fallback Fetching
    useEffect(() => {
        const validateAndFetch = async () => {
            if (!user?.id) return;

            if (initialBooking) {
                if (!initialBooking.serviceName || !initialBooking.vehicleModel) {
                    // fall through to fetch
                } else {
                    setActiveBooking(initialBooking);
                    return;
                }
            }

            if (!initialBooking || (initialBooking && (!initialBooking.serviceName))) {
                setIsValidating(true);
                try {
                    const bookingsRef = collection(db, 'bookings');
                    const q = query(
                        bookingsRef,
                        where('customerId', '==', user.id),
                        where('status', 'in', ['paid', 'queued', 'confirmed', 'assigned', 'processing', 'in-progress', 'finishing', 'ready', 'quality-check']),
                        orderBy('createdAt', 'desc'),
                        limit(1)
                    );
                    const snapshot = await getDocs(q);
                    if (!snapshot.empty) {
                        const foundBooking = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Booking;
                        setActiveBooking(foundBooking);
                    } else {
                        setActiveBooking(null);
                    }
                } catch (error) {
                    console.error('LiveTracking: Error during fallback fetch', error);
                } finally {
                    setIsValidating(false);
                }
            }
        };
        validateAndFetch();
    }, [user?.id, initialBooking]);

    // Fetch detailer name
    useEffect(() => {
        const fetchDetailer = async () => {
            if (!activeBooking?.assignedDetailer) return;
            if (typeof activeBooking.assignedDetailer === 'string') {
                try {
                    const userDoc = await getDoc(doc(db, 'users', activeBooking.assignedDetailer));
                    if (userDoc.exists()) {
                        const userData = userDoc.data() as User;
                        setDetailerName(userData.name || userData.displayName || 'Specialist');
                    }
                } catch {}
            } else if (typeof activeBooking.assignedDetailer === 'object') {
                const detailer = activeBooking.assignedDetailer as User;
                setDetailerName(detailer.name || detailer.displayName || 'Specialist');
            }
        };
        fetchDetailer();
    }, [activeBooking?.assignedDetailer]);

    // Real-time Firestore listener
    useEffect(() => {
        if (!activeBooking?.id) return;
        const unsubscribe = onSnapshot(
            doc(db, 'bookings', activeBooking.id),
            (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data() as Booking;
                    setActiveBooking(prev => ({ ...prev, ...data, id: docSnap.id }));
                }
            },
            (error) => console.error('LiveTracking Connection Error:', error)
        );
        return () => unsubscribe();
    }, [activeBooking?.id]);

    if (isValidating && !activeBooking) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
                <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4" />
                <p className="text-zinc-400">Verifying service status...</p>
            </div>
        );
    }

    if (!activeBooking) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 animate-in fade-in zoom-in duration-500">
                <div className="w-24 h-24 rounded-full bg-zinc-900/50 flex items-center justify-center mb-6 border border-zinc-800 shadow-xl">
                    <Sparkles className="w-10 h-10 text-zinc-600" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">No Active Service</h2>
                <p className="text-zinc-500 max-w-md">
                    You don't have any services currently in progress.
                    Your future bookings will appear here once confirmed.
                </p>
                <Button
                    className="mt-8 bg-indigo-600 hover:bg-indigo-700"
                    onClick={() => window.location.href = '/customer/dashboard'}
                >
                    Book a Service
                </Button>
            </div>
        );
    }

    const baseSteps = [
        { id: 'received',  label: 'Vehicle Received', icon: CheckCircle, description: 'Your vehicle has been checked in.' },
        { id: 'washing',   label: 'Washing Phase',    icon: Sparkles,    description: 'Exterior prep and deep cleaning.' },
        { id: 'detailing', label: 'Detailing',        icon: Wrench,      description: 'Polishing, coating, and interior care.' },
        { id: 'ready',     label: 'Ready for Pickup', icon: Flag,        description: 'Your vehicle is ready! Come collect it.' },
    ];

    const { currentStepIndex, displaySteps, progressValue } = useMemo(() => {
        let steps = [...baseSteps];
        const status = activeBooking.status;
        const customerStatus = activeBooking.customerStatus || 'received';

        let progress = 0;
        let currentIndex = 0;

        // Force to completed if order is actually completed
        if (status === 'completed' || customerStatus === 'ready') {
            progress = 100; currentIndex = 3;
        } else if (customerStatus === 'detailing') {
            progress = 75;  currentIndex = 2;
        } else if (customerStatus === 'washing') {
            progress = 50;  currentIndex = 1;
        } else {
            // received or other raw states default to the start of the chain
            progress = 25;  currentIndex = 0;
        }

        if (activeBooking.serviceSteps && activeBooking.serviceSteps.length > 0) {
            const detailedSteps = activeBooking.serviceSteps.map((step, idx) => ({
                id: `step-${idx}`,
                label: step.name,
                icon: Wrench,
                description: step.status === 'completed' ? 'Completed ✓' : 'In Progress…',
                isServiceStep: true,
                originalStatus: step.status,
            }));

            steps = [baseSteps[0], baseSteps[1], ...detailedSteps, baseSteps[3]];

            if (currentIndex === 2) { // If detailing, jump into checklist array
                const firstIncompleteIdx = detailedSteps.findIndex(s => s.originalStatus !== 'completed');
                currentIndex = firstIncompleteIdx !== -1 ? firstIncompleteIdx + 2 : detailedSteps.length + 1;
                // Scale progress smoothly inside detailing checklist
                if(detailedSteps.length > 0) {
                   const completedCt = detailedSteps.filter(s => s.originalStatus === 'completed').length;
                   progress = 50 + (25 * (completedCt / detailedSteps.length));
                }
            } else if (currentIndex === 3) {
                currentIndex = steps.length - 1;
            }
        }

        return { currentStepIndex: currentIndex, displaySteps: steps, progressValue: progress };
    }, [activeBooking]);

    const CurrentIcon = displaySteps[currentStepIndex]?.icon || Wrench;

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-8">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="text-center md:text-left"
            >
                <Badge variant="outline" className="mb-2 border-indigo-500/30 bg-indigo-500/10 text-indigo-400">
                    Live Status
                </Badge>
                <h1 className="text-3xl font-bold text-white">Service Tracker</h1>
                <p className="text-zinc-400 mt-1">
                    Order #{activeBooking.id.slice(-6).toUpperCase()} • {activeBooking.serviceName || 'Car Detail'}
                </p>
            </motion.div>

            {/* Main Status Card */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4 }}
            >
                <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden relative backdrop-blur-xl">
                    {/* Animated Progress Bar */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-zinc-800">
                        <motion.div
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                            initial={{ width: 0 }}
                            animate={{ width: `${progressValue}%` }}
                            transition={{ type: 'spring', stiffness: 60, damping: 18, delay: 0.2 }}
                        />
                    </div>

                    <CardContent className="p-6 md:p-8">
                        <div className="flex flex-col md:flex-row gap-8 items-center justify-center py-8">
                            {/* Animated Active Step Icon */}
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={currentStepIndex}
                                    initial={{ scale: 0.7, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 1.1, opacity: 0 }}
                                    transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                                    className="w-32 h-32 rounded-full bg-zinc-900 border-4 border-indigo-500/30 flex items-center justify-center shadow-[0_0_50px_-10px_rgba(99,102,241,0.4)] relative"
                                >
                                    <CurrentIcon className="w-16 h-16 text-indigo-400" />
                                    {/* Ripple rings */}
                                    <motion.div
                                        className="absolute inset-0 rounded-full border border-indigo-500/40"
                                        animate={{ scale: [1, 1.4, 1.4], opacity: [0.6, 0, 0] }}
                                        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
                                    />
                                    <motion.div
                                        className="absolute inset-0 rounded-full border border-indigo-500/25"
                                        animate={{ scale: [1, 1.7, 1.7], opacity: [0.4, 0, 0] }}
                                        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: 0.6 }}
                                    />
                                </motion.div>
                            </AnimatePresence>

                            <div className="text-center md:text-left space-y-2">
                                <AnimatePresence mode="wait">
                                    <motion.h2
                                        key={`label-${currentStepIndex}`}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 8 }}
                                        transition={{ duration: 0.25 }}
                                        className="text-2xl font-bold text-white"
                                    >
                                        {displaySteps[currentStepIndex]?.label}
                                    </motion.h2>
                                </AnimatePresence>
                                <p className="text-zinc-400 max-w-sm">
                                    {displaySteps[currentStepIndex]?.description}
                                </p>
                                <div className="flex items-center justify-center md:justify-start gap-4 mt-4 pt-4 border-t border-zinc-800/50">
                                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                                        <Clock className="w-4 h-4" />
                                        <span>Updated: {activeBooking.updatedAt ? format(new Date(activeBooking.updatedAt), 'h:mm a') : 'Just now'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                                        <MapPin className="w-4 h-4" />
                                        <span>{activeBooking.vehicleModel || 'Vehicle'}</span>
                                    </div>
                                    {detailerName && (
                                        <div className="flex items-center gap-2 text-sm text-indigo-400">
                                            <Wrench className="w-4 h-4" />
                                            <span>Specialist: {detailerName}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* ── Framer Motion Animated Step Timeline ───────────────────────── */}
            <div className="relative">
                {/* Vertical connector track */}
                <div className="absolute left-5 top-5 bottom-5 w-0.5 bg-zinc-800" />

                <motion.div
                    className="space-y-0"
                    initial="hidden"
                    animate="visible"
                    variants={{
                        hidden: {},
                        visible: { transition: { staggerChildren: 0.1 } },
                    }}
                >
                    {displaySteps.map((step, index) => {
                        const isCompleted = index < currentStepIndex;
                        const isCurrent  = index === currentStepIndex;
                        const StepIcon   = step.icon;

                        return (
                            <motion.div
                                key={step.id}
                                variants={{
                                    hidden:  { opacity: 0, x: -16 },
                                    visible: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 200, damping: 22 } },
                                }}
                                className="flex items-start gap-4 relative pb-8 last:pb-0"
                            >
                                {/* Animated Connector Fill */}
                                {index < displaySteps.length - 1 && (
                                    <motion.div
                                        className="absolute left-5 top-10 w-0.5 bg-gradient-to-b from-indigo-500 to-indigo-500/30 origin-top"
                                        initial={{ scaleY: 0 }}
                                        animate={{ scaleY: isCompleted ? 1 : 0 }}
                                        transition={{ type: 'spring', stiffness: 80, damping: 18, delay: index * 0.12 }}
                                        style={{ height: 'calc(100% - 2.5rem)' }}
                                    />
                                )}

                                {/* Step Dot */}
                                <div className="relative z-10 shrink-0">
                                    <motion.div
                                        className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors duration-500 ${
                                            isCompleted
                                                ? 'bg-indigo-600 border-indigo-400'
                                                : isCurrent
                                                ? 'bg-zinc-900 border-indigo-500'
                                                : 'bg-zinc-900 border-zinc-700'
                                        }`}
                                        animate={isCurrent ? { boxShadow: ['0 0 0 0 rgba(99,102,241,0.5)', '0 0 0 10px rgba(99,102,241,0)', '0 0 0 0 rgba(99,102,241,0)'] } : {}}
                                        transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                                    >
                                        <AnimatePresence mode="wait">
                                            {isCompleted ? (
                                                <motion.div
                                                    key="check"
                                                    initial={{ scale: 0 }}
                                                    animate={{ scale: 1 }}
                                                    transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                                                >
                                                    <CheckCircle className="w-5 h-5 text-white" />
                                                </motion.div>
                                            ) : isCurrent ? (
                                                <motion.div
                                                    key="current"
                                                    animate={{ scale: [1, 1.2, 1] }}
                                                    transition={{ duration: 1.5, repeat: Infinity }}
                                                >
                                                    <StepIcon className="w-5 h-5 text-indigo-400" />
                                                </motion.div>
                                            ) : (
                                                <motion.div key="future">
                                                    <StepIcon className="w-5 h-5 text-zinc-600" />
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                </div>

                                {/* Step Label */}
                                <div className="pt-1.5 min-w-0">
                                    <p className={`font-semibold text-sm transition-colors duration-300 ${
                                        isCompleted ? 'text-indigo-300' : isCurrent ? 'text-white' : 'text-zinc-600'
                                    }`}>
                                        {step.label}
                                        {isCompleted && (
                                            <motion.span
                                                initial={{ opacity: 0, x: 4 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                className="ml-2 text-xs text-indigo-400/70"
                                            >
                                                ✓ Done
                                            </motion.span>
                                        )}
                                        {isCurrent && (
                                            <motion.span
                                                animate={{ opacity: [1, 0.4, 1] }}
                                                transition={{ duration: 1.5, repeat: Infinity }}
                                                className="ml-2 text-xs text-indigo-400"
                                            >
                                                ● In progress
                                            </motion.span>
                                        )}
                                    </p>
                                    <p className="text-xs text-zinc-500 mt-0.5 hidden md:block">{step.description}</p>
                                </div>
                            </motion.div>
                        );
                    })}
                </motion.div>
            </div>
        </div>
    );
};
