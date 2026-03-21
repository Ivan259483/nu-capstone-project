import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { CheckCircle2, ArrowRight, Star } from 'lucide-react';
import { Link } from 'react-router-dom';

/* ── Easing ── */
const EASE = [0.16, 1, 0.3, 1] as const;

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
};

const stagger: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};

/* ── Packages ── */
interface Package {
    name: string;
    tagline: string;
    price: string;
    unit: string;
    recommended?: boolean;
    accentColor: string;
    glowColor: string;
    badge?: string;
    features: string[];
}

const PACKAGES: Package[] = [
    {
        name: 'Essential',
        tagline: 'The perfect starting point',
        price: '₱3,500',
        unit: 'starting at',
        accentColor: 'from-slate-400 to-slate-500',
        glowColor: 'rgba(100,116,139,0.12)',
        features: [
            'Exterior hand wash & dry',
            'Wheel & tyre clean',
            'Interior vacuum',
            'Dashboard wipe-down',
            'Glass clean (interior)',
            'Air freshener finish',
        ],
    },
    {
        name: 'Elite',
        tagline: 'Our most popular package',
        price: '₱8,500',
        unit: 'starting at',
        recommended: true,
        badge: 'Most Popular',
        accentColor: 'from-orange-500 to-amber-500',
        glowColor: 'rgba(249,115,22,0.18)',
        features: [
            'Everything in Essential',
            'Clay bar decontamination',
            'Single-stage paint correction',
            'Ceramic detail spray',
            'Leather conditioning',
            'Engine bay clean',
            '3-month paint sealant',
        ],
    },
    {
        name: 'Ultimate',
        tagline: 'Uncompromising perfection',
        price: '₱22,000',
        unit: 'starting at',
        accentColor: 'from-indigo-400 to-violet-500',
        glowColor: 'rgba(99,102,241,0.14)',
        features: [
            'Everything in Elite',
            'Multi-stage paint correction',
            'Full ceramic coating (2 layers)',
            'PPF consultation & quote',
            'Full interior steam clean',
            'Nano ceramic tint (front 2)',
            '5-year coating warranty',
        ],
    },
];

/* ════════════════════════════════════════
   COMPONENT
════════════════════════════════════════ */
export default function PricingSection() {
    return (
        <section id="pricing" className="relative py-28 px-6 overflow-hidden bg-[#0B1120]">
            {/* Ambient blobs */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-orange-500/4 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[400px] h-[250px] bg-indigo-500/5 blur-[100px] rounded-full pointer-events-none" />

            {/* Top border line */}
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
                        className="text-4xl md:text-6xl font-serif font-medium text-white tracking-tight mb-5">
                        Our Packages
                    </motion.h2>
                    <motion.p variants={fadeUp}
                        className="text-white/35 text-base max-w-md mx-auto font-light">
                        Choose your level of excellence. All packages include a thorough consultation and post-service report.
                    </motion.p>
                </motion.div>

                {/* ── Cards ── */}
                <motion.div
                    variants={stagger} initial="hidden" whileInView="visible"
                    viewport={{ once: true, margin: '-40px' }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch"
                >
                    {PACKAGES.map((pkg) => (
                        <motion.div
                            key={pkg.name}
                            variants={fadeUp}
                            whileHover={{ y: -8, transition: { duration: 0.25 } }}
                            className={`relative flex flex-col rounded-2xl overflow-hidden
                                border transition-all duration-300
                                ${pkg.recommended
                                    ? 'border-orange-500/50 bg-white/[0.07] shadow-[0_0_60px_rgba(249,115,22,0.12)]'
                                    : 'border-white/10 bg-white/[0.04] hover:border-white/20'
                                }`}
                            style={{ boxShadow: pkg.recommended ? `0 0 60px ${pkg.glowColor}` : undefined }}
                        >
                            {/* Top accent bar */}
                            <div className={`h-1 w-full bg-gradient-to-r ${pkg.accentColor}`} />

                            {/* Badge */}
                            {pkg.badge && (
                                <div className="absolute top-5 right-5 flex items-center gap-1 px-2.5 py-1 rounded-full
                                                bg-orange-500/15 border border-orange-500/30 text-orange-400 text-[10px] font-semibold uppercase tracking-wider">
                                    <Star className="w-2.5 h-2.5" />
                                    {pkg.badge}
                                </div>
                            )}

                            <div className="p-7 flex flex-col flex-1">
                                {/* Plan name */}
                                <p className="text-[10px] uppercase tracking-widest text-white/30 font-medium mb-1">
                                    {pkg.tagline}
                                </p>
                                <h3 className={`text-2xl font-bold tracking-tight mb-5 text-transparent bg-clip-text bg-gradient-to-r ${pkg.accentColor}`}>
                                    {pkg.name}
                                </h3>

                                {/* Price */}
                                <div className="mb-7">
                                    <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1">{pkg.unit}</p>
                                    <p className="text-4xl font-black text-white tracking-tight">{pkg.price}</p>
                                    <p className="text-xs text-white/25 mt-1">Price varies by vehicle size</p>
                                </div>

                                {/* Divider */}
                                <div className="w-full h-px bg-white/8 mb-6" />

                                {/* Features */}
                                <ul className="space-y-3 flex-1 mb-8">
                                    {pkg.features.map(f => (
                                        <li key={f} className="flex items-start gap-2.5 text-sm text-white/55">
                                            <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 bg-clip-text ${pkg.recommended ? 'text-orange-400' : 'text-white/30'
                                                }`} />
                                            {f}
                                        </li>
                                    ))}
                                </ul>

                                {/* CTA */}
                                <Link to="/login">
                                    <motion.button
                                        whileHover={{ scale: 1.025 }} whileTap={{ scale: 0.975 }}
                                        className={`w-full h-11 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200
                                            ${pkg.recommended
                                                ? 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-lg shadow-orange-500/25'
                                                : 'border border-white/15 hover:border-white/30 text-white/60 hover:text-white hover:bg-white/5'
                                            }`}
                                    >
                                        Book This Package <ArrowRight className="w-4 h-4" />
                                    </motion.button>
                                </Link>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>

                {/* ── Disclaimer ── */}
                <motion.p
                    variants={fadeUp} initial="hidden" whileInView="visible"
                    viewport={{ once: true }}
                    className="text-center text-xs text-white/20 mt-8 max-w-lg mx-auto"
                >
                    All prices are starting rates. Final quotes are tailored to your vehicle's condition, size, and selected add-ons.
                    Contact us for a custom assessment.
                </motion.p>
            </div>
        </section>
    );
}
