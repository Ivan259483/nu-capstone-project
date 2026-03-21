import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

const getCurrencyPreference = (): 'PHP' | 'USD' => {
    if (typeof window === 'undefined') return 'PHP';
    const stored = localStorage.getItem('autospf_currency');
    return stored === 'USD' ? 'USD' : 'PHP';
};

const getFormatter = (currency: 'PHP' | 'USD') => {
    const locale = currency === 'USD' ? 'en-US' : 'en-PH';
    return new Intl.NumberFormat(locale, { style: 'currency', currency });
};

export const formatCurrency = (value: number | string | null | undefined, currency?: 'PHP' | 'USD') => {
    const numericValue = typeof value === 'string' ? Number(value) : value;
    const curr = currency || getCurrencyPreference();
    const formatter = getFormatter(curr);
    return formatter.format(Number.isFinite(numericValue as number) ? (numericValue as number) : 0);
};
