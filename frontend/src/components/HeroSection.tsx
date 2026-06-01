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

const SERVICE_KEYS = [
    "ceramicCoating",
    "fullDetail",
    "paintCorrection",
    "ppf",
    "interiorDetail",
    "tinting",
] as const;

export default function HeroSection() {
    const { lang, t } = useLanguage();
    const typingWords = useMemo(
        () => (lang === "fil" ? fil.hero.typingWords : en.hero.typingWords),
        [lang]
    );
    const [activeServiceKey, setActiveServiceKey] = useState<(typeof SERVICE_KEYS)[number]>("ceramicCoating");
    const [displayText, setDisplayText] = useState("");
    const [wordIndex, setWordIndex] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showCursor, setShowCursor] = useState(true);

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
        <section className="relative min-h-screen w-full flex items-center overflow-hidden" style={{ backgroundColor: "#07070A" }}>

            {/* Full-bleed hero media — wide soft fade (avoids hard vertical seam under nav) */}
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden border-0">
                <img
                    src="https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?q=80&w=2670&auto=format&fit=crop"
                    alt={t("hero.imageAlt")}
                    className="h-full w-full object-cover object-center opacity-55 lg:opacity-95 lg:object-[72%_center]"
                    style={{ animation: "hero-car-drift 25s ease-in-out infinite", transformOrigin: "center center" }}
                />
                <div
                    className="absolute inset-0 z-10 hidden lg:block"
                    aria-hidden
                    style={{
                        background:
                            "linear-gradient(100deg, rgba(7,7,10,0.98) 0%, rgba(7,7,10,0.88) 25%, rgba(7,7,10,0.48) 43%, rgba(7,7,10,0.16) 62%, rgba(7,7,10,0.04) 100%), linear-gradient(to bottom, rgba(7,7,10,0.14) 0%, transparent 38%, rgba(7,7,10,0.58) 100%)",
                    }}
                />
                <div
                    className="absolute inset-0 z-10 lg:hidden"
                    aria-hidden
                    style={{
                        background: "linear-gradient(to top, #07070A 0%, rgba(7,7,10,0.86) 48%, rgba(7,7,10,0.38) 100%), linear-gradient(90deg, rgba(7,7,10,0.72) 0%, rgba(7,7,10,0.28) 100%)",
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
                        className="my-9 inline-flex w-fit items-center gap-4 rounded-full border border-white/10 bg-white/[0.045] px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.18)] backdrop-blur-md animate-slide-up"
                        style={{ animationDelay: "0.5s" }}
                        aria-label={`${t("stats.rating")}: 4.9, ${t("hero.reviews")}`}
                    >
                        <span className="text-[34px] font-serif font-light leading-none text-white tabular-nums relative -translate-y-[6px]">
                            4.9
                        </span>
                        <span className="h-8 w-px bg-white/10" aria-hidden />
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-0.5 text-[#f4b43f]">
                                {[...Array(5)].map((_, i) => (
                                    <Star key={i} className="h-[15px] w-[15px] shrink-0 fill-current" />
                                ))}
                            </div>
                            <span className="text-[11px] font-sans uppercase tracking-[0.14em] text-white/62">
                                {t("stats.rating")} · {t("hero.reviews")}
                            </span>
                        </div>
                    </div>

                    {/* CTA Buttons */}
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-12 animate-slide-up font-sans" style={{ animationDelay: "0.6s" }}>
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
                    <div className="grid max-w-[16rem] grid-cols-1 gap-2.5 animate-slide-up font-sans sm:max-w-[620px] sm:flex sm:flex-wrap sm:items-center sm:gap-2.5" style={{ animationDelay: "0.7s" }}>
                        {SERVICE_KEYS.map((key) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setActiveServiceKey(key)}
                                aria-pressed={activeServiceKey === key}
                                className={`inline-flex min-h-9 items-center justify-center rounded-full border px-4 text-center text-[11px] font-semibold uppercase tracking-[0.1em] transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e0a020]/45 sm:justify-start ${activeServiceKey === key
                                    ? "border-[#e0a020]/50 bg-[#e0a020]/11 text-[#f4c96b] shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]"
                                    : "border-white/12 bg-[#090d14]/45 text-white/66 hover:border-[#e0a020]/34 hover:bg-white/[0.07] hover:text-white"
                                    }`}
                            >
                                {t(`hero.serviceTags.${key}`)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right Column (Floating Elements) - Hidden on mobile */}
                <div className="hidden lg:flex w-[45%] relative h-screen flex-col justify-center items-end pr-0 xl:pr-10">

                    <div className="absolute top-[25%] right-[-10px] w-8 h-8 border-t border-r border-[#F0A500] opacity-40" />
                    <div className="absolute bottom-[25%] left-10 w-8 h-8 border-b border-l border-[#F0A500] opacity-35" />

                    <div className="absolute top-1/2 right-[-60px] rotate-[270deg] origin-center z-10 animate-fade-in translate-y-[-50%]">
                        <span className="text-[10px] uppercase tracking-[0.4em] text-[rgba(255,255,255,0.25)] font-sans whitespace-nowrap">
                            {t("hero.brandStamp")}
                        </span>
                    </div>

                </div>
            </div>
        </section>
    );
}
