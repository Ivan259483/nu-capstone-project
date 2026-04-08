import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { CheckCircle2, ArrowRight, Star } from 'lucide-react';
import QuickBookModal from './QuickBookModal';

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
    id: string;
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
        id: 'essential',
        name: 'Essential',
        tagline: 'The perfect starting point',
        price: '₱3,500',
        unit: 'starting at',
        accentColor: 'from-zinc-400 to-zinc-500',
        glowColor: 'rgba(255,255,255,0.05)',
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
        id: 'elite',
        name: 'Elite',
        tagline: 'Our most popular package',
        price: '₱8,500',
        unit: 'starting at',
        recommended: true,
        badge: 'Most Popular',
        accentColor: 'from-gold-light to-gold-dark',
        glowColor: 'rgba(212,175,55,0.15)',
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
        id: 'ultimate',
        name: 'Ultimate',
        tagline: 'Uncompromising perfection',
        price: '₱22,000',
        unit: 'starting at',
        accentColor: 'from-zinc-300 to-zinc-400',
        glowColor: 'rgba(255,255,255,0.08)',
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
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <section id="pricing" className="relative py-28 px-6 overflow-hidden">
            {/* Ambient blobs */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gold/5 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[400px] h-[250px] bg-zinc-800/10 blur-[100px] rounded-full pointer-events-none" />

            {/* Top border line */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/10 to-transparent" />

            <div className="max-w-6xl mx-auto relative z-[1]">
                {/* ── Header ── */}
                <motion.div
                    variants={stagger} initial="hidden" whileInView="visible"
                    viewport={{ once: true, margin: '-80px' }}
                    className="text-center mb-16"
                >
                    <motion.p variants={fadeUp}
                        className="text-[11px] uppercase tracking-[0.4em] text-gold/70 font-semibold mb-3">
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
                            className={`glass relative flex flex-col rounded-2xl overflow-hidden
                                transition-all duration-300
                                ${pkg.recommended
                                    ? 'border-gold/30 bg-gold/5'
                                    : 'hover:border-gold/20'
                                }`}
                            style={{ boxShadow: pkg.recommended ? `0 0 40px ${pkg.glowColor}` : undefined }}
                        >
                            {/* Top accent bar */}
                            <div className={`h-1 w-full bg-gradient-to-r ${pkg.accentColor}`} />

                            {/* Badge */}
                            {pkg.badge && (
                                <div className="absolute top-5 right-5 flex items-center gap-1 px-2.5 py-1 rounded-full
                                                bg-gold/15 border border-gold/30 text-gold-light text-[10px] font-semibold uppercase tracking-wider">
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
                                            <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 bg-clip-text ${pkg.recommended ? 'text-gold' : 'text-zinc-500'
                                                }`} />
                                            {f}
                                        </li>
                                    ))}
                                </ul>

                                {/* CTA */}
                                <motion.button
                                    onClick={() => setIsModalOpen(true)}
                                    whileHover={{ scale: 1.025 }} whileTap={{ scale: 0.975 }}
                                    className={`w-full h-11 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 z-10 relative
                                        ${pkg.recommended
                                            ? 'bg-gradient-gold hover:shadow-[0_0_20px_rgba(212,175,55,0.4)] text-black shadow-lg shadow-gold/20'
                                            : 'glass-subtle border border-white/10 hover:border-gold/30 hover:bg-gold/5 text-white/80 hover:text-white'
                                        }`}
                                >
                                    Book This Package <ArrowRight className="w-4 h-4" />
                                </motion.button>
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
            
            <QuickBookModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
        </section>
    );
}
