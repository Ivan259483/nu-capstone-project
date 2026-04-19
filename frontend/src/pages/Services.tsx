import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
    Shield, Sparkles, Crown, Zap, Star, BadgeCheck,
    ArrowRight, Car, Truck, CarFront,
    Check, Gem, Award, ChevronRight, Layers, Timer, Users, Trophy,
} from "lucide-react";
import { motion, AnimatePresence, useInView, useMotionValue, useTransform, animate } from "framer-motion";
import type { Variants } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import PageLayout from "@/components/PageLayout";
import BookingCTA from "@/components/BookingCTA";
import FAQSection from "@/components/FAQSection";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════
   Types & Constants
═══════════════════════════════════════ */
export type VehicleType = "hatchback" | "sedan" | "midsized" | "suv" | "pickup" | "largesuv" | "highend";

const EASE = [0.16, 1, 0.3, 1] as const;

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } },
};

const stagger: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const priceFlip: Variants = {
    exit: { opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.1 } },
    enter: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: EASE } },
};

/* ═══════════════════════════════════════
   Animated Counter Component
═══════════════════════════════════════ */
function AnimatedCounter({ value, suffix = "", duration = 2 }: { value: number; suffix?: string; duration?: number }) {
    const ref = useRef<HTMLSpanElement>(null);
    const isInView = useInView(ref, { once: true, margin: "-50px" });
    const count = useMotionValue(0);
    const rounded = useTransform(count, (v) => Math.round(v).toLocaleString());

    useEffect(() => {
        if (isInView) {
            animate(count, value, { duration, ease: "easeOut" });
        }
    }, [isInView, value, count, duration]);

    return (
        <span ref={ref}>
            <motion.span>{rounded}</motion.span>
            {suffix}
        </span>
    );
}

/* ═══════════════════════════════════════
   Pricing Data
═══════════════════════════════════════ */
type PriceMap = Record<VehicleType, number | null>;

interface SPFPackage {
    key: string;
    label: string;
    years: string;
    yearsNum: number;
    badge: string;
    tier: string;
    accentFrom: string;
    accentTo: string;
    accentMid: string;
    prices: PriceMap;
    tintPrices: PriceMap;
    originalPriceMultiplier: number;
    features: string[];
    highlighted: string[];
    popular: boolean;
    flagship: boolean;
    icon: typeof Shield;
    tagline: string;
}

const spfPackages: SPFPackage[] = [
    {
        key: "spf80", label: "SPF 80", years: "3 Years", yearsNum: 3,
        badge: "SPECIAL OFFER", tier: "Essential",
        accentFrom: "#38bdf8", accentTo: "#0284c7", accentMid: "#0ea5e9",
        tagline: "Perfect entry-level protection",
        prices: { hatchback: 7499, sedan: 7999, midsized: 7999, suv: 8999, pickup: 8499, largesuv: 12999, highend: 14999 },
        tintPrices: { hatchback: 13499, sedan: 13499, midsized: 14499, suv: 15999, pickup: 14499, largesuv: 20999, highend: 22999 },
        originalPriceMultiplier: 2,
        features: [
            "3 Layers Graphene Ceramic Coating (Canada)",
            "Graphene Sealant",
            "FREE 1 visit Signature AUTOSPF Carwash",
        ],
        highlighted: [],
        popular: false, flagship: false, icon: Sparkles,
    },
    {
        key: "spf89", label: "SPF 89", years: "5 Years", yearsNum: 5,
        badge: "RECOMMENDED", tier: "Advanced",
        accentFrom: "#34d399", accentTo: "#059669", accentMid: "#10b981",
        tagline: "Our most chosen package",
        prices: { hatchback: 8999, sedan: 9999, midsized: 10999, suv: 11999, pickup: 10999, largesuv: 14999, highend: 17999 },
        tintPrices: { hatchback: 14999, sedan: 15999, midsized: 17499, suv: 18999, pickup: 17499, largesuv: 22999, highend: 23999 },
        originalPriceMultiplier: 2,
        features: [
            "4 Layers Graphene Ceramic Coating (Canada)",
            "Graphene Sealant",
            "FREE 1 visit Reboost/Maintenance (save ₱1,500)",
        ],
        highlighted: ["4 Layers"],
        popular: true, flagship: false, icon: Shield,
    },
    {
        key: "spf99", label: "SPF 99", years: "10 Years", yearsNum: 10,
        badge: "50% OFF PROMO", tier: "Premium",
        accentFrom: "#fbbf24", accentTo: "#d97706", accentMid: "#f59e0b",
        tagline: "Maximum protection, best price-to-value",
        prices: { hatchback: 13999, sedan: 13999, midsized: 15999, suv: 16999, pickup: 15999, largesuv: 19999, highend: 22999 },
        tintPrices: { hatchback: 19999, sedan: 19999, midsized: 22499, suv: 23999, pickup: 22499, largesuv: 27999, highend: 28999 },
        originalPriceMultiplier: 2,
        features: [
            "4 Layers SONAX Profiline CC EVO (Germany)",
            "FREE Full Recoat After 5 Years",
            "FREE 2 visits Reboost/Maintenance (save ₱3,000)",
        ],
        highlighted: ["SONAX Profiline CC EVO", "Full Recoat"],
        popular: false, flagship: false, icon: Star,
    },
    {
        key: "spf101", label: "SPF 101", years: "10 Years", yearsNum: 10,
        badge: "ALL-IN PACKAGE", tier: "Ultimate",
        accentFrom: "#c084fc", accentTo: "#7c3aed", accentMid: "#a78bfa",
        tagline: "The complete transformation experience",
        prices: { hatchback: 39999, sedan: 39999, midsized: 46999, suv: 46999, pickup: 46999, largesuv: 49999, highend: 49999 },
        tintPrices: { hatchback: null, sedan: null, midsized: null, suv: null, pickup: null, largesuv: null, highend: null },
        originalPriceMultiplier: 2,
        features: [
            "PPF Coverage (Hood, Bumper, Mirrors, Stepsils, Door Bowls, Lights)",
            "4 Layers SONAX Profiline CC EVO (Germany)",
            "FREE 5 visits Reboost/Maintenance (save ₱7,500)",
            "FREE Full Recoat After 5 Years",
            "Nano Ceramic Window Tint (Full Wrap — Any Shade)",
            "FREE Undercoating (Rust Proofing)",
        ],
        highlighted: ["PPF", "SONAX", "Nano Ceramic Window Tint", "Undercoating"],
        popular: false, flagship: true, icon: Crown,
    },
];

