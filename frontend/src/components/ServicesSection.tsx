import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { Sparkles, Shield, ArrowRight, Wind, Layers, Wrench, Package } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import QuickBookModal from "./QuickBookModal";
import { BackgroundGradient } from "@/lib/components/ui/BackgroundGradient";

/* ── Easing ── */
const EASE = [0.16, 1, 0.3, 1] as const;

/* ── Animation Variants ── */
const fadeUp: Variants = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

const shimmer: Variants = {
    hidden: { x: '-100%' },
    visible: { x: '200%', transition: { duration: 2.2, ease: 'easeInOut', repeat: Infinity, repeatDelay: 5 } },
};

/* ── Data ── */
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

const serviceAccents = [
    '#0ea5e9',
    '#10b981',
    '#f59e0b',
    '#d4af37',
    '#ef4444',
    '#8b5cf6',
];

const serviceImages = [
    // Exterior Wash — shiny sports car exterior after wash
    'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=600&q=80',
    // Interior Detail — luxury car interior
    'https://images.unsplash.com/photo-1494905998402-395d579af36f?auto=format&fit=crop&w=600&q=80',
    // Paint Correction — car paint polishing close-up
    'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=600&q=80',
    // Ceramic Coating — glossy luxury showroom car
    'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=600&q=80',
    // Engine Bay Detail — engine close-up
    'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=600&q=80',
    // Full Detail Package — pristine exotic sports car
    'https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=600&q=80',
];

const serviceDurations = ['~30 min', '~2 hrs', '~4 hrs', '~8 hrs', '~1.5 hrs', '~6 hrs'];
const serviceRatings = ['4.9', '4.8', '4.9', '5.0', '4.7', '5.0'];


export default function ServicesSection() {
    const { t } = useLanguage();
    const { ref } = useScrollAnimation<HTMLDivElement>({ threshold: 0.1 });
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
                        className="text-3xl sm:text-4xl md:text-5xl font-serif font-medium text-foreground mb-5 tracking-tight"
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
                    {serviceKeys.map((key, i) => {
                        const Icon = serviceIcons[i];
                        const isHighlight = key === 'ceramic' || key === 'full';
                        return (
                            <BackgroundGradient
                                key={key}
                                containerClassName="rounded-[22px] w-full"
                                className="rounded-[22px] p-5 sm:p-7 bg-[#0d1526]/90 backdrop-blur-xl border border-white/[0.06] min-h-[580px] flex flex-col group shadow-2xl shadow-black/40"
                            >
                                {/* Icon + Duration row */}
                                <div className="flex items-center justify-between mb-4">
                                    <div
                                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                                        style={{
                                            background: `${serviceAccents[i]}12`,
                                            border: `1px solid ${serviceAccents[i]}30`,
                                        }}
                                    >
                                        <Icon className="w-5 h-5" style={{ color: serviceAccents[i] }} />
                                    </div>
                                    <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/40 border border-white/10 rounded-full px-3 py-1">
                                        {serviceDurations[i]}
                                    </span>
                                </div>

                                {/* Image — zoom on hover, fades into dark card background */}
                                <div className="relative mb-5 overflow-hidden rounded-2xl h-56 shrink-0">
                                    <img
                                        src={serviceImages[i]}
                                        alt={serviceNames[i]}
                                        className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                                    />
                                    {/* Fade into dark card background */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#0d1526] via-[#0d1526]/30 to-transparent" />
                                    {/* Subtle accent tint on hover */}
                                    <div
                                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                                        style={{ background: `linear-gradient(to top, ${serviceAccents[i]}12, transparent 60%)` }}
                                    />
                                    {/* Floating "Auto Detailing" label */}
                                    <div className="absolute bottom-3 left-3">
                                        <span className="text-[8px] font-bold uppercase tracking-[0.25em] text-white/70 drop-shadow-sm">
                                            Auto Detailing
                                        </span>
                                    </div>
                                    {/* Dark glassmorphic rating badge */}
                                    <div
                                        className="absolute top-3 right-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-bold"
                                        style={{
                                            background: 'rgba(13,21,38,0.80)',
                                            backdropFilter: 'blur(12px)',
                                            border: `1px solid ${serviceAccents[i]}35`,
                                        }}
                                    >
                                        <span style={{ color: serviceAccents[i] }}>★</span>
                                        <span className="text-white/80">{serviceRatings[i]}</span>
                                    </div>
                                </div>

                                {/* Badge */}
                                {isHighlight && (
                                    <span className="mb-2 inline-flex w-fit items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-400">
                                        {key === 'full' ? '✦ Flagship' : '✦ Popular'}
                                    </span>
                                )}

                                {/* Title */}
                                <p className="text-base sm:text-lg font-bold text-white/90 leading-snug mb-1.5">
                                    {serviceNames[i]}
                                </p>

                                {/* Description */}
                                <p className="flex-grow text-[11px] text-white/40 leading-relaxed mb-4">
                                    {serviceDescs[i]}
                                </p>

                                {/* Divider — accent colored */}
                                <div className="h-px mb-4" style={{ background: `linear-gradient(to right, ${serviceAccents[i]}35, transparent)` }} />

                                {/* Price + Book Now */}
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-[8px] uppercase tracking-[0.2em] text-white/35 mb-0.5">From</p>
                                        <p className="text-xl font-black" style={{ color: serviceAccents[i] }}>
                                            {servicePrices[i]}
                                        </p>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setIsModalOpen(true); }}
                                        className="flex items-center rounded-full py-2 pl-5 pr-2 text-xs font-bold text-white transition-all duration-300"
                                        style={{
                                            background: serviceAccents[i],
                                            boxShadow: `0 4px 14px ${serviceAccents[i]}50`,
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = 'translateY(-2px)';
                                            e.currentTarget.style.boxShadow = `0 8px 24px ${serviceAccents[i]}65`;
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.boxShadow = `0 4px 14px ${serviceAccents[i]}50`;
                                        }}
                                    >
                                        <span>Book now</span>
                                        <span
                                            className="ml-2 rounded-full px-2 py-0.5 text-[0.6rem] font-bold"
                                            style={{ background: 'rgba(255,255,255,0.22)', color: 'white' }}
                                        >
                                            {servicePrices[i]}
                                        </span>
                                    </button>
                                </div>
                            </BackgroundGradient>

                        );
                    })}
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
