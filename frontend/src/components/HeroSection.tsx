import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { en } from "@/translations/en";
import { fil } from "@/translations/fil";

const HERO_VIDEO_WEBM_SRC = "/videos/hero-autospf.webm";
const HERO_VIDEO_MP4_SRC = "/videos/hero-autospf.mp4";
const HERO_IMAGE_SRC = "/images/hero/hero-hood-detailing.webp";

const HERO_SERVICE_KEYS = [
    "ceramicCoating",
    "fullDetail",
    "paintCorrection",
    "ppf",
] as const;

export default function HeroSection() {
    const { lang, t } = useLanguage();
    const heroHighlight = useMemo(
        () => (lang === "fil" ? fil.hero.typingWords : en.hero.typingWords)[0] || t("hero.titleHighlight"),
        [lang, t]
    );
    const [activeServiceKey, setActiveServiceKey] = useState<(typeof HERO_SERVICE_KEYS)[number]>("ceramicCoating");
    const [heroVideoFailed, setHeroVideoFailed] = useState(false);
    const [heroVideoReady, setHeroVideoReady] = useState(false);
    const heroVideoRef = useRef<HTMLVideoElement>(null);
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

    const shouldReduceMotion = prefersReducedMotion;

    useEffect(() => {
        const video = heroVideoRef.current;
        if (!video || shouldReduceMotion || heroVideoFailed) return;

        // Reinforce muted autoplay for Chrome and retry as soon as media data is available.
        video.muted = true;
        video.defaultMuted = true;
        const startPlayback = () => {
            void video.play().catch(() => {
                // The poster remains as a graceful fallback if the browser blocks playback.
            });
        };

        startPlayback();
        video.addEventListener("loadeddata", startPlayback, { once: true });
        return () => video.removeEventListener("loadeddata", startPlayback);
    }, [heroVideoFailed, shouldReduceMotion]);

    return (
        <section
            className="relative min-h-screen w-full flex items-center overflow-hidden"
            style={{
                background:
                    "radial-gradient(ellipse 62% 48% at 66% 16%, rgba(255,228,177,0.12) 0%, rgba(68,52,32,0.08) 34%, transparent 68%), radial-gradient(ellipse 44% 36% at 46% 46%, rgba(224,150,44,0.1) 0%, rgba(169,88,24,0.04) 38%, transparent 72%), linear-gradient(145deg, #010204 0%, #07070A 44%, #020306 100%)",
            }}
        >

            {/* Full-bleed hero media — wide soft fade (avoids hard vertical seam under nav) */}
            <div
                className="pointer-events-none absolute inset-0 z-0 overflow-hidden border-0 will-change-transform"
            >
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
                {!shouldReduceMotion && !heroVideoFailed && (
                    <video
                        ref={heroVideoRef}
                        aria-hidden
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="auto"
                        poster={HERO_IMAGE_SRC}
                        onError={() => setHeroVideoFailed(true)}
                        onPlaying={() => setHeroVideoReady(true)}
                        className={`absolute inset-0 z-[1] h-full w-full object-cover object-[47%_52%] transition-opacity duration-700 sm:object-[48%_52%] lg:object-[47%_51%] ${heroVideoReady ? "opacity-100" : "opacity-0"}`}
                        style={{ filter: "saturate(1.08) contrast(1.08) brightness(0.92)" }}
                    >
                        <source src={HERO_VIDEO_WEBM_SRC} type="video/webm" />
                        <source src={HERO_VIDEO_MP4_SRC} type="video/mp4" />
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
            </div>


            {/* Content Container */}
            <div className="container max-w-7xl mx-auto px-6 relative z-20 h-full flex flex-col lg:flex-row pt-32 pb-20 lg:py-0">

                {/* Left Column (Content) */}
                <div className="w-full lg:w-[55%] flex flex-col justify-center min-h-[calc(100vh-160px)] lg:min-h-screen pt-10">


                    <div className="mb-5 inline-flex w-fit items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f6d78a]/90 drop-shadow-[0_8px_18px_rgba(0,0,0,0.52)]">
                        <span className="h-px w-9 bg-gradient-to-r from-[#ffe2a1] via-[#f4c96b] to-transparent shadow-[0_0_18px_rgba(244,201,107,0.28)]" aria-hidden />
                        {t("hero.badge")}
                    </div>

                    {/* Headline */}
                    <h1 className="flex max-w-[760px] flex-col text-5xl font-serif font-medium leading-[1.03] text-white drop-shadow-[0_16px_30px_rgba(0,0,0,0.62)] sm:text-6xl lg:text-[72px] xl:text-[78px]">
                        <span className="pb-1 text-white/98">{t("hero.titleLine1")}</span>
                        <span className="pb-1 text-white/92">{t("hero.titleLine2")}</span>
                        <span
                            className="block min-h-[1.08em] italic font-semibold text-[#f5bd4e]"
                            style={{
                                textShadow:
                                    "0 12px 30px rgba(0,0,0,0.58), 0 0 24px rgba(244,180,63,0.2)",
                            }}
                        >
                            {heroHighlight}
                        </span>
                    </h1>

                    {/* Subtitle */}
                    <p className="mt-7 max-w-[35rem] text-base leading-[1.78] font-sans text-white/78 drop-shadow-[0_10px_20px_rgba(0,0,0,0.52)]">
                        {t("hero.subtitle")}
                    </p>

                    {/* Rating */}
                    <div
                        className="hero-rating-pill my-8 inline-flex w-fit items-center gap-3.5 rounded-full border border-[#f4c96b]/18 bg-[linear-gradient(135deg,rgba(255,255,255,0.09),rgba(255,255,255,0.028)_48%,rgba(7,7,10,0.68))] px-4 py-2.5 shadow-[0_17px_38px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-lg"
                        aria-label={`${t("stats.rating")}: 4.9, ${t("hero.reviews")}`}
                    >
                        <span className="flex h-9 min-w-[3.25rem] items-center justify-center text-[31px] font-serif font-light leading-none text-white/95 tabular-nums">
                            <span className="block -translate-y-[4px]">4.9</span>
                        </span>
                        <span className="h-7 w-px bg-gradient-to-b from-transparent via-[#f4c96b]/22 to-transparent" aria-hidden />
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-0.5 text-[#f7c760]">
                                {[...Array(5)].map((_, i) => (
                                    <svg key={i} aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 fill-current stroke-current" strokeWidth="1.5"><path d="m12 2.8 2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 16.83l-5.5 2.89 1.05-6.12L3.1 9.27l6.15-.9L12 2.8Z" /></svg>
                                ))}
                            </div>
                            <span className="text-[11px] font-sans font-medium uppercase tracking-[0.12em] text-white/76">
                                {t("stats.rating")} · {t("hero.reviews")}
                            </span>
                        </div>
                    </div>

                    {/* CTA Buttons */}
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-11 font-sans">
                        <Link
                            to="/login"
                            className="group public-luxury-cta public-luxury-cta--primary public-luxury-cta--hero"
                        >
                            {t("hero.cta")}
                            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current transition-transform duration-300 group-hover:translate-x-1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                        </Link>
                        <a
                            href="#transformation"
                            className="public-luxury-cta public-luxury-cta--secondary public-luxury-cta--hero public-luxury-cta--view-work"
                        >
                            {t("hero.viewWork")}
                        </a>
                    </div>

                    {/* Service tags */}
                    <div className="mt-3 grid max-w-[15rem] grid-cols-1 gap-2 font-sans opacity-[0.92] transition-opacity duration-300 hover:opacity-100 sm:max-w-[600px] sm:flex sm:flex-wrap sm:items-center sm:gap-2">
                        {HERO_SERVICE_KEYS.map((key) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setActiveServiceKey(key)}
                                aria-pressed={activeServiceKey === key}
                                className={`inline-flex min-h-8 items-center justify-center rounded-full border px-3.5 text-center text-[10px] font-medium uppercase tracking-[0.08em] shadow-[0_10px_22px_rgba(0,0,0,0.18)] backdrop-blur-sm transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e0a020]/35 motion-reduce:transform-none sm:justify-start ${activeServiceKey === key
                                    ? "border-[#f4c96b]/42 bg-[#e0a020]/12 text-[#ffe1a1] shadow-[0_10px_24px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08)]"
                                    : "border-white/[0.12] bg-white/[0.035] text-white/64 hover:border-[#e0a020]/34 hover:bg-white/[0.055] hover:text-white/82"
                                    }`}
                            >
                                {t(`hero.serviceTags.${key}`)}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="hidden lg:block w-[45%] h-screen" aria-hidden />
            </div>

            <a
                href="#transformation"
                aria-label={t("hero.scrollCue")}
                className="absolute bottom-6 left-1/2 z-20 ml-[-1.125rem] hidden h-14 w-9 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.035] text-white/64 shadow-[0_14px_32px_rgba(0,0,0,0.22),0_0_24px_rgba(244,201,107,0.12)] backdrop-blur-md transition-colors duration-300 hover:border-[#f4c96b]/34 hover:bg-white/[0.05] hover:text-[#f4c96b]/82 md:flex"
            >
                <span className="relative h-8 w-px overflow-hidden rounded-full bg-gradient-to-b from-white/20 via-[#f4c96b]/55 to-transparent" aria-hidden>
                    <span className="public-scroll-cue-dot absolute left-1/2 top-0 ml-[-0.1875rem] h-1.5 w-1.5 rounded-full bg-[#f4c96b]/90 shadow-[0_0_14px_rgba(244,201,107,0.5)]" />
                </span>
            </a>
        </section>
    );
}
