import { useState, useCallback, useEffect } from "react";
import {
    Image, ZoomIn, X, ChevronLeft, ChevronRight,
    Camera, Sparkles, Eye, ArrowRight, Filter
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import PageLayout from "@/components/PageLayout";
import { cn } from "@/lib/utils";

/* ── Framer Variants ── */
const EASE = [0.16, 1, 0.3, 1] as const;

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

const stagger: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const cardReveal: Variants = {
    hidden: { opacity: 0, scale: 0.9, y: 30 },
    visible: (i: number) => ({
        opacity: 1,
        scale: 1,
        y: 0,
        transition: { duration: 0.5, ease: EASE, delay: i * 0.06 },
    }),
};

const lightboxVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.25 } },
    exit: { opacity: 0, transition: { duration: 0.2 } },
};

const lightboxImgVariants: Variants = {
    hidden: { opacity: 0, scale: 0.92 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.35, ease: EASE } },
    exit: { opacity: 0, scale: 0.92, transition: { duration: 0.2 } },
};




/* ── Categories ── */
const categories = [
    { key: "all", label: "All Work", icon: Filter },
    { key: "exterior", label: "Exterior", icon: Sparkles },
    { key: "interior", label: "Interior", icon: Eye },
    { key: "paint", label: "Paint", icon: Camera },
    { key: "ceramic", label: "Ceramic", icon: Image },
] as const;
type Category = (typeof categories)[number]["key"];

/* ── Gallery Data — high-quality Unsplash auto detailing images ── */
const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1518306727298-4c17e1bf6942?auto=format&fit=crop&q=80&w=1200";

const galleryData = [
    {
        id: 1,
        category: "exterior",
        label: "Premium Exterior Wash",
        desc: "Full hand wash with foam cannon and clay bar treatment",
        src: "https://images.unsplash.com/photo-1528597469186-bddab681a37f?auto=format&fit=crop&q=80&w=1200",
        span: "col-span-2 row-span-2",
        featured: true,
    },
    {
        id: 2,
        category: "ceramic",
        label: "Ceramic Coating Application",
        desc: "Professional nano-ceramic protection for lasting brilliance",
        src: "https://images.unsplash.com/photo-1567808291548-fc3ee04dbcf0?auto=format&fit=crop&q=80&w=1200",
        span: "",
        featured: false,
    },
    {
        id: 3,
        category: "paint",
        label: "Paint Correction Detail",
        desc: "Multi-stage machine polish for a flawless mirror finish",
        src: "https://images.unsplash.com/photo-1605437241278-c1806d14a4d9?auto=format&fit=crop&q=80&w=1200",
        span: "",
        featured: false,
    },
    {
        id: 4,
        category: "interior",
        label: "Full Interior Restoration",
        desc: "Deep cleaning, leather conditioning, and odor elimination",
        src: "https://images.unsplash.com/photo-1619431856706-ca2cc58258f6?auto=format&fit=crop&q=80&w=1200",
        span: "col-span-2",
        featured: false,
    },
    {
        id: 5,
        category: "exterior",
        label: "SUV Exterior Detail",
        desc: "Full exterior restoration on a luxury SUV",
        src: "https://images.unsplash.com/photo-1620584898989-d39f7f9ed1b7?auto=format&fit=crop&q=80&w=1200",
        span: "",
        featured: false,
    },
    {
        id: 6,
        category: "ceramic",
        label: "Ceramic on BMW M4",
        desc: "9H ceramic coating on Alpine White — candy gloss achieved",
        src: "https://images.unsplash.com/photo-1620584899131-a5ff5f8fbb03?auto=format&fit=crop&q=80&w=1200",
        span: "row-span-2",
        featured: true,
    },
    {
        id: 7,
        category: "paint",
        label: "Scratch & Swirl Removal",
        desc: "Deep scratch removal with 3-stage machine polishing",
        src: "https://images.unsplash.com/photo-1622329821376-a19fd6002562?auto=format&fit=crop&q=80&w=1200",
        span: "",
        featured: false,
    },
    {
        id: 8,
        category: "interior",
        label: "Leather Conditioning",
        desc: "Premium leather care and UV protection treatment",
        src: "https://images.unsplash.com/photo-1632823469850-2f77dd9c7f93?auto=format&fit=crop&q=80&w=1200",
        span: "",
        featured: false,
    },
    {
        id: 9,
        category: "exterior",
        label: "Supercar Detailing",
        desc: "Full exterior detail on a Lamborghini Huracan",
        src: "https://images.unsplash.com/photo-1632823471799-c3812077da2d?auto=format&fit=crop&q=80&w=1200",
        span: "col-span-2",
        featured: false,
    },
    {
        id: 10,
        category: "paint",
        label: "Multi-Stage Polish",
        desc: "Removing years of oxidation and micro-scratches",
        src: "https://images.unsplash.com/photo-1633014041037-f5446fb4ce99?auto=format&fit=crop&q=80&w=1200",
        span: "",
        featured: false,
    },
    {
        id: 11,
        category: "ceramic",
        label: "Nano Coating on Range Rover",
        desc: "Full body ceramic with hydrophobic top coat",
        src: "https://images.unsplash.com/photo-1633014332834-c94559ff5439?auto=format&fit=crop&q=80&w=1200",
        span: "",
        featured: false,
    },
    {
        id: 12,
        category: "interior",
        label: "Dashboard & Console Detail",
        desc: "Complete dashboard restoration and UV protectant",
        src: "https://images.unsplash.com/photo-1652454449601-e83b62eabe94?auto=format&fit=crop&q=80&w=1200",
        span: "col-span-2 row-span-2",
        featured: true,
    },
] as const;

