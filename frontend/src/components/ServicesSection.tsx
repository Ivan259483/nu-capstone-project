import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import { Sparkles, Shield, Crown, ArrowRight, CheckCircle2, Zap, Star, Wind, Layers, Wrench, Package } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import QuickBookModal from "./QuickBookModal";

/* ── Easing ── */
const EASE = [0.16, 1, 0.3, 1] as const;

/* ── Animation Variants ── */
const fadeUp: Variants = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

const stagger: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};

const cardReveal: Variants = {
    hidden: { opacity: 0, y: 50, scale: 0.96 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.6, ease: EASE, delay: i * 0.08 },
    }),
};

const shimmer: Variants = {
    hidden: { x: '-100%' },
    visible: { x: '200%', transition: { duration: 2.2, ease: 'easeInOut', repeat: Infinity, repeatDelay: 5 } },
};

const serviceIcons = [Sparkles, Wind, Layers, Shield, Wrench, Package];
const servicePrices = ["₱499", "₱699", "₱1,499", "₱3,999", "₱799", "₱5,499"];
const serviceKeys = ["exterior", "interior", "paint", "ceramic", "engine", "full"] as const;

const serviceNames = [
    "Exterior Wash",
    "Interior Detail",
    "Paint Correction",
    "Ceramic Coating",
    "Engine Bay Detail",
    "Full Detail Package",
];

const serviceDescs = [
    "Full exterior hand wash, clay bar treatment, and spray wax for a brilliant shine.",
    "Deep vacuum, steam cleaning, leather conditioning, and odor elimination.",
    "Multi-stage machine polish to remove swirls, scratches, and oxidation.",
    "Long-lasting nano-ceramic protection that repels water, dirt, and UV rays.",
    "Safe degreasing and detailing of engine bay for a showroom-clean finish.",
    "Complete interior + exterior + paint correction — the ultimate treatment.",
];

const serviceGlows = [
    'rgba(14,165,233,0.08)',
    'rgba(16,185,129,0.10)',
    'rgba(245,158,11,0.10)',
    'rgba(212,175,55,0.12)',
    'rgba(239,68,68,0.08)',
    'rgba(139,92,246,0.10)',
];
const serviceAccents = [
    '#0ea5e9',
    '#10b981',
    '#f59e0b',
    '#d4af37',
    '#ef4444',
    '#8b5cf6',
];

/* ── Card Component ── */
interface ServiceCardProps {
    icon: React.ComponentType<{ className?: string }>;
    name: string;
    desc: string;
    price: string;
    years?: string;
    isPopular?: boolean;
    isFlagship?: boolean;
    index: number;
    glow: string;
    accent: string;
    onBookClick: () => void;
}

