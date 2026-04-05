/**
 * ARCarViewer.tsx
 * International-standard AR component powered by Google's <model-viewer>.
 * Provides a premium 3D + AR experience with Before/After material simulation.
 *
 * NOTE ON SSR: This project is a Vite SPA (not Next.js), so there are no SSR
 * hydration issues. The <model-viewer> web component is loaded via a side-effect
 * <script> the first time this component mounts, keeping the bundle lean.
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Loader2, Zap, Hammer, View } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

// ── TypeScript declarations for the <model-viewer> custom element ─────────────
declare global {
    namespace JSX {
        interface IntrinsicElements {
            'model-viewer': React.DetailedHTMLProps<
                React.HTMLAttributes<HTMLElement> & {
                    src?: string;
                    alt?: string;
                    ar?: boolean;
                    'ar-modes'?: string;
                    'camera-controls'?: boolean;
                    'auto-rotate'?: boolean;
                    'shadow-intensity'?: string;
                    'environment-image'?: string;
                    exposure?: string;
                    loading?: string;
                    poster?: string;
                    style?: React.CSSProperties;
                    class?: string;
                    'ar-button-style'?: string;
                    onLoad?: React.EventHandler<any>;
                    onError?: React.EventHandler<any>;
                },
                HTMLElement
            >;
        }
    }
}

// ── Material Profiles ──────────────────────────────────────────────────────────
const MATERIAL_PROFILES = {
    damaged: {
        label: 'Damaged',
        roughness: 0.9,
        clearcoat: 0,
        baseColorFactor: [0.25, 0.22, 0.20, 1.0] as [number, number, number, number],
        badge: 'Pre-Repair',
        badgeClass: 'bg-red-500/20 text-red-300 border-red-500/30',
        description: 'Oxidized paint, surface scratches, worn clearcoat',
    },
    repaired: {
        label: 'Repaired',
        roughness: 0.08,
        clearcoat: 1.0,
        baseColorFactor: [0.05, 0.35, 0.85, 1.0] as [number, number, number, number],
        badge: 'Post-Detail',
        badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        description: 'Mirror-like clearcoat, paint corrected, ceramic coated',
    },
} as const;

type ProfileKey = keyof typeof MATERIAL_PROFILES;

// ── Helper: inject the model-viewer script once ────────────────────────────────
let scriptInjected = false;
function ensureModelViewerScript() {
    if (scriptInjected || document.querySelector('[data-model-viewer-script]')) {
        scriptInjected = true;
        return;
    }
    const script = document.createElement('script');
    script.type = 'module';
    script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js';
    script.setAttribute('data-model-viewer-script', 'true');
    document.head.appendChild(script);
    scriptInjected = true;
}

// ── Component ──────────────────────────────────────────────────────────────────
interface ARCarViewerProps {
    modelSrc?: string;
    /** Optional poster image shown while the model loads */
    posterSrc?: string;
    title?: string;
    subtitle?: string;
}

