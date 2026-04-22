import { useState, useEffect, useRef } from "react";
import { Star, Quote, X, ChevronLeft, ChevronRight, MessageSquareQuote, BadgeCheck } from "lucide-react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

/* ─── Floating Particle ─── */
function Particle({ delay, x, y, size }: { delay: number; x: string; y: string; size: number }) {
    return (
        <motion.div
            className="absolute rounded-full pointer-events-none"
            style={{ left: x, top: y, width: size, height: size, background: "radial-gradient(circle, rgba(232,101,10,0.25), transparent 70%)" }}
            animate={{ y: [0, -25, 0], opacity: [0.2, 0.6, 0.2], scale: [1, 1.4, 1] }}
            transition={{ duration: 5, repeat: Infinity, delay, ease: "easeInOut" }}
        />
    );
}


/* ─── Easing ─── */
const EASE = [0.16, 1, 0.3, 1] as const;

const testimonials = [
    {
        name: "ivan",
        role: "BMW M3 Owner",
        text: "Nagpa ceramic coating ako dito last month. Napansin ko agad after umulan, parang ayaw kumapit ng tubig sa pintura. Ang linis tignan palagi kahit ilang araw na. Maingat sila gumawa at kita mo na sanay na sanay.",
        rating: 5,
        image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=faces",
    },
    {
        name: "Angelica",
        role: "Toyota Fortuner Owner",
        text: "Nagpa-full detail ako kasi madalas gamitin sa byahe. Pagkuha ko, parang bagong labas ng casa yung itsura. Malinis pati loob, pati amoy bago. Sulit yung bayad.",
        rating: 5,
        image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=faces",
    },
    {
        name: "James",
        role: "Porsche 911 Owner",
        text: "May mga swirl marks na yung kotse ko dati. After paint correction, sobrang kintab na ulit. Kita mo yung difference lalo na sa ilaw. Tahimik lang sila magtrabaho pero pulido.",
        rating: 5,
        image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=faces",
    },
    {
        name: "Ana",
        role: "Honda Civic Owner",
        text: "First time ko magpa-detailing at dito ko pinagawa. Hindi ako na-disappoint. Maayos kausap at malinaw magpaliwanag kung ano gagawin sa kotse.",
        rating: 5,
        image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=faces",
    },
    {
        name: "Ricky",
        role: "Ford Ranger Owner",
        text: "On time sila mag-update habang ginagawa yung sasakyan ko. Hindi ako nag alala kasi may pictures pa silang sinend. Pagbalik, sobrang linis pati mga sulok na hindi ko nalilinis dati.",
        rating: 5,
        image: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&h=150&fit=crop&crop=faces",
    },
    {
        name: "Dianne",
        role: "Hyundai Tucson Owner",
        text: "May mga gasgas at watermarks na dati yung pintura. Ngayon halos hindi na makita. Mukhang inalagaan talaga nila habang ginagawa.",
        rating: 5,
        image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=faces",
    },
];