function ServiceCard({ icon: Icon, name, desc, price, years, isPopular, isFlagship, index, glow, accent, onBookClick }: ServiceCardProps) {
    const { t } = useLanguage();
    const [isHovered, setIsHovered] = useState(false);

    return (
        <motion.div
            custom={index}
            variants={cardReveal}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-30px' }}
            whileHover={{
                y: -10,
                scale: 1.02,
                transition: { duration: 0.3, ease: EASE },
            }}
            onHoverStart={() => setIsHovered(true)}
            onHoverEnd={() => setIsHovered(false)}
            className="group relative glass rounded-2xl overflow-hidden cursor-pointer"
            style={{
                boxShadow: isHovered
                    ? `0 20px 60px ${glow}, inset 0 1px 0 rgba(255,255,255,0.06)`
                    : `0 4px 20px rgba(0,0,0,0.2)`,
                transition: 'box-shadow 0.5s ease',
            }}
        >
            {/* Animated border glow */}
            <motion.div
                className="absolute inset-0 rounded-2xl pointer-events-none z-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: isHovered ? 1 : 0 }}
                transition={{ duration: 0.4 }}
                style={{
                    boxShadow: `inset 0 0 0 1.5px ${accent}40`,
                }}
            />

            {/* Top accent bar */}
            <div className="relative h-1 w-full overflow-hidden">
                <motion.div
                    className="absolute inset-0"
                    style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    transition={{ duration: 0.8, delay: index * 0.08 + 0.3 }}
                />
            </div>

            {/* Popular badge */}
            {isPopular && (
                <motion.span
                    initial={{ opacity: 0, y: -10, scale: 0.9 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.4, delay: 0.5, type: 'spring', stiffness: 300 }}
                    viewport={{ once: true }}
                    className="absolute -top-0 right-5 px-3 py-1.5 rounded-b-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-[10px] font-bold tracking-widest uppercase shadow-lg shadow-emerald-500/30 z-20"
                >
                    <Star className="w-2.5 h-2.5 inline mr-1 fill-current" />
                    Recommended
                </motion.span>
            )}

            {/* Flagship badge */}
            {isFlagship && (
                <motion.span
                    initial={{ opacity: 0, y: -10, scale: 0.9 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.4, delay: 0.5, type: 'spring', stiffness: 300 }}
                    viewport={{ once: true }}
                    className="absolute -top-0 right-5 px-3 py-1.5 rounded-b-lg bg-gradient-gold text-primary-foreground text-[10px] font-bold tracking-widest uppercase shadow-lg shadow-gold/20 z-20"
                >
                    <Crown className="w-2.5 h-2.5 inline mr-1" />
                    Flagship
                </motion.span>
            )}

            <div className="p-7 relative flex flex-col items-center text-center">
                {/* Icon + Protection badge */}
                <div className="flex flex-col items-center gap-3 mb-5">
                    <motion.div
                        className="w-12 h-12 rounded-xl flex items-center justify-center relative"
                        whileHover={{ rotate: 8, scale: 1.1 }}
                        transition={{ type: 'spring', stiffness: 300 }}
                        style={{
                            background: `${accent}15`,
                            border: `1px solid ${accent}30`,
                        }}
                    >
                        <Icon className="w-5 h-5 text-primary" />
                        {/* Icon glow */}
                        <motion.div
                            className="absolute inset-0 rounded-xl"
                            animate={isHovered ? {
                                boxShadow: `0 0 20px ${accent}30`,
                            } : {
                                boxShadow: `0 0 0px transparent`,
                            }}
                            transition={{ duration: 0.4 }}
                        />
                    </motion.div>
                    {years && (
                        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/30 bg-white/5 px-2.5 py-1 rounded-full border border-white/8 inline-flex items-center gap-1">
                            <Shield className="w-2.5 h-2.5" />
                            {years}
                        </span>
                    )}
                </div>

                <h3 className="text-base font-bold text-foreground mb-2 group-hover:text-primary transition-colors duration-300">
                    {name}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                    {desc}
                </p>

                {/* Divider */}
                <div className="relative h-px w-full mb-5 overflow-hidden">
                    <div className="absolute inset-0 bg-white/[0.06]" />
                    <motion.div
                        className="absolute inset-0 h-full"
                        style={{ background: `linear-gradient(90deg, transparent, ${accent}40, transparent)` }}
                        initial={{ scaleX: 0 }}
                        whileInView={{ scaleX: isHovered ? 1 : 0 }}
                        transition={{ duration: 0.5 }}
                    />
                </div>

                {/* Price + CTA */}
                <div className="flex flex-col items-center gap-4 w-full">
                    <div>
                        <motion.span
                            className="text-[10px] text-muted-foreground uppercase tracking-widest block"
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            transition={{ delay: 0.3 + index * 0.08 }}
                        >
                            Starting from
                        </motion.span>
                        <motion.div
                            className="text-xl font-black gradient-text"
                            initial={{ opacity: 0, scale: 0.95 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.5, delay: 0.4 + index * 0.08 }}
                        >
                            {price}
                        </motion.div>
                    </div>
                    <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        <Button
                            onClick={(e) => { e.stopPropagation(); onBookClick(); }}
                            size="sm"
                            variant="outline"
                            className="border-gold/25 text-primary hover:bg-gold/10 hover:border-gold/50 text-xs z-10 relative group/btn overflow-hidden"
                        >
                            <span className="relative z-10 flex items-center gap-1.5">
                                {t("services.bookNow")}
                                <ArrowRight className="w-3 h-3 group-hover/btn:translate-x-0.5 transition-transform duration-200" />
                            </span>
                        </Button>
                    </motion.div>
                </div>
            </div>
        </motion.div>
    );
}

