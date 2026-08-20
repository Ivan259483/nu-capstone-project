import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MessageSquareQuote, Star, X } from "lucide-react";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { TRUSTED_BY_SECTION_BG_FOLLOW, TrustedBySectionAmbient } from "@/components/TrustedBySectionSurface";
import {
    demoReviews,
    featuredDemoReviews,
    REVIEWS_PER_TESTIMONIAL_PAGE,
    type DemoReview,
} from "@/data/sample-reviews";

function Particle({ delay, x, y, size }: { delay: number; x: string; y: string; size: number }) {
    return (
        <motion.div
            className="absolute rounded-full pointer-events-none"
            style={{ left: x, top: y, width: size, height: size, background: "radial-gradient(circle, rgba(244,182,61,0.2), transparent 70%)" }}
            animate={{ y: [0, -25, 0], opacity: [0.16, 0.46, 0.16], scale: [1, 1.32, 1] }}
            transition={{ duration: 5, repeat: Infinity, delay, ease: "easeInOut" }}
        />
    );
}

const EASE = [0.16, 1, 0.3, 1] as const;
const GOLD = "#F4B63D";
const featuredReviews = featuredDemoReviews.length > 0 ? featuredDemoReviews : demoReviews.slice(0, 8);
const reviewPageCount = Math.ceil(demoReviews.length / REVIEWS_PER_TESTIMONIAL_PAGE);

function formatReviewDate(date: string) {
    return new Intl.DateTimeFormat("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "Asia/Manila",
    }).format(new Date(`${date}T00:00:00+08:00`));
}

function RatingStars({ rating, size = "h-3.5 w-3.5" }: { rating: DemoReview["rating"]; size?: string }) {
    return (
        <div className="flex items-center gap-1" role="img" aria-label={`${rating} out of 5 stars`}>
            {Array.from({ length: 5 }).map((_, index) => {
                const filled = index < rating;
                return (
                    <Star
                        key={index}
                        className={`${size} transition-colors`}
                        style={{
                            fill: filled ? GOLD : "transparent",
                            color: filled ? GOLD : "rgba(255,255,255,0.2)",
                            filter: filled ? "drop-shadow(0 0 5px rgba(244,182,61,0.3))" : "none",
                        }}
                    />
                );
            })}
        </div>
    );
}

function ReviewMeta({ review, compact = false }: { review: DemoReview; compact?: boolean }) {
    return (
        <div className={`flex flex-wrap items-center gap-2 ${compact ? "text-[11px]" : "text-xs"} text-white/38`}>
            <span>{review.service}</span>
            <span className="text-[#F4B63D]/35">/</span>
            <span>{review.vehicle}</span>
            <span className="text-[#F4B63D]/35">/</span>
            <span>{formatReviewDate(review.date)}</span>
        </div>
    );
}

function TestimonialCard({ review, onClick }: { review: DemoReview; onClick: () => void }) {
    const [hovered, setHovered] = useState(false);

    return (
        <button
            type="button"
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="relative flex min-h-[286px] w-full flex-col overflow-hidden rounded-2xl p-5 text-left transition-all duration-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4B63D]/70"
            style={{
                background: hovered
                    ? "linear-gradient(135deg, rgba(244,182,61,0.08) 0%, rgba(13,13,20,0.96) 50%, rgba(244,182,61,0.035) 100%)"
                    : "linear-gradient(135deg, rgba(255,255,255,0.032) 0%, rgba(11,12,18,0.92) 100%)",
                border: hovered ? "1px solid rgba(244,182,61,0.26)" : "1px solid rgba(255,255,255,0.07)",
                boxShadow: hovered
                    ? "0 20px 60px rgba(0,0,0,0.38), 0 0 34px rgba(244,182,61,0.07)"
                    : "0 8px 28px rgba(0,0,0,0.22)",
                transform: hovered ? "translateY(-4px)" : "translateY(0)",
                backdropFilter: "blur(18px)",
            }}
        >
            <div className="mb-5 flex items-start justify-between gap-3">
                <RatingStars rating={review.rating} />
                <MessageSquareQuote className="h-5 w-5 text-[#F4B63D]/45" aria-hidden="true" />
            </div>

            <p className="line-clamp-5 flex-1 text-[14px] font-light leading-[1.7] text-white/58">
                "{review.comment}"
            </p>

            <div
                className="mt-5 border-t pt-4 transition-colors duration-300"
                style={{ borderColor: hovered ? "rgba(244,182,61,0.18)" : "rgba(255,255,255,0.07)" }}
            >
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[14px] font-bold tracking-tight text-white">
                        <span className="truncate">{review.name}</span>
                    </div>
                    <div className="mt-1 text-[12px] font-medium leading-none text-[#F4B63D]/62">Vehicle Owner</div>
                </div>
                <div className="mt-3">
                    <ReviewMeta review={review} compact />
                </div>
            </div>

            <div
                className="absolute bottom-0 left-5 right-5 h-px rounded-full transition-all duration-500"
                style={{
                    background: hovered
                        ? "linear-gradient(90deg, transparent, rgba(244,182,61,0.72), transparent)"
                        : "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
                }}
            />
        </button>
    );
}

