import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { CheckCircle2, ArrowRight, Star, Sparkles, Crown } from 'lucide-react';
import { Link } from 'react-router-dom';

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

const PACKAGES: Package[] = [
    {
        id: 'essential',
        tier: 'Essential',
        icon: Star,
        tagline: 'Entry Level',
        focus: 'Maintenance & basic protection',
        price: '₱3,500',
        borderClass: 'border-white/10 hover:border-white/20',
        glowColor: 'transparent',
        accentFrom: 'from-slate-400',
        accentTo: 'to-slate-500',
        features: [
            'High-pressure exterior wash',
            'Hand-applied wax sealant',
            'Interior vacuum & wipe-down',
            'Tyre dressing & wheel clean',
            'Glass clean (exterior)',
            'Air freshener finish',
        ],
        btnClass: 'border border-white/15 text-white/60 hover:text-white hover:border-white/30 hover:bg-white/5',
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
        borderClass: 'border-orange-500/40',
        glowColor: 'rgba(249,115,22,0.14)',
        accentFrom: 'from-orange-500',
        accentTo: 'to-amber-500',
        features: [
            '1-step paint correction',
            'Ceramic coating (1-year)',
            'Engine bay detailing',
            'Full interior deep clean',
            'Leather conditioning',
            'Nano hydrophobic glass coat',
        ],
        btnClass: 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-lg shadow-orange-500/25',
    },
    {
        id: 'ultimate',
        tier: 'Ultimate',
        icon: Crown,
        tagline: 'The Gold Standard',
        focus: 'Total protection — PPF + 5-year coating',
        price: '₱22,000',
        borderClass: 'border-indigo-500/30 hover:border-indigo-400/50',
        glowColor: 'rgba(99,102,241,0.12)',
        accentFrom: 'from-indigo-400',
        accentTo: 'to-violet-500',
        features: [
            'Full body PPF installation',
            '9H ceramic coating (5-year)',
            'Wheel & caliper coating',
            'Windshield & glass coating',
            'Leather & fabric protection',
            'Annual maintenance included',
        ],
        btnClass: 'bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/20',
    },
];

/* ════════════════════════════════════════
   COMPONENT
════════════════════════════════════════ */
export default function Pricing() {
    return (
        <section id="pricing" className="relative py-28 px-6 overflow-hidden bg-[#0B1120]">
            {/* Ambient blobs */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[280px] bg-orange-500/4 blur-[130px] rounded-full pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-[400px] h-[260px] bg-indigo-500/5 blur-[100px] rounded-full pointer-events-none" />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />

            <div className="max-w-6xl mx-auto relative z-[1]">

                {/* ── Header ── */}
                <motion.div
                    variants={stagger} initial="hidden" whileInView="visible"
                    viewport={{ once: true, margin: '-80px' }}
                    className="text-center mb-16"
                >
                    <motion.p variants={fadeUp}
                        className="text-[11px] uppercase tracking-[0.4em] text-orange-400/70 font-semibold mb-3">
                        Transparent Pricing
                    </motion.p>
                    <motion.h2 variants={fadeUp}
                        className="text-4xl md:text-6xl font-serif font-medium text-white tracking-tight mb-4">
                        Detailing Packages
                    </motion.h2>
                    <motion.p variants={fadeUp}
                        className="text-white/35 text-base max-w-sm mx-auto font-light">
                        Choose your level of excellence. Every package includes a post-service report.
                    </motion.p>
                </motion.div>

                {/* ── Cards ── */}
                <motion.div
                    variants={stagger} initial="hidden" whileInView="visible"
                    viewport={{ once: true, margin: '-40px' }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch"
                >
                    {PACKAGES.map((pkg) => {
                        const Icon = pkg.icon;
                        return (
                            <motion.div
                                key={pkg.tier}
                                variants={fadeUp}
                                whileHover={{ y: -8, transition: { duration: 0.22 } }}
                                className={`relative flex flex-col rounded-2xl overflow-hidden border
                                    backdrop-blur-md transition-all duration-300
                                    ${pkg.recommended
                                        ? 'bg-white/[0.08]'
                                        : 'bg-white/[0.04] hover:bg-white/[0.06]'
                                    } ${pkg.borderClass}`}
                                style={pkg.recommended
                                    ? { boxShadow: `0 0 70px ${pkg.glowColor}` }
                                    : undefined}
                            >
                                {/* Top accent bar */}
                                <div className={`h-[3px] w-full bg-gradient-to-r ${pkg.accentFrom} ${pkg.accentTo}`} />

                                {/* Recommended badge */}
                                {pkg.badgeLabel && (
                                    <div className="absolute top-5 right-5 flex items-center gap-1 px-2.5 py-1 rounded-full
                                                    bg-orange-500/15 border border-orange-500/30 text-orange-400 text-[10px]
                                                    font-semibold uppercase tracking-wider">
                                        <Star className="w-2.5 h-2.5 fill-orange-400" />
                                        {pkg.badgeLabel}
                                    </div>
                                )}

                                <div className="p-7 flex flex-col flex-1">
                                    {/* Tier icon */}
                                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${pkg.accentFrom} ${pkg.accentTo}
                                                    flex items-center justify-center mb-5 shadow-md`}>
                                        <Icon className="w-5 h-5 text-white" />
                                    </div>

                                    {/* Tier name */}
                                    <p className="text-[10px] uppercase tracking-widest text-white/30 font-medium mb-0.5">
                                        {pkg.tagline}
                                    </p>
                                    <h3 className={`text-2xl font-black tracking-tight mb-1
                                                    text-transparent bg-clip-text bg-gradient-to-r
                                                    ${pkg.accentFrom} ${pkg.accentTo}`}>
                                        {pkg.tier}
                                    </h3>
                                    <p className="text-white/35 text-xs font-light mb-6 leading-snug">{pkg.focus}</p>

                                    {/* Price */}
                                    <div className="mb-6">
                                        <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1">Starting at</p>
                                        <p className="text-4xl font-black text-white tracking-tight">{pkg.price}</p>
                                        <p className="text-[10px] text-white/20 mt-1">Price varies by vehicle size & condition</p>
                                    </div>

                                    {/* Divider */}
                                    <div className="w-full h-px bg-white/8 mb-6" />

                                    {/* Features */}
                                    <ul className="space-y-3 flex-1 mb-7">
                                        {pkg.features.map(f => (
                                            <li key={f} className="flex items-start gap-2.5 text-sm text-white/55">
                                                <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5
                                                    ${pkg.recommended ? 'text-orange-400' : 'text-white/25'}`} />
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
                    className="text-center text-xs text-white/18 mt-8 max-w-lg mx-auto"
                >
                    All prices are starting rates and may vary based on vehicle type, size, and condition.
                    Final quote provided after your free consultation.
                </motion.p>
            </div>
        </section>
    );
}