/* ═══════════════════════════════════════
   TESTIMONIAL CARD — Glass card in marquee
═══════════════════════════════════════ */
function TestimonialCard({
    testimonial,
    onClick,
    index,
}: {
    testimonial: (typeof testimonials)[0];
    onClick: () => void;
    index: number;
}) {
    const [hovered, setHovered] = useState(false);

    return (
        <div
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="w-[340px] shrink-0 relative rounded-2xl p-6 cursor-pointer select-none transition-all duration-500"
            style={{
                background: hovered
                    ? "linear-gradient(135deg, rgba(232,101,10,0.08) 0%, rgba(20,20,30,0.95) 50%, rgba(232,101,10,0.04) 100%)"
                    : "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(15,15,25,0.9) 100%)",
                border: hovered ? "1px solid rgba(232,101,10,0.3)" : "1px solid rgba(255,255,255,0.06)",
                boxShadow: hovered
                    ? "0 20px 60px rgba(0,0,0,0.4), 0 0 40px rgba(232,101,10,0.08)"
                    : "0 8px 30px rgba(0,0,0,0.2)",
                transform: hovered ? "translateY(-6px)" : "translateY(0)",
                backdropFilter: "blur(20px)",
            }}
        >
            {/* Quote icon — top right */}
            <div
                className="absolute top-5 right-5 transition-all duration-300"
                style={{ opacity: hovered ? 0.5 : 0.15 }}
            >
                <Quote className="w-8 h-8 text-[#E8650A]" />
            </div>

            {/* Stars */}
            <div className="flex gap-1 mb-5">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star
                        key={i}
                        className="w-3.5 h-3.5 transition-all duration-300"
                        style={{
                            fill: "#E8650A",
                            color: "#E8650A",
                            filter: hovered ? "drop-shadow(0 0 4px rgba(232,101,10,0.5))" : "none",
                            transitionDelay: `${i * 40}ms`,
                        }}
                    />
                ))}
            </div>

            {/* Text */}
            <p className="text-white/50 text-[14px] leading-[1.7] mb-6 line-clamp-4 font-light">
                "{testimonial.text}"
            </p>

            {/* Author */}
            <div className="flex items-center gap-3.5">
                <div
                    className="w-11 h-11 rounded-full overflow-hidden shrink-0 transition-all duration-300"
                    style={{
                        border: hovered ? "2px solid #E8650A" : "2px solid rgba(255,255,255,0.1)",
                        boxShadow: hovered ? "0 0 20px rgba(232,101,10,0.2)" : "none",
                    }}
                >
                    <img
                        src={testimonial.image}
                        alt={testimonial.name}
                        className="w-full h-full object-cover"
                    />
                </div>
                <div>
                    <div className="text-[14px] font-bold text-white tracking-tight flex items-center gap-1.5">
                        {testimonial.name}
                        <BadgeCheck className="w-3.5 h-3.5 text-[#E8650A]" />
                    </div>
                    <div className="text-[12px] text-white/30 font-medium">
                        {testimonial.role}
                    </div>
                </div>
            </div>

            {/* Bottom accent line */}
            <div
                className="absolute bottom-0 left-6 right-6 h-[2px] rounded-full transition-all duration-500"
                style={{
                    background: hovered
                        ? "linear-gradient(90deg, transparent, #E8650A, transparent)"
                        : "linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)",
                }}
            />
        </div>
    );
}

