import { useState } from "react";
import { Link } from "react-router-dom";
import {
    Sparkles, Wind, Layers, Shield, Wrench, Package,
    CheckCircle2, ArrowRight, CarFront, Car, Truck,
    Crown, Zap, Star, BadgeCheck
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import PageLayout from "@/components/PageLayout";
import BookingCTA from "@/components/BookingCTA";
import FAQSection from "@/components/FAQSection";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════
   Types & Constants
═══════════════════════════════════════ */
export type VehicleType = "sedan" | "suv" | "van";
export const vehicleMultipliers: Record<VehicleType, number> = {
    sedan: 1.0,
    suv: 1.3,
    van: 1.5,
};

/* ── Framer Variants ── */
const EASE = [0.16, 1, 0.3, 1] as const;

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

const stagger: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const cardVariant: Variants = {
    hidden: { opacity: 0, y: 50, scale: 0.95 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.6, ease: EASE, delay: i * 0.08 },
    }),
};

const priceFlip: Variants = {
    exit: { opacity: 0, y: -20, scale: 0.9, transition: { duration: 0.2 } },
    enter: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: EASE } },
};

const shimmer: Variants = {
    hidden: { x: "-100%" },
    visible: {
        x: "200%",
        transition: { duration: 2.5, repeat: Infinity, repeatDelay: 4, ease: "linear" },
    },
};

/* ═══════════════════════════════════════
   Service Data
═══════════════════════════════════════ */
const serviceData = [
    {
        key: "exterior",
        icon: Sparkles,
        basePrice: 499,
        duration: "2-3 hrs",
        tier: "Essential",
        tierColor: "from-sky-400 to-cyan-500",
        tierBg: "bg-sky-500/10 text-sky-400 border-sky-500/20",
        glowColor: "rgba(14,165,233,0.10)",
        features: ["Hand wash & rinse", "Clay bar treatment", "Spray wax application", "Tire & rim cleaning", "Window cleaning"],
        popular: false,
    },
    {
        key: "interior",
        icon: Wind,
        basePrice: 699,
        duration: "3-4 hrs",
        tier: "Essential",
        tierColor: "from-violet-400 to-purple-500",
        tierBg: "bg-violet-500/10 text-violet-400 border-violet-500/20",
        glowColor: "rgba(139,92,246,0.10)",
        features: ["Deep vacuum all surfaces", "Steam cleaning", "Leather conditioning", "Dashboard detailing", "Odor elimination"],
        popular: false,
    },
    {
        key: "paint",
        icon: Layers,
        basePrice: 1499,
        duration: "5-8 hrs",
        tier: "Advanced",
        tierColor: "from-emerald-400 to-teal-500",
        tierBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        glowColor: "rgba(16,185,129,0.10)",
        features: ["Paint inspection", "Single-stage machine polish", "Swirl removal", "Scratch reduction", "Paint sealant"],
        popular: false,
    },
    {
        key: "ceramic",
        icon: Shield,
        basePrice: 3999,
        duration: "1-2 days",
        tier: "Premium",
        tierColor: "from-amber-400 to-orange-500",
        tierBg: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        glowColor: "rgba(245,158,11,0.15)",
        features: ["Paint correction prep", "Nano-ceramic application", "2-year protection", "UV & chemical resistance", "Hydrophobic coating"],
        popular: true,
    },
    {
        key: "engine",
        icon: Wrench,
        basePrice: 799,
        duration: "2-3 hrs",
        tier: "Essential",
        tierColor: "from-rose-400 to-pink-500",
        tierBg: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        glowColor: "rgba(244,63,94,0.10)",
        features: ["Degreaser application", "Soft brush agitation", "Low-pressure rinse", "Plastic dressing", "Corrosion inhibitor"],
        popular: false,
    },
    {
        key: "full",
        icon: Package,
        basePrice: 5499,
        duration: "2 days",
        tier: "Flagship",
        tierColor: "from-amber-300 via-yellow-400 to-orange-500",
        tierBg: "bg-gradient-to-r from-amber-500/15 to-orange-500/15 text-amber-400 border-amber-500/25",
        glowColor: "rgba(212,175,55,0.15)",
        features: ["Full exterior wash", "Interior deep clean", "Paint correction", "Ceramic coating", "Engine bay detail", "Final inspection"],
        popular: false,
    },
] as const;

