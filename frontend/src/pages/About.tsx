import { useState } from "react";
import { Shield, Star, Zap, Users, Car, Sparkles, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScrollAnimation, useCounter } from "@/hooks/useScrollAnimation";
import PageLayout from "@/components/PageLayout";
import BookingCTA from "@/components/BookingCTA";
/* ── Framer Motion Variants (matching Services/Gallery) ── */
const EASE = [0.16, 1, 0.3, 1] as const;

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

const stagger: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};

const slideLeft: Variants = {
    hidden: { opacity: 0, x: -60 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.85, ease: EASE } },
};

const slideRight: Variants = {
    hidden: { opacity: 0, x: 60 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.85, ease: EASE } },
};

const cardReveal: Variants = {
    hidden: { opacity: 0, y: 30, scale: 0.95 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.55, ease: EASE, delay: i * 0.1 },
    }),
};

const counterPop: Variants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: (i: number) => ({
        opacity: 1,
        scale: 1,
        transition: { duration: 0.5, ease: EASE, delay: i * 0.12, type: "spring", stiffness: 200, damping: 15 },
    }),
};

/* ── Data ── */
const team = [
    { name: "Ivan Wong", role: "Head Detailer & Founder", years: "4 yrs", src: "/images/ivan-wong.jpg" },
    { name: "Earl Francis Jeremiah", role: "Service Advisor", years: "8 yrs", src: "/images/earl-nabong.jpg" },
    { name: "Natalie Joy Tugade", role: "Ceramic Coating Specialist", years: "9 yrs", src: "/images/natalie-tugade.jpg" },
    { name: "Ivan Christian", role: "Interior Detail Technician", years: "7 yrs", src: "/images/ivan-christian.jpg" },
];

const values = [
    { icon: Star, key: "quality", keyDesc: "qualityDesc", glowColor: "rgba(245,158,11,0.12)" },
    { icon: Shield, key: "trust", keyDesc: "trustDesc", glowColor: "rgba(16,185,129,0.12)" },
    { icon: Zap, key: "passion", keyDesc: "passionDesc", glowColor: "rgba(139,92,246,0.12)" },
] as const;

/* ── Counter Component ── */
function CounterStat({ value, suffix, label, isVisible, index }: { value: number; suffix: string; label: string; isVisible: boolean; index: number }) {
    const count = useCounter(value, 2200, isVisible);
    return (
        <motion.div
            custom={index}
            variants={counterPop}
            className="text-center group"
        >
            <div className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 mb-1 tracking-tight">
                {count.toLocaleString()}{suffix}
            </div>
            <div className="text-[10px] text-white/25 uppercase tracking-[0.2em] font-medium">{label}</div>
        </motion.div>
    );
}

