import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, Sparkles, Clock, Gem, Award } from "lucide-react";
import { motion, useInView, useMotionValue, useTransform, useSpring } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import type { LandingGalleryItem } from "@/lib/landing";

/* ─── Legacy export for LandingPageEditor ─── */
export const GALLERY_ITEMS = [
    { label: "Exterior Wash & Wax", src: "https://images.unsplash.com/photo-1620584898989-d39f7f9ed1b7?auto=format&fit=crop&q=80&w=1200", aspect: "normal" },
    { label: "Interior Detailing", src: "https://images.unsplash.com/photo-1620584899131-a5ff5f8fbb03?auto=format&fit=crop&q=80&w=1200", aspect: "wide" },
    { label: "Paint Correction", src: "https://images.unsplash.com/photo-1622329821376-a19fd6002562?auto=format&fit=crop&q=80&w=1200", aspect: "normal" },
    { label: "Ceramic Coating", src: "https://images.unsplash.com/photo-1632823469850-2f77dd9c7f93?auto=format&fit=crop&q=80&w=1200", aspect: "normal" },
    { label: "Full Paint Protection (PPF)", src: "https://images.unsplash.com/photo-1605437241278-c1806d14a4d9?auto=format&fit=crop&q=80&w=1200", aspect: "tall" },
    { label: "Premium Window Tint", src: "https://images.unsplash.com/photo-1528597469186-bddab681a37f?auto=format&fit=crop&q=80&w=1200", aspect: "normal" },
];

/* ─── Easing ─── */
const EASE = [0.16, 1, 0.3, 1] as const;

/* ─── Feature Cards Data ─── */
const featureCards = [
    {
        num: "01",
        label: "Premium\nProducts",
        desc: "SONAX Germany & top-tier nano-ceramic coatings — no shortcuts, no substitutes.",
        src: "https://images.unsplash.com/photo-1619431856706-ca2cc58258f6?auto=format&fit=crop&q=80&w=800",
        icon: Gem,
    },
    {
        num: "02",
        label: "Attention\nto Detail",
        desc: "Every panel, crevice, and surface inspected with expert precision.",
        src: "https://images.unsplash.com/photo-1622329821376-a19fd6002562?auto=format&fit=crop&q=80&w=800",
        icon: Sparkles,
    },
    {
        num: "03",
        label: "Long-Lasting\nProtection",
        desc: "Up to 10 years of hydrophobic ceramic shield that repels dirt, UV & scratches.",
        src: "https://images.unsplash.com/photo-1605437241278-c1806d14a4d9?auto=format&fit=crop&q=80&w=800",
        icon: ShieldCheck,
    },
    {
        num: "04",
        label: "Convenient\n& Fast",
        desc: "Same-day turnaround available — quick service without cutting corners.",
        src: "https://images.unsplash.com/photo-1620584898989-d39f7f9ed1b7?auto=format&fit=crop&q=80&w=800",
        icon: Clock,
    },
];