/* ═══════════════════════════════════════
   ServiceCard — Premium Component
═══════════════════════════════════════ */
function ServiceCard({
    service,
    index,
    vehicleType,
}: {
    service: (typeof serviceData)[number];
    index: number;
    vehicleType: VehicleType;
}) {
    const { t } = useLanguage();
    const Icon = service.icon;
    const [isHovered, setIsHovered] = useState(false);

    const multiplier = vehicleMultipliers[vehicleType];
    const computedPrice = Math.round(service.basePrice * multiplier);

    const isFlagship = service.key === "full";
    const isPopular = service.popular;

    return (
        <motion.div
            custom={index}
            variants={cardVariant}
            whileHover={{ y: -12, transition: { duration: 0.35, ease: EASE } }}
            onHoverStart={() => setIsHovered(true)}
            onHoverEnd={() => setIsHovered(false)}
            className={cn(
                "group relative rounded-3xl overflow-hidden transition-all duration-500",
                isFlagship
                    ? "md:col-span-2 lg:col-span-1"
                    : "",
                isPopular || isFlagship
                    ? "ring-1 ring-amber-500/30"
                    : "ring-1 ring-white/[0.07]"
            )}
            style={{
                background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
                backdropFilter: "blur(12px)",
            }}
        >
            {/* ── Animated border glow ── */}
            <motion.div
                className="absolute inset-0 rounded-3xl pointer-events-none"
                animate={{
                    boxShadow: isHovered
                        ? `0 0 40px ${service.glowColor}, inset 0 1px 0 rgba(255,255,255,0.08)`
                        : `0 0 0px transparent, inset 0 1px 0 rgba(255,255,255,0.04)`,
                }}
                transition={{ duration: 0.4, ease: EASE }}
            />

            {/* ── Shimmer effect on hover ── */}
            <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
                <motion.div
                    className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent skew-x-[-20deg]"
                    variants={shimmer}
                    initial="hidden"
                    animate={isHovered ? "visible" : "hidden"}
                />
            </div>

            {/* ── Popular / Flagship badge strip ── */}
            {(isPopular || isFlagship) && (
                <div className="relative">
                    <div
                        className={cn(
                            "flex items-center justify-center gap-2 py-2.5 text-[11px] font-bold uppercase tracking-[0.25em]",
                            isFlagship
                                ? "bg-gradient-to-r from-amber-500/20 via-yellow-500/25 to-orange-500/20 text-amber-400"
                                : "bg-gradient-to-r from-amber-500/15 to-orange-500/15 text-amber-400"
                        )}
                    >
                        {isFlagship ? (
                            <Crown className="w-3.5 h-3.5" />
                        ) : (
                            <Star className="w-3.5 h-3.5 fill-current" />
                        )}
                        {isPopular ? t("services.popular") : "Flagship Package"}
                    </div>
                    {/* Glow line under badge */}
                    <div className="h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
                </div>
            )}

            {/* ── Card Header ── */}
            <div className="relative px-7 pt-8 pb-4">
                {/* Tier badge + Duration */}
                <div className="flex items-center justify-between mb-5">
                    <span
                        className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                            service.tierBg
                        )}
                    >
                        <Zap className="w-2.5 h-2.5" />
                        {service.tier}
                    </span>
                    <span className="text-[11px] text-white/30 font-medium tracking-wide">
                        {service.duration}
                    </span>
                </div>

                {/* Icon + Title */}
                <div className="flex items-start gap-4 mb-4">
                    <motion.div
                        className={cn(
                            "w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border transition-all duration-500",
                            isHovered
                                ? `bg-gradient-to-br ${service.tierColor} border-transparent shadow-lg`
                                : "bg-white/[0.05] border-white/10"
                        )}
                        animate={isHovered ? { rotate: [0, -5, 5, 0], scale: 1.05 } : { rotate: 0, scale: 1 }}
                        transition={{ duration: 0.5, ease: EASE }}
                    >
                        <Icon
                            className={cn(
                                "w-6 h-6 transition-colors duration-300",
                                isHovered ? "text-white" : "text-white/50"
                            )}
                        />
                    </motion.div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold text-white group-hover:text-amber-400 transition-colors duration-300 leading-tight">
                            {t(`services.items.${service.key}.name`)}
                        </h3>
                        <p className="text-xs text-white/30 mt-1 leading-relaxed line-clamp-2">
                            {t(`services.items.${service.key}.desc`)}
                        </p>
                    </div>
                </div>

                {/* ── Price Display ── */}
                <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-[11px] text-white/25 uppercase tracking-wider font-medium">
                        {t("services.startingAt")}
                    </span>
                </div>
                <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-white/40 text-lg font-medium">&#8369;</span>
                    <AnimatePresence mode="wait">
                        <motion.span
                            key={computedPrice}
                            variants={priceFlip}
                            initial="exit"
                            animate="enter"
                            exit="exit"
                            className={cn(
                                "text-4xl font-black tracking-tight",
                                isFlagship || isPopular
                                    ? "text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500"
                                    : "text-white"
                            )}
                        >
                            {computedPrice.toLocaleString()}
                        </motion.span>
                    </AnimatePresence>
                </div>
            </div>

            {/* ── Divider ── */}
            <div className="mx-7 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {/* ── Features ── */}
            <div className="px-7 py-6">
                <ul className="space-y-3">
                    {service.features.map((feat, i) => (
                        <motion.li
                            key={feat}
                            className="flex items-center gap-3 text-sm text-white/50 group-hover:text-white/65 transition-colors duration-300"
                            initial={{ opacity: 0, x: -10 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.3 + i * 0.05, duration: 0.4, ease: EASE }}
                        >
                            <div
                                className={cn(
                                    "w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all duration-300",
                                    isHovered
                                        ? "bg-amber-500/15 border border-amber-500/30"
                                        : "bg-white/5 border border-white/10"
                                )}
                            >
                                <CheckCircle2
                                    className={cn(
                                        "w-3 h-3 transition-colors duration-300",
                                        isHovered ? "text-amber-400" : "text-white/30"
                                    )}
                                />
                            </div>
                            <span className="font-medium text-[13px]">{feat}</span>
                        </motion.li>
                    ))}
                </ul>
            </div>

            {/* ── CTA Button ── */}
            <div className="px-7 pb-7">
                <Link to={`/booking?pkg=${service.key}`}>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={cn(
                            "w-full h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-300 group/btn cursor-pointer",
                            isFlagship || isPopular
                                ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 hover:from-amber-600 hover:to-orange-700"
                                : "bg-white/[0.06] text-white/70 hover:text-white border border-white/10 hover:border-amber-500/30 hover:bg-amber-500/[0.08]"
                        )}
                    >
                        {t("services.bookNow")}
                        <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                    </motion.button>
                </Link>
            </div>

            {/* ── Corner accent ── */}
            <div
                className={cn(
                    "absolute top-0 right-0 w-40 h-40 rounded-full blur-[80px] pointer-events-none transition-opacity duration-500",
                    isHovered ? "opacity-100" : "opacity-0"
                )}
                style={{ background: service.glowColor }}
            />
        </motion.div>
    );
}

