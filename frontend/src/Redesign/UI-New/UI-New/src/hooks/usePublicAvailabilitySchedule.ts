import { useEffect, useMemo, useState } from 'react';

export type PublicScheduleLocale = 'en' | 'fil';

interface PublicScheduleDay {
    dow: number;
    open: boolean;
    from: string;
    to: string;
}

export interface PublicScheduleDisplayRow {
    day: string;
    time: string;
    open: boolean;
}

type ScheduleState =
    | { status: 'loading'; days: PublicScheduleDay[] }
    | { status: 'ready'; days: PublicScheduleDay[] }
    | { status: 'unavailable'; days: PublicScheduleDay[] };

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES: Record<PublicScheduleLocale, string[]> = {
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    fil: ['Linggo', 'Lunes', 'Martes', 'Miyerkules', 'Huwebes', 'Biyernes', 'Sabado'],
};
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function formatTime(value: string): string {
    if (!TIME_PATTERN.test(value)) return '';
    const [hourValue, minute] = value.split(':').map(Number);
    const period = hourValue >= 12 ? 'PM' : 'AM';
    const hour = hourValue % 12 || 12;
    return `${hour}:${String(minute).padStart(2, '0')} ${period}`;
}

function validateSchedule(value: unknown): PublicScheduleDay[] {
    if (!Array.isArray(value) || value.length !== 7) throw new Error('Incomplete public schedule.');
    const byDay = new Map<number, PublicScheduleDay>();
    for (const item of value) {
        if (!item || typeof item !== 'object') throw new Error('Invalid schedule row.');
        const row = item as Partial<PublicScheduleDay>;
        const dow = Number(row.dow);
        if (!Number.isInteger(dow) || dow < 0 || dow > 6 || byDay.has(dow) || typeof row.open !== 'boolean') {
            throw new Error('Invalid schedule day.');
        }
        const from = typeof row.from === 'string' ? row.from : '';
        const to = typeof row.to === 'string' ? row.to : '';
        if (row.open && (!TIME_PATTERN.test(from) || !TIME_PATTERN.test(to) || from >= to)) {
            throw new Error('Invalid schedule hours.');
        }
        byDay.set(dow, { dow, open: row.open, from, to });
    }
    return DAY_ORDER.map((dow) => {
        const row = byDay.get(dow);
        if (!row) throw new Error('Incomplete public schedule.');
        return row;
    });
}

function buildDisplayRows(days: PublicScheduleDay[], locale: PublicScheduleLocale): PublicScheduleDisplayRow[] {
    if (days.length !== 7) return [];
    const groups: PublicScheduleDay[][] = [];
    for (const day of days) {
        const previous = groups[groups.length - 1];
        const first = previous?.[0];
        const sameHours = first && first.open === day.open && (!day.open || (first.from === day.from && first.to === day.to));
        if (sameHours) previous.push(day);
        else groups.push([day]);
    }
    return groups.map((group) => {
        const first = group[0];
        const last = group[group.length - 1];
        const firstName = DAY_NAMES[locale][first.dow];
        const lastName = DAY_NAMES[locale][last.dow];
        return {
            day: group.length === 1 ? firstName : `${firstName} – ${lastName}`,
            open: first.open,
            time: first.open
                ? `${formatTime(first.from)} – ${formatTime(first.to)}`
                : locale === 'fil' ? 'Sarado' : 'Closed',
        };
    });
}

export function usePublicAvailabilitySchedule(locale: PublicScheduleLocale = 'en') {
    const [state, setState] = useState<ScheduleState>({ status: 'loading', days: [] });
    useEffect(() => {
        const controller = new AbortController();
        setState({ status: 'loading', days: [] });
        fetch('/api/slots/schedule', { signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error(`Schedule request failed: ${response.status}`);
                const payload = await response.json();
                if (!payload?.success) throw new Error('Schedule request failed.');
                setState({ status: 'ready', days: validateSchedule(payload.data) });
            })
            .catch((error) => {
                if (controller.signal.aborted) return;
                console.warn('Could not load public appointment hours.', error);
                setState({ status: 'unavailable', days: [] });
            });
        return () => controller.abort();
    }, []);

    const rows = useMemo(() => buildDisplayRows(state.days, locale), [locale, state.days]);
    const summary = state.status === 'loading'
        ? locale === 'fil' ? 'Kinukuha ang kasalukuyang oras…' : 'Loading current hours…'
        : state.status === 'unavailable'
            ? locale === 'fil' ? 'Makipag-ugnayan para sa kasalukuyang oras' : 'Contact us for current hours'
            : rows.map((row) => `${row.day}: ${row.time}`).join(' · ');
    return { rows, summary, isLoading: state.status === 'loading', isUnavailable: state.status === 'unavailable' };
}
