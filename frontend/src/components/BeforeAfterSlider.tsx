import { useState, useRef, useEffect } from "react";
import { MoveHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface BeforeAfterSliderProps {
    beforeImage: string;
    afterImage: string;
    beforeLabel?: string;
    afterLabel?: string;
    className?: string;
}

export default function BeforeAfterSlider({
    beforeImage,
    afterImage,
    beforeLabel = "Before",
    afterLabel = "After",
    className,
}: BeforeAfterSliderProps) {
    const [sliderPos, setSliderPos] = useState(50);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMove = (clientX: number) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const percent = Math.max(0, Math.min((x / rect.width) * 100, 100));
        setSliderPos(percent);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        handleMove(e.clientX);
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        setIsDragging(true);
        handleMove(e.touches[0].clientX);
    };

    useEffect(() => {
        const handleMouseUp = () => setIsDragging(false);
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) handleMove(e.clientX);
        };
        const handleTouchMove = (e: TouchEvent) => {
            if (isDragging) handleMove(e.touches[0].clientX);
        };

        if (isDragging) {
            window.addEventListener("mouseup", handleMouseUp);
            window.addEventListener("mousemove", handleMouseMove);
            window.addEventListener("touchend", handleMouseUp);
            window.addEventListener("touchmove", handleTouchMove, { passive: false });
        }

        return () => {
            window.removeEventListener("mouseup", handleMouseUp);
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("touchend", handleMouseUp);
            window.removeEventListener("touchmove", handleTouchMove);
        };
    }, [isDragging]);

    return (
        <div
            ref={containerRef}
            className={cn(
                "relative w-full max-w-4xl mx-auto aspect-video rounded-2xl overflow-hidden cursor-ew-resize select-none border border-gold/20 shadow-2xl shadow-black/50 group",
                className
            )}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
        >
            {/* After Image (Background) */}
            <div className="absolute inset-0">
                <img
                    src={afterImage}
                    alt={afterLabel}
                    className="w-full h-full object-cover"
                    draggable={false}
                />
            </div>

            {/* Before Image (Foreground, clipped) */}
            <div
                className="absolute inset-0 right-0 overflow-hidden"
                style={{ width: `${sliderPos}%` }}
            >
                <img
                    src={beforeImage}
                    alt={beforeLabel}
                    className="absolute inset-0 w-[100vw] sm:w-[896px] h-full object-cover max-w-none"
                    style={{ width: containerRef.current ? containerRef.current.offsetWidth : "100%" }}
                    draggable={false}
                />
            </div>

            {/* Labels */}
            <div
                className={cn(
                    "absolute top-4 left-4 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-white text-xs sm:text-sm font-semibold transition-opacity duration-300",
                    sliderPos < 20 ? "opacity-0" : "opacity-100"
                )}
            >
                {beforeLabel}
            </div>
            <div
                className={cn(
                    "absolute top-4 right-4 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-white text-xs sm:text-sm font-semibold transition-opacity duration-300",
                    sliderPos > 80 ? "opacity-0" : "opacity-100"
                )}
            >
                {afterLabel}
            </div>

            {/* Slider Handle */}
            <div
                className="absolute top-0 bottom-0 w-0.5 bg-gold shadow-[0_0_10px_rgba(201,162,39,0.5)] cursor-ew-resize flex items-center justify-center z-10"
                style={{ left: `${sliderPos}%` }}
            >
                <div className="w-8 h-8 -ml-4 rounded-full bg-black/80 border-2 border-gold flex items-center justify-center shadow-lg shadow-black/50 backdrop-blur-sm group-hover:scale-110 transition-transform">
                    <MoveHorizontal className="w-4 h-4 text-gold" />
                </div>
            </div>
            
            {/* Interaction Overlay (to prevent drag issues) */}
            {isDragging && <div className="absolute inset-0 z-20" />}
        </div>
    );
}
