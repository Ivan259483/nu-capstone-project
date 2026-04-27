import React, { useEffect, useRef, useState } from 'react';

interface StockProgressBarProps {
  current: number;
  max: number;
  minStock: number;
  showLabel?: boolean;
  height?: string;
}

export default function StockProgressBar({ current, max, minStock, showLabel = false, height = 'h-2' }: StockProgressBarProps) {
  const [animated, setAnimated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pct = Math.min((current / max) * 100, 100);
  const lowPct = (minStock / max) * 100;

  const getColor = () => {
    if (current === 0) return 'bg-gray-300';
    if (current <= minStock * 0.5) return 'bg-gradient-to-r from-red-500 to-red-400';
    if (current <= minStock) return 'bg-gradient-to-r from-amber-400 to-amber-500';
    return 'bg-gradient-to-r from-emerald-400 to-emerald-500';
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setAnimated(true); },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full">
      <div className={`relative w-full ${height} bg-gray-100 rounded-full overflow-hidden`}>
        <div className="absolute top-0 bottom-0 w-px bg-amber-300/60 z-10" style={{ left: `${lowPct}%` }} />
        <div className={`${height} rounded-full ${getColor()} transition-all duration-1000 ease-out`} style={{ width: animated ? `${pct}%` : '0%' }} />
      </div>
      {showLabel && (
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-gray-400 font-medium font-tabular">{current} units</span>
          <span className="text-[10px] text-gray-300 font-medium font-tabular">max {max}</span>
        </div>
      )}
    </div>
  );
}