function FeaturedTestimonial() {
    const [current, setCurrent] = useState(0);
    const featured = featuredReviews[current];

    const next = () => setCurrent((value) => (value + 1) % featuredReviews.length);
    const prev = () => setCurrent((value) => (value - 1 + featuredReviews.length) % featuredReviews.length);

    useEffect(() => {
        const timer = window.setInterval(next, 6500);
        return () => window.clearInterval(timer);
    }, []);

    if (!featured) return null;

    return (
        <div className="relative mx-auto mb-14 max-w-4xl sm:mb-16">
            <div
                className="relative overflow-hidden rounded-3xl px-7 py-10 sm:px-12 sm:py-14"
                style={{
                    background: "linear-gradient(135deg, rgba(244,182,61,0.065) 0%, rgba(8,9,15,0.96) 42%, rgba(244,182,61,0.025) 100%)",
                    border: "1px solid rgba(244,182,61,0.16)",
                    boxShadow: "0 30px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.035)",
                }}
            >
                <div
                    className="pointer-events-none absolute inset-0 z-0"
                    style={{
                        background: "radial-gradient(circle at 18% 0%, rgba(244,182,61,0.12), transparent 34%)",
                    }}
                />

                <AnimatePresence mode="wait">
                    <motion.div
                        key={featured.id}
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -18 }}
                        transition={{ duration: 0.45, ease: EASE }}
                        className="relative z-10"
                    >
                        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                            <RatingStars rating={featured.rating} size="h-5 w-5" />
                            <MessageSquareQuote className="h-6 w-6 text-[#F4B63D]/45" aria-hidden="true" />
                        </div>

                        <p className="mb-8 max-w-3xl text-lg font-light italic leading-[1.65] text-white/72 sm:text-xl md:text-2xl">
                            "{featured.comment}"
                        </p>

                        <div className="flex flex-col gap-5 border-t border-[#F4B63D]/15 pt-6 sm:flex-row sm:items-end">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 text-base font-bold tracking-tight text-white">
                                    <span className="truncate">{featured.name}</span>
                                </div>
                                <div className="mt-1.5 text-sm font-medium leading-none text-[#F4B63D]/70">Vehicle Owner</div>
                                <div className="mt-3">
                                    <ReviewMeta review={featured} />
                                </div>
                            </div>

                            <div className="flex items-center gap-2 sm:ml-auto">
                                <button
                                    type="button"
                                    onClick={prev}
                                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 transition-all duration-300 hover:border-[#F4B63D]/30 hover:bg-white/5"
                                    aria-label="Previous featured review"
                                >
                                    <ChevronLeft className="h-4 w-4 text-white/54" />
                                </button>
                                <button
                                    type="button"
                                    onClick={next}
                                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 transition-all duration-300 hover:border-[#F4B63D]/30 hover:bg-white/5"
                                    aria-label="Next featured review"
                                >
                                    <ChevronRight className="h-4 w-4 text-white/54" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </AnimatePresence>

                <div className="mt-9 flex items-center justify-center gap-2">
                    {featuredReviews.map((review, index) => (
                        <button
                            type="button"
                            key={review.id}
                            onClick={() => setCurrent(index)}
                            className="rounded-full transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4B63D]/70"
                            aria-label={`Show featured review ${index + 1}`}
                        >
                            <span
                                className="block rounded-full transition-all duration-300"
                                style={{
                                    width: index === current ? 28 : 8,
                                    height: 8,
                                    background: index === current
                                        ? "linear-gradient(90deg, #F4B63D, #D58A12)"
                                        : "rgba(255,255,255,0.12)",
                                    boxShadow: index === current ? "0 0 12px rgba(244,182,61,0.26)" : "none",
                                }}
                            />
                        </button>
                    ))}
                </div>

                <div
                    className="pointer-events-none absolute inset-0 rounded-3xl"
                    style={{
                        boxShadow: "inset 0 0 0 1px rgba(244,182,61,0.46)",
                        maskImage: "linear-gradient(135deg, black 0%, transparent 30%, transparent 70%, black 100%)",
                        WebkitMaskImage: "linear-gradient(135deg, black 0%, transparent 30%, transparent 70%, black 100%)",
                    }}
                />
            </div>
        </div>
    );
}