export const ARCarViewer: React.FC<ARCarViewerProps> = ({
    modelSrc = '/models/car.glb',
    posterSrc,
    title = 'Vehicle AR Inspection',
    subtitle = 'Drag to rotate · Pinch to zoom · Tap AR to project in your space',
}) => {
    const viewerRef = useRef<HTMLElement & { model?: any }>(null);
    const [profile, setProfile] = useState<ProfileKey>('damaged');
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [isApplyingMaterial, setIsApplyingMaterial] = useState(false);

    // Inject the model-viewer web component script on mount
    useEffect(() => {
        ensureModelViewerScript();
    }, []);

    // ── Apply material profile to model-viewer materials ────────────────────────
    const applyMaterialProfile = useCallback(async (key: ProfileKey) => {
        const mv = viewerRef.current;
        if (!mv || !mv.model) {
            toast.error('3D model is not yet loaded. Please wait.');
            return;
        }

        setIsApplyingMaterial(true);
        try {
            const { materials } = mv.model as { materials: any[] };
            if (!materials || materials.length === 0) {
                toast.warning('No materials found on this model.');
                return;
            }

            const p = MATERIAL_PROFILES[key];

            for (const material of materials) {
                // PBR Metallic Roughness
                const pbr = material.pbrMetallicRoughness;
                if (pbr) {
                    if (pbr.setRoughnessFactor) pbr.setRoughnessFactor(p.roughness);
                    if (pbr.setBaseColorFactor) pbr.setBaseColorFactor(p.baseColorFactor);
                }

                // KHR_materials_clearcoat extension
                if (material.extensions?.KHR_materials_clearcoat) {
                    const cc = material.extensions.KHR_materials_clearcoat;
                    if (cc.setClearcoatFactor) cc.setClearcoatFactor(p.clearcoat);
                }
            }

            toast.success(`Applied: ${p.label} profile`);
        } catch (err) {
            console.error('Material swap error:', err);
            toast.error('Could not apply material changes. The model may not support this.');
        } finally {
            setIsApplyingMaterial(false);
        }
    }, []);

    // ── Switch profile via toggle ────────────────────────────────────────────────
    const handleToggle = async (key: ProfileKey) => {
        if (key === profile) return;
        setProfile(key);
        if (isModelLoaded) {
            await applyMaterialProfile(key);
        }
    };

    // ── Apply initial profile after model loads ──────────────────────────────────
    const handleModelLoad = useCallback(async () => {
        setIsModelLoaded(true);
        await applyMaterialProfile(profile);
    }, [applyMaterialProfile, profile]);

    const handleModelError = useCallback((e: any) => {
        const detail = e?.detail || e?.message || 'Unknown error';
        console.error('❌ model-viewer failed to load:', detail);
        console.error('   src attempted:', modelSrc);
    }, [modelSrc]);

    const current = MATERIAL_PROFILES[profile];

    return (
        <div className="relative w-full flex flex-col gap-0 rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/60 bg-zinc-950">

            {/* ── Header strip ─────────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-4 px-6 py-4 bg-zinc-900/80 backdrop-blur-md border-b border-white/5">
                <div>
                    <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
                    <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>
                </div>
                <Badge
                    variant="outline"
                    className={`shrink-0 mt-0.5 text-xs font-semibold border ${current.badgeClass} transition-all duration-500`}
                >
                    {current.badge}
                </Badge>
            </div>

            {/* ── model-viewer canvas ───────────────────────────────────────────── */}
            <div className="relative w-full" style={{ minHeight: '420px' }}>
                {/* Loading spinner overlay */}
                {!isModelLoaded && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-950 gap-3">
                        <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
                        <p className="text-sm text-zinc-400">Loading 3D model…</p>
                    </div>
                )}

                {/* The actual <model-viewer> web component */}
                {/* @ts-ignore */}
                <model-viewer
                    ref={viewerRef}
                    src={modelSrc}
                    alt="3D car model for AR inspection"
                    ar
                    ar-modes="webxr scene-viewer quick-look"
                    camera-controls
                    auto-rotate
                    shadow-intensity="1"
                    environment-image="neutral"
                    exposure="0.9"
                    loading="eager"
                    {...(posterSrc ? { poster: posterSrc } : {})}
                    onLoad={handleModelLoad}
                    onError={handleModelError}
                    style={{
                        width: '100%',
                        height: '420px',
                        display: 'block',
                        backgroundColor: 'transparent',
                        '--poster-color': 'transparent',
                    } as React.CSSProperties}
                >
                    {/* Custom AR button slot — glassmorphism pill */}
                    <button
                        slot="ar-button"
                        className="absolute bottom-5 right-5 flex items-center gap-2 px-5 py-2.5
                                   rounded-full font-semibold text-sm text-white
                                   bg-indigo-600/80 hover:bg-indigo-600 backdrop-blur-md
                                   border border-indigo-400/30 shadow-lg shadow-indigo-900/50
                                   transition-all duration-200 hover:scale-105 active:scale-95"
                        style={{ zIndex: 10 }}
                    >
                        <View className="w-4 h-4" />
                        View in AR
                    </button>
                </model-viewer>

                {/* Applying material indicator */}
                {isApplyingMaterial && (
                    <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center bg-black/30 backdrop-blur-sm rounded-b-none">
                        <div className="flex items-center gap-2 bg-zinc-900/90 border border-white/10 rounded-full px-4 py-2 text-sm text-white">
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                            Applying material…
                        </div>
                    </div>
                )}
            </div>

            {/* ── Before / After toggle ────────────────────────────────────────── */}
            <div className="px-6 py-5 bg-zinc-900/70 backdrop-blur-md border-t border-white/5">
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">
                    Simulate Repair Outcome
                </p>
                <div className="flex gap-3">
                    {/* Damaged */}
                    <button
                        onClick={() => handleToggle('damaged')}
                        disabled={isApplyingMaterial}
                        className={`flex-1 flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl
                                   border text-sm font-semibold transition-all duration-300
                                   disabled:opacity-50 disabled:cursor-not-allowed
                                   ${profile === 'damaged'
                                ? 'bg-red-500/15 border-red-500/40 text-red-300 shadow-inner shadow-red-900/20 scale-[1.02]'
                                : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                            }`}
                    >
                        <Hammer className="w-4 h-4" />
                        Damaged
                    </button>

                    {/* Repaired */}
                    <button
                        onClick={() => handleToggle('repaired')}
                        disabled={isApplyingMaterial}
                        className={`flex-1 flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl
                                   border text-sm font-semibold transition-all duration-300
                                   disabled:opacity-50 disabled:cursor-not-allowed
                                   ${profile === 'repaired'
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-inner shadow-emerald-900/20 scale-[1.02]'
                                : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                            }`}
                    >
                        <Zap className="w-4 h-4" />
                        Repaired
                    </button>
                </div>

                {/* Description chip */}
                <p
                    key={profile}
                    className="mt-3 text-xs text-zinc-500 text-center animate-in fade-in slide-in-from-bottom-1 duration-300"
                >
                    {current.description}
                </p>
            </div>

            {/* ── AR info footer ────────────────────────────────────────────────── */}
            <div className="px-6 py-3 bg-black/20 border-t border-white/5 flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider">
                    Powered by Google model-viewer · WebXR / QuickLook / Scene Viewer
                </span>
                <div className="flex gap-1.5">
                    {['WebXR', 'iOS AR', 'Android AR'].map(tag => (
                        <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500 border border-zinc-700">
                            {tag}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ARCarViewer;
