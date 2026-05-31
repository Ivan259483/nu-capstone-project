import { useState, useEffect, useMemo, useRef } from "react";
import {
    Shield, Crown, Zap, BadgeCheck,
    Car, Truck, CarFront,
    Check, Gem, Award, ChevronRight, Layers, Timer, Users, Trophy,
} from "lucide-react";
import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion";
import type { Variants } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import PageLayout from "@/components/PageLayout";
import BookingCTA from "@/components/BookingCTA";
import FAQSection from "@/components/FAQSection";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import type { PublishedServicePricingSource } from "@/lib/service-pricing";
import { LuxuryServiceCard } from "@/components/services/LuxuryServiceCard";
import {
    mergePublishedPricingIntoPackages,
    spfPackages,
    type VehicleType,
} from "@/components/services/services-catalog-data";

export type { VehicleType } from "@/components/services/services-catalog-data";

const EASE = [0.16, 1, 0.3, 1] as const;

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } },
};

const stagger: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
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
   ADD-ONS DATA
═══════════════════════════════════════ */
const addOns: { name: string; prices: Record<VehicleType, string> }[] = [
    { name: "Undercoating", prices: { hatchback: "₱6,000", sedan: "₱6,500", midsized: "₱7,000", suv: "₱7,500", pickup: "₱7,500", largesuv: "₱9,000", highend: "₱8,000" } },
    { name: "Repainting", prices: { hatchback: "Per Panel", sedan: "Per Panel", midsized: "Per Panel", suv: "Per Panel", pickup: "Per Panel", largesuv: "Per Panel", highend: "Per Panel" } },
    { name: "PDR (Paintless Dent Repair)", prices: { hatchback: "Per Dent", sedan: "Per Dent", midsized: "Per Dent", suv: "Per Dent", pickup: "Per Dent", largesuv: "Per Dent", highend: "Per Dent" } },
    { name: "PPF (per panel)", prices: { hatchback: "Per Panel", sedan: "Per Panel", midsized: "Per Panel", suv: "Per Panel", pickup: "Per Panel", largesuv: "Per Panel", highend: "Per Panel" } },
    { name: "Interior Detailing", prices: { hatchback: "Inquire", sedan: "Inquire", midsized: "Inquire", suv: "Inquire", pickup: "Inquire", largesuv: "Inquire", highend: "Inquire" } },
    { name: "Engine Wash/Detailing", prices: { hatchback: "Inquire", sedan: "Inquire", midsized: "Inquire", suv: "Inquire", pickup: "Inquire", largesuv: "Inquire", highend: "Inquire" } },
];

const ppfPriceRows = [
    { vehicle: "Sedan / Hatch", prices: ["₱75,000", "₱80,000", "₱90,000", "₱120,000"] },
    { vehicle: "Crossover", prices: ["₱80,000", "₱85,000", "₱95,000", "₱135,000"] },
    { vehicle: "SUV / Pickup", prices: ["₱85,000", "₱90,000", "₱100,000", "₱140,000"] },
    { vehicle: "Full-Size SUV", prices: ["₱100,000", "₱110,000", "₱120,000", "₱150,000"] },
];

const ppfSpecRows = [
    { label: "Thickness", values: ["7.0 mils", "7.5 mils", "7.5 mils", "8.0 mils"] },
    { label: "Warranty", values: ["5 Years", "6 Years", "8 Years", "10 Years"] },
    { label: "Free Panel Replacement", values: ["2 panels", "2 panels", "2 panels", "None"] },
];

const tintSpecRows = [
    { shade: "Clear Green", vlt: "75", irr: "97", uvr: "99.99%", tser: "55%" },
    { shade: "Clear Blue", vlt: "65", irr: "97", uvr: "99.99%", tser: "60%" },
    { shade: "Medium Dark", vlt: "30", irr: "99", uvr: "99.99%", tser: "85%" },
    { shade: "Dark", vlt: "10", irr: "99", uvr: "99.99%", tser: "90%" },
    { shade: "Super Dark", vlt: "5", irr: "99", uvr: "99.99%", tser: "92%" },
];

