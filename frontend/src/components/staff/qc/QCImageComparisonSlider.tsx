import React, { useState, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';

interface ImageComparisonSliderProps {
  beforeSrc: string;
  beforeAlt: string;
  afterSrc: string;
  afterAlt: string;
}

export default function QCImageComparisonSlider({
  beforeSrc,
  beforeAlt,
  afterSrc,
  afterAlt,
}: ImageComparisonSliderProps) {
  const [position, setPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setPosition((x / rect.width) * 100);
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    updatePosition(e.clientX);
  };

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      updatePosition(e.clientX);
    },
    [isDragging, updatePosition]
  );

  const onMouseUp = () => setIsDragging(false);

  const onTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    updatePosition(e.touches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    updatePosition(e.touches[0].clientX);
  };

  return (
    <div className="relative">
      {/* Zoom Controls */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg p-1 shadow-sm">
        <button
          onClick={() => setZoom(Math.min(2, zoom + 0.25))}
          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 transition-colors"
          title="Zoom in"
        >
          <ZoomIn size={14} />
        </button>
        <span className="text-xs font-medium text-slate-600 w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom(Math.max(1, zoom - 0.25))}
          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 transition-colors"
          title="Zoom out"
        >
          <ZoomOut size={14} />
        </button>
        <button
          onClick={() => setZoom(1)}
          className="text-xs text-slate-500 hover:text-slate-700 px-2 border-l border-slate-200 transition-colors"
          title="Reset zoom"
        >
          Reset
        </button>
      </div>

      {/* Labels */}
      <div className="absolute top-3 left-3 z-10">
        <span className="text-xs font-semibold bg-slate-900/70 text-white px-2.5 py-1 rounded-lg backdrop-blur-sm">BEFORE</span>
      </div>
      <div className="absolute top-3 z-10" style={{ left: `${Math.min(position + 2, 75)}%` }}>
        <span className="text-xs font-semibold bg-blue-600/80 text-white px-2.5 py-1 rounded-lg backdrop-blur-sm">AFTER</span>
      </div>

      {/* Comparison container */}
      <div
        ref={containerRef}
        className="relative overflow-hidden select-none cursor-col-resize"
        style={{ height: '380px' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onMouseUp}
      >
        {/* Before image (full width) */}
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={beforeSrc}
            alt={beforeAlt}
            className="w-full h-full object-cover transition-transform duration-200"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
            draggable={false}
          />
        </div>

        {/* After image (clipped) */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          <img
            src={afterSrc}
            alt={afterAlt}
            className="w-full h-full object-cover transition-transform duration-200"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
            draggable={false}
          />
        </div>

        {/* Divider line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg z-10"
          style={{ left: `${position}%` }}
        >
          {/* Handle */}
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-white rounded-full shadow-xl border border-slate-200 flex items-center justify-center cursor-col-resize">
            <div className="flex gap-0.5">
              <div className="w-0.5 h-4 bg-slate-400 rounded" />
              <div className="w-0.5 h-4 bg-slate-400 rounded" />
            </div>
          </div>
        </div>

        {/* Progress track */}
        <input
          type="range"
          min={0}
          max={100}
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-col-resize z-20"
          aria-label="Image comparison slider"
        />
      </div>

      {/* Range slider below for accessibility */}
      <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
        <input
          type="range"
          min={0}
          max={100}
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
          className="w-full accent-blue-600"
          aria-label="Adjust before/after comparison position"
        />
        <div className="flex justify-between text-[11px] text-slate-400 mt-1">
          <span>← Before</span>
          <span className="tabular-nums">{Math.round(position)}%</span>
          <span>After →</span>
        </div>
      </div>
    </div>
  );
}
