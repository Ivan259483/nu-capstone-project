/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  VehiclePreview3D  —  Professional 3D Digital Twin System               ║
 * ║                                                                          ║
 * ║  International high-end standard vehicle visualizer with:               ║
 * ║  • GLB model loading via useGLTF (4K-ready)                            ║
 * ║  • Auto-Discovery: Detects models by name in /public/models/            ║
 * ║  • Ceramic Coating Engine (MeshPhysicalMaterial, clearcoat, envMap)     ║
 * ║  • Stage lighting with AccumulativeShadows + RandomizedLight           ║
 * ║  • HDRI Environment reflections (city preset)                           ║
 * ║  • Mesh-geometry neon laser scanner animation                           ║
 * ║  • BakeShadows + AdaptiveDpr for iPhone 15/16 Pro optimization         ║
 * ║                                                                          ║
 * ║  Stack: React Three Fiber 8 + drei 9 + Three.js 0.168                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import React, { Suspense, useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
    OrbitControls,
    Environment,
    ContactShadows,
    useGLTF,
    Center,
    BakeShadows,
    AdaptiveDpr,
    AccumulativeShadows,
    RandomizedLight,
    PerformanceMonitor,
} from '@react-three/drei';
import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════════════

export type VehicleType = 'sedan' | 'suv' | 'truck' | 'coupe';

export interface VehiclePreview3DProps {
    /** AI-detected car string (e.g. "Toyota Camry 2024") — maps to GLB */
    detectedCar?: string;
    /** Ceramic coating slider: 0 = factory paint  →  1 = $2,000 ceramic coating */
    glossLevel: number;
    /** Show laser scanning animation */
    scanning?: boolean;
    /** Fallback vehicle type when no GLB available */
    vehicleType: VehicleType;
    /** Container CSS class */
    className?: string;
}

// ═══════════════════════════════════════════════════════════════════════
//  Model Registry — Auto-Discovery + Static Mapping
//
//  HOW TO ADD NEW MODELS:
//  ───────────────────────
//  1. Drop your .glb file into:  autospf/public/models/
//
//     Example folder structure:
//     public/models/
//     ├── sedan.glb          ← Generic sedan (Camry, Civic, Corolla)
//     ├── suv.glb            ← Generic SUV (Fortuner, RAV4, CR-V)
//     ├── truck.glb          ← Generic truck (Hilux, Ranger, F-150)
//     ├── coupe.glb          ← Generic coupe (86, Supra, Mustang)
//     ├── sport.glb          ← Generic sport car
//     ├── toyota_camry.glb   ← Exact model (highest priority)
//     ├── bmw_3_series.glb   ← Exact model
//     └── tesla_model_3.glb  ← Exact model
//
//  2. The system resolves models in this priority order:
//     a) EXACT match — "toyota_camry" → /models/toyota_camry.glb
//     b) KEYWORD match — "Camry" → sedan.glb (via registry below)
//     c) TYPE fallback — vehicleType="sedan" → /models/sedan.glb
//     d) PROCEDURAL fallback — ShowroomVehicle renders if nothing found
//
//  3. No code changes needed. Just drop GLB files and they auto-load.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Static keyword → GLB path mapping.
 * Covers 60+ popular car models across major brands.
 * Extend this list as needed — or just drop exact-name GLBs into /public/models/.
 */