/* ═══════════════════════════════════════
   ABOUT PAGE
═══════════════════════════════════════ */
export default function About() {
    const { t } = useLanguage();
    const { ref: statsRef, isVisible: statsVisible } = useScrollAnimation({ threshold: 0.3 });

    return (
        <PageLayout>
            {/* ══════════════════════════════════
                HERO SECTION
            ══════════════════════════════════ */}
            <section className="relative pt-36 pb-24 overflow-hidden">
                <div className="absolute inset-0 bg-hero-pattern" />
                <div
                    className="absolute inset-0"
                    style={{ background: "linear-gradient(to bottom, transparent 0%, transparent 50%, #07070A 100%)" }}
                />
                <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-amber-500/[0.06] blur-[150px] rounded-full pointer-events-none" />
                <div className="absolute top-40 right-0 w-[400px] h-[300px] bg-indigo-500/[0.04] blur-[120px] rounded-full pointer-events-none" />

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
                            <Car className="w-3.5 h-3.5" />
                            {t("about.title")}
                        </motion.div>

                        {/* Headline */}
                        <motion.h1
                            variants={fadeUp}
                            className="text-5xl sm:text-6xl lg:text-7xl font-serif font-medium text-white tracking-tight mb-5 leading-[1.05]"
                        >
                            About{" "}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 italic">
                                AutoSPF+
                            </span>
                        </motion.h1>

                        {/* Subtitle */}
                        <motion.p
                            variants={fadeUp}
                            className="text-white/35 text-base md:text-lg max-w-2xl mx-auto font-light leading-relaxed"
                        >
                            {t("about.subtitle")}
                        </motion.p>

                        {/* Trust badges */}
                        <motion.div
                            variants={fadeUp}
                            className="flex items-center justify-center gap-6 mt-8"
                        >
                            {["Since 2011", "Las Piñas City", "500+ Cars"].map((item) => (
                                <span
                                    key={item}
                                    className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/20 px-3 py-1.5 rounded-full border border-white/5"
                                >
                                    {item}
                                </span>
                            ))}
                        </motion.div>
                    </motion.div>
                </div>
            </section>

            {/* ══════════════════════════════════
                OUR STORY
            ══════════════════════════════════ */}
            <section className="relative py-24 overflow-hidden" style={{ background: "#07070A" }}>
                <div className="absolute top-0 right-0 w-[500px] h-[400px] bg-amber-500/[0.03] blur-[130px] rounded-full pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[300px] bg-indigo-500/[0.03] blur-[110px] rounded-full pointer-events-none" />

                <div className="container max-w-6xl mx-auto px-6 relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    {/* Left: Story text */}
                    <motion.div
                        variants={stagger}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-60px" }}
                    >
                        <motion.div
                            variants={slideLeft}
                            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs font-bold uppercase tracking-[0.2em] text-amber-400/80 mb-5"
                        >
                            <Sparkles className="w-3 h-3" />
                            {t("about.story")}
                        </motion.div>

                        <motion.h2
                            variants={slideLeft}
                            className="text-3xl sm:text-4xl font-serif font-medium text-white mb-6 leading-tight tracking-tight"
                        >
                            Built on{" "}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 italic">
                                Passion
                            </span>{" "}
                            & Precision
                        </motion.h2>

                        <motion.div
                            variants={slideLeft}
                            className="text-white/40 leading-[1.85] text-[15px] space-y-4 font-light mb-8"
                        >
                            <p>
                                AutoSPF+ is a premium automotive care and protection specialist based in <strong className="text-white/60 font-semibold">Las Piñas, Philippines</strong>, dedicated to delivering high-quality detailing and vehicle protection services.
                            </p>
                            <p>
                                We specialize in <strong className="text-white/60 font-semibold">Paint Protection Film (PPF), Ceramic Coating, Window Tinting, and Premium Auto Detailing</strong>, helping vehicle owners preserve the beauty, protection, and long-term value of their cars.
                            </p>
                            <p>
                                Our mission is to provide professional-grade workmanship, premium materials, and exceptional customer service to ensure every vehicle leaves with a showroom-quality finish.
                            </p>
                        </motion.div>

                        {/* Mini Stats */}
                        <motion.div
                            variants={slideLeft}
                            className="flex items-center gap-8 flex-wrap"
                        >
                            {[
                                { value: "2011", label: "Founded" },
                                { value: "3", label: "Locations" },
                                { value: "5K+", label: "Cars Detailed" },
                            ].map(({ value, label }) => (
                                <div key={label} className="group">
                                    <p className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 tracking-tight">{value}</p>
                                    <p className="text-[10px] uppercase tracking-widest text-white/25 font-medium">{label}</p>
                                </div>
                            ))}
                        </motion.div>
                    </motion.div>

                    {/* Right: Card */}
                    <motion.div
                        variants={slideRight}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-60px" }}
                        className="relative"
                    >
                        <div className="absolute -inset-4 bg-gradient-to-br from-amber-500/10 via-transparent to-orange-500/10 blur-3xl rounded-3xl pointer-events-none" />

                        <motion.div
                            whileHover={{ y: -6, transition: { duration: 0.3 } }}
                            className="relative isolate overflow-hidden rounded-3xl border-0 px-10 pt-8 pb-9 text-center shadow-[0_24px_56px_-12px_rgba(0,0,0,0.72),0_0_80px_-28px_rgba(251,146,60,0.055)] selection:bg-white/15 selection:text-white"
                            style={{
                                background:
                                    "linear-gradient(200deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.028) 28%, rgba(10,9,8,0.42) 100%), radial-gradient(ellipse 95% 55% at 50% 128%, rgba(251,191,36,0.045), transparent 58%)",
                                backdropFilter: "blur(22px) saturate(140%)",
                                WebkitBackdropFilter: "blur(22px) saturate(140%)",
                            }}
                        >
                            {/* Soft vignette only — no top band */}
                            <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[radial-gradient(ellipse_85%_55%_at_50%_100%,rgba(0,0,0,0.22),transparent_72%)] opacity-90" />

                            {/* Ambient glows (corners only, very soft) */}
                            <div className="absolute -top-4 -right-10 w-44 h-44 bg-amber-400/[0.06] blur-[58px] rounded-full pointer-events-none" />
                            <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-orange-500/[0.06] blur-[52px] rounded-full pointer-events-none" />

                            {/* Diagonal sweep — no mix-blend (avoids orange “plate” behind text) */}
                            <div className="about-brand-glass-sweep" aria-hidden />

                            <div className="relative z-10 mx-auto w-full max-w-sm selection:bg-white/15 selection:text-white">
                                <motion.div
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    whileInView={{ scale: 1, opacity: 1 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.6, delay: 0.3, type: "spring", stiffness: 200 }}
                                    className="mx-auto mb-1 flex items-center justify-center"
                                >
                                    <img
                                        src="/images/autospf-logo.png"
                                        alt="AutoSPF+"
                                        className="h-28 sm:h-32 w-auto max-w-[min(100%,320px)] object-contain drop-shadow-[0_12px_36px_rgba(0,0,0,0.5)]"
                                    />
                                </motion.div>
                                <h3 className="sr-only">AutoSPF+</h3>

                                <p className="text-sm text-white/35 mb-2 leading-snug -mt-0.5">Premium Auto Detailing</p>

                                <div className="flex justify-center gap-1 mb-3">
                                    {[...Array(5)].map((_, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, scale: 0 }}
                                            whileInView={{ opacity: 1, scale: 1 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: 0.5 + i * 0.08, type: "spring", stiffness: 300 }}
                                        >
                                            <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                                        </motion.div>
                                    ))}
                                </div>
                            </div>

                            {/* Badge pills */}
                            <div className="relative z-10 flex flex-wrap items-center justify-center gap-2">
                                {["SONAX Certified", "PPF Installer", "Vinyl Frog Partner"].map((badge) => (
                                    <span key={badge} className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/35 px-3 py-1.5 rounded-full border-0 bg-white/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.2)]">
                                        {badge}
                                    </span>
                                ))}
                            </div>
                        </motion.div>

                        {/* Floating badge */}
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.9 }}
                            whileInView={{ opacity: 1, y: 0, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: 0.6, ease: EASE }}
                            className="absolute -bottom-4 -right-4 isolate overflow-hidden rounded-2xl border-0 px-5 py-3 shadow-[0_16px_40px_-8px_rgba(0,0,0,0.65),0_0_56px_-20px_rgba(251,146,60,0.06)] backdrop-blur-xl selection:bg-white/15 selection:text-white"
                            style={{
                                background:
                                    "linear-gradient(200deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.035) 40%, rgba(12,10,9,0.45) 100%), radial-gradient(ellipse 100% 80% at 50% 120%, rgba(251,191,36,0.08), transparent 58%)",
                            }}
                        >
                            <div className="about-brand-glass-sweep about-brand-glass-sweep--badge" aria-hidden />
                            <div className="relative z-10 text-[10px] text-white/30 uppercase tracking-wider font-medium">Since</div>
                            <div className="relative z-10 text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">2011</div>
                        </motion.div>
                    </motion.div>
                </div>
            </section>

            {/* ══════════════════════════════════
                STATS
            ══════════════════════════════════ */}
            <section className="relative py-16 overflow-hidden" style={{ background: "#07070A" }}>
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/15 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/15 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/[0.02] via-transparent to-orange-500/[0.02]" />

                <motion.div
                    ref={statsRef}
                    variants={stagger}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-40px" }}
                    className="container max-w-4xl mx-auto px-6"
                >
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-10">
                        <CounterStat value={5000} suffix="+" label={t("stats.carsDetailed")} isVisible={statsVisible} index={0} />
                        <CounterStat value={15} suffix="+" label={t("stats.yearsExperience")} isVisible={statsVisible} index={1} />
                        <CounterStat value={4} suffix=".9" label={t("stats.rating")} isVisible={statsVisible} index={2} />
                        <CounterStat value={2500} suffix="+" label={t("stats.happyClients")} isVisible={statsVisible} index={3} />
                    </div>
                </motion.div>
            </section>

            {/* ══════════════════════════════════
                TEAM
            ══════════════════════════════════ */}
            <section className="relative py-24 overflow-hidden" style={{ background: "#07070A" }}>
                <div className="absolute top-20 left-0 w-[500px] h-[500px] bg-indigo-500/[0.02] blur-[140px] rounded-full pointer-events-none" />
                <div className="absolute bottom-20 right-0 w-[400px] h-[400px] bg-amber-500/[0.03] blur-[120px] rounded-full pointer-events-none" />

                <div className="container max-w-6xl mx-auto px-6 relative z-10">
                    <motion.div
                        variants={stagger}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-60px" }}
                        className="text-center mb-14"
                    >
                        <motion.div
                            variants={fadeUp}
                            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs font-bold uppercase tracking-[0.2em] text-amber-400/80 mb-5"
                        >
                            <Users className="w-3.5 h-3.5" />
                            {t("about.team")}
                        </motion.div>
                        <motion.h2
                            variants={fadeUp}
                            className="text-3xl sm:text-4xl font-serif font-medium text-white mb-3 tracking-tight"
                        >
                            Meet the{" "}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 italic">
                                Experts
                            </span>
                        </motion.h2>
                        <motion.p variants={fadeUp} className="text-white/30 text-sm font-light max-w-md mx-auto">
                            {t("about.teamSubtitle")}
                        </motion.p>
                    </motion.div>

                    <motion.div
                        variants={stagger}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-40px" }}
                        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
                    >
                        {team.map((member, i) => (
                            <motion.div
                                key={member.name}
                                custom={i}
                                variants={cardReveal}
                                whileHover={{ y: -8, transition: { duration: 0.25 } }}
                                className="group relative text-center p-7 rounded-2xl overflow-hidden
                                           ring-1 ring-white/[0.07] hover:ring-amber-500/20 transition-all duration-500"
                                style={{
                                    background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
                                    backdropFilter: "blur(12px)",
                                }}
                            >
                                {/* Hover glow */}
                                <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-amber-500/[0.08]" />

                                <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-white/10 mx-auto mb-5 group-hover:border-amber-500/30 transition-colors duration-500 relative">
                                    <img
                                        src={member.src}
                                        alt={member.name}
                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                                    />
                                </div>
                                <h3 className="text-base font-semibold text-white mb-1 group-hover:text-amber-400 transition-colors duration-300">{member.name}</h3>
                                <p className="text-xs font-semibold text-amber-400/60 mb-2 uppercase tracking-wider">{member.role}</p>
                                <p className="text-[11px] text-white/25 font-medium">{member.years} experience</p>
                            </motion.div>
                        ))}
                    </motion.div>
                </div>
            </section>

            {/* ══════════════════════════════════
                VALUES
            ══════════════════════════════════ */}
            <section className="relative py-24 overflow-hidden" style={{ background: "#07070A" }}>
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-amber-500/[0.03] blur-[120px] rounded-full pointer-events-none" />

                <div className="container max-w-5xl mx-auto px-6 relative z-10">
                    <motion.div
                        variants={stagger}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-60px" }}
                        className="text-center mb-14"
                    >
                        <motion.div
                            variants={fadeUp}
                            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs font-bold uppercase tracking-[0.2em] text-amber-400/80 mb-5"
                        >
                            <Sparkles className="w-3 h-3" />
                            Our Core
                        </motion.div>
                        <motion.h2
                            variants={fadeUp}
                            className="text-3xl sm:text-4xl font-serif font-medium text-white mb-3 tracking-tight"
                        >
                            Our{" "}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 italic">
                                Values
                            </span>
                        </motion.h2>
                        <motion.div variants={fadeUp} className="w-16 h-0.5 bg-gradient-to-r from-amber-400 to-orange-500 mx-auto rounded-full" />
                    </motion.div>

                    <motion.div
                        variants={stagger}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-40px" }}
                        className="grid grid-cols-1 sm:grid-cols-3 gap-6"
                    >
                        {values.map(({ icon: Icon, key, keyDesc, glowColor }, i) => (
                            <motion.div
                                key={key}
                                custom={i}
                                variants={cardReveal}
                                whileHover={{ y: -8, transition: { duration: 0.25 } }}
                                className="group relative p-8 rounded-2xl text-center overflow-hidden
                                           ring-1 ring-white/[0.07] hover:ring-amber-500/20 transition-all duration-500"
                                style={{
                                    background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
                                    backdropFilter: "blur(12px)",
                                }}
                            >
                                {/* Hover glow */}
                                <div
                                    className="absolute top-0 right-0 w-32 h-32 rounded-full blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                                    style={{ background: glowColor }}
                                />

                                <motion.div
                                    className="w-14 h-14 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-5 group-hover:bg-amber-500/15 group-hover:border-amber-500/30 transition-all duration-300"
                                    whileHover={{ rotate: [0, -5, 5, 0], scale: 1.05 }}
                                    transition={{ duration: 0.5 }}
                                >
                                    <Icon className="w-6 h-6 text-amber-400" />
                                </motion.div>
                                <h3 className="text-base font-semibold text-white mb-3 group-hover:text-amber-400 transition-colors duration-300">{t(`about.${key}`)}</h3>
                                <p className="text-sm text-white/35 leading-relaxed font-light group-hover:text-white/50 transition-colors duration-300">{t(`about.${keyDesc}`)}</p>
                            </motion.div>
                        ))}
                    </motion.div>
                </div>
            </section>

            <BookingCTA />
        </PageLayout>
    );
}