/* ── Main Section ── */
export default function ServicesSection() {
    const { t } = useLanguage();
    const { ref, isVisible } = useScrollAnimation<HTMLDivElement>({ threshold: 0.1 });
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <section className="relative pt-24 pb-16 section-dark z-20 min-h-max isolate overflow-hidden">
            {/* Ambient background blobs */}
            <motion.div
                className="absolute top-20 left-10 w-96 h-96 bg-gold/[0.03] blur-[120px] rounded-full pointer-events-none"
                animate={{ scale: [1, 1.15, 1], opacity: [0.03, 0.06, 0.03] }}
                transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
                className="absolute bottom-10 right-10 w-80 h-80 bg-indigo-500/[0.03] blur-[100px] rounded-full pointer-events-none"
                animate={{ scale: [1, 1.2, 1], opacity: [0.03, 0.06, 0.03] }}
                transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
            />

            <div className="container max-w-7xl mx-auto px-6 relative z-10">
                {/* ── Header ── */}
                <motion.div
                    ref={ref}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-60px' }}
                    className="text-center mb-16"
                >
                    {/* Label badge */}
                    <motion.div
                        variants={fadeUp}
                        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-gold/20 text-xs font-semibold text-primary mb-5"
                    >
                        <motion.div
                            animate={{ rotate: [0, 15, -15, 0] }}
                            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                        </motion.div>
                        {t("services.title")}
                    </motion.div>

                    {/* Heading */}
                    <motion.h2
                        variants={fadeUp}
                        className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-5 tracking-tight"
                    >
                        {t("services.subtitle")}
                    </motion.h2>

                    {/* Animated shimmer underline */}
                    <motion.div
                        className="relative w-24 h-[2px] mx-auto rounded-full overflow-hidden"
                        initial={{ scaleX: 0 }}
                        whileInView={{ scaleX: 1 }}
                        transition={{ duration: 0.6, delay: 0.4 }}
                    >
                        <div className="absolute inset-0 bg-gradient-gold" />
                        <motion.div
                            className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent"
                            variants={shimmer}
                            initial="hidden"
                            animate="visible"
                        />
                    </motion.div>
                </motion.div>

                {/* ── Cards Grid ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-14">
                    {serviceKeys.map((key, i) => (
                        <ServiceCard
                            key={key}
                            icon={serviceIcons[i]}
                            name={serviceNames[i]}
                            desc={serviceDescs[i]}
                            price={servicePrices[i]}
                            isPopular={key === "full" || key === "ceramic"}
                            index={i}
                            glow={serviceGlows[i]}
                            accent={serviceAccents[i]}
                            onBookClick={() => setIsModalOpen(true)}
                        />
                    ))}
                </div>

                {/* ── View All CTA ── */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                    className="text-center"
                >
                    <Link to="/services">
                        <motion.button
                            whileHover={{ scale: 1.04, y: -2 }}
                            whileTap={{ scale: 0.97 }}
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold border border-gold/30 text-primary hover:bg-gold/10 hover:border-gold/60 transition-all duration-300 group/cta relative overflow-hidden"
                        >
                            {/* Shimmer effect */}
                            <div className="absolute inset-0 -translate-x-full group-hover/cta:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-gold/[0.08] to-transparent" />
                            <span className="relative z-10">{t("services.viewAll")}</span>
                            <ArrowRight className="w-4 h-4 ml-2 relative z-10 group-hover/cta:translate-x-1 transition-transform" />
                        </motion.button>
                    </Link>
                </motion.div>
            </div>
            <QuickBookModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
        </section>
    );
}