const MODEL_REGISTRY: Record<string, string> = {
    // ── Generic body types ──
    sedan: '/models/sedan.glb',
    suv: '/models/suv.glb',
    truck: '/models/truck.glb',
    coupe: '/models/coupe.glb',
    sport: '/models/sport.glb',
    hatchback: '/models/hatchback.glb',
    minivan: '/models/minivan.glb',
    van: '/models/van.glb',
    pickup: '/models/truck.glb',
    crossover: '/models/suv.glb',

    // ── Toyota ──
    camry: '/models/sedan.glb',
    corolla: '/models/sedan.glb',
    vios: '/models/sedan.glb',
    altis: '/models/sedan.glb',
    fortuner: '/models/suv.glb',
    'rav4': '/models/suv.glb',
    highlander: '/models/suv.glb',
    'land cruiser': '/models/suv.glb',
    hilux: '/models/truck.glb',
    tacoma: '/models/truck.glb',
    tundra: '/models/truck.glb',
    '86': '/models/coupe.glb',
    supra: '/models/coupe.glb',
    yaris: '/models/hatchback.glb',
    innova: '/models/minivan.glb',

    // ── Honda ──
    civic: '/models/sedan.glb',
    accord: '/models/sedan.glb',
    city: '/models/sedan.glb',
    'cr-v': '/models/suv.glb',
    'hr-v': '/models/suv.glb',
    'br-v': '/models/suv.glb',
    jazz: '/models/hatchback.glb',
    fit: '/models/hatchback.glb',

    // ── Ford ──
    mustang: '/models/coupe.glb',
    'f-150': '/models/truck.glb',
    'f150': '/models/truck.glb',
    ranger: '/models/truck.glb',
    explorer: '/models/suv.glb',
    everest: '/models/suv.glb',
    ecosport: '/models/suv.glb',
    territory: '/models/suv.glb',

    // ── BMW ──
    '3 series': '/models/sedan.glb',
    '5 series': '/models/sedan.glb',
    'x1': '/models/suv.glb',
    'x3': '/models/suv.glb',
    'x5': '/models/suv.glb',
    'm3': '/models/sport.glb',
    'm4': '/models/coupe.glb',

    // ── Mercedes-Benz ──
    'c-class': '/models/sedan.glb',
    'e-class': '/models/sedan.glb',
    'a-class': '/models/hatchback.glb',
    'glc': '/models/suv.glb',
    'gle': '/models/suv.glb',
    'amg': '/models/sport.glb',

    // ── Nissan ──
    navara: '/models/truck.glb',
    'x-trail': '/models/suv.glb',
    terra: '/models/suv.glb',
    almera: '/models/sedan.glb',
    'gt-r': '/models/sport.glb',
    '370z': '/models/coupe.glb',

    // ── Mitsubishi ──
    montero: '/models/suv.glb',
    pajero: '/models/suv.glb',
    xpander: '/models/minivan.glb',
    mirage: '/models/hatchback.glb',
    'strada': '/models/truck.glb',

    // ── Hyundai / Kia ──
    tucson: '/models/suv.glb',
    'santa fe': '/models/suv.glb',
    elantra: '/models/sedan.glb',
    accent: '/models/sedan.glb',
    sportage: '/models/suv.glb',
    seltos: '/models/suv.glb',

    // ── Tesla ──
    'model 3': '/models/sedan.glb',
    'model y': '/models/suv.glb',
    'model s': '/models/sport.glb',
    'model x': '/models/suv.glb',
    'cybertruck': '/models/truck.glb',

    // ── Subaru ──
    wrx: '/models/sport.glb',
    brz: '/models/coupe.glb',
    forester: '/models/suv.glb',
    outback: '/models/suv.glb',
};

/**
 * Resolves a detected car string to a GLB path.
 *
 * Resolution priority:
 * 1. EXACT FILE — normalizes detectedCar to a filename and checks if it exists
 *    e.g. "Toyota Camry 2024" → /models/toyota_camry_2024.glb
 * 2. KEYWORD — scans MODEL_REGISTRY for substring matches
 *    e.g. "Camry" matches the "camry" key → /models/sedan.glb
 * 3. TYPE FALLBACK — uses the vehicleType prop
 *    e.g. vehicleType="sedan" → /models/sedan.glb
 * 4. Returns Candidates[] → Main component checks HEAD to find first valid one.
 */
function resolveModelPath(detectedCar?: string, vehicleType?: VehicleType): string[] {
    // ── BMW Testing Phase Override ──
    // Force all vehicles to load sedan.glb during BMW testing.
    // Remove this block when testing is complete.
    return ['/models/sedan.glb'];

    const candidates: string[] = [];

    if (detectedCar) {
        // Priority 1: Construct exact-name path
        // "Toyota Camry 2024" → "toyota_camry_2024"
        const normalized = detectedCar
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '');

        if (normalized) {
            candidates.push(`/models/${normalized}.glb`);

            // Priority 1.5: Try without year/numbers (smarter fallback)
            // "toyota_camry_2024" → "toyota_camry"
            const noYear = normalized.replace(/_\d{4}$/, '').replace(/_\d+$/, '');
            if (noYear !== normalized && noYear.length > 0) {
                candidates.push(`/models/${noYear}.glb`);
            }
        }

        // Priority 2: Keyword match from registry
        const lower = detectedCar.toLowerCase();
        for (const [key, path] of Object.entries(MODEL_REGISTRY)) {
            if (lower.includes(key) && !candidates.includes(path)) {
                candidates.push(path);
            }
        }
    }

    // Priority 3: Vehicle type fallback
    if (vehicleType && MODEL_REGISTRY[vehicleType]) {
        const typePath = MODEL_REGISTRY[vehicleType];
        if (!candidates.includes(typePath)) {
            candidates.push(typePath);
        }
    }

    return candidates;
}

