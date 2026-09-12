import { useMemo, useState, type ElementType } from 'react';
import { motion } from 'framer-motion';
import { Car, CarFront, Crown, Truck } from 'lucide-react';
import type { Service } from '@/types';
import { cn } from '@/lib/utils';
import { LuxuryServiceCard } from '@/components/services/LuxuryServiceCard';
import {
    mergePublishedPricingIntoPackages,
    spfPackages,
    type SPFPackage,
    type VehicleType,
} from '@/components/services/services-catalog-data';

const EASE = [0.16, 1, 0.3, 1] as const;

const vehicleOptions: { type: VehicleType; label: string; icon: ElementType }[] = [
    { type: 'hatchback', label: 'Hatchback', icon: CarFront },
    { type: 'sedan', label: 'Sedan', icon: Car },
    { type: 'midsized', label: 'Midsize', icon: Car },
    { type: 'suv', label: 'SUV', icon: Truck },
    { type: 'pickup', label: 'Pickup', icon: Truck },
    { type: 'largesuv', label: 'Large SUV / Van', icon: Truck },
    { type: 'highend', label: 'High-end Sedan', icon: Crown },
];

interface AdminServicesLivePreviewProps {
    services: Service[];
    packages?: SPFPackage[];
    selectedPackageKey?: string | null;
    vehicleType?: VehicleType;
    onVehicleTypeChange?: (vehicleType: VehicleType) => void;
}

/** Customer-facing package cards in a non-navigating admin preview. */
export function AdminServicesLivePreview({
    services,
    packages,
    selectedPackageKey,
    vehicleType: controlledVehicleType,
    onVehicleTypeChange,
}: AdminServicesLivePreviewProps) {
    const [internalVehicleType, setInternalVehicleType] = useState<VehicleType>('sedan');
    const vehicleType = controlledVehicleType || internalVehicleType;
    const displayPackages = useMemo(
        () => packages || mergePublishedPricingIntoPackages(spfPackages, services),
        [packages, services],
    );

    const setVehicleType = (next: VehicleType) => {
        if (onVehicleTypeChange) onVehicleTypeChange(next);
        else setInternalVehicleType(next);
    };

    const pricingGridClassName = cn(
        'grid items-stretch gap-4 lg:gap-5 mx-auto w-full',
        displayPackages.length <= 1 && 'grid-cols-1 max-w-md mx-auto',
        displayPackages.length === 2 && 'grid-cols-1 sm:grid-cols-2 max-w-3xl',
        displayPackages.length === 3 && 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 max-w-6xl',
        displayPackages.length >= 4 && 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 max-w-[1440px]',
    );

    return (
        <section className="flex flex-col overflow-hidden rounded-[20px] bg-slate-50 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.24)]">
            <div className="relative z-20 shrink-0 bg-white px-4 py-3 sm:px-5">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Customer preview</p>
                        <h2 className="mt-1 text-base font-bold tracking-tight text-slate-950">Public package cards</h2>
                        <p className="mt-0.5 text-xs font-medium text-slate-500">This is the package design customers see.</p>
                    </div>

                    <div className="flex w-full justify-start gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 xl:w-auto">
                        {vehicleOptions.map((option) => {
                            const Icon = option.icon;
                            const active = vehicleType === option.type;
                            return (
                                <button
                                    key={option.type}
                                    type="button"
                                    onClick={() => setVehicleType(option.type)}
                                    className={cn(
                                        'flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors',
                                        active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-950',
                                    )}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">{option.label}</span>
                                    <span className="sm:hidden">{option.label.split(' ')[0]}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <section className="bg-[#0a0f1c] px-3 py-4 sm:px-5 sm:py-5 lg:px-6">
                <div className="mx-auto w-full max-w-[1440px]">
                    <motion.div
                        key={vehicleType}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, ease: EASE }}
                        className={pricingGridClassName}
                    >
                        {displayPackages.map((pkg, index) => (
                            <LuxuryServiceCard
                                key={pkg.key}
                                pkg={pkg}
                                index={index}
                                vehicleType={vehicleType}
                                adminHighlight={Boolean(selectedPackageKey && selectedPackageKey === pkg.key)}
                                adminPreview
                            />
                        ))}
                    </motion.div>
                </div>
            </section>
        </section>
    );
}
