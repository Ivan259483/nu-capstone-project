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
        'grid gap-6 lg:gap-5 items-stretch mx-auto w-full',
        displayPackages.length <= 1 && 'grid-cols-1 max-w-md mx-auto',
        displayPackages.length === 2 && 'grid-cols-1 sm:grid-cols-2 max-w-3xl',
        displayPackages.length === 3 && 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 max-w-6xl',
        displayPackages.length >= 4 && 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 max-w-[1440px]',
    );

    return (
        <section className="overflow-hidden rounded-3xl bg-white shadow-[0_22px_64px_-36px_rgba(15,23,42,0.14),0_12px_40px_-28px_rgba(15,23,42,0.06)]">
            <div className="bg-white px-5 py-4 shadow-[inset_0_-1px_0_0_rgba(241,245,249,0.95)] sm:px-6">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-600">Live catalog editor</p>
                <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900">Services page — pricing strip</h2>
                <p className="mt-1 max-w-3xl text-xs font-medium leading-relaxed text-slate-500">
                    Preview matches published SPF packages (same data as <span className="font-mono text-slate-700">/services</span>). Pick a
                    vehicle tab, tap <span className="font-medium text-slate-700">Edit</span> on a card, change copy and prices, then{' '}
                    <span className="font-medium text-slate-700">Save this package</span>.
                </p>
            </div>

            <div className="relative z-20 bg-white py-5">
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: EASE }}
                    className="flex justify-center px-4"
                >
                    <div className="inline-flex flex-wrap justify-center gap-1 rounded-2xl bg-slate-50/90 p-1.5 shadow-[0_10px_40px_-24px_rgba(15,23,42,0.12),inset_0_1px_0_0_rgba(255,255,255,0.85)]">
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
                                        'relative flex items-center gap-2 overflow-hidden rounded-[11px] px-4 py-2.5 text-sm font-semibold transition-all duration-300 ease-in-out sm:px-5',
                                        !isActive && 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm',
                                    )}
                                    style={
                                        isActive
                                            ? {
                                                  background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
                                                  color: '#fff',
                                                  boxShadow: '0 10px 36px -8px rgba(245,158,11,0.5)',
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
                                    <VIcon className="w-4 h-4 relative z-10" />
                                    <span className="hidden sm:inline relative z-10">{opt.label}</span>
                                    <span className="sm:hidden text-xs relative z-10">{opt.label.split(' ')[0]}</span>
                                </motion.button>
                            );
                        })}
                    </div>
                </motion.div>

                <motion.p
                    key={vehicleType}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.25 } }}
                    className="mt-4 text-center text-[11px] font-medium uppercase tracking-[0.3em] text-slate-400"
                >
                    Showing prices for{' '}
                    <span className="font-bold text-blue-600">{vehicleOptions.find((v) => v.type === vehicleType)?.label}</span>{' '}
                    vehicles
                </motion.p>
            </div>

            <section className="relative overflow-hidden bg-white px-3 pb-10 pt-6 sm:px-5 lg:px-8">
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