/* ═══════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════ */
export default function Services() {
    const { t } = useLanguage();
    const [vehicleType, setVehicleType] = useState<VehicleType>("sedan");
    const [publishedServices, setPublishedServices] = useState<PublishedServicePricingSource[]>([]);

    const vehicleOptions: { type: VehicleType; label: string; icon: React.ElementType }[] = [
        { type: "hatchback", label: "Hatchback", icon: CarFront },
        { type: "sedan", label: "Sedan", icon: Car },
        { type: "midsized", label: "Midsized", icon: Car },
        { type: "suv", label: "SUV", icon: Truck },
        { type: "pickup", label: "Pick Up", icon: Truck },
        { type: "largesuv", label: "Large SUV / Van", icon: Truck },
        { type: "highend", label: "Highend Sedan", icon: Crown },
    ];

    useEffect(() => {
        let active = true;

        api.get('/services/published', { meta: { suppressErrorToast: true } } as any)
            .then((response) => {
                const list = response.data?.data;
                if (active && Array.isArray(list)) {
                    setPublishedServices(list);
                }
            })
            .catch((error) => {
                console.warn('[Services] Falling back to bundled pricing:', error?.message || error);
            });

        return () => {
            active = false;
        };
    }, []);

    const displayPackages = useMemo(
        () => mergePublishedPricingIntoPackages(spfPackages, publishedServices),
        [publishedServices],
    );

    const visiblePricingPackages = useMemo(
        () => displayPackages.filter((pkg) => pkg.prices[vehicleType] != null),
        [displayPackages, vehicleType],
    );

    const pricingGridClassName = cn(
        "grid gap-6 lg:gap-5 items-stretch mx-auto w-full",
        visiblePricingPackages.length <= 1 && "grid-cols-1 max-w-md",
        visiblePricingPackages.length === 2 && "grid-cols-1 sm:grid-cols-2 max-w-3xl",
        visiblePricingPackages.length === 3 && "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 max-w-6xl",
        visiblePricingPackages.length >= 4 && "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 max-w-[1440px]",
    );

    return (
        <PageLayout>
            {/* ══════════════════════════════════
                CINEMATIC HERO
            ══════════════════════════════════ */}
            <section className="relative pt-32 pb-20 overflow-hidden">
                {/* Same bg-hero-pattern as Gallery */}
                <div className="absolute inset-0 bg-hero-pattern" />
                <div
                    className="absolute inset-0"
                    style={{ background: "linear-gradient(to bottom, transparent 0%, transparent 50%, #07070A 100%)" }}
                />
                {/* Orange amber glow blob — matches Gallery hero */}
                <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-amber-500/[0.07] blur-[160px] rounded-full pointer-events-none" />

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
                VEHICLE SELECTOR
            ══════════════════════════════════ */}
            <section className="relative py-6 z-20" style={{ background: "#07070A" }}>
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
            <section className="relative pt-8 pb-28 overflow-hidden" style={{ background: "#07070A" }}>
                <div className="w-full max-w-[1440px] mx-auto px-4 lg:px-10 relative z-10">
                    <motion.div
                        key={vehicleType}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, ease: EASE }}
                        className={pricingGridClassName}
                    >
                        {visiblePricingPackages.map((pkg, i) => (
                            <LuxuryServiceCard key={pkg.key} pkg={pkg} index={i} vehicleType={vehicleType} />
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
            <section className="relative py-20 overflow-hidden" style={{ background: "#07070A" }}>
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
            <section className="relative py-24 overflow-hidden" style={{ background: "#07070A" }}>
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
            <section className="relative py-24 overflow-hidden" style={{ background: "#07070A" }}>
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
                                    {ppfPriceRows.map((row, i) => (
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
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[620px] text-xs">
                                    <thead>
                                        <tr className="border-b border-white/[0.06]">
                                            <th className="px-3 py-2 text-left font-semibold text-white/35">Spec</th>
                                            <th className="px-3 py-2 text-center font-semibold text-white/35">CEO PPF</th>
                                            <th className="px-3 py-2 text-center font-semibold text-white/35">XPEL</th>
                                            <th className="px-3 py-2 text-center font-semibold text-white/35">Vinyl Frog</th>
                                            <th className="px-3 py-2 text-center font-semibold text-white/35">ZIVENT</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ppfSpecRows.map((spec) => (
                                            <tr key={spec.label} className="border-b border-white/[0.03] last:border-0">
                                                <td className="px-3 py-2.5 font-semibold text-white/50">{spec.label}</td>
                                                {spec.values.map((value, valueIndex) => (
                                                    <td key={`${spec.label}-${valueIndex}`} className="px-3 py-2.5 text-center font-bold text-white/60">{value}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="border-t border-white/[0.06] px-6 py-5">
                            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/35 mb-3">Nano Ceramic Tint</div>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[620px] text-xs">
                                    <thead>
                                        <tr className="border-b border-white/[0.06]">
                                            <th className="px-3 py-2 text-left font-semibold text-white/35">Shade</th>
                                            <th className="px-3 py-2 text-center font-semibold text-white/35">VLT</th>
                                            <th className="px-3 py-2 text-center font-semibold text-white/35">IRR</th>
                                            <th className="px-3 py-2 text-center font-semibold text-white/35">UVR</th>
                                            <th className="px-3 py-2 text-center font-semibold text-white/35">TSER</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tintSpecRows.map((row) => (
                                            <tr key={row.shade} className="border-b border-white/[0.03] last:border-0">
                                                <td className="px-3 py-2.5 font-semibold uppercase tracking-[0.08em] text-white/65">{row.shade}</td>
                                                <td className="px-3 py-2.5 text-center font-bold text-white/60">{row.vlt}</td>
                                                <td className="px-3 py-2.5 text-center font-bold text-white/60">{row.irr}</td>
                                                <td className="px-3 py-2.5 text-center font-bold text-white/60">{row.uvr}</td>
                                                <td className="px-3 py-2.5 text-center font-bold text-amber-400/80">{row.tser}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30">
                                <span>VLT: Visible Light Transmission</span>
                                <span>IRR: Infrared Rejection</span>
                                <span>UVR: UV Rejection</span>
                                <span>TSER: Total Solar Energy Rejected</span>
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
