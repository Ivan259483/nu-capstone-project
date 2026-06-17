import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Star } from "lucide-react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { en } from "@/translations/en";
import { fil } from "@/translations/fil";

const HERO_VIDEO_SRC = "/videos/hero-autospf.mp4";
const HERO_IMAGE_SRC = "/images/hero/hero-hood-detailing.webp";

const HERO_SERVICE_KEYS = [
    "ceramicCoating",
    "fullDetail",
    "paintCorrection",
    "ppf",
] as const;

const HERO_EASE = [0.16, 1, 0.3, 1] as const;

const heroStagger = {
    hidden: {},
    visible: {
        transition: {
            delayChildren: 0.14,
            staggerChildren: 0.13,
        },
    },
};

const heroFadeUp = {
    hidden: { opacity: 0, y: 18 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.78, ease: HERO_EASE },
    },
};

const heroFade = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { duration: 0.78, ease: HERO_EASE },
    },
};

export default function HeroSection() {
    const { lang, t } = useLanguage();
    const sectionRef = useRef<HTMLElement>(null);
    const reducedMotionPreference = useReducedMotion();
    const { scrollYProgress } = useScroll({
        target: sectionRef,
        offset: ["start start", "end start"],
    });
    const mediaY = useTransform(scrollYProgress, [0, 1], [0, 46]);
    const mediaScale = useTransform(scrollYProgress, [0, 1], [1.025, 1.055]);
    const heroHighlight = useMemo(
        () => (lang === "fil" ? fil.hero.typingWords : en.hero.typingWords)[0] || t("hero.titleHighlight"),
        [lang, t]
    );
    const [activeServiceKey, setActiveServiceKey] = useState<(typeof HERO_SERVICE_KEYS)[number]>("ceramicCoating");
    const [heroVideoFailed, setHeroVideoFailed] = useState(false);
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
        typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );

    useEffect(() => {
        const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        const updateMotionPreference = () => setPrefersReducedMotion(mediaQuery.matches);

        updateMotionPreference();
        mediaQuery.addEventListener("change", updateMotionPreference);

        return () => mediaQuery.removeEventListener("change", updateMotionPreference);
    }, []);

    const shouldReduceMotion = prefersReducedMotion || Boolean(reducedMotionPreference);

    return (
        <section
            ref={sectionRef}
            className="relative min-h-screen w-full flex items-center overflow-hidden"
            style={{
                background:
                    "radial-gradient(ellipse 62% 48% at 66% 16%, rgba(255,228,177,0.12) 0%, rgba(68,52,32,0.08) 34%, transparent 68%), radial-gradient(ellipse 44% 36% at 46% 46%, rgba(224,150,44,0.1) 0%, rgba(169,88,24,0.04) 38%, transparent 72%), linear-gradient(145deg, #010204 0%, #07070A 44%, #020306 100%)",
            }}
        >

            {/* Full-bleed hero media — wide soft fade (avoids hard vertical seam under nav) */}
            <motion.div
                className="pointer-events-none absolute inset-0 z-0 overflow-hidden border-0 will-change-transform"
                style={{
                    y: shouldReduceMotion ? 0 : mediaY,
                    scale: shouldReduceMotion ? 1 : mediaScale,
                }}
            >
                {(shouldReduceMotion || heroVideoFailed) && (
                    <img
                        src={HERO_IMAGE_SRC}
                        alt=""
                        aria-hidden
                        width={1920}
                        height={1080}
                        decoding="async"
                        fetchPriority="high"
                        className="absolute inset-0 z-0 h-full w-full object-cover object-[47%_52%] opacity-100 sm:object-[48%_52%] lg:object-[47%_51%]"
                        style={{ filter: "saturate(1.08) contrast(1.08) brightness(0.92)" }}
                    />
                )}
                {!shouldReduceMotion && !heroVideoFailed && (
                    <video
                        aria-hidden
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="auto"
                        poster={HERO_IMAGE_SRC}
                        onError={() => setHeroVideoFailed(true)}
                        className="absolute inset-0 z-[1] h-full w-full object-cover object-[47%_52%] opacity-100 sm:object-[48%_52%] lg:object-[47%_51%]"
                        style={{ filter: "saturate(1.08) contrast(1.08) brightness(0.92)" }}
                    >
                        <source src={HERO_VIDEO_SRC} type="video/mp4" />
                    </video>
                )}
                <div
                    className="absolute inset-0 z-[2]"
                    aria-hidden
                    style={{
                        background:
                            "linear-gradient(90deg, rgba(1,2,4,0.72) 0%, rgba(3,4,7,0.5) 28%, rgba(6,7,9,0.18) 56%, rgba(2,3,6,0.06) 100%), linear-gradient(to bottom, rgba(1,2,4,0.18) 0%, transparent 38%, rgba(1,2,4,0.4) 100%)",
                    }}
                />
                <div
                    className="absolute inset-0 z-[3]"
                    aria-hidden
                    style={{
                        background:
                            "radial-gradient(ellipse 74% 54% at 68% 18%, rgba(255,239,202,0.16) 0%, rgba(147,112,70,0.08) 28%, rgba(7,7,10,0.015) 62%, transparent 78%), radial-gradient(ellipse 42% 34% at 50% 54%, rgba(239,156,54,0.1) 0%, rgba(166,83,22,0.04) 38%, transparent 74%)",
                        mixBlendMode: "screen",
                        opacity: 0.68,
                    }}
                />
                <div
                    className="absolute inset-0 z-[4]"
                    aria-hidden
                    style={{
                        background:
                            "radial-gradient(ellipse 100% 82% at 66% 24%, transparent 0%, transparent 46%, rgba(2,3,6,0.34) 78%, rgba(1,2,4,0.72) 100%), radial-gradient(ellipse 50% 34% at 78% 92%, rgba(207,115,32,0.08) 0%, transparent 68%)",
                    }}
                />
                <div
                    className="absolute inset-0 z-[5] opacity-[0.035]"
                    aria-hidden
                    style={{
                        backgroundImage:
                            "linear-gradient(115deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 9px), radial-gradient(circle at 20% 30%, rgba(255,255,255,0.09) 0 1px, transparent 1px)",
                        backgroundSize: "18px 18px, 10px 10px",
                    }}
                />
                <div
                    className="absolute inset-0 z-10 hidden lg:block"
                    aria-hidden
                    style={{
                        background:
                            "linear-gradient(100deg, rgba(1,2,4,0.98) 0%, rgba(5,5,7,0.92) 24%, rgba(13,11,8,0.58) 43%, rgba(8,8,9,0.2) 64%, rgba(5,5,6,0.04) 100%), radial-gradient(ellipse 60% 64% at 20% 48%, rgba(40,27,10,0.46) 0%, rgba(5,6,8,0.18) 58%, transparent 78%), linear-gradient(to bottom, rgba(2,3,6,0.2) 0%, transparent 42%, rgba(1,2,4,0.52) 100%)",
                    }}
                />
                <div
                    className="absolute inset-0 z-10 lg:hidden"
                    aria-hidden
                    style={{
                        background: "linear-gradient(to top, rgba(1,2,4,0.98) 0%, rgba(3,4,7,0.82) 46%, rgba(7,7,10,0.28) 100%), linear-gradient(90deg, rgba(1,2,4,0.82) 0%, rgba(7,7,10,0.14) 100%), radial-gradient(ellipse 80% 56% at 64% 18%, rgba(255,225,170,0.1) 0%, transparent 66%)",
                    }}
                />
            </motion.div>


            {/* Content Container */}
            <div className="container max-w-7xl mx-auto px-6 relative z-20 h-full flex flex-col lg:flex-row pt-32 pb-20 lg:py-0">

                {/* Left Column (Content) */}
                <motion.div
                    className="w-full lg:w-[55%] flex flex-col justify-center min-h-[calc(100vh-160px)] lg:min-h-screen pt-10"
                    variants={heroStagger}
                    initial={shouldReduceMotion ? false : "hidden"}
                    animate="visible"
                >


                    <motion.div
                        variants={heroFade}
                        className="mb-5 inline-flex w-fit items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f6d78a]/90 drop-shadow-[0_8px_18px_rgba(0,0,0,0.52)]"
                    >
                        <span className="h-px w-9 bg-gradient-to-r from-[#ffe2a1] via-[#f4c96b] to-transparent shadow-[0_0_18px_rgba(244,201,107,0.28)]" aria-hidden />
                        {t("hero.badge")}
                    </motion.div>

                    {/* Headline */}
                    <motion.h1
                        variants={heroFadeUp}
                        className="flex max-w-[760px] flex-col text-5xl font-serif font-medium leading-[1.03] text-white drop-shadow-[0_16px_30px_rgba(0,0,0,0.62)] sm:text-6xl lg:text-[72px] xl:text-[78px]"
                    >
                        <span className="pb-1 text-white/98">{t("hero.titleLine1")}</span>
                        <span className="pb-1 text-white/92">{t("hero.titleLine2")}</span>
                        <span
                            className="block min-h-[1.08em] italic font-semibold text-[#f5bd4e]"
                            style={{
                                textShadow:
                                    "0 12px 30px rgba(0,0,0,0.58), 0 0 24px rgba(244,180,63,0.2)",
                            }}
                        >
                            {heroHighlight.split("").map((char, i) => (
                                <motion.span
                                    key={`${heroHighlight}-${i}`}
                                    initial={shouldReduceMotion ? false : { opacity: 0, y: 7 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{
                                        duration: 0.28,
                                        delay: shouldReduceMotion ? 0 : 0.42 + i * 0.012,
                                        ease: HERO_EASE,
                                    }}
                                    style={{ display: "inline-block", minWidth: char === " " ? "0.25em" : undefined }}
                                >
                                    {char}
                                </motion.span>
                            ))}
                        </span>
                    </motion.h1>

                    {/* Subtitle */}
                    <motion.p
                        variants={heroFade}
                        className="mt-7 max-w-[35rem] text-base leading-[1.78] font-sans text-white/78 drop-shadow-[0_10px_20px_rgba(0,0,0,0.52)]"
                    >
                        {t("hero.subtitle")}
                    </motion.p>

                    {/* Rating */}
                    <motion.div
                        variants={heroFadeUp}
                        className="my-8 inline-flex w-fit items-center gap-3 rounded-full border border-[#f4c96b]/24 bg-[linear-gradient(135deg,rgba(255,255,255,0.115),rgba(255,255,255,0.04)_48%,rgba(7,7,10,0.58))] px-3.5 py-2 shadow-[0_16px_36px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.11)] backdrop-blur-md"
                        aria-label={`${t("stats.rating")}: 4.9, ${t("hero.reviews")}`}
                    >
                        <span className="flex h-8 min-w-[3rem] items-center justify-center text-[28px] font-serif font-light leading-none text-white/95 tabular-nums">
                            <span className="block -translate-y-[5px]">4.9</span>
                        </span>
                        <span className="h-6 w-px bg-gradient-to-b from-transparent via-[#f4c96b]/22 to-transparent" aria-hidden />
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-[1px] text-[#f7c760]">
                                {[...Array(5)].map((_, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, scale: 0 }}
                                        whileInView={{ opacity: 1, scale: 1 }}
                                        viewport={{ once: true }}
                                        transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.58 + i * 0.08, type: "spring", stiffness: 280, damping: 20 }}
                                        className="shrink-0"
                                    >
                                        <Star className="h-3 w-3 fill-current" />
                                    </motion.div>
                                ))}
                            </div>
                            <span className="text-[10px] font-sans font-medium uppercase tracking-[0.1em] text-white/74">
                                {t("stats.rating")} · {t("hero.reviews")}
                            </span>
                        </div>
                    </motion.div>

                    {/* CTA Buttons */}
                    <motion.div
                        variants={heroFadeUp}
                        className="flex flex-wrap items-center gap-3 sm:gap-4 mb-11 font-sans"
                    >
                        <Link
                            to="/login"
                            className="group public-luxury-cta public-luxury-cta--primary public-luxury-cta--hero"
                        >
                            {t("hero.cta")}
                            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                        </Link>
                        <a
                            href="#transformation"
                            className="public-luxury-cta public-luxury-cta--secondary public-luxury-cta--hero public-luxury-cta--view-work"
                        >
                            {t("hero.viewWork")}
                        </a>
                    </motion.div>

                    {/* Service tags */}
                    <motion.div
                        variants={{
                            hidden: {},
                            visible: {
                                transition: {
                                    staggerChildren: 0.075,
                                    delayChildren: 0.12,
                                },
                            },
                        }}
                        className="mt-3 grid max-w-[15rem] grid-cols-1 gap-2 font-sans opacity-[0.92] transition-opacity duration-300 hover:opacity-100 sm:max-w-[600px] sm:flex sm:flex-wrap sm:items-center sm:gap-2"
                    >
                        {HERO_SERVICE_KEYS.map((key) => (
                            <motion.button
                                key={key}
                                variants={heroFadeUp}
                                type="button"
                                onClick={() => setActiveServiceKey(key)}
                                aria-pressed={activeServiceKey === key}
                                className={`inline-flex min-h-8 items-center justify-center rounded-full border px-3.5 text-center text-[10px] font-medium uppercase tracking-[0.08em] shadow-[0_10px_22px_rgba(0,0,0,0.18)] backdrop-blur-sm transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e0a020]/35 motion-reduce:transform-none sm:justify-start ${activeServiceKey === key
                                    ? "border-[#f4c96b]/42 bg-[#e0a020]/12 text-[#ffe1a1] shadow-[0_10px_24px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08)]"
                                    : "border-white/[0.12] bg-white/[0.035] text-white/64 hover:border-[#e0a020]/34 hover:bg-white/[0.055] hover:text-white/82"
                                    }`}
                            >
                                {t(`hero.serviceTags.${key}`)}
                            </motion.button>
                        ))}
                    </motion.div>
                </motion.div>

                <div className="hidden lg:block w-[45%] h-screen" aria-hidden />
            </div>

            <motion.a
                href="#transformation"
                aria-label={t("hero.scrollCue")}
                className="absolute bottom-6 left-1/2 z-20 ml-[-1.125rem] hidden h-14 w-9 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.035] text-white/64 shadow-[0_14px_32px_rgba(0,0,0,0.22),0_0_24px_rgba(244,201,107,0.12)] backdrop-blur-md transition-colors duration-300 hover:border-[#f4c96b]/34 hover:bg-white/[0.05] hover:text-[#f4c96b]/82 md:flex"
                initial={{ opacity: 0, y: 12 }}
                animate={prefersReducedMotion ? { opacity: 0.68, y: 0 } : { opacity: [0.55, 0.9, 0.55], y: 0 }}
                transition={prefersReducedMotion ? { duration: 0.4 } : { opacity: { duration: 2.8, repeat: Infinity, ease: "easeInOut" }, y: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }}
            >
                <span className="relative h-8 w-px overflow-hidden rounded-full bg-gradient-to-b from-white/20 via-[#f4c96b]/55 to-transparent" aria-hidden>
                    <motion.span
                        className="absolute left-1/2 top-0 ml-[-0.1875rem] h-1.5 w-1.5 rounded-full bg-[#f4c96b]/90 shadow-[0_0_14px_rgba(244,201,107,0.5)]"
                        animate={prefersReducedMotion ? { y: 0 } : { y: [0, 20, 0] }}
                        transition={prefersReducedMotion ? { duration: 0 } : { duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                    />
                </span>
            </motion.a>
        </section>
    );
}