export default function TestimonialsSection() {
    const { t } = useLanguage();
    const headingRef = useRef<HTMLDivElement>(null);
    const isInView = useInView(headingRef, { once: true, margin: "-80px" });
    const [selected, setSelected] = useState<DemoReview | null>(null);
    const [reviewPage, setReviewPage] = useState(0);
    const start = reviewPage * REVIEWS_PER_TESTIMONIAL_PAGE;
    const visibleReviews = demoReviews.slice(start, start + REVIEWS_PER_TESTIMONIAL_PAGE);

    const nextPage = () => setReviewPage((page) => (page + 1) % reviewPageCount);
    const prevPage = () => setReviewPage((page) => (page - 1 + reviewPageCount) % reviewPageCount);

    useEffect(() => {
        document.body.style.overflow = selected ? "hidden" : "";
        return () => {
            document.body.style.overflow = "";
        };
    }, [selected]);

    return (
        <section className="relative overflow-hidden pt-24 pb-28 sm:pt-32 sm:pb-36" style={TRUSTED_BY_SECTION_BG_FOLLOW}>
            <TrustedBySectionAmbient />

            <Particle delay={0} x="10%" y="25%" size={5} />
            <Particle delay={1.8} x="88%" y="35%" size={4} />
            <Particle delay={0.6} x="70%" y="75%" size={6} />
            <Particle delay={2.5} x="20%" y="85%" size={4} />
            <Particle delay={3.2} x="55%" y="12%" size={3} />
            <Particle delay={1.2} x="40%" y="60%" size={5} />

            <div className="container relative z-10 mx-auto max-w-7xl px-6">
                <div ref={headingRef} className="mb-16 text-center sm:mb-20">
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                        animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
                        transition={{ duration: 0.6, ease: EASE }}
                        className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-[#F4B63D]/25 bg-[#F4B63D]/[0.06] px-6 py-2.5 text-[11px] font-bold uppercase tracking-[0.25em] text-[#F4B63D] backdrop-blur-sm"
                    >
                        <MessageSquareQuote className="h-3.5 w-3.5" />
                        {t("testimonialsPublic.badge")}
                    </motion.div>

                    <div className="mb-3 overflow-hidden">
                        <motion.h2
                            initial={{ opacity: 0, y: 60 }}
                            animate={isInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.8, ease: EASE, delay: 0.15 }}
                            className="font-serif text-4xl font-medium leading-[1.05] tracking-tight text-[#F8F7F2] sm:text-5xl md:text-6xl lg:text-[68px]"
                        >
                            <span className="animate-shimmer bg-gradient-to-r from-[#F8F7F2] via-[#F4B63D] to-[#F8F7F2] bg-[length:200%_100%] bg-clip-text text-transparent">
                                {t("testimonialsPublic.title")}
                            </span>
                        </motion.h2>
                    </div>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={isInView ? { opacity: 1, y: 0 } : {}}
                        transition={{ duration: 0.6, ease: EASE, delay: 0.45 }}
                        className="mx-auto max-w-2xl text-sm font-light leading-relaxed text-[#B8BEC8] sm:text-base"
                    >
                        {t("testimonialsPublic.subtitle")}
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={isInView ? { opacity: 1, scale: 1 } : {}}
                        transition={{ duration: 0.5, ease: EASE, delay: 0.58 }}
                        className="mt-10 flex flex-wrap items-center justify-center gap-3"
                    >
                        <div className="h-px w-12 bg-gradient-to-r from-transparent to-white/15" />
                        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/48">
                            Detailing
                        </span>
                        <span className="rounded-full border border-[#F4B63D]/20 bg-[#F4B63D]/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F4B63D]/78">
                            Coating
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/48">
                            Paint Protection
                        </span>
                        <div className="h-px w-12 bg-gradient-to-l from-transparent to-white/15" />
                    </motion.div>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ duration: 0.8, ease: EASE }}
                >
                    <FeaturedTestimonial />
                </motion.div>

                <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#F4B63D]/72">
                            More owner feedback
                        </p>
                        <p className="mt-1 text-sm text-white/52">
                            Browse a few recent experiences from booked car care services.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={prevPage}
                            className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 px-4 text-xs font-bold uppercase tracking-[0.14em] text-white/58 transition-colors hover:border-[#F4B63D]/30 hover:text-[#F4B63D]"
                            aria-label="Show previous reviews"
                        >
                            <ChevronLeft className="h-4 w-4" />
                            Prev
                        </button>
                        <button
                            type="button"
                            onClick={nextPage}
                            className="inline-flex h-10 items-center gap-2 rounded-full border border-[#F4B63D]/24 bg-[#F4B63D]/[0.07] px-4 text-xs font-bold uppercase tracking-[0.14em] text-[#F4B63D] transition-colors hover:bg-[#F4B63D]/[0.12]"
                            aria-label="Show next reviews"
                        >
                            Next
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={reviewPage}
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -18 }}
                        transition={{ duration: 0.32, ease: EASE }}
                        className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
                    >
                        {visibleReviews.map((review) => (
                            <TestimonialCard
                                key={review.id}
                                review={review}
                                onClick={() => setSelected(review)}
                            />
                        ))}
                    </motion.div>
                </AnimatePresence>
            </div>

            <AnimatePresence>
                {selected && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[999999] flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 backdrop-blur-md"
                            style={{ background: "rgba(0,0,0,0.85)" }}
                            onClick={() => setSelected(null)}
                        />

                        <motion.div
                            initial={{ opacity: 0, scale: 0.92, y: 24 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 18 }}
                            transition={{ duration: 0.35, ease: EASE }}
                            className="relative w-full max-w-xl rounded-3xl p-7 sm:p-9"
                            style={{
                                background: "linear-gradient(135deg, rgba(244,182,61,0.06) 0%, rgba(10,10,20,0.98) 42%, rgba(244,182,61,0.03) 100%)",
                                border: "1px solid rgba(244,182,61,0.2)",
                                boxShadow: "0 0 80px rgba(244,182,61,0.1), 0 30px 80px rgba(0,0,0,0.5)",
                            }}
                            onClick={(event) => event.stopPropagation()}
                        >
                            <button
                                type="button"
                                onClick={() => setSelected(null)}
                                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-all duration-200 hover:bg-white/10"
                                aria-label="Close review"
                            >
                                <X className="h-4 w-4 text-white/50" />
                            </button>

                            <div className="relative z-10 mt-2">
                                <div className="mb-6 flex flex-wrap items-center justify-between gap-3 pr-10">
                                    <RatingStars rating={selected.rating} size="h-5 w-5" />
                                    <MessageSquareQuote className="h-6 w-6 text-[#F4B63D]/45" aria-hidden="true" />
                                </div>

                                <p className="text-base font-light italic leading-relaxed text-white/64 sm:text-lg">
                                    "{selected.comment}"
                                </p>

                                <div className="mt-7 border-t border-[#F4B63D]/15 pt-5">
                                    <div className="flex items-center gap-1.5 text-lg font-bold tracking-tight text-white">
                                        <span>{selected.name}</span>
                                    </div>
                                    <div className="mt-1.5 text-sm font-medium leading-none text-[#F4B63D]/68">Vehicle Owner</div>
                                    <div className="mt-4 grid gap-2 text-sm text-white/48">
                                        <div>Service: <span className="text-white/70">{selected.service}</span></div>
                                        <div>Vehicle: <span className="text-white/70">{selected.vehicle}</span></div>
                                        <div>Date: <span className="text-white/70">{formatReviewDate(selected.date)}</span></div>
                                    </div>
                                </div>
                            </div>

                            <div
                                className="pointer-events-none absolute inset-0 rounded-3xl"
                                style={{
                                    boxShadow: "inset 0 0 0 1px rgba(244,182,61,0.48)",
                                    maskImage: "linear-gradient(135deg, black 0%, transparent 30%, transparent 70%, black 100%)",
                                    WebkitMaskImage: "linear-gradient(135deg, black 0%, transparent 30%, transparent 70%, black 100%)",
                                }}
                            />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
}