// ═══════════════════════════════════════════════════════════════════════
//  Ceramic Coating Material Engine
//
//  Maps the gloss slider (0–1) to physically accurate PBR values
//  simulating the transformation from factory paint to a professional
//  ceramic coating finish ($2,000+ detailing treatment).
// ═══════════════════════════════════════════════════════════════════════

function applyCeramicCoating(material: THREE.Material, glossLevel: number): void {
    // Create a MeshPhysicalMaterial from the original if possible
    if ((material as any).isMeshStandardMaterial || (material as any).isMeshPhysicalMaterial) {
        const mat = material as THREE.MeshPhysicalMaterial;

        // Eased curve for more dramatic visual change in the upper range
        const t = glossLevel;
        const eased = t * t * (3 - 2 * t); // smoothstep for premium feel

        mat.roughness = THREE.MathUtils.lerp(0.75, 0.02, eased);
        mat.metalness = THREE.MathUtils.lerp(0.15, 0.85, eased);
        mat.envMapIntensity = THREE.MathUtils.lerp(0.6, 3.0, eased);

        // Clearcoat — the key differentiator of ceramic coating
        if ('clearcoat' in mat) {
            mat.clearcoat = THREE.MathUtils.lerp(0.0, 1.0, eased);
            mat.clearcoatRoughness = THREE.MathUtils.lerp(0.4, 0.01, eased);
        }

        // Reflectivity (Fresnel IOR effect)
        if ('reflectivity' in mat) {
            (mat as any).reflectivity = THREE.MathUtils.lerp(0.5, 1.0, eased);
        }

        mat.needsUpdate = true;
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  GLB Model Loader
//  Loads the high-fidelity model and applies ceramic coating engine.
// ═══════════════════════════════════════════════════════════════════════

interface GLBModelProps {
    path: string;
    glossLevel: number;
}

function GLBModel({ path, glossLevel }: GLBModelProps) {
    console.log('Fetching BMW from: ', path);
    const { scene } = useGLTF(path);
    const groupRef = useRef<THREE.Group>(null);

    // Clone scene to avoid mutating the cached original
    const clonedScene = useMemo(() => {
        const clone = scene.clone(true);
        // Upgrade all MeshStandardMaterial → MeshPhysicalMaterial for clearcoat
        // ── System Override: PBR Material Injection ──
        clone.traverse((child: any) => {
            if (child.isMesh && child.material) {
                const oldMat = child.material;
                const physMat = new THREE.MeshPhysicalMaterial({
                    color: oldMat.color,
                    map: oldMat.map ?? null,
                    normalMap: oldMat.normalMap ?? null,
                    roughnessMap: oldMat.roughnessMap ?? null,
                    metalnessMap: oldMat.metalnessMap ?? null,
                    aoMap: oldMat.aoMap ?? null,
                    // System Override: Ceramic coating PBR baseline
                    roughness: 0.02,
                    metalness: 0.8,
                    envMapIntensity: 3.0,
                    clearcoat: 1.0,
                    clearcoatRoughness: 0.01,
                });
                child.material = physMat;
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        return clone;
    }, [scene]);

    // Apply ceramic coating based on gloss slider
    useEffect(() => {
        clonedScene.traverse((child: any) => {
            if (child.isMesh && child.material) {
                applyCeramicCoating(child.material, glossLevel);
            }
        });
    }, [clonedScene, glossLevel]);

    // Gentle auto-rotation
    useFrame((_, delta) => {
        if (groupRef.current) {
            groupRef.current.rotation.y += delta * 0.12;
        }
    });

    return (
        <Center>
            <group ref={groupRef}>
                <primitive object={clonedScene} />
            </group>
        </Center>
    );
}

// ═══════════════════════════════════════════════════════════════════════
// ShowroomVehicle DELETED — System Override.
// If bmw.glb is not found, an 'Asset Path Error' message is shown instead.

// ═══════════════════════════════════════════════════════════════════════
//  Neon Laser Scanner
//  High-end orange neon laser that sweeps vertically over the model.
// ═══════════════════════════════════════════════════════════════════════

function NeonLaserScanner({ active }: { active: boolean }) {
    const coreRef = useRef<THREE.Mesh>(null);
    const haloRef = useRef<THREE.Mesh>(null);
    const progressRef = useRef(0);

    useFrame((_, delta) => {
        if (!active) {
            if (coreRef.current) coreRef.current.visible = false;
            if (haloRef.current) haloRef.current.visible = false;
            return;
        }

        if (coreRef.current) coreRef.current.visible = true;
        if (haloRef.current) haloRef.current.visible = true;

        progressRef.current += delta * 0.4;
        const t = progressRef.current % 1;
        const y = THREE.MathUtils.lerp(-0.5, 3.0, t);
        const edgeFade = Math.sin(t * Math.PI);

        if (coreRef.current) {
            coreRef.current.position.y = y;
            (coreRef.current.material as THREE.MeshBasicMaterial).opacity = 0.5 * edgeFade;
        }

        if (haloRef.current) {
            haloRef.current.position.y = y;
            (haloRef.current.material as THREE.MeshBasicMaterial).opacity = 0.15 * edgeFade;
        }
    });

    return (
        <>
            <mesh ref={coreRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
                <planeGeometry args={[10, 10]} />
                <meshBasicMaterial
                    color="#FF6D00"
                    transparent
                    opacity={0.5}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>
            <mesh ref={haloRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
                <planeGeometry args={[12, 12]} />
                <meshBasicMaterial
                    color="#F57C00"
                    transparent
                    opacity={0.15}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════
//  Loading Spinner (replaces ShowroomVehicle fallback)
// ═══════════════════════════════════════════════════════════════════════

function LoadingSpinner() {
    const ref = useRef<THREE.Mesh>(null);
    useFrame((_, delta) => {
        if (ref.current) ref.current.rotation.z += delta * 2;
    });
    return (
        <mesh ref={ref}>
            <torusGeometry args={[0.6, 0.06, 16, 48, Math.PI * 1.5]} />
            <meshBasicMaterial color="#F57C00" transparent opacity={0.9} />
        </mesh>
    );
}

// ═══════════════════════════════════════════════════════════════════════
//  GLB Error Boundary — shows 'Asset Path Error' if bmw.glb fails
// ═══════════════════════════════════════════════════════════════════════

function AssetPathError() {
    return (
        <Center>
            <mesh>
                <boxGeometry args={[3, 1.5, 0.1]} />
                <meshBasicMaterial color="#1a1a1a" transparent opacity={0.85} />
            </mesh>
            <mesh position={[0, 0.25, 0.06]}>
                <planeGeometry args={[2.8, 0.4]} />
                <meshBasicMaterial color="#ef4444" />
            </mesh>
            <mesh position={[0, -0.25, 0.06]}>
                <planeGeometry args={[2.8, 0.4]} />
                <meshBasicMaterial color="#27272a" />
            </mesh>
        </Center>
    );
}

class GLBErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; error: string }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: '' };
    }
    static getDerivedStateFromError(error: Error) {
        console.error('Asset Path Error:', error.message);
        return { hasError: true, error: error.message };
    }
    render() {
        if (this.state.hasError) {
            return <AssetPathError />;
        }
        return this.props.children;
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  Showroom Stage — System Override (ShowroomVehicle killed)
// ═══════════════════════════════════════════════════════════════════════

interface ShowroomProps {
    path: string | null;
    glossLevel: number;
    scanning: boolean;
}

function Showroom({ path, glossLevel, scanning }: ShowroomProps) {
    return (
        <>
            <AdaptiveDpr pixelated />
            <BakeShadows />
            {/* PBR Environment: 'city' preset for high-end BMW ceramic reflections */}
            <Environment preset="city" />

            <ambientLight intensity={0.25} />
            <spotLight
                position={[10, 12, 8]}
                angle={0.18}
                penumbra={1}
                intensity={1.5}
                castShadow
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
                shadow-bias={-0.0001}
            />
            <spotLight
                position={[-8, 8, -6]}
                angle={0.25}
                penumbra={1}
                intensity={0.6}
                color="#b0c4ff"
            />
            <directionalLight position={[0, 10, -10]} intensity={0.3} color="#ffd4a0" />
            <pointLight position={[0, -2, 0]} intensity={0.15} color="#8899bb" />

            <GLBErrorBoundary>
                <Suspense fallback={<LoadingSpinner />}>
                    {path ? <GLBModel path={path} glossLevel={glossLevel} /> : <LoadingSpinner />}
                </Suspense>
            </GLBErrorBoundary>

            <NeonLaserScanner active={scanning} />

            <AccumulativeShadows
                temporal
                frames={60}
                alphaTest={0.85}
                scale={14}
                position={[0, 0, 0]}
                color="#000000"
            >
                <RandomizedLight
                    amount={4}
                    radius={9}
                    intensity={0.55}
                    ambient={0.25}
                    position={[5, 8, -5]}
                />
            </AccumulativeShadows>

            <ContactShadows
                position={[0, -0.005, 0]}
                opacity={0.45}
                scale={14}
                blur={2.5}
                far={8}
                color="#000000"
            />

            <OrbitControls
                minPolarAngle={0.3}
                maxPolarAngle={Math.PI / 2.05}
                enableZoom={true}
                enablePan={false}
                autoRotate={!scanning}
                autoRotateSpeed={0.8}
                minDistance={3.5}
                maxDistance={14}
                target={[0, 0.7, 0]}
            />
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════
//  Main Export — VehiclePreview3D
// ═══════════════════════════════════════════════════════════════════════

export default function VehiclePreview3D({
    detectedCar,
    glossLevel,
    scanning = false,
    vehicleType,
    className,
}: VehiclePreview3DProps) {
    // Dynamic path resolution
    const candidates = useMemo(
        () => resolveModelPath(detectedCar, vehicleType),
        [detectedCar, vehicleType]
    );

    const [validPath, setValidPath] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        const checkPaths = async () => {
            // Reset valid path when candidates change
            setValidPath(null);

            for (const path of candidates) {
                try {
                    const res = await fetch(path, { method: 'HEAD' });
                    if (res.ok && active) {
                        setValidPath(path);
                        return;
                    }
                } catch (e) {
                    console.warn('Path check failed:', path);
                }
            }
            // Fallback to registry default if nothing works
            if (active && MODEL_REGISTRY[vehicleType]) {
                setValidPath(MODEL_REGISTRY[vehicleType]);
            }
        };
        checkPaths();
        return () => { active = false; };
    }, [candidates, vehicleType]);

    const [perfDegraded, setPerfDegraded] = useState(false);

    const handlePerformanceDecline = useCallback(() => setPerfDegraded(true), []);
    const handlePerformanceIncline = useCallback(() => setPerfDegraded(false), []);

    return (
        <div className={`relative ${className || ''}`}>
            {/* ── R3F Canvas ── */}
            <Canvas
                shadows
                dpr={[1, perfDegraded ? 1.5 : 2]}
                gl={{
                    antialias: !perfDegraded,
                    powerPreference: 'high-performance',
                    alpha: true,
                    toneMapping: THREE.ACESFilmicToneMapping,
                    toneMappingExposure: 1.1,
                }}
                camera={{
                    position: [5, 2.8, 6],
                    fov: 42,
                    near: 0.1,
                    far: 100,
                }}
                style={{ background: 'transparent' }}
            >
                <PerformanceMonitor
                    onDecline={handlePerformanceDecline}
                    onIncline={handlePerformanceIncline}
                />
                <color attach="background" args={['#08090c']} />
                <fog attach="fog" args={['#08090c', 15, 30]} />

                <Showroom
                    path={validPath}
                    glossLevel={glossLevel}
                    scanning={scanning}
                />
            </Canvas>

            {/* ── Scanning Overlay ── */}
            {scanning && (
                <div className="absolute inset-0 pointer-events-none z-20 flex flex-col items-center justify-end pb-16">
                    <div className="flex items-center gap-2 bg-black/70 backdrop-blur-xl border border-orange-500/30 rounded-full px-5 py-2.5 shadow-[0_0_30px_rgba(245,124,0,0.15)]">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500" />
                        </span>
                        <span className="text-xs font-medium text-orange-300 tracking-wider uppercase">
                            Scanning Vehicle...
                        </span>
                    </div>
                </div>
            )}

            {/* ── HUD ── */}
            <div className="absolute top-3 right-3 z-10 rounded-xl border border-white/[0.08] bg-black/50 backdrop-blur-xl px-3.5 py-2.5 text-[10px] space-y-1 shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
                <div className="text-zinc-500 uppercase tracking-widest text-[8px] font-semibold mb-1">Digital Twin</div>
                <div className="text-zinc-400">
                    Source: <span className="text-zinc-200 font-medium">GLB Model</span>
                </div>
                <div className="text-zinc-400">
                    Coating: <span className="text-orange-400 font-semibold">{Math.round(glossLevel * 100)}%</span>
                </div>
                {glossLevel >= 0.9 && (
                    <div className="text-[8px] text-amber-400/80 font-medium">✦ Ceramic Finish</div>
                )}
            </div>

            {/* ── Bottom hint ── */}
            <div className="absolute bottom-3 left-3 z-10 text-[9px] text-white/20 pointer-events-none tracking-wide">
                Drag to orbit • Pinch to zoom
            </div>
        </div>
    );
}
