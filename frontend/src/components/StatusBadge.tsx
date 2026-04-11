import React from 'react';
import { Badge } from '@/components/ui/badge';
import type { Booking } from '@/types';

type Tone = 'emerald' | 'amber' | 'blue' | 'zinc' | 'rose' | 'violet';

const toneClasses: Record<Tone, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 shadow-[0_0_14px_rgba(16,185,129,0.12)]',
    amber: 'bg-amber-500/10 text-amber-300 border border-amber-500/20 shadow-[0_0_14px_rgba(245,158,11,0.12)]',
    blue: 'bg-blue-500/10 text-blue-300 border border-blue-500/20 shadow-[0_0_14px_rgba(59,130,246,0.12)]',
    violet: 'bg-violet-500/10 text-violet-300 border border-violet-500/20 shadow-[0_0_14px_rgba(139,92,246,0.12)]',
    rose: 'bg-rose-500/10 text-rose-300 border border-rose-500/20 shadow-[0_0_14px_rgba(244,63,94,0.12)]',
    zinc: 'bg-zinc-500/10 text-zinc-300 border border-zinc-500/20',
};

function resolveStatus(booking?: Booking | null): { label: string; tone: Tone } {
    if (!booking) return { label: 'Pending', tone: 'zinc' };

    // Payment-first indicator (helps admins/customers instantly understand the gate)
    if (booking.paymentStatus === 'paid' && booking.status === 'pending') {
        return { label: 'Paid', tone: 'emerald' };
    }

    if (booking.status === 'released') {
        return { label: 'Released', tone: 'emerald' };
    }

    if (booking.status === 'completed') {
        return { label: 'Completed', tone: 'emerald' };
    }

    if (booking.status === 'paid') {
        return { label: 'Paid', tone: 'emerald' };
    }

    if (booking.status === 'in_progress') {
        return { label: 'In Progress', tone: 'amber' };
    }

    if (booking.status === 'received') {
        return { label: 'Checked In', tone: 'violet' };
    }

    if (booking.status === 'confirmed') {
        return { label: 'Confirmed', tone: 'blue' };
    }

    if (booking.paymentStatus === 'unpaid' || booking.paymentStatus === 'failed') {
        return { label: 'Pending', tone: 'rose' };
    }

    return { label: 'Pending', tone: 'blue' };
}

export function StatusBadge({
    booking,
    className,
    label,
    tone,
}: {
    booking?: Booking | null;
    className?: string;
    label?: string;
    tone?: Tone;
}) {
    const resolved = label && tone ? { label, tone } : resolveStatus(booking);
    return (
        <Badge
            className={[
                'px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase',
                toneClasses[resolved.tone],
                className || '',
            ].join(' ')}
        >
            {resolved.label}
        </Badge>
    );
}

