import React, { useRef, useState } from 'react';
import { Upload, X, Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { analyzeLocalCarProfile, type LocalCarScanImage } from '@/lib/localCarProfile';

const ANALYZE_TAP_DEBOUNCE_MS = 1200;

interface CarAnalysis {
    color: string;
    type: 'sedan' | 'suv' | 'truck' | 'sport' | 'hatchback' | 'unknown';
    condition: string;
    confidence: number;
}

interface CarScannerProps {
    onAnalysisComplete: (analysis: CarAnalysis) => void;
}

interface ScanImage extends LocalCarScanImage {
    id: string;
}

const CarScanner: React.FC<CarScannerProps> = ({ onAnalysisComplete }) => {
    const [images, setImages] = useState<ScanImage[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const requestLockRef = useRef(false);
    const lastAnalyzeTapAtRef = useRef(0);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        if (images.length + files.length > 8) {
            toast.error('Maximum 8 images allowed');
            return;
        }

        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImages(prev => [
                    ...prev,
                    {
                        id: `${file.name}_${file.size}_${Date.now()}`,
                        preview: reader.result as string,
                        fileName: file.name,
                        mimeType: file.type || 'image/jpeg',
                        fileSize: file.size,
                    },
                ]);
            };
            reader.readAsDataURL(file);
        });
    };

    const removeImage = (index: number) => {
        setImages(prev => prev.filter((_, i) => i !== index));
    };

    const analyzeImages = async () => {
        if (images.length === 0) {
            toast.error('Please upload at least one image of your car');
            return;
        }

        const now = Date.now();
        const sinceLastTap = now - lastAnalyzeTapAtRef.current;
        if (sinceLastTap < ANALYZE_TAP_DEBOUNCE_MS) {
            console.log(`[CarScanner] Analyze tap debounced (${sinceLastTap}ms since previous tap)`);
            return;
        }
        lastAnalyzeTapAtRef.current = now;

        if (requestLockRef.current) {
            console.log('[CarScanner] Analyze blocked: request lock is active');
            return;
        }

        const requestId = `web_scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        requestLockRef.current = true;
        setIsAnalyzing(true);
        setUploadProgress(10);
        console.log(`[CarScanner][${requestId}] Analysis started (images=${images.length})`);

        try {
            await new Promise(resolve => setTimeout(resolve, 180));
            setUploadProgress(42);
            await new Promise(resolve => setTimeout(resolve, 160));
            setUploadProgress(78);
            const analysis: CarAnalysis = analyzeLocalCarProfile(images);
            setUploadProgress(100);
            toast.success('Local Scan Complete');
            onAnalysisComplete(analysis);
            console.log(`[CarScanner][${requestId}] Analysis success`);

        } catch (error) {
            console.error('Local car scan failed:', error);
            toast.error('Local scan failed. Switching to manual mode.');
            // Fallback
            onAnalysisComplete({
                color: '#ffffff',
                type: 'sedan',
                condition: 'Unknown',
                confidence: 0
            });
        } finally {
            setIsAnalyzing(false);
            requestLockRef.current = false;
            console.log(`[CarScanner][${requestId}] Analysis finished`);
        }
    };

    return (
        <Card className="w-full bg-zinc-900 border-zinc-800">
            <CardContent className="p-6 space-y-6">
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-500/10 mb-2">
                        <Sparkles className="w-6 h-6 text-orange-500" />
                    </div>
                    <h3 className="text-xl font-semibold text-white">Local Car Scanner</h3>
                    <p className="text-zinc-400 text-sm max-w-sm mx-auto">
                        Upload photos of your vehicle. The local scan engine will estimate its body style, color, and condition to generate a 3D digital twin.
                    </p>
                </div>

                {/* Upload Area */}
                {/* Upload Area */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {images.map((img, idx) => (
                        <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-zinc-700 group">
                            <img src={img.preview} alt={`Car angle ${idx + 1}`} className="w-full h-full object-cover" />
                            <button
                                onClick={() => removeImage(idx)}
                                className="absolute top-1 right-1 bg-black/50 p-1 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}

                    {images.length < 8 && (
                        <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-zinc-700 rounded-lg cursor-pointer hover:border-orange-500 hover:bg-zinc-800/50 transition-all group min-h-[140px]">
                            <Upload className="w-8 h-8 text-zinc-500 group-hover:text-white mb-2" />
                            <span className="text-xs text-zinc-500 group-hover:text-zinc-300 text-center px-2">Add Photo</span>
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={handleImageUpload}
                                disabled={isAnalyzing}
                            />
                        </label>
                    )}
                </div>

                <div className="pt-4">
                    <Button
                        className="w-full bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold py-6"
                        onClick={analyzeImages}
                        disabled={images.length === 0 || isAnalyzing}
                    >
                        {isAnalyzing ? (
                            <>
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                Analyzing Vehicle ({uploadProgress}%)...
                            </>
                        ) : (
                            <>
                                Start Local Scan <ArrowRight className="ml-2 h-5 w-5" />
                            </>
                        )}
                    </Button>
                    {images.length === 0 && (
                        <p className="text-center text-xs text-zinc-500 mt-3">
                            Upload at least 1 photo to start
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

export default CarScanner;
