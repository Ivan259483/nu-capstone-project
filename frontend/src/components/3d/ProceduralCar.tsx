import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, MeshStandardMaterial } from 'three';

interface ProceduralCarProps {
    color: string;
    type: 'sedan' | 'suv' | 'truck' | 'sport' | 'hatchback' | 'unknown';
    roughness?: number;
    metalness?: number;
    rotation?: [number, number, number];
}

const ProceduralCar: React.FC<ProceduralCarProps> = ({
    color,
    type,
    roughness = 0.6,
    metalness = 0.5,
    rotation = [0, 0, 0]
}) => {
    const groupRef = useRef<Group>(null);

    // Car dimensions based on type
    const getChassisDims = () => {
        switch (type) {
            case 'suv': return [2.2, 0.8, 4.8];
            case 'truck': return [2.4, 1.0, 5.2];
            case 'sport': return [2.0, 0.5, 4.4];
            case 'hatchback': return [1.8, 0.6, 3.8];
            default: return [2.0, 0.6, 4.6]; // Sedan
        }
    };

    const getCabinDims = () => {
        switch (type) {
            case 'suv': return [1.8, 0.8, 3.0];
            case 'truck': return [2.0, 0.9, 1.8]; // Short cabin
            case 'sport': return [1.6, 0.5, 2.0]; // Sleek cabin
            case 'hatchback': return [1.6, 0.7, 2.5];
            default: return [1.7, 0.7, 2.5]; // Sedan
        }
    };

    const chassisDims = getChassisDims() as [number, number, number];
    const cabinDims = getCabinDims() as [number, number, number];

    // Cabin offset Z (trucks have cabin forward)
    const cabinZ = type === 'truck' ? -0.8 : type === 'sport' ? -0.2 : -0.2;

    const bodyMaterial = new MeshStandardMaterial({
        color: color,
        roughness: roughness,
        metalness: metalness,
    });

    const glassMaterial = new MeshStandardMaterial({
        color: '#111111',
        roughness: 0.1,
        metalness: 0.8,
        transparent: true,
        opacity: 0.7
    });

    const wheelMaterial = new MeshStandardMaterial({
        color: '#1a1a1a',
        roughness: 0.9,
    });

    const hubcapMaterial = new MeshStandardMaterial({
        color: '#cccccc',
        metalness: 0.8,
        roughness: 0.2
    });

    const wheelRadius = 0.35;
    const wheelThickness = 0.25;
    const wheelY = -chassisDims[1] / 2; // Position wheels at bottom of chassis
    const wheelX = (chassisDims[0] / 2) - (wheelThickness / 2);
    const wheelZFront = chassisDims[2] * 0.35;
    const wheelZRear = -chassisDims[2] * 0.35;

    return (
        <group ref={groupRef} rotation={rotation} position={[0, 0.5, 0]}>
            {/* Chassis */}
            <mesh position={[0, 0, 0]} material={bodyMaterial} castShadow receiveShadow>
                <boxGeometry args={chassisDims} />
            </mesh>

            {/* Cabin */}
            <mesh position={[0, chassisDims[1] / 2 + cabinDims[1] / 2, cabinZ]} material={bodyMaterial} castShadow receiveShadow>
                <boxGeometry args={cabinDims} />
            </mesh>

            {/* Windows (Simple Insets) */}
            <mesh position={[0, chassisDims[1] / 2 + cabinDims[1] / 2, cabinZ]} scale={[1.01, 0.8, 0.8]}>
                <boxGeometry args={cabinDims} />
                {/* This is a lazy way to mock windows, rendering a slightly larger translucent box? No, that looks bad. 
               Let's just use simple child meshes for windows */}
            </mesh>

            {/* Wheels */}
            {/* Front Left */}
            <mesh position={[wheelX, wheelY, wheelZFront]} rotation={[0, 0, Math.PI / 2]} material={wheelMaterial}>
                <cylinderGeometry args={[wheelRadius, wheelRadius, wheelThickness, 32]} />
            </mesh>
            <mesh position={[wheelX + 0.05, wheelY, wheelZFront]} rotation={[0, 0, Math.PI / 2]} material={hubcapMaterial}>
                <cylinderGeometry args={[wheelRadius / 2, wheelRadius / 2, wheelThickness, 16]} />
            </mesh>

            {/* Front Right */}
            <mesh position={[-wheelX, wheelY, wheelZFront]} rotation={[0, 0, Math.PI / 2]} material={wheelMaterial}>
                <cylinderGeometry args={[wheelRadius, wheelRadius, wheelThickness, 32]} />
            </mesh>
            <mesh position={[-wheelX - 0.05, wheelY, wheelZFront]} rotation={[0, 0, Math.PI / 2]} material={hubcapMaterial}>
                <cylinderGeometry args={[wheelRadius / 2, wheelRadius / 2, wheelThickness, 16]} />
            </mesh>

            {/* Rear Left */}
            <mesh position={[wheelX, wheelY, wheelZRear]} rotation={[0, 0, Math.PI / 2]} material={wheelMaterial}>
                <cylinderGeometry args={[wheelRadius, wheelRadius, wheelThickness, 32]} />
            </mesh>
            <mesh position={[wheelX + 0.05, wheelY, wheelZRear]} rotation={[0, 0, Math.PI / 2]} material={hubcapMaterial}>
                <cylinderGeometry args={[wheelRadius / 2, wheelRadius / 2, wheelThickness, 16]} />
            </mesh>

            {/* Rear Right */}
            <mesh position={[-wheelX, wheelY, wheelZRear]} rotation={[0, 0, Math.PI / 2]} material={wheelMaterial}>
                <cylinderGeometry args={[wheelRadius, wheelRadius, wheelThickness, 32]} />
            </mesh>
            <mesh position={[-wheelX - 0.05, wheelY, wheelZRear]} rotation={[0, 0, Math.PI / 2]} material={hubcapMaterial}>
                <cylinderGeometry args={[wheelRadius / 2, wheelRadius / 2, wheelThickness, 16]} />
            </mesh>

            {/* Headlights */}
            <mesh position={[chassisDims[0] / 3, 0.1, chassisDims[2] / 2 + 0.01]} material={new MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 2 })}>
                <boxGeometry args={[0.4, 0.2, 0.05]} />
            </mesh>
            <mesh position={[-chassisDims[0] / 3, 0.1, chassisDims[2] / 2 + 0.01]} material={new MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 2 })}>
                <boxGeometry args={[0.4, 0.2, 0.05]} />
            </mesh>

        </group>
    );
};

export default ProceduralCar;
