import { useState } from "react";
import { Link } from "react-router-dom";
import {
    Shield, Sparkles, Crown, Zap, Star, BadgeCheck,
    CheckCircle2, ArrowRight, Car, Truck, CarFront,
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
export type VehicleType = "hatchback" | "sedan" | "midsized" | "suv" | "pickup" | "largesuv" | "highend";

/* ── Framer Variants ── */
const EASE = [0.25, 0.46, 0.45, 0.94] as const;

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

const stagger: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.07, delayChildren: 0.0 } },
};

// Used only on initial page load — stagger per-card
const cardVariant: Variants = {
    hidden: { opacity: 0, y: 28, scale: 0.98 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.4, ease: EASE, delay: i * 0.06 },
    }),
};

const priceFlip: Variants = {
    exit: { opacity: 0, y: -10, scale: 0.94, transition: { duration: 0.12 } },
    enter: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: EASE } },
};

const shimmer: Variants = {
    hidden: { x: "-100%" },
    visible: {
        x: "200%",
        transition: { duration: 2.5, repeat: Infinity, repeatDelay: 4, ease: "linear" },
    },
};

/* ═══════════════════════════════════════
   Real Pricing Data — SPF Graphene Coating
═══════════════════════════════════════ */
type PriceMap = Record<VehicleType, number | null>;
type TintPriceMap = Record<VehicleType, number | null>;

interface SPFPackage {
    key: string;
    label: string;
    years: string;
    badge: string;
    badgeColor: string;
    tier: string;
    tierColor: string;
    tierBg: string;
    glowColor: string;
    prices: PriceMap;
    tintPrices: TintPriceMap;
    originalPriceMultiplier: number;
    features: string[];
    popular: boolean;
    flagship: boolean;
    icon: typeof Shield;
}

const spfPackages: SPFPackage[] = [
    {
        key: "spf80",
        label: "SPF 80",
        years: "3 Years",
        badge: "SPECIAL OFFER",
        badgeColor: "from-orange-500 to-red-500",
        tier: "Essential",
        tierColor: "from-sky-400 to-cyan-500",
        tierBg: "bg-sky-500/10 text-sky-400 border-sky-500/20",
        glowColor: "rgba(14,165,233,0.12)",
        prices: { hatchback: 7499, sedan: 7999, midsized: 7999, suv: 8999, pickup: 8499, largesuv: 12999, highend: null },
        tintPrices: { hatchback: 13499, sedan: 13499, midsized: 14499, suv: 15999, pickup: 14499, largesuv: 20999, highend: null },
        originalPriceMultiplier: 2,
        features: [
            "3 Layers Graphene Ceramic Coating (Canada)",
            "Graphene Sealant",
            "FREE 1 visit Signature AUTOSPF Carwash",
        ],
        popular: false,
        flagship: false,
        icon: Sparkles,
    },
    {
        key: "spf89",
        label: "SPF 89",
        years: "5 Years",
        badge: "RECOMMENDED",
        badgeColor: "from-amber-400 to-orange-500",
        tier: "Advanced",
        tierColor: "from-emerald-400 to-teal-500",
        tierBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        glowColor: "rgba(16,185,129,0.12)",
        prices: { hatchback: 8999, sedan: 9999, midsized: 10999, suv: 11999, pickup: 10999, largesuv: 14999, highend: 17999 },
        tintPrices: { hatchback: 14999, sedan: 15999, midsized: 17499, suv: 18999, pickup: 17499, largesuv: 22999, highend: 23999 },
        originalPriceMultiplier: 2,
        features: [
            "4 Layers Graphene Ceramic Coating (Canada)",
            "Graphene Sealant",
            "FREE 1 visit Reboost/Maintenance (save ₱1,500)",
        ],
        popular: true,
        flagship: false,
        icon: Shield,
    },
    {
        key: "spf99",
        label: "SPF 99",
        years: "10 Years",
        badge: "50% OFF PROMO",
        badgeColor: "from-violet-500 to-purple-600",
        tier: "Premium",
        tierColor: "from-amber-400 to-orange-500",
        tierBg: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        glowColor: "rgba(245,158,11,0.15)",
        prices: { hatchback: 13999, sedan: 13999, midsized: 15999, suv: 16999, pickup: 15999, largesuv: 19999, highend: 22999 },
        tintPrices: { hatchback: 19999, sedan: 19999, midsized: 22499, suv: 23999, pickup: 22499, largesuv: 27999, highend: 28999 },
        originalPriceMultiplier: 2,
        features: [
            "4 Layers SONAX Profiline CC EVO (Germany)",
            "FREE Full Recoat After 5 Years",
            "FREE 2 visits Reboost/Maintenance (save ₱3,000)",
        ],
        popular: false,
        flagship: false,
        icon: Shield,
    },
    {
        key: "spf101",
        label: "SPF 101",
        years: "10 Years",
        badge: "ALL-IN PACKAGE",
        badgeColor: "from-amber-300 via-yellow-400 to-orange-500",
        tier: "Flagship",
        tierColor: "from-amber-300 via-yellow-400 to-orange-500",
        tierBg: "bg-gradient-to-r from-amber-500/15 to-orange-500/15 text-amber-400 border-amber-500/25",
        glowColor: "rgba(212,175,55,0.18)",
        prices: { hatchback: 39999, sedan: 39999, midsized: 46999, suv: 46999, pickup: 46999, largesuv: 49999, highend: 49999 },
        tintPrices: { hatchback: null, sedan: null, midsized: null, suv: null, pickup: null, largesuv: null, highend: null },
        originalPriceMultiplier: 2,
        features: [
            "Paint Protection Film PPF (Hood, Bumper, Mirrors & More)",
            "4 Layers SONAX Profiline CC EVO (Germany)",
            "FREE 5 visits Reboost/Maintenance (save ₱7,500)",
            "FREE Full Recoat After 5 Years",
            "Nano Ceramic Window Tint (Full Wrap — Any Shade)",
            "FREE Undercoating (Rust Proofing)",
        ],
        popular: false,
        flagship: true,
        icon: Crown,
    },
];