/* ═══════════════════════════════════════
   3D TILT FEATURE CARD
═══════════════════════════════════════ */
function FeatureCard({
    card,
    index,
}: {
    card: (typeof featureCards)[number];
    index: number;
}) {
    const [imgSrc, setImgSrc] = useState(card.src);
    const [hovered, setHovered] = useState(false);
    const Icon = card.icon;
    const cardRef = useRef<HTMLDivElement>(null);

    // 3D tilt effect
    const mouseX = useMotionValue(0.5);
    const mouseY = useMotionValue(0.5);

    const rotateX = useSpring(useTransform(mouseY, [0, 1], [8, -8]), { stiffness: 300, damping: 30 });
    const rotateY = useSpring(useTransform(mouseX, [0, 1], [-8, 8]), { stiffness: 300, damping: 30 });

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        mouseX.set((e.clientX - rect.left) / rect.width);
        mouseY.set((e.clientY - rect.top) / rect.height);
    };

    const handleMouseLeave = () => {
        setHovered(false);
        mouseX.set(0.5);
        mouseY.set(0.5);
    };

    // Shine position
    const shineX = useTransform(mouseX, [0, 1], ["-50%", "150%"]);
    const shineOpacity = useSpring(hovered ? 1 : 0, { stiffness: 200, damping: 30 });

    return (
        <motion.div
            ref={cardRef}
            initial={{ opacity: 0, y: 60, scale: 0.95 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.7, ease: EASE, delay: index * 0.12 }}
            style={{
                perspective: 800,
            }}
        >
            <motion.div
                className="group relative rounded-[22px] overflow-hidden cursor-default select-none"
                style={{
                    aspectRatio: "3 / 4",
                    rotateX: hovered ? rotateX : 0,
                    rotateY: hovered ? rotateY : 0,
                    transformStyle: "preserve-3d",
                }}
                onMouseMove={handleMouseMove}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={handleMouseLeave}
                whileHover={{ scale: 1.03 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
                {/* Image */}
                <motion.img
                    src={imgSrc}
                    alt={card.label}
                    onError={() =>
                        setImgSrc("https://images.unsplash.com/photo-1518306727298-4c17e1bf6942?auto=format&fit=crop&q=80&w=800")
                    }
                    className="absolute inset-0 w-full h-full object-cover"
                    animate={{ scale: hovered ? 1.12 : 1 }}
                    transition={{ duration: 0.8, ease: EASE }}
                />

                {/* Gradient overlay */}
                <motion.div
                    className="absolute inset-0"
                    animate={{
                        background: hovered
                            ? "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.25) 100%)"
                            : "linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.1) 55%, transparent 100%)",
                    }}
                    transition={{ duration: 0.4 }}
                />

                {/* Shine / light sweep effect */}
                <motion.div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        opacity: shineOpacity,
                        background: `linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.06) 45%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 55%, transparent 60%)`,
                        backgroundPositionX: shineX,
                        backgroundSize: "200% 100%",
                    }}
                />

                {/* Top-right number */}
                <motion.span
                    className="absolute top-5 right-5 text-[11px] font-bold tracking-[0.3em] uppercase font-mono"
                    animate={{
                        color: hovered ? "#E8650A" : "rgba(255,255,255,0.25)",
                        opacity: hovered ? 1 : 0.5,
                    }}
                    transition={{ duration: 0.3 }}
                >
                    {card.num}
                </motion.span>

                {/* Bottom content */}
                <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6 flex flex-col justify-end z-10">
                    {/* Orange accent line */}
                    <motion.div
                        className="h-[2px] rounded-full mb-4"
                        animate={{
                            width: hovered ? 44 : 22,
                            background: hovered
                                ? "linear-gradient(90deg, #E8650A, #f59e0b)"
                                : "rgba(255,255,255,0.15)",
                        }}
                        transition={{ duration: 0.5, ease: EASE }}
                    />

                    {/* Icon */}
                    <motion.div
                        className="mb-3"
                        initial={false}
                        animate={{
                            opacity: hovered ? 1 : 0,
                            y: hovered ? 0 : 15,
                            height: hovered ? "auto" : 0,
                        }}
                        transition={{ duration: 0.4, ease: EASE }}
                        style={{ overflow: "hidden" }}
                    >
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center backdrop-blur-md"
                            style={{
                                background: "rgba(232,101,10,0.12)",
                                border: "1px solid rgba(232,101,10,0.3)",
                                boxShadow: "0 8px 25px rgba(232,101,10,0.15)",
                            }}
                        >
                            <Icon className="w-[18px] h-[18px] text-[#E8650A]" />
                        </div>
                    </motion.div>

                    {/* Title — always visible */}
                    <h3
                        className="text-[22px] sm:text-[26px] lg:text-[30px] font-black text-white leading-[1.08] tracking-tight"
                        style={{
                            fontStyle: "italic",
                            textShadow: "0 2px 20px rgba(0,0,0,0.5)",
                        }}
                    >
                        {card.label.split("\n").map((line, i) => (
                            <span key={i}>
                                {line}
                                {i === 0 && <br />}
                            </span>
                        ))}
                    </h3>

                    {/* Description — slides in */}
                    <motion.div
                        initial={false}
                        animate={{
                            opacity: hovered ? 1 : 0,
                            y: hovered ? 0 : 10,
                            height: hovered ? "auto" : 0,
                            marginTop: hovered ? 10 : 0,
                        }}
                        transition={{ duration: 0.4, ease: EASE }}
                        style={{ overflow: "hidden" }}
                    >
                        <p className="text-white/50 text-[13px] font-medium leading-[1.55]">
                            {card.desc}
                        </p>
                    </motion.div>
                </div>

                {/* Orange border glow */}
                <motion.div
                    className="absolute inset-0 rounded-[22px] pointer-events-none"
                    animate={{
                        boxShadow: hovered
                            ? "inset 0 0 0 2px #E8650A, 0 0 50px rgba(232,101,10,0.12), 0 30px 80px rgba(0,0,0,0.4)"
                            : "inset 0 0 0 1px rgba(255,255,255,0.05), 0 10px 30px rgba(0,0,0,0.1)",
                    }}
                    transition={{ duration: 0.4 }}
                />

                {/* Corner accents */}
                <motion.div
                    className="absolute top-0 left-0 bg-[#E8650A] pointer-events-none"
                    animate={{ width: hovered ? 50 : 0, height: 2 }}
                    transition={{ duration: 0.5, ease: EASE }}
                />
                <motion.div
                    className="absolute top-0 left-0 bg-[#E8650A] pointer-events-none"
                    animate={{ width: 2, height: hovered ? 50 : 0 }}
                    transition={{ duration: 0.5, ease: EASE }}
                />
                <motion.div
                    className="absolute bottom-0 right-0 bg-[#E8650A] pointer-events-none"
                    animate={{ width: hovered ? 50 : 0, height: 2 }}
                    transition={{ duration: 0.5, ease: EASE, delay: 0.05 }}
                />
                <motion.div
                    className="absolute bottom-0 right-0 bg-[#E8650A] pointer-events-none"
                    animate={{ width: 2, height: hovered ? 50 : 0 }}
                    transition={{ duration: 0.5, ease: EASE, delay: 0.05 }}
                />
            </motion.div>
        </motion.div>
    );
}

