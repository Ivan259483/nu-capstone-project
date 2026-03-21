import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { Button } from '@/components/ui/button';

type SignaturePadProps = {
    onChange?: (dataUrl: string | null) => void;
    className?: string;
    height?: number;
};

export default function SignaturePad({ onChange, className, height = 160 }: SignaturePadProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawingRef = useRef(false);
    const [hasDrawn, setHasDrawn] = useState(false);

    const setupCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ratio = window.devicePixelRatio || 1;
        const { width, height: canvasHeight } = canvas.getBoundingClientRect();
        canvas.width = Math.max(1, Math.floor(width * ratio));
        canvas.height = Math.max(1, Math.floor(canvasHeight * ratio));
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(ratio, ratio);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#f4f4f5';
    }, []);

    useEffect(() => {
        setupCanvas();
        const handleResize = () => setupCanvas();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [setupCanvas]);

    const getPoint = (event: PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const startDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const { x, y } = getPoint(event);
        drawingRef.current = true;
        canvas.setPointerCapture(event.pointerId);
        ctx.beginPath();
        ctx.moveTo(x, y);
        setHasDrawn(true);
    };

    const draw = (event: PointerEvent<HTMLCanvasElement>) => {
        if (!drawingRef.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const { x, y } = getPoint(event);
        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const endDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
        if (!drawingRef.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        drawingRef.current = false;
        canvas.releasePointerCapture(event.pointerId);
        if (hasDrawn) {
            onChange?.(canvas.toDataURL('image/png'));
        }
    };

    const clearSignature = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasDrawn(false);
        onChange?.(null);
    };

    return (
        <div className={className}>
            <div className="rounded-md border border-zinc-700 bg-[#0b0b0e]">
                <canvas
                    ref={canvasRef}
                    className="w-full touch-none"
                    style={{ height }}
                    onPointerDown={startDrawing}
                    onPointerMove={draw}
                    onPointerUp={endDrawing}
                    onPointerLeave={endDrawing}
                />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                <span>{hasDrawn ? 'Signature captured' : 'Sign above using finger or stylus'}</span>
                <Button type="button" variant="ghost" size="sm" className="text-zinc-400 hover:text-white" onClick={clearSignature}>
                    Clear
                </Button>
            </div>
        </div>
    );
}