/* ═══════════════════════════════════════
   ServiceCard — Premium SPF Package Card
═══════════════════════════════════════ */
function ServiceCard({
    pkg,
    index,
    vehicleType,
}: {
    pkg: SPFPackage;
    index: number;
    vehicleType: VehicleType;
}) {
    const { t } = useLanguage();
    const Icon = pkg.icon;
    const [isHovered, setIsHovered] = useState(false);

    const price = pkg.prices[vehicleType];
    const tintPrice = pkg.tintPrices[vehicleType];
    const originalPrice = price ? price * pkg.originalPriceMultiplier : null;

    // If package is not available for this vehicle type, don't render it
    if (price === null) return null;
    const isFlagship = pkg.flagship;
    const isPopular = pkg.popular;

    return (
        <motion.div
            custom={index}
            variants={cardVariant}
            whileHover={{ y: -12, transition: { duration: 0.35, ease: EASE } }}
            onHoverStart={() => setIsHovered(true)}
            onHoverEnd={() => setIsHovered(false)}
            className={cn(
                "group relative flex flex-col rounded-3xl overflow-hidden transition-all duration-500 w-full sm:w-[320px] lg:w-[300px] xl:w-[280px] 2xl:w-[310px] shrink-0",
                isFlagship
                    ? ""
                    : "",
                isPopular || isFlagship
                    ? "ring-1 ring-amber-500/30 shadow-2xl shadow-amber-500/10"
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
                        ? `0 0 40px ${pkg.glowColor}, inset 0 1px 0 rgba(255,255,255,0.08)`
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

            {/* ── Badge strip ── */}
            <div className="relative">
                <div
                    className={cn(
                        "flex items-center justify-center gap-2 py-2.5 text-[11px] font-bold uppercase tracking-[0.25em]",
                        isFlagship
                            ? "bg-gradient-to-r from-amber-500/20 via-yellow-500/25 to-orange-500/20 text-amber-400"
                            : isPopular
                            ? "bg-gradient-to-r from-emerald-500/15 to-teal-500/15 text-emerald-400"
                            : "bg-gradient-to-r from-orange-500/15 to-red-500/10 text-orange-400"
                    )}
                >
                    {isFlagship ? (
                        <Crown className="w-3.5 h-3.5" />
                    ) : isPopular ? (
                        <Star className="w-3.5 h-3.5 fill-current" />
                    ) : (
                        <Zap className="w-3.5 h-3.5" />
                    )}
                    {pkg.badge}
                </div>
                <div className="h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
            </div>

            {/* ── Card Header ── */}
            <div className="relative px-7 pt-7 pb-4 flex flex-col items-center text-center">
                {/* SPF Label + Duration */}
                <div className="flex items-center justify-center gap-2 mb-4">
                    <span
                        className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                            pkg.tierBg
                        )}
                    >
                        <Zap className="w-2.5 h-2.5" />
                        {pkg.tier}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-white/5 border border-white/10 text-white/50">
                        <Shield className="w-2.5 h-2.5" />
                        {pkg.years} Protection
                    </span>
                </div>

                {/* Icon + Title */}
                <div className="flex flex-col items-center gap-3 mb-5">
                    <motion.div
                        className={cn(
                            "w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border transition-all duration-500",
                            isHovered
                                ? `bg-gradient-to-br ${pkg.tierColor} border-transparent shadow-lg`
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
                    <div className="w-full">
                        <h3 className="text-xl font-black text-white group-hover:text-amber-400 transition-colors duration-300 leading-tight tracking-tight">
                            {pkg.label}
                        </h3>
                        <p className="text-xs text-white/30 mt-1 leading-relaxed">
                            Graphene Ceramic Coating — {pkg.years} Protection
                        </p>
                    </div>
                </div>

                {/* ── Price Display ── */}
                <div className="flex items-baseline justify-center gap-3 mb-1 w-full">
                    <span className="text-[11px] text-white/25 uppercase tracking-wider font-medium">
                        {t("services.startingAt")}
                    </span>
                    {/* Original (crossed out) price */}
                    <span className="text-sm text-white/25 line-through font-medium">
                        ₱{originalPrice?.toLocaleString()}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold uppercase tracking-wider">
                        50% off
                    </span>
                </div>
                <div className="flex justify-center mb-2 w-full mt-1">
                    <AnimatePresence mode="wait">
                        <motion.span
                            key={price}
                            variants={priceFlip}
                            initial="exit"
                            animate="enter"
                            exit="exit"
                            className={cn(
                                "relative text-4xl font-black tracking-tight inline-block",
                                isFlagship || isPopular
                                    ? "text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500"
                                    : "text-white"
                            )}
                        >
                            <span className="text-white/40 text-lg font-medium absolute -left-4 bottom-1.5 leading-none">₱</span>
                            {price?.toLocaleString()}
                            <span className="text-white/20 text-sm font-medium absolute -right-7 bottom-1.5 leading-none">.00</span>
                        </motion.span>
                    </AnimatePresence>
                </div>
                {/* Tint bundle price */}
                {tintPrice && (
                    <div className="flex items-center justify-center gap-2 mb-4 w-full">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/60">
                            + Nano Ceramic Window Tint
                        </span>
                        <AnimatePresence mode="wait">
                            <motion.span
                                key={tintPrice}
                                variants={priceFlip}
                                initial="exit"
                                animate="enter"
                                exit="exit"
                                className="text-sm font-bold text-amber-400/80"
                            >
                                ₱{tintPrice.toLocaleString()}
                            </motion.span>
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* ── Divider ── */}
            <div className="mx-7 h-px shrink-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {/* ── Features ── */}
            <div className="px-7 py-6 flex-1">
                <ul className="space-y-3">
                    {pkg.features.map((feat, i) => (
                        <motion.li
                            key={feat}
                            className="flex items-start gap-3 text-sm text-white/50 group-hover:text-white/65 transition-colors duration-300"
                            initial={{ opacity: 0, x: -10 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.3 + i * 0.05, duration: 0.4, ease: EASE }}
                        >
                            <div
                                className={cn(
                                    "w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-all duration-300",
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
                            <span className="font-medium text-[13px] leading-snug">{feat}</span>
                        </motion.li>
                    ))}
                </ul>
            </div>

            {/* ── CTA Button ── */}
            <div className="px-7 pb-7 mt-auto shrink-0">
                <Link to={`/booking?pkg=${pkg.key}`}>
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
                style={{ background: pkg.glowColor }}
            />
        </motion.div>
    );
}

/* ═══════════════════════════════════════
   Add-ons Section
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
   Main Page Component
═══════════════════════════════════════ */
export default function Services() {
    const { t } = useLanguage();
    const [vehicleType, setVehicleType] = useState<VehicleType>("sedan");

    const vehicleOptions: { type: VehicleType; label: string; icon: React.ElementType; desc: string }[] = [
        { type: "hatchback", label: "Hatchback", icon: CarFront, desc: "Small Car" },
        { type: "sedan", label: "Sedan", icon: Car, desc: "Standard" },
        { type: "midsized", label: "Midsized", icon: Car, desc: "Mid SUV" },
        { type: "suv", label: "SUV", icon: Truck, desc: "Large" },
        { type: "pickup", label: "Pick Up", icon: Truck, desc: "Truck" },
        { type: "largesuv", label: "Large SUV / Van", icon: Truck, desc: "Full-Size" },
        { type: "highend", label: "Highend Sedan", icon: Crown, desc: "Luxury" },
    ];

    return (
        <PageLayout>
            {/* ══════════════════════════════════
                HERO SECTION
            ══════════════════════════════════ */}
            <section className="relative pt-36 pb-24 overflow-hidden">
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
                            Graphene Ceramic Coating
                        </motion.div>

                        {/* Headline */}
                        <motion.h1
                            variants={fadeUp}
                            className="text-5xl sm:text-6xl lg:text-7xl font-serif font-medium text-white tracking-tight mb-5 leading-[1.05]"
                        >
                            Premium Vehicle{" "}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 italic">
                                Protection
                            </span>
                        </motion.h1>

                        {/* Subtitle */}
                        <motion.p
                            variants={fadeUp}
                            className="text-white/35 text-base md:text-lg max-w-2xl mx-auto font-light leading-relaxed"
                        >
                            Industry-leading graphene ceramic coating packages with up to 10 years of protection.
                            Select your vehicle category below for accurate pricing.
                        </motion.p>

                        {/* Trust badges */}
                        <motion.div
                            variants={fadeUp}
                            className="flex items-center justify-center gap-6 mt-8"
                        >
                            {["SONAX Germany", "PPF Certified", "Vinyl Frog"].map((brand) => (
                                <span key={brand} className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/20 px-3 py-1.5 rounded-full border border-white/5">
                                    {brand}
                                </span>
                            ))}
                        </motion.div>
                    </motion.div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/15 to-transparent" />
            </section>

            {/* ══════════════════════════════════
                VEHICLE SELECTOR — 5 Categories
            ══════════════════════════════════ */}
            <section className="relative py-8 z-20">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.4, ease: EASE }}
                    className="flex justify-center px-6"
                >
                    <div className="inline-flex flex-wrap justify-center p-1.5 bg-white/[0.03] backdrop-blur-xl rounded-2xl border border-white/8 gap-1.5">
                        {vehicleOptions.map((opt) => {
                            const VIcon = opt.icon;
                            const isActive = vehicleType === opt.type;
                            return (
                                <motion.button
                                    key={opt.type}
                                    onClick={() => setVehicleType(opt.type)}
                                    whileHover={{ scale: isActive ? 1 : 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                    className={cn(
                                        "flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 relative overflow-hidden",
                                        isActive
                                            ? "bg-gradient-gold text-primary-foreground shadow-lg shadow-amber-500/25 ring-1 ring-amber-500/50"
                                            : "glass-subtle border border-white/5 text-white/50 hover:text-white/80 hover:bg-white/5"
                                    )}
                                >
                                    <VIcon className="w-4 h-4" />
                                    <span className="hidden sm:inline">{opt.label}</span>
                                    <span className="sm:hidden text-xs">{opt.label.split(" ")[0]}</span>
                                </motion.button>
                            );
                        })}
                    </div>
                </motion.div>

                {/* Vehicle type label */}
                <motion.p
                    key={vehicleType}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { duration: 0.2 } }}
                    className="text-center text-[11px] text-white/25 font-medium uppercase tracking-[0.3em] mt-4"
                >
                    Showing prices for {vehicleOptions.find(v => v.type === vehicleType)?.label} vehicles
                </motion.p>
            </section>

            {/* ══════════════════════════════════
                SPF PACKAGE CARDS
            ══════════════════════════════════ */}
            <section className="relative pt-4 pb-20 overflow-hidden">
                {/* Ambient blobs */}
                <div className="absolute top-40 left-0 w-[500px] h-[500px] bg-indigo-500/[0.03] blur-[150px] rounded-full pointer-events-none" />
                <div className="absolute bottom-20 right-0 w-[400px] h-[400px] bg-amber-500/[0.04] blur-[120px] rounded-full pointer-events-none" />

                <div className="w-full max-w-[1400px] mx-auto px-4 lg:px-8 relative z-10">
                    <motion.div
                        key={vehicleType}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22, ease: EASE }}
                        className="flex flex-wrap justify-center items-stretch gap-5 lg:gap-6"
                    >
                        {spfPackages.map((pkg, i) => (
                            <ServiceCard
                                key={pkg.key}
                                pkg={pkg}
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
                                All prices include VAT &bull; 50% OFF limited promo &bull;{" "}
                                <span className="text-amber-400/60">Satisfaction guaranteed</span>
                            </p>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* ══════════════════════════════════
                ADD-ONS TABLE
            ══════════════════════════════════ */}
            <section className="relative py-16 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-amber-500/[0.02] to-transparent" />
                <div className="container max-w-4xl mx-auto px-6 relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7 }}
                        className="text-center mb-10"
                    >
                        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3 tracking-tight">
                            Add-On Services
                        </h2>
                        <p className="text-white/30 text-sm max-w-lg mx-auto">
                            Enhance your protection package with additional services
                        </p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7, delay: 0.1 }}
                        className="rounded-2xl overflow-hidden ring-1 ring-white/10"
                        style={{
                            background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
                            backdropFilter: "blur(12px)",
                        }}
                    >
                        {addOns.map((addon, i) => (
                            <div
                                key={addon.name}
                                className={cn(
                                    "flex items-center justify-between px-6 py-4 group hover:bg-white/[0.03] transition-colors duration-300",
                                    i < addOns.length - 1 && "border-b border-white/5"
                                )}
                            >
                                <span className="text-sm font-semibold text-white/70 group-hover:text-white transition-colors">
                                    {addon.name}
                                </span>
                                <span className="text-sm font-bold text-amber-400/80">
                                    {addon.prices[vehicleType]}
                                </span>
                            </div>
                        ))}
                    </motion.div>
                </div>
            </section>

            {/* ══════════════════════════════════
                FREE INCLUSIONS
            ══════════════════════════════════ */}
            <section className="relative py-20 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-red-500/[0.02] to-transparent" />
                <div className="container max-w-5xl mx-auto px-6 relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7 }}
                        className="text-center mb-12"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            whileInView={{ scale: 1, opacity: 1 }}
                            viewport={{ once: true }}
                            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-xs font-bold uppercase tracking-[0.2em] text-red-400 mb-5"
                        >
                            <Zap className="w-3 h-3" />
                            All Packages Include
                        </motion.div>
                        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3 tracking-tight">
                            FREE{" "}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-500">
                                Inclusions
                            </span>
                        </h2>
                        <p className="text-white/30 text-sm max-w-lg mx-auto">
                            Every SPF package comes with these premium services at no extra cost
                        </p>
                    </motion.div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {[
                            "Paint Decontamination",
                            "Multi-Stage Paint Correction",
                            "Acid Rain Removal",
                            "Asphalt Removal",
                            "Premium Wash",
                            "Light Scratch Removal",
                            "SwirlMarks Removal",
                            "Bac2zero",
                            "Gloss Enhancement",
                            "Trim Restoration",
                            "Matte Enhancement",
                            "Degrimming",
                            "Headlight/Taillight Coating",
                            "Glass Coating",
                            "Trims Coating",
                            "Mags/Wheels Coating",
                        ].map((item, i) => (
                            <motion.div
                                key={item}
                                initial={{ opacity: 0, x: -15 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.4, delay: i * 0.03 }}
                                className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] hover:border-red-500/15 transition-all duration-300 group"
                            >
                                <div className="w-6 h-6 rounded-md bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                                    <Zap className="w-3 h-3 text-red-400 group-hover:text-red-300 transition-colors" />
                                </div>
                                <span className="text-sm font-medium text-white/60 group-hover:text-white/80 transition-colors">
                                    {item}
                                </span>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════
                PPF PAINT PROTECTION FILM PRICELIST
            ══════════════════════════════════ */}
            <section className="relative py-20 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-amber-500/[0.015] to-transparent" />
                <div className="container max-w-5xl mx-auto px-6 relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7 }}
                        className="text-center mb-12"
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs font-bold uppercase tracking-[0.2em] text-amber-400/80 mb-5">
                            <Shield className="w-3.5 h-3.5" />
                            Paint Protection Film
                        </div>
                        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3 tracking-tight">
                            PPF{" "}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">
                                Pricelist
                            </span>
                        </h2>
                        <p className="text-white/30 text-sm max-w-lg mx-auto">
                            Full-body Paint Protection Film — All TPU PPF Material
                        </p>
                    </motion.div>

                    {/* PPF Table */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7, delay: 0.1 }}
                        className="rounded-2xl overflow-hidden ring-1 ring-white/10"
                        style={{
                            background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
                            backdropFilter: "blur(12px)",
                        }}
                    >
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-white/10">
                                        <th className="text-left px-5 py-4 text-xs font-bold uppercase tracking-widest text-amber-400/80">Vehicle</th>
                                        <th className="text-center px-4 py-4 text-xs font-bold uppercase tracking-widest text-white/40">CEO PPF</th>
                                        <th className="text-center px-4 py-4 text-xs font-bold uppercase tracking-widest text-white/40">XPEL</th>
                                        <th className="text-center px-4 py-4 text-xs font-bold uppercase tracking-widest text-white/40">Vinyl Frog</th>
                                        <th className="text-center px-4 py-4 text-xs font-bold uppercase tracking-widest text-amber-400/60">ZIVENT</th>
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
                                            "group hover:bg-white/[0.03] transition-colors duration-300",
                                            i < 3 && "border-b border-white/5"
                                        )}>
                                            <td className="px-5 py-4 font-semibold text-white/70 group-hover:text-white transition-colors">{row.vehicle}</td>
                                            {row.prices.map((price, j) => (
                                                <td key={j} className={cn(
                                                    "text-center px-4 py-4 font-bold",
                                                    j === 3 ? "text-amber-400/80" : "text-white/50"
                                                )}>
                                                    {price}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* PPF Specs */}
                        <div className="border-t border-white/8 px-5 py-4">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-white/20 mb-3">Specifications</div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-xs">
                                {[
                                    { label: "Warranty", values: ["5 Yrs", "5 Yrs", "6 Yrs", "10 Yrs"] },
                                    { label: "Thickness", values: ["7.5 mils", "7.5 mils", "8.0 mils", "8.5 mils"] },
                                    { label: "Free Panel Replacement", values: ["2 panels", "2 panels", "2 panels", "2 panels"] },
                                ].map((spec) => (
                                    <div key={spec.label} className="flex items-center gap-2">
                                        <span className="text-white/30 font-medium">{spec.label}:</span>
                                        <span className="text-white/50 font-semibold">{spec.values.join(" / ")}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>

                    {/* Trust badges */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        className="flex items-center justify-center gap-8 mt-10"
                    >
                        {["PPF — Paint Protection Film", "SONAX — Made in Germany", "Vinyl Frog"].map((brand) => (
                            <span key={brand} className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/15 px-3 py-1.5 rounded-full border border-white/5">
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
