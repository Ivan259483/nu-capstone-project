import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Star } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { en } from "@/translations/en";
import { fil } from "@/translations/fil";

const TYPING_SPEED = 55;
const DELETING_SPEED = 30;
const PAUSE_AFTER_WORD = 1400;
const PAUSE_BEFORE_TYPE = 200;
const HERO_VIDEO_SRC = "/videos/hero-autospf.mp4";
const HERO_VIDEO_POSTER_SRC = "/images/hero/hero-video-poster.webp";

const HERO_SERVICE_KEYS = [
    "ceramicCoating",
    "fullDetail",
    "paintCorrection",
    "ppf",
] as const;

export default function HeroSection() {
    const { lang, t } = useLanguage();
    const typingWords = useMemo(
        () => (lang === "fil" ? fil.hero.typingWords : en.hero.typingWords),
        [lang]
    );
    const [activeServiceKey, setActiveServiceKey] = useState<(typeof HERO_SERVICE_KEYS)[number]>("ceramicCoating");
    const [displayText, setDisplayText] = useState("");
    const [wordIndex, setWordIndex] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showCursor, setShowCursor] = useState(true);
    const [heroVideoFailed, setHeroVideoFailed] = useState(false);
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
        typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );

    useEffect(() => {
        setWordIndex(0);
        setDisplayText("");
        setIsDeleting(false);
    }, [lang, typingWords]);

    // Cursor blink
    useEffect(() => {
        const blink = setInterval(() => setShowCursor((c) => !c), 530);
        return () => clearInterval(blink);
    }, []);

    useEffect(() => {
        const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        const updateMotionPreference = () => setPrefersReducedMotion(mediaQuery.matches);

        updateMotionPreference();
        mediaQuery.addEventListener("change", updateMotionPreference);

        return () => mediaQuery.removeEventListener("change", updateMotionPreference);
    }, []);

    // Typing engine
    useEffect(() => {
        const currentWord = typingWords[wordIndex] ?? "";
        let timeout: ReturnType<typeof setTimeout>;

        if (!isDeleting) {
            if (displayText.length < currentWord.length) {
                timeout = setTimeout(() => {
                    setDisplayText(currentWord.slice(0, displayText.length + 1));
                }, TYPING_SPEED);
            } else {
                timeout = setTimeout(() => setIsDeleting(true), PAUSE_AFTER_WORD);
            }
        } else {
            if (displayText.length > 0) {
                timeout = setTimeout(() => {
                    setDisplayText(currentWord.slice(0, displayText.length - 1));
                }, DELETING_SPEED);
            } else {
                timeout = setTimeout(() => {
                    setIsDeleting(false);
                    setWordIndex((i) => (i + 1) % typingWords.length);
                }, PAUSE_BEFORE_TYPE);
            }
        }

        return () => clearTimeout(timeout);
    }, [displayText, isDeleting, wordIndex, typingWords]);

    return (
        <section
            className="relative min-h-screen w-full flex items-center overflow-hidden"
            style={{
                background:
                    "radial-gradient(ellipse 62% 48% at 66% 16%, rgba(128,143,153,0.14) 0%, rgba(38,46,56,0.08) 34%, transparent 68%), radial-gradient(ellipse 44% 36% at 46% 46%, rgba(224,150,44,0.08) 0%, rgba(169,88,24,0.035) 38%, transparent 72%), linear-gradient(145deg, #020306 0%, #07070A 44%, #030407 100%)",
            }}
        >

            {/* Full-bleed hero media — wide soft fade (avoids hard vertical seam under nav) */}
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden border-0">
                <img
                    src={HERO_VIDEO_POSTER_SRC}
                    alt=""
                    aria-hidden
                    width={1920}
                    height={1080}
                    decoding="async"
                    fetchPriority="high"
                    className="absolute inset-0 z-0 h-full w-full object-cover object-[47%_52%] opacity-100 sm:object-[48%_52%] lg:object-[47%_51%]"
                />
                {!prefersReducedMotion && !heroVideoFailed && (
                    <video
                        aria-hidden
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        poster={HERO_VIDEO_POSTER_SRC}
                        onError={() => setHeroVideoFailed(true)}
                        className="absolute inset-0 z-[1] h-full w-full object-cover object-[47%_52%] opacity-100 sm:object-[48%_52%] lg:object-[47%_51%]"
                    >
                        <source src={HERO_VIDEO_SRC} type="video/mp4" />
                    </video>
                )}
                <div
                    className="absolute inset-0 z-[2]"
                    aria-hidden
                    style={{
                        background:
                            "linear-gradient(90deg, rgba(2,3,6,0.5) 0%, rgba(2,3,6,0.18) 34%, rgba(2,3,6,0.08) 100%)",
                    }}
                />
                <div
                    className="absolute inset-0 z-[3]"
                    aria-hidden
                    style={{
                        background:
                            "radial-gradient(ellipse 78% 58% at 68% 20%, rgba(223,232,235,0.24) 0%, rgba(97,113,124,0.12) 29%, rgba(7,7,10,0.02) 62%, transparent 76%), radial-gradient(ellipse 42% 34% at 50% 54%, rgba(239,156,54,0.09) 0%, rgba(166,83,22,0.035) 38%, transparent 74%)",
                        mixBlendMode: "screen",
                        opacity: 0.82,
                    }}
                />
                <div
                    className="absolute inset-0 z-[4]"
                    aria-hidden
                    style={{
                        background:
                            "radial-gradient(ellipse 100% 82% at 66% 24%, transparent 0%, transparent 48%, rgba(2,3,6,0.32) 78%, rgba(2,3,6,0.68) 100%), radial-gradient(ellipse 50% 34% at 78% 92%, rgba(207,115,32,0.08) 0%, transparent 68%)",
                    }}
                />
                <div
                    className="absolute inset-0 z-[5] opacity-[0.045]"
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
                            "linear-gradient(100deg, rgba(2,3,6,0.96) 0%, rgba(3,4,7,0.78) 25%, rgba(7,7,10,0.34) 46%, rgba(7,7,10,0.1) 67%, rgba(7,7,10,0.02) 100%), linear-gradient(to bottom, rgba(2,3,6,0.14) 0%, transparent 42%, rgba(2,3,6,0.42) 100%)",
                    }}
                />
                <div
                    className="absolute inset-0 z-10 lg:hidden"
                    aria-hidden
                    style={{
                        background: "linear-gradient(to top, rgba(2,3,6,0.96) 0%, rgba(3,4,7,0.78) 46%, rgba(7,7,10,0.24) 100%), linear-gradient(90deg, rgba(2,3,6,0.76) 0%, rgba(7,7,10,0.12) 100%), radial-gradient(ellipse 80% 56% at 64% 18%, rgba(171,188,198,0.14) 0%, transparent 66%)",
                    }}
                />
            </div>


            {/* Content Container */}
            <div className="container max-w-7xl mx-auto px-6 relative z-20 h-full flex flex-col lg:flex-row pt-32 pb-20 lg:py-0">

                {/* Left Column (Content) */}
                <div className="w-full lg:w-[55%] flex flex-col justify-center min-h-[calc(100vh-160px)] lg:min-h-screen pt-10">


                    <div
                        className="mb-5 inline-flex w-fit items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f4c96b]/85 animate-slide-up"
                        style={{ animationDelay: "0.12s" }}
                    >
                        <span className="h-px w-9 bg-gradient-to-r from-[#f4c96b] to-transparent" aria-hidden />
                        {t("hero.badge")}
                    </div>

                    {/* Headline */}
                    <h1
                        className="flex max-w-[760px] flex-col text-5xl font-serif font-medium leading-[1.03] text-white sm:text-6xl lg:text-[72px] xl:text-[78px] animate-slide-up"
                        style={{ animationDelay: "0.2s" }}
                    >
                        <span className="pb-1 text-white/95">{t("hero.titleLine1")}</span>
                        <span className="pb-1 text-white/88">{t("hero.titleLine2")}</span>
                        <span className="block min-h-[1.08em] italic font-semibold text-[#f4b43f] drop-shadow-[0_12px_28px_rgba(0,0,0,0.45)]">
                            {displayText.split("").map((char, i) => (
                                <motion.span
                                    key={`${wordIndex}-${i}`}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
                                    style={{ display: "inline-block", minWidth: char === " " ? "0.25em" : undefined }}
                                >
                                    {char}
                                </motion.span>
                            ))}
                            <span
                                className="inline-block ml-[2px] align-middle"
                                style={{
                                    width: "2px",
                                    height: "0.85em",
                                    background: showCursor ? "#f4b43f" : "transparent",
                                    boxShadow: showCursor ? "0 0 12px rgba(244,180,63,0.5), 0 0 4px rgba(244,180,63,0.72)" : "none",
                                    borderRadius: "1px",
                                    transition: "all 0.1s ease",
                                    verticalAlign: "middle",
                                    marginBottom: "4px",
                                }}
                            />
                        </span>
                    </h1>

                    {/* Subtitle */}
                    <p className="mt-7 max-w-[34rem] text-base leading-7 font-sans text-white/72 animate-slide-up" style={{ animationDelay: "0.4s" }}>
                        {t("hero.subtitle")}
                    </p>

                    {/* Rating */}
                    <div
                        className="my-8 inline-flex w-fit items-center gap-3 rounded-full border border-white/[0.105] bg-white/[0.045] px-3.5 py-2 shadow-[0_12px_28px_rgba(0,0,0,0.18)] backdrop-blur-md animate-slide-up"
                        style={{ animationDelay: "0.5s" }}
                        aria-label={`${t("stats.rating")}: 4.9, ${t("hero.reviews")}`}
                    >
                        <span className="flex h-8 min-w-[3rem] items-center justify-center text-[28px] font-serif font-light leading-none text-white/96 tabular-nums">
                            <span className="block -translate-y-[5px]">4.9</span>
                        </span>
                        <span className="h-6 w-px bg-white/[0.12]" aria-hidden />
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-[1px] text-[#f4b43f]/95">
                                {[...Array(5)].map((_, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, scale: 0 }}
                                        whileInView={{ opacity: 1, scale: 1 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 0.5 + i * 0.08, type: "spring", stiffness: 300 }}
                                        className="shrink-0"
                                    >
                                        <Star className="h-3 w-3 fill-current" />
                                    </motion.div>
                                ))}
                            </div>
                            <span className="text-[10px] font-sans font-medium uppercase tracking-[0.1em] text-white/60">
                                {t("stats.rating")} · {t("hero.reviews")}
                            </span>
                        </div>
                    </div>

                    {/* CTA Buttons */}
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-11 animate-slide-up font-sans" style={{ animationDelay: "0.6s" }}>
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
                    </div>

                    {/* Service tags */}
                    <div className="mt-3 grid max-w-[15rem] grid-cols-1 gap-2 animate-slide-up font-sans opacity-[0.88] transition-opacity duration-300 hover:opacity-100 sm:max-w-[600px] sm:flex sm:flex-wrap sm:items-center sm:gap-2" style={{ animationDelay: "0.7s" }}>
                        {HERO_SERVICE_KEYS.map((key) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setActiveServiceKey(key)}
                                aria-pressed={activeServiceKey === key}
                                className={`inline-flex min-h-8 items-center justify-center rounded-full border px-3.5 text-center text-[10px] font-medium uppercase tracking-[0.08em] transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e0a020]/35 sm:justify-start ${activeServiceKey === key
                                    ? "border-[#e0a020]/34 bg-[#e0a020]/7 text-[#f4c96b]/86 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]"
                                    : "border-white/[0.105] bg-white/[0.03] text-white/58 hover:border-[#e0a020]/24 hover:bg-white/[0.045] hover:text-white/76"
                                    }`}
                            >
                                {t(`hero.serviceTags.${key}`)}
                            </button>
                        ))}
                    </div>
                </div>

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
