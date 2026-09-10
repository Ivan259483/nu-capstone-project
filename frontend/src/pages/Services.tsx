import { useState, useEffect, useMemo, useRef } from "react";
import {
    Shield, Crown, BadgeCheck,
    Car, Truck, CarFront,
    Gem, Award, ChevronRight, Timer, Users, Trophy,
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
   MAIN PAGE
═══════════════════════════════════════ */
export default function Services() {
    const { t } = useLanguage();
    const [vehicleType, setVehicleType] = useState<VehicleType>("sedan");
    const [publishedServices, setPublishedServices] = useState<PublishedServicePricingSource[]>([]);

    const vehicleOptions: { type: VehicleType; label: string; icon: React.ElementType }[] = useMemo(
        () => [
            { type: "hatchback", label: t("servicesPage.vehicles.hatchback"), icon: CarFront },
            { type: "sedan", label: t("servicesPage.vehicles.sedan"), icon: Car },
            { type: "midsized", label: t("servicesPage.vehicles.midsized"), icon: Car },
            { type: "suv", label: t("servicesPage.vehicles.suv"), icon: Truck },
            { type: "pickup", label: t("servicesPage.vehicles.pickup"), icon: Truck },
            { type: "largesuv", label: t("servicesPage.vehicles.largesuv"), icon: Truck },
            { type: "highend", label: t("servicesPage.vehicles.highend"), icon: Crown },
        ],
        [t]
    );

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
                {/* Premium gold glow blob — matches Gallery hero */}
                <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[#F4B63D]/[0.07] blur-[160px] rounded-full pointer-events-none" />

                {/* Animated gradient mesh */}
                <motion.div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] pointer-events-none"
                    animate={{ rotate: [0, 3, -3, 0] }}
                    transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
                >
                    <div className="absolute top-10 left-1/4 w-72 h-72 bg-[#F4B63D]/[0.06] blur-[120px] rounded-full" />
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
                                background: "linear-gradient(135deg, rgba(244,182,61,0.12), rgba(213,138,18,0.06))",
                                border: "1px solid rgba(244,182,61,0.2)",
                                boxShadow: "0 4px 20px rgba(244,182,61,0.08)",
                            }}
                        >
                            <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }}>
                                <Gem className="w-4 h-4 text-[#F4B63D]" />
                            </motion.div>
                            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#F4B63D]/90">
                                {t("servicesPage.badge")}
                            </span>
                        </motion.div>

                        {/* Main headline */}
                        <motion.h1 variants={fadeUp}
                            className="text-5xl sm:text-6xl lg:text-[76px] font-serif font-medium text-white tracking-tight mb-6 leading-[1.05]"
                        >
                            {t("servicesPage.title")}{" "}
                            <br className="hidden sm:block" />
                            <span className="relative inline-block">
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F4B63D] via-amber-200 to-[#D58A12] italic">
                                    {t("servicesPage.titleHighlight")}
                                </span>
                                {/* Underline accent */}
                                <motion.div
                                    className="absolute -bottom-2 left-0 right-0 h-[2px] rounded-full"
                                    style={{ background: "linear-gradient(90deg, transparent, #F4B63D, transparent)" }}
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
                            {t("servicesPage.subtitle")}{" "}
                            <span className="text-[#F4B63D]/70 font-medium">{t("servicesPage.subtitleHighlight")}</span>.
                            {" "}{t("servicesPage.subtitleSuffix")}
                        </motion.p>

                        {/* Trust badges */}
                        <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-4">
                            {[
                                { label: t("servicesPage.trustSonax"), icon: Award, color: "#F4B63D" },
                                { label: t("servicesPage.trustPpf"), icon: Shield, color: "#F4B63D" },
                                { label: t("servicesPage.trustVinyl"), icon: Gem, color: "#F4B63D" },
                            ].map(({ label, icon: TIcon, color }) => (
                                <span key={label} className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white/30 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.12] transition-all duration-300">
                                    <TIcon className="w-3.5 h-3.5" style={{ color: color + "80" }} />
                                    {label}
                                </span>
                            ))}
                        </motion.div>
                    </motion.div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#F4B63D]/15 to-transparent" />
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
                                        background: "linear-gradient(135deg, #F4B63D, #D58A12)",
                                        color: "#fff",
                                        boxShadow: "0 6px 30px rgba(244,182,61,0.3), 0 0 0 1px rgba(244,182,61,0.2)",
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
                    <span className="text-[#F4B63D] font-bold">{vehicleOptions.find(v => v.type === vehicleType)?.label}</span>
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
                            <BadgeCheck className="w-4 h-4 text-[#F4B63D]/70" />
                            <p className="text-xs text-white/30 font-medium">
                                All prices include VAT &bull; 50% OFF currently active &bull;{" "}
                                <span className="text-[#F4B63D]/70 font-semibold">Satisfaction guaranteed</span>
                            </p>
                        </div>
                    </motion.div>
                </div>
            </section>

            <FAQSection />
            <BookingCTA />
        </PageLayout>
    );
}
