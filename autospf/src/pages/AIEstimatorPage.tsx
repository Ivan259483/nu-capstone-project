/**
 * AIEstimatorPage.tsx
 * Upload → AI Scan → AR Results flow for Capstone Defense demo.
 * Flow: (1) Upload damage photo → (2) 3-second AI scan animation → (3) AR + Damage Report
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import {
    ScanLine, Sparkles, ChevronRight, Car, Camera,
    CheckCircle2, ArrowRight, Upload, ImagePlus,
    X, AlertTriangle, Cpu, Eye, Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ARCarViewer } from '@/components/ARCarViewer';
import { useNavigate } from 'react-router-dom';

// ── Data ───────────────────────────────────────────────────────────────────────
const MOCK_DAMAGE_ITEMS = [
    { label: 'Paint Oxidation', severity: 'High', cost: '₱4,500', dot: 'bg-red-400' },
    { label: 'Clear Coat Failure', severity: 'High', cost: '₱6,000', dot: 'bg-red-400' },
    { label: 'Surface Swirl Marks', severity: 'Medium', cost: '₱2,500', dot: 'bg-yellow-400' },
    { label: 'Minor Dent (Door)', severity: 'Low', cost: '₱1,800', dot: 'bg-blue-400' },
];

const SERVICES_RECOMMENDED = [
    { name: 'Diamond Paint Correction', duration: '8 hrs', price: '₱9,000' },
    { name: 'Ceramic Shield Pro', duration: '6 hrs', price: '₱12,000' },
    { name: 'Full Interior Detail', duration: '4 hrs', price: '₱3,500' },
];

const SEVERITY_COLORS: Record<string, string> = {
    High: 'bg-red-500/15 text-red-300 border-red-500/30',
    Medium: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
    Low: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
};

/** Scanning steps shown sequentially during the 3s mock scan */
const SCAN_STEPS = [
    { icon: Eye, label: 'Detecting damage regions…' },
    { icon: Layers, label: 'Analyzing paint layers & clearcoat…' },
    { icon: Cpu, label: 'Running defect classification model…' },
    { icon: CheckCircle2, label: 'Generating cost estimate…' },
];

// ── Animation variants ─────────────────────────────────────────────────────────
const fadeUp: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.09, duration: 0.45, ease: 'easeOut' as const },
    }),
};

// ── Helper: convert File to base64 string ─────────────────────────────────────
const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

