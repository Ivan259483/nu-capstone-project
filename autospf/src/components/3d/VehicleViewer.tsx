import React, { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, Stars } from '@react-three/drei';
import ProceduralCar from './ProceduralCar';

interface VehicleViewerProps {
    color: string;
    type: 'sedan' | 'suv' | 'truck' | 'sport' | 'hatchback' | 'unknown';
    roughness: number;
    metalness: number;
    rotationSpeed?: number;
}

const RotatingCar: React.FC<VehicleViewerProps> = (props) => {
    const groupRef = useRef<any>(null);

    useFrame((state, delta) => {
        if (groupRef.current && props.rotationSpeed) {
            groupRef.current.rotation.y += delta * props.rotationSpeed;
        }
    });

    return (
        <group ref={groupRef}>
            <ProceduralCar {...props} />
        </group>
    )
}

const VehicleViewer: React.FC<VehicleViewerProps & { showARButton?: boolean }> = (props) => {
    return (
        <div className="w-full h-[400px] bg-gradient-to-b from-zinc-900 to-zinc-950 rounded-xl overflow-hidden relative border border-zinc-800">

            <Canvas shadows camera={{ position: [5, 2, 5], fov: 50 }}>
                <Suspense fallback={null}>
                    <Environment preset="city" />
                    <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

                    <ambientLight intensity={0.4} />
                    <spotLight
                        position={[10, 10, 10]}
                        angle={0.15}
                        penumbra={1}
                        intensity={1}
                        castShadow
                    />

                    <RotatingCar {...props} />

                    <ContactShadows
                        resolution={1024}
                        scale={10}
                        blur={2}
                        opacity={0.5}
                        far={10}
                        color="#000000"
                    />

                    <OrbitControls
                        minPolarAngle={0}
                        maxPolarAngle={Math.PI / 2}
                        enableZoom={true}
                        autoRotate={false}
                    />
                </Suspense>
            </Canvas>

            <div className="absolute bottom-4 left-4 text-xs text-white/50 pointer-events-none">
                3D Visualizer • Drag to rotate • Scroll to zoom
            </div>
        </div>
    );
};

export default VehicleViewer;
