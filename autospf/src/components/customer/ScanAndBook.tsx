import React, { useState, useRef } from 'react';
import { Camera, Upload, Check, Zap, ArrowRight, RefreshCcw, ScanSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

type FlowStep = 'upload' | 'analyzing' | 'results';

export const ScanAndBook: React.FC = () => {
    const [flowStep, setFlowStep] = useState<FlowStep>('upload');
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const aiEstimate = {
        base: 2500,
        paintCorrection: 1500,
        ceramicCoating: 4000,
        total: 8000,
    };

    const triggerFileUpload = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Show the image preview while scanning
        const reader = new FileReader();
        reader.onloadend = () => setPreviewUrl(reader.result as string);
        reader.readAsDataURL(file);

        // Enter the "analyzing" state
        setFlowStep('analyzing');

        // Simulate 3.5s AI processing delay
        setTimeout(() => {
            setFlowStep('results');
            toast.success('AI Analysis Complete! Damage report is ready.');
        }, 3500);

        // Reset the file input so the same file can be re-selected if needed
        e.target.value = '';
    };

    const handleReset = () => {
        setFlowStep('upload');
        setPreviewUrl(null);
    };

    const handleConfirm = () => {
        toast.info('Redirecting to payment...');
        // TODO: Wire this to the booking payment flow
    };

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Hidden real file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileSelected}
            />

            <div className="text-center md:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-4">
                    <Zap className="w-4 h-4" />
                    <span className="text-sm font-medium">AutoSPF+ AI Vision</span>
                </div>
                <h1 className="text-3xl font-bold text-white">Scan & Book</h1>
                <p className="text-zinc-400 mt-2">
                    Let our AI analyze your vehicle's condition and recommend the perfect detailing package.
                </p>
            </div>

            {/* ── STEP 1: UPLOAD ── */}
            {flowStep === 'upload' && (
                <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardContent className="p-12 flex flex-col items-center justify-center text-center">
                        <div className="w-24 h-24 rounded-full bg-zinc-800 flex items-center justify-center mb-8">
                            <Camera className="w-10 h-10 text-zinc-400" />
                        </div>
                        <p className="text-zinc-400 text-sm max-w-xs mb-8">
                            Take a photo or upload an image of your car. Our AI will scan for paint defects, swirls, and surface condition.
                        </p>
                        <div className="flex flex-col gap-3 w-full max-w-sm">
                            <Button onClick={triggerFileUpload} className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 text-base">
                                <Camera className="w-5 h-5 mr-2" /> Open Camera / Take Photo
                            </Button>
                            <div className="relative flex items-center py-1">
                                <div className="flex-grow border-t border-zinc-800" />
                                <span className="flex-shrink-0 mx-4 text-zinc-500 text-sm">or</span>
                                <div className="flex-grow border-t border-zinc-800" />
                            </div>
                            <Button onClick={triggerFileUpload} variant="outline" className="w-full border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-white h-12 text-base">
                                <Upload className="w-5 h-5 mr-2" /> Upload Car Photo
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ── STEP 2: ANALYZING ── */}
            {flowStep === 'analyzing' && (
                <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardContent className="p-12 flex flex-col items-center text-center gap-8">
                        {/* Image preview with scanner overlay */}
                        {previewUrl && (
                            <div className="relative w-full max-w-md rounded-xl overflow-hidden border border-zinc-700">
                                <img
                                    src={previewUrl}
                                    alt="Uploaded vehicle"
                                    className="w-full max-h-64 object-cover opacity-60"
                                />
                                {/* Animated scanner line */}
                                <div className="absolute inset-0 overflow-hidden">
                                    <div
                                        className="absolute w-full h-1 bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_20px_rgba(99,102,241,0.6)]"
                                        style={{ animation: 'scanLine 2s ease-in-out infinite' }}
                                    />
                                </div>
                                {/* Grid overlay for tech feel */}
                                <div
                                    className="absolute inset-0 opacity-20"
                                    style={{
                                        backgroundImage: 'linear-gradient(rgba(99,102,241,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.3) 1px, transparent 1px)',
                                        backgroundSize: '40px 40px',
                                    }}
                                />
                            </div>
                        )}

                        {/* Main spinner */}
                        <div className="flex flex-col items-center gap-4">
                            <div className="relative">
                                <div className="w-16 h-16 rounded-full border-4 border-zinc-800" />
                                <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
                                <ScanSearch className="absolute inset-0 m-auto w-7 h-7 text-indigo-400" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white">AI is scanning your vehicle...</h3>
                                <p className="text-zinc-400 text-sm mt-1 max-w-sm">
                                    Detecting defects, mapping the 3D surface model, and calculating the optimal service package. Please wait.
                                </p>
                            </div>
                            {/* Animated progress steps */}
                            <div className="flex flex-col gap-1.5 text-sm text-left w-full max-w-xs mt-2">
                                {['Mapping paint surface...', 'Detecting swirl marks...', 'Calculating correction depth...'].map((txt, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center gap-2 text-zinc-500 animate-pulse"
                                        style={{ animationDelay: `${i * 0.4}s` }}
                                    >
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                                        {txt}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ── STEP 3: RESULTS ── */}
            {flowStep === 'results' && (
                <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
                    {/* AR Visualization header */}
                    <div className="h-56 bg-black relative flex items-center justify-center overflow-hidden">
                        {previewUrl && (
                            <img src={previewUrl} alt="Scanned vehicle" className="absolute inset-0 w-full h-full object-cover opacity-30" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-tr from-indigo-900/40 via-transparent to-purple-900/40" />
                        <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-xs text-white flex items-center gap-2 z-10">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Analysis Complete
                        </div>
                        <div className="relative z-10 w-full max-w-md h-36 border-2 border-indigo-500/40 rounded-3xl mx-auto flex items-center justify-center shadow-[0_0_50px_rgba(99,102,241,0.25)]">
                            <span className="text-zinc-400 font-mono text-sm tracking-widest">3D SURFACE MODEL READY</span>
                        </div>
                    </div>

                    <CardContent className="p-6">
                        <h3 className="text-xl font-bold text-white mb-1">AI Cost Estimate</h3>
                        <p className="text-zinc-500 text-sm mb-5">Based on vehicle scan analysis — moderate paint swirls & surface oxidation detected.</p>

                        <div className="space-y-3 mb-6">
                            {[
                                { label: 'Base Detail Package', amount: aiEstimate.base },
                                { label: 'Paint Correction (Moderate Swirls)', amount: aiEstimate.paintCorrection },
                                { label: 'Ceramic Pro Coating', amount: aiEstimate.ceramicCoating },
                            ].map((item) => (
                                <div key={item.label} className="flex justify-between items-center text-zinc-300">
                                    <span className="flex items-center gap-2">
                                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                        {item.label}
                                    </span>
                                    <span className="font-medium shrink-0 ml-4">{formatCurrency(item.amount)}</span>
                                </div>
                            ))}
                            <div className="pt-3 border-t border-zinc-800 flex justify-between items-center text-white font-bold text-lg">
                                <span>Total Estimated Cost</span>
                                <span className="text-indigo-400">{formatCurrency(aiEstimate.total)}</span>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white" onClick={handleReset}>
                                <RefreshCcw className="w-4 h-4 mr-2" /> Rescan
                            </Button>
                            <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleConfirm}>
                                Confirm & Proceed to Payment <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Scanner line keyframe — injected into a style tag */}
            <style>{`
                @keyframes scanLine {
                    0%   { top: 0%; }
                    50%  { top: calc(100% - 4px); }
                    100% { top: 0%; }
                }
            `}</style>
        </div>
    );
};
