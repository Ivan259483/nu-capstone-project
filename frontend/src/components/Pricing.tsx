import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { CheckCircle2, ArrowRight, Star, Sparkles, Crown } from 'lucide-react';
import { SettingsService } from '@/lib/settings-service';
import { Link } from 'react-router-dom';
import type { LandingPackage } from '@/lib/landing';
import { resolveLandingIcon } from '@/lib/landing';

/* ─────────────────────── Variants ─────────────────────── */
const EASE = [0.16, 1, 0.3, 1] as const;

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 36 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
};

const stagger: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.13, delayChildren: 0.05 } },
};

/* ─────────────────────── Package data ─────────────────────── */
interface Package {
    id: string;
    tier: string;
    icon: React.ElementType;
    tagline: string;
    focus: string;
    price: string;
    recommended?: boolean;
    borderClass: string;
    glowColor: string;
    badgeLabel?: string;
    accentFrom: string;
    accentTo: string;
    features: string[];
    btnClass: string;
}

interface PricingProps {
    packages?: LandingPackage[];
}

export const PACKAGES: Package[] = [
    {
        id: 'essential',
        tier: 'Essential',
        icon: Star,
        tagline: 'Entry Level',
        focus: 'Maintenance & basic protection',
        price: '₱3,500',
        borderClass: 'hover:border-gold/20',
        glowColor: 'rgba(255,255,255,0.05)',
        accentFrom: 'from-zinc-400',
        accentTo: 'to-zinc-500',
        features: [
            'High-pressure exterior wash',
            'Hand-applied wax sealant',
            'Interior vacuum & wipe-down',
            'Tyre dressing & wheel clean',
            'Glass clean (exterior)',
            'Air freshener finish',
        ],
        btnClass: 'glass-subtle border border-white/10 hover:border-gold/30 hover:bg-gold/5 text-white/80 hover:text-white',
    },
    {
        id: 'elite',
        tier: 'Elite',
        icon: Sparkles,
        tagline: 'Best Value',
        focus: 'Restoration & 1-year ceramic protection',
        price: '₱8,500',
        recommended: true,
        badgeLabel: 'Recommended',
        borderClass: 'border-gold/30 bg-gold/5',
        glowColor: 'rgba(212,175,55,0.15)',
        accentFrom: 'from-gold-light',
        accentTo: 'to-gold-dark',
        features: [
            '1-step paint correction',
            'Ceramic coating (1-year)',
            'Engine bay detailing',
            'Full interior deep clean',
            'Leather conditioning',
            'Nano hydrophobic glass coat',
        ],
        btnClass: 'bg-gradient-gold hover:shadow-[0_0_20px_rgba(212,175,55,0.4)] text-black shadow-lg shadow-gold/20',
    },
    {
        id: 'ultimate',
        tier: 'Ultimate',
        icon: Crown,
        tagline: 'The Gold Standard',
        focus: 'Total protection — PPF + 5-year coating',
        price: '₱22,000',
        borderClass: 'hover:border-gold/20',
        glowColor: 'rgba(255,255,255,0.08)',
        accentFrom: 'from-zinc-300',
        accentTo: 'to-zinc-400',
        features: [
            'Full body PPF installation',
            '9H ceramic coating (5-year)',
            'Wheel & caliper coating',
            'Windshield & glass coating',
            'Leather & fabric protection',
            'Annual maintenance included',
        ],
        btnClass: 'glass-subtle border border-white/10 hover:border-gold/30 hover:bg-gold/5 text-white/80 hover:text-white',
    },
];