/* ═══════════════════════════════════════
   Floating Particle
═══════════════════════════════════════ */
function FloatingParticle({ delay, x, y, size }: { delay: number; x: string; y: string; size: number }) {
    return (
        <motion.div
            className="absolute rounded-full pointer-events-none"
            style={{
                left: x,
                top: y,
                width: size,
                height: size,
                background: "radial-gradient(circle, rgba(232,101,10,0.3), transparent 70%)",
            }}
            animate={{
                y: [0, -20, 0],
                opacity: [0.3, 0.7, 0.3],
                scale: [1, 1.3, 1],
            }}
            transition={{
                duration: 4,
                repeat: Infinity,
                delay,
                ease: "easeInOut",
            }}
        />
    );
}

/* ═══════════════════════════════════════
   GALLERY SECTION — "Why Choose AutoSPF+?"
═══════════════════════════════════════ */
interface GallerySectionProps {
    items?: LandingGalleryItem[];
}

export default function GallerySection({ items }: GallerySectionProps) {
    const { t } = useLanguage();
    const sectionRef = useRef<HTMLElement>(null);
    const headingRef = useRef<HTMLDivElement>(null);
    const isInView = useInView(headingRef, { once: true, margin: "-80px" });

    return (
        <section
            ref={sectionRef}
            id="gallery"
            className="relative py-28 sm:py-36 overflow-hidden"
            style={{
                background: "linear-gradient(180deg, #060a14 0%, #0a0f1c 40%, #0d1225 60%, #080c18 100%)",
            }}
        >
            {/* Ambient blurs */}
            <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[#E8650A]/[0.03] blur-[200px] rounded-full pointer-events-none" />
            <div className="absolute bottom-20 left-10 w-[400px] h-[400px] bg-indigo-500/[0.015] blur-[160px] rounded-full pointer-events-none" />
            <div className="absolute top-40 right-10 w-[300px] h-[300px] bg-amber-500/[0.02] blur-[120px] rounded-full pointer-events-none" />

            {/* Floating particles */}
            <FloatingParticle delay={0} x="15%" y="20%" size={6} />
            <FloatingParticle delay={1.5} x="85%" y="30%" size={4} />
            <FloatingParticle delay={0.8} x="75%" y="70%" size={5} />
            <FloatingParticle delay={2.2} x="25%" y="80%" size={4} />
            <FloatingParticle delay={3} x="50%" y="15%" size={3} />

            {/* Decorative top border */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E8650A]/25 to-transparent" />

            <div className="container max-w-7xl mx-auto px-6 relative z-10">
                {/* ── Heading ── */}
                <div ref={headingRef} className="text-center mb-20 sm:mb-24">
                    {/* Pill badge */}
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                        animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
                        transition={{ duration: 0.6, ease: EASE }}
                        className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full border border-[#E8650A]/25 bg-[#E8650A]/[0.06] text-[11px] font-bold uppercase tracking-[0.25em] text-[#E8650A] mb-8 backdrop-blur-sm"
                    >
                        <Award className="w-3.5 h-3.5" />
                        Why Choose AutoSPF+?
                    </motion.div>

                    {/* Title — word-by-word reveal */}
                    <div className="overflow-hidden mb-6">
                        <motion.h2
                            initial={{ opacity: 0, y: 60 }}
                            animate={isInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.8, ease: EASE, delay: 0.15 }}
                            className="text-4xl sm:text-5xl md:text-6xl lg:text-[76px] font-serif font-medium text-white leading-[1.05] tracking-tight"
                        >
                            Unparalleled Quality,
                        </motion.h2>
                    </div>
                    <div className="overflow-hidden mb-7">
                        <motion.h2
                            initial={{ opacity: 0, y: 60 }}
                            animate={isInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.8, ease: EASE, delay: 0.3 }}
                            className="text-4xl sm:text-5xl md:text-6xl lg:text-[76px] font-serif font-medium text-white leading-[1.05] tracking-tight italic"
                        >
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E8650A] via-amber-400 to-[#E8650A] bg-[length:200%_100%] animate-shimmer">
                                Every Time
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
                        We don't just clean cars — we transform them. Here's what sets us apart.
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
                            animate={{ boxShadow: ["0 0 0 0 rgba(232,101,10,0)", "0 0 0 6px rgba(232,101,10,0.1)", "0 0 0 0 rgba(232,101,10,0)"] }}
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

                {/* ── 4-Card Grid ── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-16">
                    {featureCards.map((card, i) => (
                        <FeatureCard key={card.num} card={card} index={i} />
                    ))}
                </div>

                {/* ── CTA ── */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, ease: EASE }}
                    className="text-center"
                >
                    <Link to="/gallery">
                        <motion.button
                            whileHover={{ scale: 1.05, boxShadow: "0 0 50px rgba(232,101,10,0.3)" }}
                            whileTap={{ scale: 0.97 }}
                            className="relative inline-flex items-center gap-3 px-10 py-4.5 rounded-full text-sm font-bold uppercase tracking-[0.2em] bg-[#E8650A] text-white shadow-lg shadow-[#E8650A]/25 overflow-hidden group"
                        >
                            {/* Button shine sweep */}
                            <motion.div
                                className="absolute inset-0 pointer-events-none"
                                style={{
                                    background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)",
                                    backgroundSize: "200% 100%",
                                }}
                                animate={{ backgroundPositionX: ["0%", "200%"] }}
                                transition={{ duration: 3, repeat: Infinity, ease: "linear", repeatDelay: 2 }}
                            />
                            <span className="relative z-10">View Full Gallery</span>
                            <ArrowRight className="w-4 h-4 relative z-10 group-hover:translate-x-1 transition-transform duration-300" />
                        </motion.button>
                    </Link>
                </motion.div>
            </div>

            {/* Decorative bottom border */}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E8650A]/25 to-transparent" />
        </section>
    );
}