/* ═══════════════════════════════════════
   Main Page
═══════════════════════════════════════ */
export default function Services() {
    const { t } = useLanguage();
    const [vehicleType, setVehicleType] = useState<VehicleType>("sedan");



    const vehicleOptions: { type: VehicleType; label: string; icon: React.ElementType; desc: string }[] = [
        { type: "sedan", label: "Sedan", icon: CarFront, desc: "Base pricing" },
        { type: "suv", label: "SUV", icon: Car, desc: "+30%" },
        { type: "van", label: "Van / AUV", icon: Truck, desc: "+50%" },
    ];

    return (
        <PageLayout>
            {/* ══════════════════════════════════
                HERO SECTION
            ══════════════════════════════════ */}
            <section className="relative pt-36 pb-24 overflow-hidden">
                {/* Background effects */}
                <div className="absolute inset-0 bg-hero-pattern" />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
                <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-amber-500/[0.06] blur-[150px] rounded-full pointer-events-none" />

                <div className="container max-w-5xl mx-auto px-6 relative z-10 text-center">
                    <motion.div
                        variants={stagger}
                        initial="hidden"
                        animate="visible"
                    >
                        {/* Badge */}
                        <motion.div
                            variants={fadeUp}
                            className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-bold uppercase tracking-[0.3em] text-amber-400/80 mb-6 backdrop-blur-sm"
                        >
                            <BadgeCheck className="w-3.5 h-3.5" />
                            {t("services.title")}
                        </motion.div>

                        {/* Headline */}
                        <motion.h1
                            variants={fadeUp}
                            className="text-5xl sm:text-6xl lg:text-7xl font-serif font-medium text-white tracking-tight mb-5 leading-[1.05]"
                        >
                            {t("services.subtitle").split(" ").slice(0, -2).join(" ")}{" "}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 italic">
                                {t("services.subtitle").split(" ").slice(-2).join(" ")}
                            </span>
                        </motion.h1>

                        {/* Subtitle */}
                        <motion.p
                            variants={fadeUp}
                            className="text-white/35 text-base md:text-lg max-w-2xl mx-auto font-light leading-relaxed"
                        >
                            Premium detailing packages tailored for every vehicle type and budget.
                            Select your vehicle category below to see accurate pricing.
                        </motion.p>
                    </motion.div>
                </div>

                {/* Gradient line at bottom */}
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/15 to-transparent" />
            </section>

            {/* ══════════════════════════════════
                VEHICLE SELECTOR
            ══════════════════════════════════ */}
            <section className="relative py-8 z-20">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.4, ease: EASE }}
                    className="flex justify-center px-6"
                >
                    <div className="inline-flex p-1.5 bg-white/[0.03] backdrop-blur-xl rounded-2xl border border-white/8 gap-1.5">
                        {vehicleOptions.map((opt) => {
                            const Icon = opt.icon;
                            const isActive = vehicleType === opt.type;
                            return (
                                <motion.button
                                    key={opt.type}
                                    onClick={() => setVehicleType(opt.type)}
                                    whileHover={{ scale: isActive ? 1 : 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                    className={cn(
                                        "flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300 relative overflow-hidden",
                                        isActive
                                            ? "bg-gradient-gold text-primary-foreground shadow-lg shadow-amber-500/25 ring-1 ring-amber-500/50"
                                            : "glass-subtle border border-white/5 text-white/50 hover:text-white/80 hover:bg-white/5"
                                    )}
                                >
                                    <Icon className="w-4.5 h-4.5" />
                                    <span>{opt.label}</span>
                                    {isActive && (
                                        <motion.span
                                            layoutId="vehicleBadge"
                                            className="text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded-md"
                                        >
                                            {opt.desc}
                                        </motion.span>
                                    )}
                                </motion.button>
                            );
                        })}
                    </div>
                </motion.div>
            </section>

            {/* ══════════════════════════════════
                SERVICE CARDS GRID
            ══════════════════════════════════ */}
            <section className="relative pt-8 pb-32 overflow-hidden">
                {/* Ambient blobs */}
                <div className="absolute top-40 left-0 w-[500px] h-[500px] bg-indigo-500/[0.03] blur-[150px] rounded-full pointer-events-none" />
                <div className="absolute bottom-20 right-0 w-[400px] h-[400px] bg-amber-500/[0.04] blur-[120px] rounded-full pointer-events-none" />
                <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] bg-rose-500/[0.02] blur-[100px] rounded-full pointer-events-none" />

                <div className="container max-w-7xl mx-auto px-6 relative z-10">
                    <motion.div
                        variants={stagger}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-40px" }}
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                    >
                        {serviceData.map((service, i) => (
                            <ServiceCard
                                key={service.key}
                                service={service}
                                index={i}
                                vehicleType={vehicleType}
                            />
                        ))}
                    </motion.div>

                    {/* ── Comparison note ── */}
                    <motion.div
                        variants={fadeUp}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        className="text-center mt-14"
                    >
                        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-white/[0.03] border border-white/8 backdrop-blur-sm">
                            <BadgeCheck className="w-4 h-4 text-amber-400/60" />
                            <p className="text-xs text-white/30 font-medium">
                                All prices include VAT &bull; Free follow-up inspection within 30 days &bull;{" "}
                                <span className="text-amber-400/60">Satisfaction guaranteed</span>
                            </p>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* ══════════════════════════════
                FAQ
            ══════════════════════════════ */}
            <FAQSection />

            {/* ══════════════════════════════
                BOOKING CTA
            ══════════════════════════════ */}
            <BookingCTA />
        </PageLayout>
    );
}