/* ═══════════════════════════════════════
   FEATURED TESTIMONIAL — Large spotlight card
═══════════════════════════════════════ */
function FeaturedTestimonial() {
    const [current, setCurrent] = useState(0);
    const featured = testimonials[current];

    const next = () => setCurrent((c) => (c + 1) % testimonials.length);
    const prev = () => setCurrent((c) => (c - 1 + testimonials.length) % testimonials.length);

    // Auto-rotate
    useEffect(() => {
        const timer = setInterval(next, 6000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="relative max-w-4xl mx-auto mb-20">
            {/* Main card */}
            <div
                className="relative rounded-3xl overflow-hidden px-8 sm:px-14 py-12 sm:py-16"
                style={{
                    background: "linear-gradient(135deg, rgba(232,101,10,0.06) 0%, rgba(10,10,20,0.95) 40%, rgba(232,101,10,0.03) 100%)",
                    border: "1px solid rgba(232,101,10,0.15)",
                    boxShadow: "0 30px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)",
                }}
            >
                {/* Shimmer sweep — pure CSS so it never resets */}
                <div
                    className="absolute inset-0 pointer-events-none z-20"
                    style={{
                        background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.04) 48%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 52%, transparent 60%)",
                        backgroundSize: "200% 100%",
                        animation: "testimonial-shine 4s linear infinite",
                    }}
                />

                {/* Giant quote watermark */}
                <motion.div
                    className="absolute top-8 left-8 opacity-[0.04] pointer-events-none"
                    animate={{ rotate: [0, 5, 0], scale: [1, 1.05, 1] }}
                    transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                >
                    <Quote className="w-32 h-32 text-[#E8650A]" />
                </motion.div>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={current}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.5, ease: EASE }}
                        className="relative z-10"
                    >
                        {/* Stars */}
                        <div className="flex gap-1.5 mb-6">
                            {Array.from({ length: featured.rating }).map((_, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, scale: 0 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: i * 0.08, duration: 0.3 }}
                                >
                                    <Star
                                        className="w-5 h-5"
                                        style={{
                                            fill: "#E8650A",
                                            color: "#E8650A",
                                            filter: "drop-shadow(0 0 8px rgba(232,101,10,0.4))",
                                        }}
                                    />
                                </motion.div>
                            ))}
                        </div>

                        {/* Quote text */}
                        <p className="text-white/70 text-lg sm:text-xl md:text-2xl leading-[1.6] font-light mb-10 max-w-3xl" style={{ fontStyle: "italic" }}>
                            "{featured.text}"
                        </p>

                        {/* Author row */}
                        <div className="flex items-center gap-4">
                            <div
                                className="w-14 h-14 rounded-full overflow-hidden shrink-0"
                                style={{
                                    border: "2px solid rgba(232,101,10,0.4)",
                                    boxShadow: "0 0 25px rgba(232,101,10,0.15)",
                                }}
                            >
                                <img
                                    src={featured.image}
                                    alt={featured.name}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <div>
                                <div className="text-base font-bold text-white tracking-tight">
                                    {featured.name}
                                </div>
                                <div className="text-sm text-[#E8650A]/70 font-medium">
                                    {featured.role}
                                </div>
                            </div>

                            {/* Navigation arrows */}
                            <div className="ml-auto flex items-center gap-2">
                                <button
                                    onClick={prev}
                                    className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 hover:bg-white/5 border border-white/10 hover:border-[#E8650A]/30"
                                >
                                    <ChevronLeft className="w-4 h-4 text-white/50" />
                                </button>
                                <button
                                    onClick={next}
                                    className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 hover:bg-white/5 border border-white/10 hover:border-[#E8650A]/30"
                                >
                                    <ChevronRight className="w-4 h-4 text-white/50" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </AnimatePresence>

                {/* Progress dots */}
                <div className="flex items-center justify-center gap-2 mt-10">
                    {testimonials.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setCurrent(i)}
                            className="transition-all duration-300"
                        >
                            <div
                                className="rounded-full transition-all duration-500"
                                style={{
                                    width: i === current ? 28 : 8,
                                    height: 8,
                                    background: i === current
                                        ? "linear-gradient(90deg, #E8650A, #f59e0b)"
                                        : "rgba(255,255,255,0.1)",
                                    boxShadow: i === current ? "0 0 12px rgba(232,101,10,0.3)" : "none",
                                }}
                            />
                        </button>
                    ))}
                </div>

                {/* Corner accents */}
                <div className="absolute top-0 left-0 w-12 h-[1px] bg-gradient-to-r from-[#E8650A]/40 to-transparent" />
                <div className="absolute top-0 left-0 w-[1px] h-12 bg-gradient-to-b from-[#E8650A]/40 to-transparent" />
                <div className="absolute bottom-0 right-0 w-12 h-[1px] bg-gradient-to-l from-[#E8650A]/40 to-transparent" />
                <div className="absolute bottom-0 right-0 w-[1px] h-12 bg-gradient-to-t from-[#E8650A]/40 to-transparent" />
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════
   TESTIMONIALS SECTION
