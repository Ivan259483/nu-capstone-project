import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Car, CheckCircle2, Clock3, ShieldCheck, Users } from 'lucide-react';
import api from '@/lib/api';
import { formatRelativeTime, type PublicTrackerSummary } from '@/components/chat/chat-utils';

const TRACKER_STEPS = [
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'received', label: 'Arrived' },
    { key: 'in_progress', label: 'In Service' },
    { key: 'quality_check', label: 'QC Review' },
    { key: 'ready_pickup', label: 'Pickup' },
];

function getStageIndex(stage?: string) {
    const index = TRACKER_STEPS.findIndex(step => step.key === stage);
    return index >= 0 ? index : 0;
}

export default function PublicTrackerPage() {
    const { token = '' } = useParams();
    const [tracker, setTracker] = useState<PublicTrackerSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        const loadTracker = async () => {
            setIsLoading(true);
            setError('');
            try {
                const res = await api.get(`/chat/tracker/${encodeURIComponent(token)}`, {
                    meta: { suppressErrorToast: true },
                } as any);
                if (active) {
                    setTracker(res.data?.data?.tracker || null);
                }
            } catch (err: any) {
                if (active) {
                    setError(err?.response?.data?.message || 'This tracker link is invalid or has expired.');
                    setTracker(null);
                }
            } finally {
                if (active) setIsLoading(false);
            }
        };

        loadTracker();
        return () => {
            active = false;
        };
    }, [token]);

    const activeIndex = useMemo(
        () => getStageIndex(tracker?.serviceTrackingStage),
        [tracker?.serviceTrackingStage]
    );

    const media = useMemo(
        () => (tracker?.trackerStageMedia || []).filter(item => item.photoUrl).slice(0, 8),
        [tracker?.trackerStageMedia]
    );

    const teamLabel = useMemo(() => {
        const names = (tracker?.serviceStaffAssignments || [])
            .map(entry => entry.name?.trim())
            .filter(Boolean);
        return names.length ? names.join(', ') : 'AutoSPF+ studio team';
    }, [tracker?.serviceStaffAssignments]);

    return (
        <main className="min-h-screen bg-[#070B14] text-white">
            <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8 lg:px-10">
                <div className="mb-8 flex items-center justify-between">
                    <Link
                        to="/"
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        AutoSPF+
                    </Link>
                    <span className="rounded-full border border-[#0066FF]/30 bg-[#0066FF]/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#66A3FF]">
                        Public tracker
                    </span>
                </div>

                {isLoading ? (
                    <section className="grid flex-1 place-items-center">
                        <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/10 border-t-[#0066FF]" />
                    </section>
                ) : error || !tracker ? (
                    <section className="grid flex-1 place-items-center">
                        <div className="max-w-md rounded-[28px] border border-white/10 bg-white/[0.04] p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
                            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
                                <ShieldCheck className="h-7 w-7 text-white/70" />
                            </div>
                            <h1 className="text-2xl font-bold">Tracker link unavailable</h1>
                            <p className="mt-3 text-sm leading-relaxed text-white/55">
                                {error || 'Please verify your booking reference and registered phone number again in chat.'}
                            </p>
                            <Link
                                to="/"
                                className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-[#0066FF] px-6 text-sm font-bold text-white"
                            >
                                Return home
                            </Link>
                        </div>
                    </section>
                ) : (
                    <section className="grid flex-1 gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                        <div className="rounded-[32px] border border-white/10 bg-gradient-to-br from-[#101827] to-[#0B1020] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
                            <div className="flex items-start gap-4">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-[#0066FF]">
                                    <ShieldCheck className="h-7 w-7" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#66A3FF]">Live Tracking</p>
                                    <h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">
                                        {tracker.currentStageLabel || 'Tracker active'}
                                    </h1>
                                    <p className="mt-2 text-sm leading-relaxed text-white/55">
                                        {tracker.serviceName} / {tracker.vehicleLabel}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-8">
                                <div className="mb-2 flex items-center justify-between text-sm font-semibold text-white/55">
                                    <span>{tracker.progressPercent}% complete</span>
                                    <span>{tracker.bookingReference}</span>
                                </div>
                                <div className="h-3 rounded-full bg-white/10">
                                    <div
                                        className="h-3 rounded-full bg-[#0066FF]"
                                        style={{ width: `${Math.max(0, Math.min(100, tracker.progressPercent))}%` }}
                                    />
                                </div>
                            </div>

                            <div className="mt-8 grid gap-3 text-sm">
                                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                                    <CalendarDays className="h-5 w-5 text-[#66A3FF]" />
                                    <span>{tracker.scheduleLabel}</span>
                                </div>
                                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                                    <Car className="h-5 w-5 text-[#66A3FF]" />
                                    <span>{tracker.vehicleLabel}</span>
                                </div>
                                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                                    <Users className="h-5 w-5 text-[#66A3FF]" />
                                    <span>{teamLabel}</span>
                                </div>
                                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                                    <Clock3 className="h-5 w-5 text-[#66A3FF]" />
                                    <span>Updated {formatRelativeTime(tracker.updatedAt || undefined)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.25)]">
                            <h2 className="text-lg font-bold">Service timeline</h2>
                            <div className="mt-6 space-y-4">
                                {TRACKER_STEPS.map((step, index) => {
                                    const isDone = index < activeIndex;
                                    const isActive = index === activeIndex;
                                    return (
                                        <div
                                            key={step.key}
                                            className={`flex items-center gap-4 rounded-2xl border p-4 ${
                                                isActive
                                                    ? 'border-[#0066FF]/50 bg-[#0066FF]/10'
                                                    : isDone
                                                        ? 'border-emerald-400/25 bg-emerald-400/10'
                                                        : 'border-white/10 bg-white/[0.03]'
                                            }`}
                                        >
                                            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                                                isDone ? 'bg-emerald-500' : isActive ? 'bg-[#0066FF]' : 'bg-white/10'
                                            }`}>
                                                <CheckCircle2 className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="font-bold">{step.label}</p>
                                                <p className="text-xs text-white/45">
                                                    {isActive ? 'Live now' : isDone ? 'Complete' : 'Upcoming'}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {media.length > 0 && (
                                <div className="mt-8">
                                    <h2 className="text-lg font-bold">Customer evidence</h2>
                                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                                        {media.map((item, index) => (
                                            <a
                                                key={`${item.stage}-${item.slot}-${index}`}
                                                href={item.photoUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]"
                                            >
                                                <img
                                                    src={item.photoUrl}
                                                    alt={item.description || `${item.stage || 'Tracker'} evidence`}
                                                    className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                />
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                )}
            </div>
        </main>
    );
}
