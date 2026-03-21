import React, { useState } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Upload, X, Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';

// Placeholder key - in production use import.meta.env.VITE_GEMINI_API_KEY
// For this demo, we'll try to find it in env, or fall back to a mock if not present/fails.
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

interface CarAnalysis {
    color: string;
    type: 'sedan' | 'suv' | 'truck' | 'sport' | 'hatchback' | 'unknown';
    condition: string;
    confidence: number;
}

interface CarScannerProps {
    onAnalysisComplete: (analysis: CarAnalysis) => void;
}

const CarScanner: React.FC<CarScannerProps> = ({ onAnalysisComplete }) => {
    const [images, setImages] = useState<string[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

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
                setImages(prev => [...prev, reader.result as string]);
            };
            reader.readAsDataURL(file);
        });
    };

    const removeImage = (index: number) => {
        setImages(prev => prev.filter((_, i) => i !== index));
    };

    const fileToGenerativePart = async (base64Data: string) => {
        // Remove metadata prefix (e.g., "data:image/jpeg;base64,")
        const base64Content = base64Data.split(',')[1];
        return {
            inlineData: {
                data: base64Content,
                mimeType: 'image/jpeg', // Assuming jpeg for simplicity, detecting would be better
            },
        };
    };

    const analyzeImages = async () => {
        if (images.length === 0) {
            toast.error('Please upload at least one image of your car');
            return;
        }

        setIsAnalyzing(true);
        setUploadProgress(10);

        try {
            if (!API_KEY) {
                // Mock analysis if no API key is present
                await new Promise(resolve => setTimeout(resolve, 2000));
                setUploadProgress(100);

                // Return a mock result based on "random" logic for demo variety
                const mockColors = ['#E53935', '#1E88E5', '#43A047', '#FB8C00', '#8E24AA', '#ffffff', '#000000'];
                const mockTypes: CarAnalysis['type'][] = ['sedan', 'suv', 'sport', 'truck'];

                const mockAnalysis: CarAnalysis = {
                    color: mockColors[Math.floor(Math.random() * mockColors.length)],
                    type: mockTypes[Math.floor(Math.random() * mockTypes.length)],
                    condition: 'Used - Good Condition',
                    confidence: 0.95
                };

                toast.success('AI Analysis Complete (Mock Mode)');
                onAnalysisComplete(mockAnalysis);
                setIsAnalyzing(false);
                return;
            }

            // Real Gemini Analysis
            const genAI = new GoogleGenerativeAI(API_KEY);
            const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

            setUploadProgress(40);

            const imageParts = await Promise.all(images.map(img => fileToGenerativePart(img)));

            setUploadProgress(60);

            const prompt = `Analyze these car images. output JSON ONLY with the following structure:
      {
        "color": "css_hex_code_of_dominant_paint_color",
        "type": "one of: sedan, suv, truck, sport, hatchback",
        "condition": "brief description of paint condition",
        "confidence": number between 0 and 1
      }`;

            const result = await model.generateContent([prompt, ...imageParts]);
            const response = await result.response;
            const text = response.text();

            setUploadProgress(90);

            // Clean markdown if present
            const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const analysis: CarAnalysis = JSON.parse(jsonStr);

            setUploadProgress(100);
            toast.success('AI Analysis Complete!');
            onAnalysisComplete(analysis);

        } catch (error) {
            console.error('Gemini Analysis Failed:', error);
            toast.error('AI Analysis failed. Switching to manual mode.');
            // Fallback
            onAnalysisComplete({
                color: '#ffffff',
                type: 'sedan',
                condition: 'Unknown',
                confidence: 0
            });
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <Card className="w-full bg-zinc-900 border-zinc-800">
            <CardContent className="p-6 space-y-6">
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-500/10 mb-2">
                        <Sparkles className="w-6 h-6 text-orange-500" />
                    </div>
                    <h3 className="text-xl font-semibold text-white">AI Car Scanner</h3>
                    <p className="text-zinc-400 text-sm max-w-sm mx-auto">
                        Upload photos of your vehicle. Our Gemini AI will analyze its body lines, color, and condition to generate a 3D digital twin.
                    </p>
                </div>

                {/* Upload Area */}
                {/* Upload Area */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {images.map((img, idx) => (
                        <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-zinc-700 group">
                            <img src={img} alt={`Car angle ${idx + 1}`} className="w-full h-full object-cover" />
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
                                Start AI Analysis <ArrowRight className="ml-2 h-5 w-5" />
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