/* ═══════════════════════════════════════
   LUXURY CARD COMPONENT
═══════════════════════════════════════ */
function LuxuryCard({ pkg, index, vehicleType }: { pkg: SPFPackage; index: number; vehicleType: VehicleType }) {
    const { t } = useLanguage();
    const Icon = pkg.icon;
    const [hovered, setHovered] = useState(false);

    const price = pkg.prices[vehicleType];
    const tintPrice = pkg.tintPrices[vehicleType];
    const originalPrice = price ? price * pkg.originalPriceMultiplier : null;
    if (price === null) return null;

    const isFlagship = pkg.flagship;
    const isPopular = pkg.popular;
    const isHighlighted = isPopular || isFlagship;

    return (
        <motion.div
            custom={index}
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-30px" }}
            transition={{ duration: 0.6, ease: EASE, delay: index * 0.08 }}
            whileHover={{ y: -12, scale: 1.025, transition: { duration: 0.35, ease: EASE } }}
            onHoverStart={() => setHovered(true)}
            onHoverEnd={() => setHovered(false)}
            className={cn(
                "group relative flex flex-col rounded-[24px] overflow-hidden w-full transition-all duration-300 ease-in-out",
                isHighlighted && "lg:scale-[1.03] z-10"
            )}
            style={{
                willChange: "transform",
                filter: hovered ? `drop-shadow(0 20px 50px ${pkg.accentFrom}25)` : "none",
                transition: "filter 0.4s ease",
            }}
        >
            {/* ── Animated outer glow ring ── */}
            <motion.div
                className="absolute -inset-[1.5px] rounded-[25px] z-0 pointer-events-none"
                animate={{
                    opacity: hovered ? 1 : isHighlighted ? 0.6 : 0,
                    background: `linear-gradient(135deg, ${pkg.accentFrom}60 0%, transparent 40%, ${pkg.accentTo}40 70%, transparent 100%)`,
                }}
                transition={{ duration: 0.5 }}
            />

            {/* ── Card Face ── */}
            <div
                className="relative z-10 rounded-[24px] flex flex-col h-full overflow-hidden"
                style={{
                    background: `linear-gradient(170deg, 
                        ${hovered ? pkg.accentFrom + "12" : pkg.accentFrom + "08"} 0%, 
                        rgba(12,17,29,0.97) 35%, 
                        rgba(8,12,24,0.99) 100%)`,
                    border: `1px solid ${hovered ? pkg.accentFrom + "45" : isHighlighted ? pkg.accentFrom + "30" : "rgba(255,255,255,0.08)"}`,
                    transition: "all 0.5s ease",
                }}
            >
                {/* ── Gradient accent bar ── */}
                <div className="h-[3px] w-full relative overflow-hidden">
                    <motion.div
                        className="absolute inset-0"
                        style={{ background: `linear-gradient(90deg, ${pkg.accentFrom}, ${pkg.accentMid}, ${pkg.accentTo})` }}
                        initial={{ scaleX: 0 }}
                        whileInView={{ scaleX: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 1, delay: index * 0.12, ease: EASE }}
                    />
                    {/* Moving shimmer on gradient bar */}
                    <motion.div
                        className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                        animate={{ x: ["-100%", "400%"] }}
                        transition={{ duration: 3, repeat: Infinity, repeatDelay: 5, ease: "easeInOut" }}
                    />
                </div>

                {/* ── Header: Badge + Year ── */}
                <div className="px-7 pt-6 pb-0 flex items-center justify-between">
                    <motion.span
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 + index * 0.08, type: "spring", stiffness: 300 }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-[6px] rounded-full text-[9px] font-black uppercase tracking-[0.25em]"
                        style={{
                            background: `linear-gradient(135deg, ${pkg.accentFrom}20, ${pkg.accentTo}10)`,
                            border: `1px solid ${pkg.accentFrom}30`,
                            color: pkg.accentFrom,
                        }}
                    >
                        {isFlagship ? <Crown className="w-3 h-3" /> : isPopular ? <Star className="w-3 h-3 fill-current" /> : <Zap className="w-3 h-3" />}
                        {pkg.badge}
                    </motion.span>

                    <div className="flex items-center gap-1.5 px-3 py-[5px] rounded-full bg-white/[0.06] border border-white/[0.08]">
                        <Shield className="w-2.5 h-2.5 text-white/50" />
                        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/50">
                            {pkg.years}
                        </span>
                    </div>
                </div>

                {/* ── Icon + Title Block ── */}
                <div className="px-7 pt-6 pb-5 flex flex-col items-center text-center">
                    {/* Animated Icon */}
                    <motion.div
                        className="relative w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                        animate={hovered ? { rotate: [0, -3, 3, 0], scale: 1.08 } : { rotate: 0, scale: 1 }}
                        transition={{ duration: 0.4, ease: EASE }}
                        style={{
                            background: `linear-gradient(145deg, ${pkg.accentFrom}, ${pkg.accentTo})`,
                            boxShadow: hovered
                                ? `0 12px 40px ${pkg.accentFrom}40, 0 0 0 1px ${pkg.accentFrom}20`
                                : `0 6px 25px ${pkg.accentFrom}20`,
                            transition: "box-shadow 0.5s ease",
                        }}
                    >
                        <Icon className="w-7 h-7 text-white relative z-10" />
                        {/* Inner shine */}
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/25 via-transparent to-transparent" />
                        {/* Pulse ring */}
                        {isHighlighted && (
                            <motion.div
                                className="absolute -inset-2 rounded-2xl border pointer-events-none"
                                style={{ borderColor: pkg.accentFrom + "20" }}
                                animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0, 0.3] }}
                                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                            />
                        )}
                    </motion.div>

                    {/* Title */}
                    <h3
                        className="text-[22px] font-black tracking-tight mb-1 transition-all duration-300"
                        style={{
                            color: hovered ? pkg.accentFrom : "#ffffff",
                        }}
                    >
                        {pkg.label}
                    </h3>
                    <p className="text-[12px] text-white/45 font-medium tracking-wide italic">
                        {pkg.tagline}
                    </p>
                </div>

                {/* ── Price Block ── */}
                <div className="mx-5 sm:mx-6 rounded-2xl p-5 mb-2 relative overflow-hidden"
                    style={{
                        background: `linear-gradient(135deg, ${pkg.accentFrom}08, ${pkg.accentTo}04, rgba(0,0,0,0.2))`,
                        border: `1px solid ${pkg.accentFrom}15`,
                    }}
                >
                    {/* Subtle mesh behind price */}
                    <div className="absolute inset-0 opacity-[0.03]"
                        style={{
                            backgroundImage: `radial-gradient(circle at 20% 50%, ${pkg.accentFrom} 1px, transparent 1px), radial-gradient(circle at 80% 50%, ${pkg.accentTo} 1px, transparent 1px)`,
                            backgroundSize: "20px 20px",
                        }}
                    />

                    <div className="relative z-10">
                        {/* Original price + discount */}
                        <div className="flex items-center justify-center gap-2.5 mb-3">
                            <span className="text-[10px] text-white/30 uppercase tracking-[0.15em] font-medium">
                                {t("services.startingAt")}
                            </span>
                            <span className="text-xs text-white/30 line-through font-medium">
                                ₱{originalPrice?.toLocaleString()}
                            </span>
                            <motion.span
                                initial={{ scale: 0.9 }}
                                whileInView={{ scale: 1 }}
                                animate={{ scale: [1, 1.05, 1] }}
                                viewport={{ once: true }}
                                className="text-[10px] px-2.5 py-[4px] rounded-full font-black uppercase tracking-wider"
                                style={{
                                    background: `linear-gradient(135deg, #ef4444, #dc2626)`,
                                    color: "#fff",
                                    boxShadow: "0 4px 16px rgba(239,68,68,0.4)",
                                }}
                                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                            >
                                50% OFF
                            </motion.span>
                        </div>

                        {/* Main price */}
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={price}
                                variants={priceFlip}
                                initial="exit"
                                animate="enter"
                                exit="exit"
                                className="flex items-baseline justify-center gap-1"
                            >
                                <span className="text-lg font-bold text-white/50">₱</span>
                                <span
                                    className="text-[52px] font-black tracking-tight leading-none"
                                    style={{
                                        backgroundImage: `linear-gradient(135deg, ${pkg.accentFrom}, ${pkg.accentMid}, ${pkg.accentTo})`,
                                        WebkitBackgroundClip: "text",
                                        WebkitTextFillColor: "transparent",
                                        filter: `drop-shadow(0 2px 8px ${pkg.accentFrom}30)`,
                                    }}
                                >
                                    {price?.toLocaleString()}
                                </span>
                                <span className="text-sm font-medium text-white/25 self-end mb-1.5">.00</span>
                            </motion.div>
                        </AnimatePresence>

                        {/* Tint bundle */}
                        {tintPrice && (
                            <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t" style={{ borderColor: pkg.accentFrom + "20" }}>
                                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: pkg.accentFrom + "90" }}>
                                    + Nano Ceramic Window Tint
                                </span>
                                <AnimatePresence mode="wait">
                                    <motion.span key={tintPrice} variants={priceFlip} initial="exit" animate="enter" exit="exit"
                                        className="text-sm font-bold" style={{ color: pkg.accentFrom }}>
                                        ₱{tintPrice.toLocaleString()}
                                    </motion.span>
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Features ── */}
                <div className="px-5 sm:px-7 pb-5 flex-1">
                    <div className="flex items-center gap-2 mb-4 pt-4 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                        <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${pkg.accentFrom}20, transparent)` }} />
                        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50">What's included</span>
                        <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${pkg.accentFrom}20)` }} />
                    </div>
                    <ul className="space-y-2.5">
                        {pkg.features.map((feat, i) => {
                            const isHighlightedFeat = pkg.highlighted.some(h => feat.includes(h));
                            return (
                                <motion.li
                                    key={feat}
                                    className="flex items-start gap-3"
                                    initial={{ opacity: 0, x: -12 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: 0.3 + i * 0.06, duration: 0.4, ease: EASE }}
                                >
                                    <div
                                        className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-all duration-300"
                                        style={{
                                            background: hovered || isHighlightedFeat ? `${pkg.accentFrom}22` : "rgba(255,255,255,0.06)",
                                            border: `1px solid ${hovered || isHighlightedFeat ? pkg.accentFrom + "45" : "rgba(255,255,255,0.10)"}`,
                                        }}
                                    >
                                        <Check className="w-3 h-3 transition-colors duration-300"
                                            style={{ color: hovered || isHighlightedFeat ? pkg.accentFrom : "rgba(255,255,255,0.50)" }}
                                        />
                                    </div>
                                    <span className={cn(
                                        "text-[13px] font-medium leading-snug transition-colors duration-300",
                                        isHighlightedFeat ? "text-white/85" : "text-white/60",
                                        "group-hover:text-white/80",
                                    )}>
                                        {feat}
                                    </span>
                                </motion.li>
                            );
                        })}
                    </ul>
                </div>

                {/* ── CTA ── */}
                <div className="px-5 sm:px-7 pb-6 mt-auto pt-3">
                    <Link to={`/booking?pkg=${pkg.key}`}>
                        <motion.button
                            whileHover={{ scale: 1.03, brightness: 1.15 }}
                            whileTap={{ scale: 0.97 }}
                            className="w-full h-[52px] rounded-xl font-bold text-[13px] flex items-center justify-center gap-2 transition-all duration-300 ease-in-out group/btn cursor-pointer relative overflow-hidden hover:brightness-110"
                            style={{
                                background: isHighlighted
                                    ? `linear-gradient(135deg, ${pkg.accentFrom}, ${pkg.accentTo})`
                                    : `linear-gradient(135deg, ${pkg.accentFrom}18, ${pkg.accentTo}0a)`,
                                color: isHighlighted ? "#fff" : "rgba(255,255,255,0.80)",
                                border: isHighlighted ? `1px solid ${pkg.accentFrom}50` : `1px solid ${pkg.accentFrom}25`,
                                boxShadow: isHighlighted ? `0 8px 30px ${pkg.accentFrom}30` : `0 2px 12px ${pkg.accentFrom}08`,
                                letterSpacing: "0.08em",
                            }}
                        >
                            {/* Animated shimmer */}
                            <span className="absolute inset-0 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                            <span className="relative z-10 uppercase tracking-wider">{t("services.bookNow")}</span>
                            <ArrowRight className="w-4 h-4 relative z-10 group-hover/btn:translate-x-1.5 transition-transform duration-300" />
                        </motion.button>
                    </Link>
                </div>

                {/* ── Ambient card glow ── */}
                <div
                    className="absolute top-0 right-0 w-56 h-56 rounded-full blur-[100px] pointer-events-none transition-opacity duration-700"
                    style={{
                        background: `radial-gradient(circle, ${pkg.accentFrom}${hovered ? "18" : "08"}, transparent)`,
                        opacity: hovered ? 1 : 0.5,
                    }}
                />
                <div
                    className="absolute bottom-0 left-0 w-40 h-40 rounded-full blur-[80px] pointer-events-none transition-opacity duration-700"
                    style={{
                        background: `radial-gradient(circle, ${pkg.accentTo}${hovered ? "12" : "04"}, transparent)`,
                        opacity: hovered ? 1 : 0.3,
                    }}
                />
            </div>
        </motion.div>
    );
}

/* ═══════════════════════════════════════
   ADD-ONS DATA
═══════════════════════════════════════ */
const addOns: { name: string; prices: Record<VehicleType, string> }[] = [
    { name: "Undercoating", prices: { hatchback: "₱6,000", sedan: "₱6,500", midsized: "₱7,000", suv: "₱7,500", pickup: "₱7,500", largesuv: "₱9,000", highend: "₱8,000" } },
    { name: "Repainting", prices: { hatchback: "Per Panel", sedan: "Per Panel", midsized: "Per Panel", suv: "Per Panel", pickup: "Per Panel", largesuv: "Per Panel", highend: "Per Panel" } },
    { name: "PDR (Dent Repair)", prices: { hatchback: "Per Dent", sedan: "Per Dent", midsized: "Per Dent", suv: "Per Dent", pickup: "Per Dent", largesuv: "Per Dent", highend: "Per Dent" } },
    { name: "PPF (per panel)", prices: { hatchback: "Per Panel", sedan: "Per Panel", midsized: "Per Panel", suv: "Per Panel", pickup: "Per Panel", largesuv: "Per Panel", highend: "Per Panel" } },
    { name: "Interior Detailing", prices: { hatchback: "Inquire", sedan: "Inquire", midsized: "Inquire", suv: "Inquire", pickup: "Inquire", largesuv: "Inquire", highend: "Inquire" } },
    { name: "Engine Wash/Detailing", prices: { hatchback: "Inquire", sedan: "Inquire", midsized: "Inquire", suv: "Inquire", pickup: "Inquire", largesuv: "Inquire", highend: "Inquire" } },
];

/* ═══════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════ */
export default function Services() {
    const { t } = useLanguage();
    const [vehicleType, setVehicleType] = useState<VehicleType>("sedan");

    const vehicleOptions: { type: VehicleType; label: string; icon: React.ElementType }[] = [
        { type: "hatchback", label: "Hatchback", icon: CarFront },
        { type: "sedan", label: "Sedan", icon: Car },
        { type: "midsized", label: "Midsized", icon: Car },
        { type: "suv", label: "SUV", icon: Truck },
        { type: "pickup", label: "Pick Up", icon: Truck },
        { type: "largesuv", label: "Large SUV / Van", icon: Truck },
        { type: "highend", label: "Highend Sedan", icon: Crown },
    ];

    return (
        <PageLayout>
            {/* ══════════════════════════════════
                CINEMATIC HERO
            ══════════════════════════════════ */}
            <section className="relative pt-32 pb-20 overflow-hidden">
                {/* Rich gradient background */}
                <div className="absolute inset-0" style={{
                    background: `
                        radial-gradient(ellipse 80% 50% at 50% 0%, rgba(245,158,11,0.08) 0%, transparent 50%),
                        radial-gradient(ellipse 60% 40% at 70% 10%, rgba(139,92,246,0.06) 0%, transparent 50%),
                        radial-gradient(ellipse 60% 40% at 30% 20%, rgba(59,130,246,0.05) 0%, transparent 50%),
                        linear-gradient(180deg, #06080f 0%, #0a0f1c 50%, #080c18 100%)
                    `
                }} />

                {/* Animated gradient mesh */}
                <motion.div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] pointer-events-none"
                    animate={{ rotate: [0, 3, -3, 0] }}
                    transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
                >
                    <div className="absolute top-10 left-1/4 w-72 h-72 bg-amber-500/[0.06] blur-[120px] rounded-full" />
                    <div className="absolute top-20 right-1/4 w-56 h-56 bg-violet-500/[0.05] blur-[100px] rounded-full" />
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-80 h-40 bg-sky-500/[0.04] blur-[100px] rounded-full" />
                </motion.div>

                {/* Grid pattern overlay */}
                <div className="absolute inset-0 opacity-[0.02]" style={{
                    backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
                    backgroundSize: "60px 60px",
                }} />

                <div className="container max-w-6xl mx-auto px-6 relative z-10 text-center">
                    <motion.div variants={stagger} initial="hidden" animate="visible">
                        {/* Prestige badge */}
                        <motion.div variants={fadeUp}
                            className="inline-flex items-center gap-3 px-6 py-2.5 rounded-full mb-8 backdrop-blur-md"
                            style={{
                                background: "linear-gradient(135deg, rgba(245,158,11,0.12), rgba(234,88,12,0.06))",
                                border: "1px solid rgba(245,158,11,0.2)",
                                boxShadow: "0 4px 20px rgba(245,158,11,0.08)",
                            }}
                        >
                            <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }}>
                                <Gem className="w-4 h-4 text-amber-400" />
                            </motion.div>
                            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber-400/90">
                                Premium Ceramic Coating
                            </span>
                        </motion.div>

                        {/* Main headline */}
                        <motion.h1 variants={fadeUp}
                            className="text-5xl sm:text-6xl lg:text-[76px] font-serif font-medium text-white tracking-tight mb-6 leading-[1.05]"
                        >
                            Unmatched Vehicle{" "}
                            <br className="hidden sm:block" />
                            <span className="relative inline-block">
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-orange-400 to-amber-500 italic">
                                    Protection
                                </span>
                                {/* Underline accent */}
                                <motion.div
                                    className="absolute -bottom-2 left-0 right-0 h-[2px] rounded-full"
                                    style={{ background: "linear-gradient(90deg, transparent, #f59e0b, transparent)" }}
                                    initial={{ scaleX: 0 }}
                                    animate={{ scaleX: 1 }}
                                    transition={{ duration: 1, delay: 0.6, ease: EASE }}
                                />
                            </span>
                        </motion.h1>

                        {/* Subtitle */}
                        <motion.p variants={fadeUp}
                            className="text-white/40 text-lg md:text-xl max-w-2xl mx-auto font-light leading-relaxed mb-10"
                        >
                            Industry-leading graphene ceramic coating with up to{" "}
                            <span className="text-amber-400/60 font-medium">10 years of protection</span>.
                            Select your vehicle for accurate pricing.
                        </motion.p>

                        {/* Trust badges */}
                        <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-4">
                            {[
                                { label: "SONAX Germany", icon: Award, color: "#f59e0b" },
                                { label: "PPF Certified", icon: Shield, color: "#3b82f6" },
                                { label: "Vinyl Frog", icon: Gem, color: "#10b981" },
                            ].map(({ label, icon: TIcon, color }) => (
                                <span key={label} className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white/30 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.12] transition-all duration-300">
                                    <TIcon className="w-3.5 h-3.5" style={{ color: color + "80" }} />
                                    {label}
                                </span>
                            ))}
                        </motion.div>
                    </motion.div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/15 to-transparent" />
            </section>

            {/* ══════════════════════════════════
                STATS COUNTER BAR
            ══════════════════════════════════ */}
            <section className="relative py-10 z-20" style={{ background: "linear-gradient(180deg, #080c18 0%, #0a0f1c 100%)" }}>
                <div className="container max-w-5xl mx-auto px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="grid grid-cols-2 sm:grid-cols-4 gap-6 py-6 px-8 rounded-2xl"
                        style={{
                            background: "linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
                            border: "1px solid rgba(255,255,255,0.06)",
                            backdropFilter: "blur(12px)",
                        }}
                    >
                        {[
                            { value: 5000, suffix: "+", label: "Vehicles Protected", icon: Car, color: "#3b82f6" },
                            { value: 10, suffix: " Yrs", label: "Max Protection", icon: Shield, color: "#f59e0b" },
                            { value: 100, suffix: "%", label: "Satisfaction Rate", icon: Trophy, color: "#10b981" },
                            { value: 8, suffix: "+", label: "Years Experience", icon: Timer, color: "#a78bfa" },
                        ].map(({ value, suffix, label, icon: SIcon, color }) => (
                            <div key={label} className="text-center">
                                <div className="flex items-center justify-center gap-2 mb-1.5">
                                    <SIcon className="w-4 h-4" style={{ color }} />
                                    <span className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                                        <AnimatedCounter value={value} suffix={suffix} />
                                    </span>
                                </div>
                                <span className="text-[10px] text-white/40 font-bold uppercase tracking-[0.2em]">{label}</span>
                            </div>
                        ))}
                    </motion.div>
                </div>
            </section>

            {/* ══════════════════════════════════
                VEHICLE SELECTOR
            ══════════════════════════════════ */}
            <section className="relative py-6 z-20" style={{ background: "#0a0f1c" }}>
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.3, ease: EASE }}
                    className="flex justify-center px-4"
                >
                    <div className="inline-flex flex-wrap justify-center p-2 rounded-2xl gap-1.5"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(16px)" }}
                    >
                        {vehicleOptions.map((opt) => {
                            const VIcon = opt.icon;
                            const isActive = vehicleType === opt.type;
                            return (
                                <motion.button
                                    key={opt.type}
                                    onClick={() => setVehicleType(opt.type)}
                                    whileHover={{ scale: isActive ? 1 : 1.04 }}
                                    whileTap={{ scale: 0.96 }}
                                    className={cn(
                                        "flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ease-in-out relative overflow-hidden",
                                        !isActive && "text-white/50 hover:text-white/80 hover:bg-white/[0.06]"
                                    )}
                                    style={isActive ? {
                                        background: "linear-gradient(135deg, #f59e0b, #ea580c)",
                                        color: "#fff",
                                        boxShadow: "0 6px 30px rgba(245,158,11,0.45), 0 0 0 1px rgba(245,158,11,0.2)",
                                    } : {}}
                                >
                                    {isActive && (
                                        <motion.div
                                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                                            initial={{ x: "-100%" }}
                                            animate={{ x: "100%" }}
                                            transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 3 }}
                                        />
                                    )}
                                    <VIcon className="w-4 h-4 relative z-10" />
                                    <span className="hidden sm:inline relative z-10">{opt.label}</span>
                                    <span className="sm:hidden text-xs relative z-10">{opt.label.split(" ")[0]}</span>
                                </motion.button>
                            );
                        })}
                    </div>
                </motion.div>

                <motion.p key={vehicleType}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.25 } }}
                    className="text-center text-[11px] text-white/35 font-medium uppercase tracking-[0.3em] mt-4"
                >
                    Showing prices for{" "}
                    <span className="text-amber-400/80 font-bold">{vehicleOptions.find(v => v.type === vehicleType)?.label}</span>
                    {" "}vehicles
                </motion.p>
            </section>

            {/* ══════════════════════════════════
                LUXURY PRICING CARDS
            ══════════════════════════════════ */}
            <section className="relative pt-8 pb-28 overflow-hidden" style={{
                background: `
                    radial-gradient(ellipse 70% 50% at 50% 30%, rgba(245,158,11,0.03) 0%, transparent 60%),
                    radial-gradient(ellipse 50% 40% at 20% 60%, rgba(59,130,246,0.03) 0%, transparent 50%),
                    radial-gradient(ellipse 50% 40% at 80% 70%, rgba(139,92,246,0.03) 0%, transparent 50%),
                    linear-gradient(180deg, #0a0f1c 0%, #080c18 100%)
                `
            }}>
                <div className="w-full max-w-[1440px] mx-auto px-4 lg:px-10 relative z-10">
                    <motion.div
                        key={vehicleType}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, ease: EASE }}
                        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 lg:gap-5 items-stretch"
                    >
                        {spfPackages.map((pkg, i) => (
                            <LuxuryCard key={pkg.key} pkg={pkg} index={i} vehicleType={vehicleType} />
                        ))}
                    </motion.div>

                    {/* Note */}
                    <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
                        className="text-center mt-16">
                        <div className="inline-flex items-center gap-3 px-7 py-3.5 rounded-2xl backdrop-blur-sm"
                            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <BadgeCheck className="w-4 h-4 text-amber-400/60" />
                            <p className="text-xs text-white/30 font-medium">
                                All prices include VAT &bull; 50% OFF currently active &bull;{" "}
                                <span className="text-amber-400/60 font-semibold">Satisfaction guaranteed</span>
                            </p>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* ══════════════════════════════════
                ADD-ONS
            ══════════════════════════════════ */}
            <section className="relative py-20 overflow-hidden" style={{ background: "#080c18" }}>
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-amber-500/[0.015] to-transparent" />
                <div className="container max-w-4xl mx-auto px-6 relative z-10">
                    <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                        transition={{ duration: 0.7 }} className="text-center mb-12">
                        <h2 className="text-3xl sm:text-4xl font-serif font-medium text-white mb-3">
                            Add-On{" "}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 italic">Services</span>
                        </h2>
                        <p className="text-white/40 text-sm max-w-lg mx-auto font-light">
                            Enhance your protection package with additional premium services
                        </p>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                        transition={{ duration: 0.7, delay: 0.1 }} className="rounded-2xl overflow-hidden"
                        style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.01) 100%)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}
                    >
                        {addOns.map((addon, i) => (
                            <div key={addon.name}
                                className={cn("flex items-center justify-between px-7 py-5 group hover:bg-white/[0.03] transition-all duration-300",
                                    i < addOns.length - 1 && "border-b border-white/[0.04]"
                                )}>
                                <div className="flex items-center gap-3">
                                    <div className="w-7 h-7 rounded-lg bg-amber-500/[0.08] border border-amber-500/15 flex items-center justify-center">
                                    <Layers className="w-3.5 h-3.5 text-amber-400/70 group-hover:text-amber-400 transition-colors duration-300" />
                                    </div>
                                    <span className="text-sm font-semibold text-white/70 group-hover:text-white/90 transition-colors duration-300">{addon.name}</span>
                                </div>
                                <span className="text-sm font-bold text-amber-400/80 group-hover:text-amber-400 transition-colors duration-300">{addon.prices[vehicleType]}</span>
                            </div>
                        ))}
                    </motion.div>
                </div>
            </section>

            {/* ══════════════════════════════════
                FREE INCLUSIONS
            ══════════════════════════════════ */}
            <section className="relative py-24 overflow-hidden" style={{
                background: `
                    radial-gradient(ellipse 60% 40% at 50% 50%, rgba(16,185,129,0.04) 0%, transparent 60%),
                    linear-gradient(180deg, #080c18 0%, #0a0f1c 100%)
                `
            }}>
                <div className="container max-w-5xl mx-auto px-6 relative z-10">
                    <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                        transition={{ duration: 0.7 }} className="text-center mb-14">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }} viewport={{ once: true }}
                            className="inline-flex items-center gap-2 px-5 py-2 rounded-full mb-6"
                            style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.18)" }}
                        >
                            <Zap className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-emerald-400/90">Complimentary</span>
                        </motion.div>
                        <h2 className="text-3xl sm:text-4xl font-serif font-medium text-white mb-3">
                            FREE{" "}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-500 italic">
                                Inclusions
                            </span>
                        </h2>
                        <p className="text-white/40 text-sm max-w-lg mx-auto font-light">
                            Every SPF package includes these premium treatments at no extra cost
                        </p>
                    </motion.div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {[
                            "Paint Decontamination", "Multi-Stage Paint Correction", "Acid Rain Removal",
                            "Asphalt Removal", "Premium Wash", "Light Scratch Removal",
                            "SwirlMarks Removal", "Bac2zero", "Gloss Enhancement",
                            "Trim Restoration", "Matte Enhancement", "Degrimming",
                            "Headlight/Taillight Coating", "Glass Coating", "Trims Coating",
                            "Mags/Wheels Coating",
                        ].map((item, i) => (
                            <motion.div key={item}
                                initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                                transition={{ duration: 0.35, delay: i * 0.025 }}
                                className="flex items-center gap-3 px-5 py-4 rounded-xl bg-white/[0.025] border border-white/[0.05] hover:bg-emerald-500/[0.06] hover:border-emerald-500/20 transition-all duration-300 group cursor-default">
                                <div className="w-6 h-6 rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/25 transition-colors duration-300">
                                    <Check className="w-3 h-3 text-emerald-400/80 group-hover:text-emerald-400 transition-colors duration-300" />
                                </div>
                                <span className="text-[13px] font-medium text-white/55 group-hover:text-white/80 transition-colors duration-300">{item}</span>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════
                PPF PRICELIST
            ══════════════════════════════════ */}
            <section className="relative py-24 overflow-hidden" style={{ background: "#080c18" }}>
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-amber-500/[0.012] to-transparent" />
                <div className="container max-w-5xl mx-auto px-6 relative z-10">
                    <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                        transition={{ duration: 0.7 }} className="text-center mb-12">
                        <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full mb-6"
                            style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)" }}>
                            <Shield className="w-3.5 h-3.5 text-amber-400/80" />
                            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber-400/80">Paint Protection Film</span>
                        </div>
                        <h2 className="text-3xl sm:text-4xl font-serif font-medium text-white mb-3">
                            PPF{" "}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 italic">Pricelist</span>
                        </h2>
                        <p className="text-white/40 text-sm max-w-lg mx-auto font-light">
                            Full-body Paint Protection Film — All TPU PPF Material
                        </p>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                        transition={{ duration: 0.7, delay: 0.1 }} className="rounded-2xl overflow-hidden"
                        style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.01) 100%)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}
                    >
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                                        <th className="text-left px-6 py-5 text-xs font-bold uppercase tracking-widest text-amber-400/90">Vehicle</th>
                                        <th className="text-center px-4 py-5 text-xs font-bold uppercase tracking-widest text-white/50">CEO PPF</th>
                                        <th className="text-center px-4 py-5 text-xs font-bold uppercase tracking-widest text-white/50">XPEL</th>
                                        <th className="text-center px-4 py-5 text-xs font-bold uppercase tracking-widest text-white/50">Vinyl Frog</th>
                                        <th className="text-center px-4 py-5 text-xs font-bold uppercase tracking-widest text-amber-400/80">ZIVENT</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        { vehicle: "Sedan / Hatch", prices: ["₱75,000", "₱80,000", "₱90,000", "₱120,000"] },
                                        { vehicle: "Crossover", prices: ["₱80,000", "₱85,000", "₱95,000", "₱135,000"] },
                                        { vehicle: "SUV / Pickup", prices: ["₱85,000", "₱90,000", "₱100,000", "₱140,000"] },
                                        { vehicle: "Full-Size SUV", prices: ["₱100,000", "₱110,000", "₱130,000", "₱160,000"] },
                                    ].map((row, i) => (
                                        <tr key={row.vehicle} className={cn(
                                            "group hover:bg-white/[0.025] transition-colors duration-300",
                                            i < 3 && "border-b border-white/[0.04]"
                                        )}>
                                            <td className="px-6 py-4.5 font-semibold text-white/70 group-hover:text-white transition-colors duration-300">{row.vehicle}</td>
                                            {row.prices.map((p, j) => (
                                                <td key={j} className={cn("text-center px-4 py-4.5 font-bold transition-colors duration-300", j === 3 ? "text-amber-400/80 group-hover:text-amber-400" : "text-white/50 group-hover:text-white/70")}>{p}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="border-t border-white/[0.06] px-6 py-5">
                            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/35 mb-3">Specifications</div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-2.5 text-xs">
                                {[
                                    { label: "Warranty", values: "5 / 5 / 6 / 10 Yrs" },
                                    { label: "Thickness", values: "7.5 / 7.5 / 8.0 / 8.5 mils" },
                                    { label: "Free Panel Replacement", values: "2 panels each" },
                                ].map((spec) => (
                                    <div key={spec.label} className="flex items-center gap-2">
                                        <span className="text-white/35 font-medium">{spec.label}:</span>
                                        <span className="text-white/55 font-semibold">{spec.values}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>

                    <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        className="flex flex-wrap items-center justify-center gap-6 mt-10">
                        {["PPF — Paint Protection Film", "SONAX — Made in Germany", "Vinyl Frog"].map((brand) => (
                            <span key={brand} className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/25 px-4 py-2 rounded-full border border-white/[0.08]">
                                {brand}
                            </span>
                        ))}
                    </motion.div>
                </div>
            </section>

            <FAQSection />
            <BookingCTA />
        </PageLayout>
    );
}
