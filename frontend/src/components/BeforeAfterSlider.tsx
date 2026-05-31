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
                "relative w-full max-w-4xl mx-auto aspect-video rounded-2xl overflow-hidden cursor-ew-resize select-none border border-white/10 shadow-2xl shadow-black/50 group",
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
                className="absolute inset-y-0 z-10 -translate-x-1/2"
                style={{ left: `${sliderPos}%` }}
            >
                <div
                    className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-orange-500 shadow-[0_0_14px_rgba(249,115,22,0.55)]"
                    aria-hidden
                />
                <div
                    className="absolute left-1/2 top-1/2 flex h-10 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-orange-500 bg-black/85 p-0 shadow-lg shadow-black/50 backdrop-blur-sm transition-transform group-hover:scale-110"
                    aria-hidden
                >
                    <MoveHorizontal
                        className="block h-[18px] w-[18px] shrink-0 text-orange-500"
                        strokeWidth={2.25}
                    />
                </div>
            </div>
            
            {/* Interaction Overlay (to prevent drag issues) */}
            {isDragging && <div className="absolute inset-0 z-20" />}
        </div>
    );
}