export default function Pricing({ packages: initialPackages }: PricingProps) {
    const [packages, setPackages] = useState<any[]>(PACKAGES);

    useEffect(() => {
        if (initialPackages?.length) {
            setPackages(initialPackages);
            return;
        }

        const fetchSettings = async () => {
            const res = await SettingsService.getPublicSettings();
            if (res.success && res.data?.landingDetails?.packages?.length > 0) {
                setPackages(res.data.landingDetails.packages);
            }
        };
        fetchSettings();
    }, [initialPackages]);

    // Use PACKAGES array values as fallback properties for dynamic elements
    const getMergedPackageData = (pkg: any, index: number) => {
        const fallback = PACKAGES[index] || PACKAGES[0];
        return {
            ...pkg,
            accentFrom: pkg.accentFrom || fallback.accentFrom,
            accentTo: pkg.accentTo || fallback.accentTo,
            glowColor: pkg.glowColor || fallback.glowColor,
            borderClass: pkg.borderClass || fallback.borderClass,
            btnClass: pkg.btnClass || fallback.btnClass
        };
    };

    return (
        <section id="pricing" className="relative py-28 px-6 overflow-hidden section-darker">
            {/* Ambient blobs */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gold/5 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[400px] h-[250px] bg-zinc-800/10 blur-[100px] rounded-full pointer-events-none" />

            {/* Top border line */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/10 to-transparent" />

            <div className="max-w-6xl mx-auto relative z-[1]">



                {/* ── Cards ── */}
                <motion.div
                    variants={stagger} initial="hidden" whileInView="visible"
                    viewport={{ once: true, margin: '-40px' }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch"
                >
                    {packages.map((rawPkg: any, idx: number) => {
                        const pkg = getMergedPackageData(rawPkg, idx);
                        const Icon = resolveLandingIcon(pkg.icon, Star);
                        return (
                            <motion.div
                                key={pkg.tier}
                                variants={fadeUp}
                                whileHover={{ y: -8, transition: { duration: 0.22 } }}
                                className={`glass relative flex flex-col rounded-2xl overflow-hidden
                                    transition-all duration-300
                                    ${pkg.borderClass}`}
                                style={pkg.recommended ? { boxShadow: `0 0 40px ${pkg.glowColor}` } : undefined}
                            >
                                {/* Top accent bar */}
                                <div className={`h-1 w-full bg-gradient-to-r ${pkg.accentFrom} ${pkg.accentTo}`} />

                                {/* Recommended badge */}
                                {pkg.badgeLabel && (
                                    <div className="absolute top-5 right-5 flex items-center gap-1 px-2.5 py-1 rounded-full
                                                    bg-gold/15 border border-gold/30 text-gold-light text-[10px]
                                                    font-semibold uppercase tracking-wider">
                                        <Star className="w-2.5 h-2.5" />
                                        {pkg.badgeLabel}
                                    </div>
                                )}

                                <div className="p-7 flex flex-col flex-1">
                                    {/* Tier name */}
                                    <p className="text-[10px] uppercase tracking-widest text-white/30 font-medium mb-1">
                                        {pkg.tagline}
                                    </p>
                                    <h3 className={`text-2xl font-bold tracking-tight mb-5
                                                    text-transparent bg-clip-text bg-gradient-to-r
                                                    ${pkg.accentFrom} ${pkg.accentTo}`}>
                                        {pkg.tier}
                                    </h3>

                                    {/* Price */}
                                    <div className="mb-7">
                                        <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1">Starting at</p>
                                        <p className="text-4xl font-black text-white tracking-tight">{pkg.price}</p>
                                        <p className="text-xs text-white/20 mt-1">Price varies by vehicle size & condition</p>
                                    </div>

                                    {/* Divider */}
                                    <div className="w-full h-px bg-white/8 mb-6" />

                                    {/* Features */}
                                    <ul className="space-y-3 flex-1 mb-8">
                                        {(pkg.features || []).map((f: string) => (
                                            <li key={f} className="flex items-start gap-2.5 text-sm text-white/55">
                                                <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 bg-clip-text
                                                    ${pkg.recommended ? 'text-gold' : 'text-zinc-500'}`} />
                                                {f}
                                            </li>
                                        ))}
                                    </ul>

                                    {/* CTA */}
                                    <Link to={`/booking?pkg=${pkg.id}`}>
                                        <motion.button
                                            whileHover={{ scale: 1.025 }}
                                            whileTap={{ scale: 0.975 }}
                                            className={`w-full h-11 rounded-xl text-sm font-semibold
                                                flex items-center justify-center gap-2 transition-all duration-200
                                                ${pkg.btnClass}`}
                                        >
                                            Book This Package
                                            <ArrowRight className="w-4 h-4" />
                                        </motion.button>
                                    </Link>
                                </div>
                            </motion.div>
                        );
                    })}
                </motion.div>

                {/* Disclaimer */}
                <motion.p
                    variants={fadeUp} initial="hidden" whileInView="visible"
                    viewport={{ once: true }}
                    className="text-center text-xs text-white/20 mt-8 max-w-lg mx-auto"
                >
                    All prices are starting rates and may vary based on vehicle type, size, and condition.
                    Final quote provided after your free consultation.
                </motion.p>
            </div>
        </section>
    );
}
