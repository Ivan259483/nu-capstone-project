import { useState, useEffect } from 'react';

export function CountUp({ end, duration = 1.8, prefix = '', suffix = '' }: { end: number; duration?: number; prefix?: string; suffix?: string }) {
    const [count, setCount] = useState(0);
    useEffect(() => {
        let startTime: number;
        let frame: number;
        const animate = (ts: number) => {
            if (!startTime) startTime = ts;
            const pct = Math.min((ts - startTime) / (duration * 1000), 1);
            const ease = pct === 1 ? 1 : 1 - Math.pow(2, -10 * pct);
            setCount(end * ease);
            if (pct < 1) frame = requestAnimationFrame(animate);
        };
        frame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frame);
    }, [end, duration]);
    return <span>{prefix}{Math.floor(count).toLocaleString()}{suffix}</span>;
}

export const formatElapsedTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
};
