import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import CarScanner from '@/components/3d/CarScanner';
import VehicleViewer from '@/components/3d/VehicleViewer';
import OutcomeComparison from '@/components/3d/OutcomeComparison';

interface CarState {
    color: string;
    type: 'sedan' | 'suv' | 'truck' | 'sport' | 'hatchback' | 'unknown';
    roughness: number;
    metalness: number;
}

const ScanPreviewPage: React.FC = () => {
    const [step, setStep] = useState<1 | 2>(1);
    const [carState, setCarState] = useState<CarState>({
        color: '#ffffff',
        type: 'sedan',
        roughness: 0.6,
        metalness: 0.2
    });

    const handleAnalysisComplete = (analysis: any) => {
        setCarState(prev => ({
            ...prev,
            color: analysis.color,
            type: analysis.type,
            // Reset to "Before" state logic
            roughness: 0.6,
            metalness: 0.2
        }));
        setStep(2);
    };

    const handleOutcomeChange = (roughness: number, metalness: number) => {
        setCarState(prev => ({
            ...prev,
            roughness,
            metalness
        }));
    };

    return (
        <div className="min-h-screen bg-black text-white p-4 pb-24 md:p-8">
            <div className="max-w-5xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex items-center gap-4">
                    <Link to="/customer/dashboard" className="p-2 -ml-2 hover:bg-zinc-800 rounded-full transition-colors">
                        <ArrowLeft className="w-6 h-6 text-zinc-400" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold">Smart Scan & Preview</h1>
                        <p className="text-zinc-400 text-sm">Offline scan analysis and 3D simulation</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Left Panel: Scanner / Controls */}
                    <div className="lg:col-span-1 space-y-6 order-1 lg:order-none">
                        {step === 1 && (
                            <CarScanner onAnalysisComplete={handleAnalysisComplete} />
                        )}

                        {step === 2 && (
                            <div className="animate-in fade-in slide-in-from-left duration-500">
                                <OutcomeComparison onOutcomeChange={handleOutcomeChange} />

                                <button
                                    onClick={() => setStep(1)}
                                    className="w-full mt-4 py-2 text-sm text-zinc-500 hover:text-white transition-colors"
                                >
                                    Start New Scan
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Right Panel: 3D View */}
                    <div className="lg:col-span-2 order-2 lg:order-none">
                        {step === 1 ? (
                            <div className="h-[400px] rounded-xl border border-zinc-800 bg-zinc-900/50 flex flex-col items-center justify-center text-center p-8">
                                <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mb-4">
                                    <span className="text-3xl">🚗</span>
                                </div>
                                <h3 className="text-lg font-medium text-white">Ready to Scan</h3>
                                <p className="text-sm text-zinc-500 max-w-xs mt-2">
                                    Upload photos of your vehicle on the left to generate its 3D digital twin.
                                </p>
                            </div>
                        ) : (
                            <div className="animate-in fade-in zoom-in duration-500">
                                <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                    Live 3D Preview
                                </h2>
                                <VehicleViewer
                                    {...carState}
                                    showARButton={true}
                                />
                                <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
                                    {/* Color Swatches (Quick Override) */}
                                    {['#ffffff', '#000000', '#ff0000', '#0000ff', '#ffff00'].map(c => (
                                        <button
                                            key={c}
                                            onClick={() => setCarState(s => ({ ...s, color: c }))}
                                            className="w-8 h-8 rounded-full border border-zinc-600 shadow-sm"
                                            style={{ backgroundColor: c }}
                                            aria-label={`Change color to ${c}`}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScanPreviewPage;
