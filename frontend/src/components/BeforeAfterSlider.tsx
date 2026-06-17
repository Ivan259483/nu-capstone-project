import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
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

    const updateSliderPos = (nextPos: number) => {
        setSliderPos(Math.max(0, Math.min(nextPos, 100)));
    };

    const handleMove = (clientX: number) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const percent = Math.max(0, Math.min((x / rect.width) * 100, 100));
        updateSliderPos(percent);
    };

    const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
        setIsDragging(true);
        handleMove(e.clientX);
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
        if (isDragging) handleMove(e.clientX);
    };

    const stopDragging = (e: PointerEvent<HTMLDivElement>) => {
        setIsDragging(false);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "ArrowLeft") {
            e.preventDefault();
            updateSliderPos(sliderPos - 4);
        } else if (e.key === "ArrowRight") {
            e.preventDefault();
            updateSliderPos(sliderPos + 4);
        } else if (e.key === "Home") {
            e.preventDefault();
            updateSliderPos(0);
        } else if (e.key === "End") {
            e.preventDefault();
            updateSliderPos(100);
        }
    };

    return (
        <div
            ref={containerRef}
            className={cn(
                "relative w-full max-w-4xl mx-auto aspect-video rounded-2xl overflow-hidden cursor-ew-resize select-none border border-white/10 shadow-2xl shadow-black/50 group",
                "transition-[border-color,box-shadow,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-[#F4B63D]/22 hover:shadow-[0_28px_78px_rgba(0,0,0,0.52),0_0_34px_rgba(244,182,61,0.11)] motion-reduce:transform-none",
                className
            )}
            style={{ touchAction: "none" }}
            role="slider"
            tabIndex={0}
            aria-label="Before and after comparison"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(sliderPos)}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
            onKeyDown={handleKeyDown}
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
                className="absolute inset-0 overflow-hidden will-change-[clip-path]"
                style={{
                    clipPath: `inset(0 ${100 - sliderPos}% 0 0)`,
                    transition: isDragging ? "none" : "clip-path 360ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
            >
                <img
                    src={beforeImage}
                    alt={beforeLabel}
                    className="absolute inset-0 h-full w-full object-cover max-w-none"
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
                className="absolute inset-y-0 z-10 -translate-x-1/2 will-change-transform"
                style={{
                    left: `${sliderPos}%`,
                    transition: isDragging ? "none" : "left 360ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
            >
                <div
                    className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#F4B63D]/90 shadow-[0_0_18px_rgba(244,182,61,0.45)]"
                    aria-hidden
                />
                <div
                    className={cn(
                        "absolute left-1/2 top-1/2 flex h-11 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#F4B63D]/75 bg-black/86 p-0 shadow-[0_18px_34px_rgba(0,0,0,0.42),0_0_24px_rgba(244,182,61,0.2)] backdrop-blur-md transition-[transform,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.06]",
                        isDragging && "scale-[1.08] border-[#ffe1a1]/90 shadow-[0_20px_42px_rgba(0,0,0,0.46),0_0_32px_rgba(244,182,61,0.28)]"
                    )}
                    aria-hidden
                >
                    <MoveHorizontal
                        className="block h-[18px] w-[18px] shrink-0 text-[#F4B63D]"
                        strokeWidth={2.25}
                    />
                </div>
            </div>
        </div>
    );
}
