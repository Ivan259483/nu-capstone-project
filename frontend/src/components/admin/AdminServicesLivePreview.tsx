import { useMemo, useState, type ElementType } from 'react';
import { motion } from 'framer-motion';
import { Car, CarFront, Crown, Truck } from 'lucide-react';
import type { Service } from '@/types';
import { cn } from '@/lib/utils';
import { AdminEditableLuxuryCard } from '@/components/admin/AdminEditableLuxuryCard';
import {
    mergePublishedPricingIntoPackages,
    spfPackages,
    type VehicleType,
} from '@/components/services/services-catalog-data';
import { findPublishedServiceForPackage } from '@/lib/service-pricing';

const EASE = [0.16, 1, 0.3, 1] as const;

const vehicleOptions: { type: VehicleType; label: string; icon: ElementType }[] = [
    { type: 'hatchback', label: 'Hatchback', icon: CarFront },
    { type: 'sedan', label: 'Sedan', icon: Car },
    { type: 'midsized', label: 'Midsized', icon: Car },
    { type: 'suv', label: 'SUV', icon: Truck },
    { type: 'pickup', label: 'Pick Up', icon: Truck },
    { type: 'largesuv', label: 'Large SUV / Van', icon: Truck },
    { type: 'highend', label: 'Highend Sedan', icon: Crown },
];

interface AdminServicesLivePreviewProps {
    services: Service[];
    /** Highlights the card for the package selected in the editor (spf80, spf89, …) */
    selectedPackageKey?: string | null;
    /** Reload services after inline card save */
    onRefresh?: () => void | Promise<void>;
}

/**
 * Same visual language as the public /services pricing strip: vehicle tabs + luxury cards.
 * Cards are editable inline; saving persists pricing + catalog card for that package.
 */
export function AdminServicesLivePreview({ services, selectedPackageKey, onRefresh }: AdminServicesLivePreviewProps) {
    const [vehicleType, setVehicleType] = useState<VehicleType>('sedan');

    const displayPackages = useMemo(
        () => mergePublishedPricingIntoPackages(spfPackages, services),
        [services],
    );

    const pricingGridClassName = cn(
        'grid gap-4 lg:gap-5 items-stretch mx-auto w-full',
        displayPackages.length <= 1 && 'grid-cols-1 max-w-md mx-auto',
        displayPackages.length === 2 && 'grid-cols-1 sm:grid-cols-2 max-w-3xl',
        displayPackages.length === 3 && 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 max-w-6xl',
        displayPackages.length >= 4 && 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 max-w-[1440px]',
    );

    return (
        <section className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-slate-50 shadow-[0_18px_48px_-34px_rgba(15,23,42,0.28)]">
            <div className="relative z-20 border-b border-slate-200/80 bg-white/95 px-4 py-3 shadow-[0_10px_28px_-26px_rgba(15,23,42,0.35)] backdrop-blur sm:px-5">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Live catalog editor</p>
                        <h2 className="mt-1 text-base font-bold tracking-tight text-slate-950">Pricing strip preview</h2>
                        <p className="mt-0.5 max-w-2xl text-xs font-medium leading-relaxed text-slate-500">
                            Edit the public SPF package cards directly from this preview.
                        </p>
                    </div>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.45, ease: EASE }}
                        className="w-full xl:w-auto"
                    >
                    <div className="flex w-full justify-start gap-1 overflow-x-auto rounded-xl bg-slate-100/90 p-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8)] xl:w-auto">
                        {vehicleOptions.map((opt) => {
                            const VIcon = opt.icon;
                            const isActive = vehicleType === opt.type;
                            return (
                                <motion.button
                                    key={opt.type}
                                    type="button"
                                    onClick={() => setVehicleType(opt.type)}
                                    whileHover={{ scale: isActive ? 1 : 1.04 }}
                                    whileTap={{ scale: 0.96 }}
                                    className={cn(
                                        'relative flex shrink-0 items-center gap-1.5 overflow-hidden rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-300 ease-in-out sm:px-3.5',
                                        !isActive && 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm',
                                    )}
                                    style={
                                        isActive
                                            ? {
                                                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                                                  color: '#fff',
                                                  boxShadow: '0 8px 28px -10px rgba(37,99,235,0.5)',
                                              }
                                            : {}
                                    }
                                >
                                    {isActive && (
                                        <motion.div
                                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                                            initial={{ x: '-100%' }}
                                            animate={{ x: '100%' }}
                                            transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 3 }}
                                        />
                                    )}
                                    <VIcon className="relative z-10 h-3.5 w-3.5" />
                                    <span className="hidden sm:inline relative z-10">{opt.label}</span>
                                    <span className="sm:hidden text-xs relative z-10">{opt.label.split(' ')[0]}</span>
                                </motion.button>
                            );
                        })}
                    </div>
                    </motion.div>
                </div>

                <motion.p
                    key={vehicleType}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.25 } }}
                    className="mt-3 text-left text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400 xl:text-right"
                >
                    Showing prices for{' '}
                    <span className="font-bold text-blue-600">{vehicleOptions.find((v) => v.type === vehicleType)?.label}</span>{' '}
                    vehicles
                </motion.p>
            </div>

            <section className="relative overflow-hidden bg-gradient-to-b from-white to-slate-50 px-3 py-5 sm:px-5 lg:px-6">
                <div className="w-full max-w-[1440px] mx-auto relative z-10">
                    <motion.div
                        key={vehicleType}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, ease: EASE }}
                        className={pricingGridClassName}
                    >
                        {displayPackages.map((pkg, i) => (
                            <AdminEditableLuxuryCard
                                key={pkg.key}
                                pkg={pkg}
                                index={i}
                                vehicleType={vehicleType}
                                service={findPublishedServiceForPackage(services, pkg.key, pkg.label)}
                                adminHighlight={Boolean(selectedPackageKey && selectedPackageKey === pkg.key)}
                                onSaved={async () => {
                                    await onRefresh?.();
                                }}
                            />
                        ))}
                    </motion.div>
                </div>
            </section>
        </section>
    );
}