/* ── Stats ── */
const GALLERY_STATS = [
    { value: "500+", label: "Projects Completed" },
    { value: "12+", label: "Services Offered" },
    { value: "98%", label: "Client Satisfaction" },
    { value: "5★", label: "Average Rating" },
];

/* ═══════════════════════════════════════
   GalleryCard
═══════════════════════════════════════ */
function GalleryCard({
    item,
    index,
    onOpen,
}: {
    item: (typeof galleryData)[number];
    index: number;
    onOpen: (idx: number) => void;
}) {
    const [imgSrc, setImgSrc] = useState<string>(item.src);
    const [isHovered, setIsHovered] = useState(false);

    return (
        <motion.div
            custom={index}
            variants={cardReveal}
            layout
            layoutId={`gallery-${item.id}`}
            onClick={() => onOpen(index)}
            onHoverStart={() => setIsHovered(true)}
            onHoverEnd={() => setIsHovered(false)}
            className={cn(
                "group relative overflow-hidden rounded-2xl cursor-pointer",
                item.span || "",
            )}
            style={{ minHeight: 200 }}
            whileHover={{ scale: 1.02, transition: { duration: 0.3 } }}
        >
            {/* Image */}
            <motion.img
                src={imgSrc}
                alt={item.label}
                onError={() => setImgSrc(FALLBACK_IMAGE)}
                className="absolute inset-0 w-full h-full object-cover"
                animate={{ scale: isHovered ? 1.12 : 1.0 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />

            {/* Permanent gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

            {/* Hover overlay */}
            <motion.div
                className="absolute inset-0 flex flex-col justify-end p-5 sm:p-6"
                initial={false}
                animate={{ opacity: isHovered ? 1 : 0.7 }}
                transition={{ duration: 0.3 }}
            >
                {/* Zoom icon */}
                <motion.div
                    className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: isHovered ? 1 : 0, scale: isHovered ? 1 : 0.8 }}
                    transition={{ duration: 0.25 }}
                >
                    <ZoomIn className="w-4 h-4 text-white" />
                </motion.div>

                {/* Category badge */}
                <motion.span
                    className="inline-flex self-start px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.2em] bg-white/10 backdrop-blur-sm border border-white/15 text-white/80 mb-2"
                    animate={{ y: isHovered ? 0 : 8, opacity: isHovered ? 1 : 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                >
                    {item.category}
                </motion.span>

                {/* Title */}
                <motion.h3
                    className="text-white font-bold text-sm sm:text-base leading-tight drop-shadow-lg"
                    animate={{ y: isHovered ? 0 : 6 }}
                    transition={{ duration: 0.35, ease: EASE }}
                >
                    {item.label}
                </motion.h3>

                {/* Description (only on hover) */}
                <motion.p
                    className="text-white/50 text-xs mt-1 leading-relaxed"
                    animate={{ y: isHovered ? 0 : 10, opacity: isHovered ? 1 : 0 }}
                    transition={{ duration: 0.35, delay: 0.05, ease: EASE }}
                >
                    {item.desc}
                </motion.p>

                {/* Gold accent underline */}
                <motion.div
                    className="w-8 h-0.5 bg-gradient-to-r from-amber-400 to-orange-500 rounded-full mt-2.5"
                    animate={{ width: isHovered ? 32 : 0, opacity: isHovered ? 1 : 0 }}
                    transition={{ duration: 0.3, delay: 0.08 }}
                />
            </motion.div>

            {/* Border glow on hover */}
            <motion.div
                className="absolute inset-0 rounded-2xl pointer-events-none"
                animate={{
                    boxShadow: isHovered
                        ? "inset 0 0 0 1.5px rgba(245,158,11,0.35), 0 0 30px rgba(245,158,11,0.12)"
                        : "inset 0 0 0 1px rgba(255,255,255,0.06), 0 0 0 transparent",
                }}
                transition={{ duration: 0.35 }}
            />

            {/* Featured badge */}
            {item.featured && (
                <div className="absolute top-4 left-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 backdrop-blur-md border border-amber-500/30 text-amber-400">
                    <Sparkles className="w-3 h-3" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">Featured</span>
                </div>
            )}
        </motion.div>
    );
}

/* ═══════════════════════════════════════
   Lightbox Component
═══════════════════════════════════════ */
function Lightbox({
    items,
    currentIndex,
    onClose,
    onNavigate,
    onGoTo,
}: {
    items: readonly (typeof galleryData)[number][];
    currentIndex: number;
    onClose: () => void;
    onNavigate: (dir: -1 | 1) => void;
    onGoTo: (index: number) => void;
}) {
    const item = items[currentIndex];
    const [imgSrc, setImgSrc] = useState<string>(item.src);

    useEffect(() => {
        setImgSrc(item.src);
    }, [item.src]);

    // Keyboard navigation
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowLeft") onNavigate(-1);
            if (e.key === "ArrowRight") onNavigate(1);
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose, onNavigate]);

    return (
        <motion.div
            variants={lightboxVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-50 flex items-center justify-center"
            onClick={onClose}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/92 backdrop-blur-xl" />

            {/* Close button */}
            <button
                onClick={onClose}
                className="absolute top-6 right-6 z-[60] w-11 h-11 rounded-full bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-all duration-200"
            >
                <X className="w-5 h-5" />
            </button>

            {/* Navigation arrows */}
            <button
                onClick={(e) => { e.stopPropagation(); onNavigate(-1); }}
                className="absolute left-4 sm:left-8 z-[60] w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-all duration-200"
            >
                <ChevronLeft className="w-5 h-5" />
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); onNavigate(1); }}
                className="absolute right-4 sm:right-8 z-[60] w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-all duration-200"
            >
                <ChevronRight className="w-5 h-5" />
            </button>

            {/* Image container */}
            <div
                className="relative z-[55] w-full max-w-5xl mx-6 sm:mx-10"
                onClick={(e) => e.stopPropagation()}
            >
                <AnimatePresence mode="wait">
                    <motion.div
                        key={item.id}
                        variants={lightboxImgVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="relative rounded-2xl overflow-hidden shadow-2xl"
                    >
                        <img
                            src={imgSrc}
                            alt={item.label}
                            onError={() => setImgSrc(FALLBACK_IMAGE)}
                            className="w-full h-auto max-h-[80vh] object-contain bg-zinc-950 rounded-2xl"
                        />

                        {/* Info bar at bottom */}
                        <div className="absolute bottom-0 inset-x-0 p-6 sm:p-8 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
                            <div className="flex items-end justify-between gap-4">
                                <div>
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.2em] bg-white/10 border border-white/15 text-white/70 mb-2">
                                        {item.category}
                                    </span>
                                    <h3 className="text-xl sm:text-2xl font-bold text-white drop-shadow-lg">
                                        {item.label}
                                    </h3>
                                    <p className="text-white/40 text-sm mt-1">{item.desc}</p>
                                </div>
                                <span className="text-white/25 text-sm font-mono whitespace-nowrap shrink-0">
                                    {currentIndex + 1} / {items.length}
                                </span>
                            </div>
                            <div className="w-12 h-0.5 bg-gradient-to-r from-amber-400 to-orange-500 rounded-full mt-4" />
                        </div>
                    </motion.div>
                </AnimatePresence>

                {/* Thumbnail strip */}
                <div className="flex items-center justify-center gap-2 mt-4 overflow-x-auto py-2 px-4">
                    {items.map((thumb, i) => (
                        <button
                            key={thumb.id}
                            onClick={() => onGoTo(i)}
                            className={cn(
                                "w-12 h-12 rounded-lg overflow-hidden border-2 transition-all duration-200 shrink-0",
                                i === currentIndex
                                    ? "border-amber-500 ring-2 ring-amber-500/30 scale-110"
                                    : "border-white/10 opacity-50 hover:opacity-80"
                            )}
                        >
                            <img src={thumb.src} alt="" className="w-full h-full object-cover" />
                        </button>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}

/* ═══════════════════════════════════════
   GALLERY PAGE
═══════════════════════════════════════ */
export default function Gallery() {
    return (
        <PageLayout>

            {/* ══════════════════════════════════
                CTA SECTION
            ══════════════════════════════════ */}
            <section className="relative py-28 px-6 overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-amber-500/[0.04] blur-[140px] rounded-full pointer-events-none" />

                <motion.div
                    variants={stagger}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-80px" }}
                    className="max-w-3xl mx-auto text-center relative z-10"
                >
                    <motion.h2
                        variants={fadeUp}
                        className="text-4xl md:text-5xl font-serif font-medium text-white tracking-tight mb-5"
                    >
                        Ready to see your car{" "}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 italic">
                            transformed?
                        </span>
                    </motion.h2>
                    <motion.p
                        variants={fadeUp}
                        className="text-white/35 text-base mb-10 font-light max-w-md mx-auto"
                    >
                        Book your premium detailing session today and join our portfolio of satisfied clients.
                    </motion.p>
                    <motion.div variants={fadeUp} className="flex items-center justify-center gap-4 flex-wrap">
                        <a href="/booking">
                            <motion.button
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.97 }}
                                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-2xl shadow-amber-500/30 hover:shadow-amber-500/50 transition-all duration-200 cursor-pointer"
                            >
                                Book Now <ArrowRight className="w-4 h-4" />
                            </motion.button>
                        </a>
                        <a href="/services">
                            <motion.button
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.97 }}
                                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-sm text-white/60 hover:text-white border border-white/15 hover:border-white/30 transition-all duration-200 cursor-pointer"
                            >
                                View Services
                            </motion.button>
                        </a>
                    </motion.div>
                </motion.div>
            </section>
        </PageLayout>
    );
}