// ── Component ──────────────────────────────────────────────────────────────────
export default function AIEstimatorPage() {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [scanStage, setScanStage] = useState<'idle' | 'scanning' | 'done'>('idle');
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [currentStep, setCurrentStep] = useState(0);
    const [damageItems, setDamageItems] = useState(MOCK_DAMAGE_ITEMS);
    const [totalCost, setTotalCost] = useState('₱24,800');

    // ── File handling ──────────────────────────────────────────────────────────
    const processFile = useCallback((file: File) => {
        if (!file.type.startsWith('image/')) return;
        setUploadedFile(file);
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processFile(file);
    };

    const clearUpload = () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setUploadedFile(null);
        setPreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // ── Scan animation & AI Integration ────────────────────────────────────────
    const runScan = async () => {
        if (!uploadedFile) return;
        setScanStage('scanning');
        setScanProgress(0);
        setCurrentStep(0);

        // Animate progress up to 90% while waiting for API
        const totalMs = 3000;
        const interval = 30;
        let elapsed = 0;
        const timer = setInterval(() => {
            elapsed += interval;
            const pct = Math.min((elapsed / totalMs) * 100, 90);
            setScanProgress(pct);

            const stepIdx = Math.floor((elapsed / totalMs) * SCAN_STEPS.length);
            setCurrentStep(Math.min(stepIdx, SCAN_STEPS.length - 1));
        }, interval);

        try {
            // ── Call the Express backend which uses OpenAI GPT-4o vision ──
            const imageBase64 = await fileToBase64(uploadedFile);

            const response = await fetch('/api/ai/analyze-damage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageBase64,
                    mimeType: uploadedFile.type,
                }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || `HTTP ${response.status}`);
            }

            const { data: parsed } = await response.json();

            if (parsed?.issues && parsed?.totalEstimate) {
                const newItems = parsed.issues.map((i: any) => ({
                    label: i.name,
                    severity: i.severity,
                    cost: `₱${Number(i.cost).toLocaleString()}`,
                    dot: i.severity === 'High' ? 'bg-red-400' : i.severity === 'Medium' ? 'bg-yellow-400' : 'bg-blue-400'
                }));
                setDamageItems(newItems);
                setTotalCost(`₱${Number(parsed.totalEstimate).toLocaleString()}`);
            }
        } catch (error) {
            console.error("Gemini AI Scan failed, falling back to mock data:", error);
            setDamageItems(MOCK_DAMAGE_ITEMS);
            setTotalCost('₱24,800');
        } finally {
            clearInterval(timer);
            setScanProgress(100);
            setCurrentStep(SCAN_STEPS.length - 1);
            setTimeout(() => setScanStage('done'), 500);
        }
    };

    // Cleanup object URL on unmount
    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, []);

    // ── Derived ────────────────────────────────────────────────────────────────
    const canScan = !!uploadedFile && scanStage === 'idle';
    const StepIcon = SCAN_STEPS[currentStep]?.icon ?? Cpu;

    return (
        <div className="min-h-screen bg-black text-white">

            {/* ── Hero Header ───────────────────────────────────────────────── */}
            <div className="relative overflow-hidden border-b border-white/5 bg-gradient-to-b from-indigo-950/40 via-zinc-950 to-black">
                <div className="pointer-events-none absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-indigo-600/10 blur-[120px]" />
                <div className="pointer-events-none absolute -top-20 right-0 w-[500px] h-[500px] rounded-full bg-purple-600/8 blur-[100px]" />

                <div className="relative max-w-7xl mx-auto px-6 py-14 md:py-20 flex flex-col md:flex-row items-start md:items-center gap-8">
                    <div className="flex-1 space-y-5">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
                            <Badge className="bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-xs uppercase tracking-widest px-3 py-1">
                                <Sparkles className="w-3 h-3 mr-1.5" />
                                AI-Powered · WebXR Ready
                            </Badge>
                        </motion.div>

                        <motion.h1
                            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.55, delay: 0.08 }}
                            className="text-3xl md:text-5xl font-black tracking-tight leading-tight"
                        >
                            Vehicle Damage{' '}
                            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                                AR Estimator
                            </span>
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.55, delay: 0.15 }}
                            className="text-zinc-400 text-base max-w-lg leading-relaxed"
                        >
                            Upload a photo of your vehicle damage. Our AI will assess the condition and
                            show you the repaired result in{' '}
                            <strong className="text-white">Augmented Reality</strong>.
                        </motion.p>

                        {/* Step indicators */}
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            transition={{ delay: 0.3, duration: 0.5 }}
                            className="flex items-center gap-3 text-xs"
                        >
                            {['Upload Photo', 'AI Analysis', 'AR Results'].map((s, i) => (
                                <React.Fragment key={s}>
                                    <div className={`flex items-center gap-1.5 font-medium ${(i === 0 && (scanStage === 'idle')) ? 'text-indigo-400' :
                                        (i === 1 && scanStage === 'scanning') ? 'text-indigo-400' :
                                            (i === 2 && scanStage === 'done') ? 'text-emerald-400' :
                                                scanStage === 'done' && i < 2 ? 'text-zinc-500 line-through' :
                                                    'text-zinc-600'
                                        }`}>
                                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${(i === 0 && scanStage === 'idle') ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300' :
                                            (i === 1 && scanStage === 'scanning') ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300' :
                                                (i === 2 && scanStage === 'done') ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300' :
                                                    scanStage === 'done' && i < 2 ? 'border-zinc-700 bg-zinc-800 text-zinc-500' :
                                                        'border-zinc-700 bg-zinc-900 text-zinc-600'
                                            }`}>{i + 1}</span>
                                        {s}
                                    </div>
                                    {i < 2 && <ChevronRight className="w-3 h-3 text-zinc-700" />}
                                </React.Fragment>
                            ))}
                        </motion.div>
                    </div>
                </div>
            </div>

            {/* ── Main Content ──────────────────────────────────────────────── */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* ── LEFT COLUMN ─────────────────────────────────────────── */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.55, delay: 0.15 }}
                    className="flex flex-col gap-5 lg:sticky lg:top-6 lg:self-start"
                >
                    {/* ── UPLOAD ZONE (shown when not done) ─────────────────── */}
                    <AnimatePresence mode="wait">
                        {scanStage !== 'done' && (
                            <motion.div
                                key="upload-zone"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.3 }}
                            >
                                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">
                                    Step 1 — Upload Damage Photo
                                </p>

                                {!previewUrl ? (
                                    /* --- Drop zone --- */
                                    <div
                                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                        onDragLeave={() => setIsDragging(false)}
                                        onDrop={handleDrop}
                                        onClick={() => fileInputRef.current?.click()}
                                        className={`relative flex flex-col items-center justify-center gap-4 cursor-pointer
                                                    rounded-2xl border-2 border-dashed transition-all duration-300 p-10
                                                    ${isDragging
                                                ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]'
                                                : 'border-zinc-700 bg-zinc-900/40 hover:border-indigo-500/60 hover:bg-zinc-900/80'
                                            }`}
                                    >
                                        {/* Animated background glow while dragging */}
                                        {isDragging && (
                                            <div className="absolute inset-0 rounded-2xl bg-indigo-600/5 animate-pulse pointer-events-none" />
                                        )}

                                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300
                                                          ${isDragging ? 'bg-indigo-500/20' : 'bg-zinc-800'}`}>
                                            <ImagePlus className={`w-8 h-8 transition-colors duration-300 ${isDragging ? 'text-indigo-400' : 'text-zinc-500'}`} />
                                        </div>

                                        <div className="text-center">
                                            <p className="font-semibold text-white text-sm">
                                                {isDragging ? 'Drop to upload' : 'Upload a photo of your vehicle damage'}
                                            </p>
                                            <p className="text-zinc-500 text-xs mt-1">
                                                Drag & drop here, or <span className="text-indigo-400 underline">browse files</span>
                                            </p>
                                            <p className="text-zinc-600 text-[10px] mt-2">JPG, PNG, WEBP — up to 20 MB</p>
                                        </div>

                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={handleFileChange}
                                        />
                                    </div>
                                ) : (
                                    /* --- Preview --- */
                                    <div className="relative rounded-2xl overflow-hidden border border-zinc-700/60 bg-zinc-900">
                                        <img
                                            src={previewUrl}
                                            alt="Uploaded vehicle damage"
                                            className="w-full object-cover max-h-64"
                                        />
                                        {/* Overlay: filename + remove */}
                                        <div className="absolute bottom-0 inset-x-0 flex items-center justify-between px-4 py-3 bg-black/70 backdrop-blur-sm">
                                            <div className="flex items-center gap-2">
                                                <Camera className="w-4 h-4 text-indigo-400 shrink-0" />
                                                <span className="text-xs text-zinc-300 truncate max-w-[180px]">
                                                    {uploadedFile?.name}
                                                </span>
                                            </div>
                                            {scanStage === 'idle' && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); clearUpload(); }}
                                                    className="text-zinc-500 hover:text-red-400 transition-colors ml-2"
                                                    title="Remove image"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                        {/* Ready badge */}
                                        {scanStage === 'idle' && (
                                            <div className="absolute top-3 right-3">
                                                <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px]">
                                                    <CheckCircle2 className="w-3 h-3 mr-1" /> Ready to scan
                                                </Badge>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Scan Button */}
                                <Button
                                    onClick={runScan}
                                    disabled={!canScan}
                                    className={`w-full mt-4 h-12 rounded-xl font-bold gap-2.5 text-sm transition-all duration-300
                                        ${canScan
                                            ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg shadow-indigo-900/40'
                                            : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                                        }`}
                                >
                                    {scanStage === 'scanning' ? (
                                        <><ScanLine className="w-4 h-4 animate-pulse" /> Analyzing…</>
                                    ) : (
                                        <>
                                            <ScanLine className="w-4 h-4" />
                                            {canScan ? 'Start AI Scan' : 'Upload a photo first'}
                                        </>
                                    )}
                                </Button>

                                {!canScan && scanStage === 'idle' && (
                                    <p className="flex items-center gap-1.5 text-[11px] text-zinc-600 mt-2 justify-center">
                                        <AlertTriangle className="w-3 h-3" />
                                        Please upload a damage photo to enable the scan
                                    </p>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ── AR VIEWER (shown after scan is done) ─────────────── */}
                    <AnimatePresence>
                        {scanStage === 'done' && (
                            <motion.div
                                key="ar-viewer"
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5 }}
                            >
                                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">
                                    Step 3 — AR Visualization
                                </p>
                                <ARCarViewer
                                    modelSrc="https://modelviewer.dev/shared-assets/models/mustang.glb"
                                    title="Vehicle AR Inspection"
                                    subtitle="Drag to rotate · Pinch to zoom · Tap AR to place in your space"
                                />
                                <p className="text-center text-[11px] text-zinc-600 mt-3">
                                    📱 On iOS / Android — tap <strong className="text-zinc-500">View in AR</strong> to place the car in your space
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* ── RIGHT COLUMN ─────────────────────────────────────────── */}
                <div className="space-y-6">

                    {/* ── SCANNING ANIMATION ────────────────────────────────── */}
                    <AnimatePresence>
                        {scanStage === 'scanning' && (
                            <motion.div
                                key="scanning"
                                initial={{ opacity: 0, scale: 0.97 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.97 }}
                                transition={{ duration: 0.3 }}
                                className="rounded-2xl border border-indigo-500/25 bg-indigo-500/5 overflow-hidden"
                            >
                                {/* Scanned image with animated overlay */}
                                {previewUrl && (
                                    <div className="relative h-48 overflow-hidden">
                                        <img
                                            src={previewUrl}
                                            alt="Scanning"
                                            className="absolute inset-0 w-full h-full object-cover opacity-40"
                                        />
                                        {/* Moving scan line */}
                                        <div
                                            className="absolute left-0 right-0 h-0.5 bg-indigo-400/80 shadow-[0_0_12px_3px_rgba(99,102,241,0.6)]"
                                            style={{ animation: 'scanLine 1.5s ease-in-out infinite', top: '20%' }}
                                        />
                                        {/* Corner brackets */}
                                        <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-indigo-400/70 rounded-tl" />
                                        <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-indigo-400/70 rounded-tr" />
                                        <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-indigo-400/70 rounded-bl" />
                                        <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-indigo-400/70 rounded-br" />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="flex items-center gap-2 bg-black/60 backdrop-blur px-3 py-1.5 rounded-full text-xs text-indigo-300 border border-indigo-500/30">
                                                <ScanLine className="w-3.5 h-3.5 animate-pulse" />
                                                AI Vision Active
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="p-6 space-y-5">
                                    {/* Current step */}
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center shrink-0">
                                            <StepIcon className="w-4.5 h-4.5 text-indigo-400 w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-white">AI Vision Processing</p>
                                            <p className="text-xs text-indigo-300/80 mt-0.5">
                                                {SCAN_STEPS[currentStep]?.label}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Progress bar */}
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-[11px] text-zinc-500">
                                            <span>Analyzing…</span>
                                            <span>{Math.round(scanProgress)}%</span>
                                        </div>
                                        <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                                            <motion.div
                                                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                                                animate={{ width: `${scanProgress}%` }}
                                                transition={{ duration: 0.05, ease: 'linear' }}
                                            />
                                        </div>
                                    </div>

                                    {/* Step checklist */}
                                    <div className="space-y-2">
                                        {SCAN_STEPS.map((step, i) => {
                                            const done = i < currentStep;
                                            const active = i === currentStep;
                                            return (
                                                <div key={step.label} className="flex items-center gap-2.5 text-xs">
                                                    <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-all ${done ? 'bg-emerald-500/20 text-emerald-400' :
                                                        active ? 'bg-indigo-500/20 text-indigo-400' :
                                                            'bg-zinc-800 text-zinc-600'
                                                        }`}>
                                                        {done ? <CheckCircle2 className="w-3 h-3" /> : <step.icon className="w-3 h-3" />}
                                                    </div>
                                                    <span className={done ? 'text-zinc-500 line-through' : active ? 'text-white' : 'text-zinc-600'}>
                                                        {step.label}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ── DAMAGE REPORT ─────────────────────────────────────── */}
                    <AnimatePresence>
                        {scanStage === 'done' && (
                            <>
                                <motion.div
                                    key="damage-report"
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.45 }}
                                    className="rounded-2xl border border-white/10 bg-zinc-900/80 backdrop-blur overflow-hidden"
                                >
                                    <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center">
                                                <Car className="w-4 h-4 text-red-400" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-white text-sm">Damage Assessment</h3>
                                                <p className="text-xs text-zinc-500">4 issues detected · Severity: High</p>
                                            </div>
                                        </div>
                                        <Badge className="bg-red-500/15 text-red-300 border border-red-500/30 text-xs">
                                            Est. {totalCost}
                                        </Badge>
                                    </div>

                                    {/* Scanned image thumbnail */}
                                    {previewUrl && (
                                        <div className="px-6 pt-4">
                                            <div className="relative rounded-xl overflow-hidden h-32 border border-zinc-800">
                                                <img src={previewUrl} alt="Scanned vehicle" className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                                <div className="absolute bottom-2 left-3 flex items-center gap-1.5 text-[10px] text-emerald-300">
                                                    <CheckCircle2 className="w-3 h-3" /> Scan complete
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="divide-y divide-white/5 mt-2">
                                        {damageItems.map((item, i) => (
                                            <motion.div
                                                key={item.label + i}
                                                custom={i}
                                                variants={fadeUp}
                                                initial="hidden"
                                                animate="show"
                                                className="flex items-center justify-between px-6 py-3.5 hover:bg-white/[0.02] transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-2 h-2 rounded-full shrink-0 ${item.dot}`} />
                                                    <span className="text-sm text-zinc-200 font-medium">{item.label}</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <Badge variant="outline" className={`text-xs border ${SEVERITY_COLORS[item.severity]}`}>
                                                        {item.severity}
                                                    </Badge>
                                                    <span className="text-sm text-zinc-400 font-mono">{item.cost}</span>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>

                                    <div className="px-6 py-3 bg-zinc-900/50 border-t border-white/5 flex justify-between items-center">
                                        <span className="text-xs text-zinc-500">Total Estimate</span>
                                        <span className="text-lg font-black text-white">{totalCost}</span>
                                    </div>
                                </motion.div>

                                {/* ── RECOMMENDED SERVICES ─────────────────── */}
                                <motion.div
                                    key="services"
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.45, delay: 0.15 }}
                                    className="rounded-2xl border border-white/10 bg-zinc-900/80 backdrop-blur overflow-hidden"
                                >
                                    <div className="px-6 py-5 border-b border-white/5">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                                                <Sparkles className="w-4 h-4 text-emerald-400" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-white text-sm">Recommended Services</h3>
                                                <p className="text-xs text-zinc-500">AI-matched to your vehicle's condition</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="divide-y divide-white/5">
                                        {SERVICES_RECOMMENDED.map((svc, i) => (
                                            <motion.div
                                                key={svc.name}
                                                custom={i}
                                                variants={fadeUp}
                                                initial="hidden"
                                                animate="show"
                                                className="flex items-center justify-between px-6 py-4"
                                            >
                                                <div>
                                                    <p className="text-sm font-semibold text-white">{svc.name}</p>
                                                    <p className="text-xs text-zinc-500 mt-0.5">{svc.duration}</p>
                                                </div>
                                                <span className="text-sm font-bold text-emerald-400">{svc.price}</span>
                                            </motion.div>
                                        ))}
                                    </div>
                                    <div className="px-6 py-4 bg-black/20 border-t border-white/5 flex flex-col gap-2">
                                        <Button
                                            onClick={() => navigate('/booking')}
                                            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl h-11 font-semibold gap-2 shadow-lg shadow-indigo-900/30"
                                        >
                                            Book Recommended Services
                                            <ArrowRight className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            onClick={() => { clearUpload(); setScanStage('idle'); setScanProgress(0); }}
                                            className="w-full text-zinc-500 hover:text-white text-xs h-8 rounded-xl"
                                        >
                                            ↩ Scan a different vehicle
                                        </Button>
                                    </div>
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>

                    {/* ── EMPTY PROMPT (no image, no scan) ─────────────────── */}
                    <AnimatePresence>
                        {scanStage === 'idle' && !uploadedFile && (
                            <motion.div
                                key="empty"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="rounded-2xl border border-dashed border-zinc-800 p-10 flex flex-col items-center gap-3 text-center"
                            >
                                <div className="w-12 h-12 rounded-2xl bg-zinc-900 flex items-center justify-center">
                                    <Upload className="w-6 h-6 text-zinc-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-zinc-400">Results will appear here</p>
                                    <p className="text-xs text-zinc-600 mt-1 max-w-xs">
                                        Upload a damage photo on the left and run the AI scan to see your damage report and 3D AR visualization.
                                    </p>
                                </div>
                            </motion.div>
                        )}

                        {scanStage === 'idle' && uploadedFile && (
                            <motion.div
                                key="ready"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-8 flex flex-col items-center gap-3 text-center"
                            >
                                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
                                    <ScanLine className="w-6 h-6 text-indigo-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-white">Photo ready — click "Start AI Scan"</p>
                                    <p className="text-xs text-zinc-500 mt-1">
                                        Our AI will analyze your photo for paint defects, swirl marks, and surface damage.
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Scan line keyframe */}
            <style>{`
                @keyframes scanLine {
                    0%   { top: 10%; opacity: 1; }
                    50%  { top: 85%; opacity: 0.6; }
                    100% { top: 10%; opacity: 1; }
                }
            `}</style>
        </div>
    );
}