═══════════════════════════════════════ */
export default function TestimonialsSection() {
    const { t } = useLanguage();
    const headingRef = useRef<HTMLDivElement>(null);
    const isInView = useInView(headingRef, { once: true, margin: "-80px" });
    const [selected, setSelected] = useState<(typeof testimonials)[0] | null>(null);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (selected) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [selected]);

    return (
        <section
            className="relative py-28 sm:py-36 overflow-hidden"
            style={{
                background: "linear-gradient(180deg, #060a14 0%, #0c1020 40%, #0a0e1a 100%)",
            }}
        >
            {/* Ambient glows */}
            <div className="absolute top-20 left-1/4 w-[500px] h-[500px] bg-[#E8650A]/[0.02] blur-[180px] rounded-full pointer-events-none" />
            <div className="absolute bottom-20 right-1/4 w-[400px] h-[400px] bg-indigo-500/[0.015] blur-[150px] rounded-full pointer-events-none" />

            {/* Floating particles */}
            <Particle delay={0} x="10%" y="25%" size={5} />
            <Particle delay={1.8} x="88%" y="35%" size={4} />
            <Particle delay={0.6} x="70%" y="75%" size={6} />
            <Particle delay={2.5} x="20%" y="85%" size={4} />
            <Particle delay={3.2} x="55%" y="12%" size={3} />
            <Particle delay={1.2} x="40%" y="60%" size={5} />

            {/* Top border */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E8650A]/20 to-transparent" />

            <div className="container max-w-7xl mx-auto px-6 relative z-10">
                {/* ── Heading ── */}
                <div ref={headingRef} className="text-center mb-16 sm:mb-20">
                    {/* Badge */}
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                        animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
                        transition={{ duration: 0.6, ease: EASE }}
                        className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full border border-[#E8650A]/25 bg-[#E8650A]/[0.06] text-[11px] font-bold uppercase tracking-[0.25em] text-[#E8650A] mb-8 backdrop-blur-sm"
                    >
                        <MessageSquareQuote className="w-3.5 h-3.5" />
                        Client Stories
                    </motion.div>

                    {/* Title */}
                    <div className="overflow-hidden mb-3">
                        <motion.h2
                            initial={{ opacity: 0, y: 60 }}
                            animate={isInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.8, ease: EASE, delay: 0.15 }}
                            className="text-4xl sm:text-5xl md:text-6xl lg:text-[68px] font-serif font-medium text-white leading-[1.05] tracking-tight"
                        >
                            Trusted by
                        </motion.h2>
                    </div>
                    <div className="overflow-hidden mb-7">
                        <motion.h2
                            initial={{ opacity: 0, y: 60 }}
                            animate={isInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.8, ease: EASE, delay: 0.3 }}
                            className="text-4xl sm:text-5xl md:text-6xl lg:text-[68px] font-serif font-medium leading-[1.05] tracking-tight italic"
                        >
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E8650A] via-amber-400 to-[#E8650A] bg-[length:200%_100%] animate-shimmer">
                                Car Enthusiasts
                            </span>
                        </motion.h2>
                    </div>

                    {/* Subtitle */}
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={isInView ? { opacity: 1, y: 0 } : {}}
                        transition={{ duration: 0.6, ease: EASE, delay: 0.45 }}
                        className="text-white/30 text-sm sm:text-base max-w-lg mx-auto font-light leading-relaxed"
                    >
                        Don't take our word for it — hear from the owners who trust us with their prized rides.
                    </motion.p>

                    {/* Accent divider */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={isInView ? { opacity: 1, scale: 1 } : {}}
                        transition={{ duration: 0.5, ease: EASE, delay: 0.55 }}
                        className="flex items-center justify-center gap-3 mt-10"
                    >
                        <motion.div
                            className="h-px bg-gradient-to-r from-transparent to-white/15"
                            initial={{ width: 0 }}
                            animate={isInView ? { width: 50 } : {}}
                            transition={{ duration: 0.8, ease: EASE, delay: 0.6 }}
                        />
                        <motion.div
                            className="w-2.5 h-2.5 rounded-full border border-[#E8650A]/40"
                            animate={{
                                boxShadow: [
                                    "0 0 0 0 rgba(232,101,10,0)",
                                    "0 0 0 6px rgba(232,101,10,0.1)",
                                    "0 0 0 0 rgba(232,101,10,0)",
                                ],
                            }}
                            transition={{ duration: 2.5, repeat: Infinity }}
                            style={{ background: "rgba(232,101,10,0.3)" }}
                        />
                        <motion.div
                            className="h-px bg-gradient-to-l from-transparent to-white/15"
                            initial={{ width: 0 }}
                            animate={isInView ? { width: 50 } : {}}
                            transition={{ duration: 0.8, ease: EASE, delay: 0.6 }}
                        />
                    </motion.div>
                </div>

                {/* ── Featured Testimonial (Spotlight) ── */}
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ duration: 0.8, ease: EASE }}
                >
                    <FeaturedTestimonial />
                </motion.div>

            </div>

            {/* ── Marquee Strip ── */}
            <div className="relative mt-4">
                {/* Fade edges */}
                <div className="absolute left-0 top-0 bottom-0 w-40 z-10 pointer-events-none"
                    style={{ background: "linear-gradient(to right, #080c18, transparent)" }}
                />
                <div className="absolute right-0 top-0 bottom-0 w-40 z-10 pointer-events-none"
                    style={{ background: "linear-gradient(to left, #080c18, transparent)" }}
                />

                <div className="flex gap-5 animate-marquee w-max py-4 hover:[animation-play-state:paused]">
                    {[...testimonials, ...testimonials].map((testimonial, i) => (
                        <TestimonialCard
                            key={i}
                            testimonial={testimonial}
                            onClick={() => setSelected(testimonial)}
                            index={i}
                        />
                    ))}
                </div>
            </div>

            {/* ── Modal ── */}
            <AnimatePresence>
                {selected && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[999999] flex items-center justify-center p-4"
                    >
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 backdrop-blur-md"
                            style={{ background: "rgba(0,0,0,0.85)" }}
                            onClick={() => setSelected(null)}
                        />

                        {/* Modal Content */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 30 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ duration: 0.4, ease: EASE }}
                            className="relative w-full max-w-md rounded-3xl p-8 sm:p-10"
                            style={{
                                background: "linear-gradient(135deg, rgba(232,101,10,0.06) 0%, rgba(10,10,20,0.98) 40%, rgba(232,101,10,0.03) 100%)",
                                border: "1px solid rgba(232,101,10,0.2)",
                                boxShadow: "0 0 80px rgba(232,101,10,0.1), 0 30px 80px rgba(0,0,0,0.5)",
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={() => setSelected(null)}
                                className="absolute right-4 top-4 w-8 h-8 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 transition-all duration-200"
                            >
                                <X className="w-4 h-4 text-white/50" />
                            </button>

                            {/* Giant quote watermark */}
                            <div className="absolute top-6 left-6 opacity-[0.04]">
                                <Quote className="w-24 h-24 text-[#E8650A]" />
                            </div>

                            <div className="flex flex-col items-center text-center relative z-10 mt-2">
                                <div
                                    className="w-20 h-20 rounded-full overflow-hidden mb-5"
                                    style={{
                                        border: "3px solid rgba(232,101,10,0.4)",
                                        boxShadow: "0 0 30px rgba(232,101,10,0.2)",
                                    }}
                                >
                                    <img
                                        src={selected.image}
                                        alt={selected.name}
                                        className="w-full h-full object-cover"
                                    />
                                </div>

                                <div className="text-lg font-bold text-white mb-1 tracking-tight">{selected.name}</div>
                                <div className="text-sm text-[#E8650A]/60 font-medium mb-5">{selected.role}</div>

                                <div className="flex gap-1.5 mb-6">
                                    {Array.from({ length: selected.rating }).map((_, i) => (
                                        <Star
                                            key={i}
                                            className="w-5 h-5"
                                            style={{
                                                fill: "#E8650A",
                                                color: "#E8650A",
                                                filter: "drop-shadow(0 0 8px rgba(232,101,10,0.4))",
                                            }}
                                        />
                                    ))}
                                </div>

                                <p className="text-white/50 text-base leading-relaxed font-light px-2" style={{ fontStyle: "italic" }}>
                                    "{selected.text}"
                                </p>
                            </div>

                            {/* Corner accents */}
                            <div className="absolute top-0 left-0 w-10 h-[1px] bg-gradient-to-r from-[#E8650A]/30 to-transparent" />
                            <div className="absolute top-0 left-0 w-[1px] h-10 bg-gradient-to-b from-[#E8650A]/30 to-transparent" />
                            <div className="absolute bottom-0 right-0 w-10 h-[1px] bg-gradient-to-l from-[#E8650A]/30 to-transparent" />
                            <div className="absolute bottom-0 right-0 w-[1px] h-10 bg-gradient-to-t from-[#E8650A]/30 to-transparent" />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Bottom border */}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E8650A]/20 to-transparent" />
        </section>
    );
}
