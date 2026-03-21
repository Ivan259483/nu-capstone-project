import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';

/* ── Easing ── */
const EASE = [0.16, 1, 0.3, 1] as const;

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 32, scale: 0.97 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: EASE } },
};

const stagger: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

/* ── Gallery items ── */
interface GalleryItem {
    src: string;
    label: string;
    tag: string;
    span?: 'wide' | 'tall' | 'normal';
}

const GALLERY_ITEMS: GalleryItem[] = [
    { src: '/images/login/lambo.png', label: 'Full PPF Wrap', tag: 'Paint Protection Film', span: 'wide' },
    { src: '/images/login/coating.png', label: 'Ceramic Coating', tag: 'Ceramic Coating', span: 'tall' },
    { src: '/images/login/porsche.png', label: 'Porsche Detail', tag: 'Exterior Detailing', span: 'normal' },
    { src: '/images/login/mclaren.png', label: 'McLaren PPF', tag: 'Full PPF Wrap', span: 'normal' },
    { src: '/images/login/interior.png', label: 'Interior Revival', tag: 'Interior Detailing', span: 'wide' },
    { src: '/images/login/correction.png', label: 'Paint Correction', tag: 'Paint Correction', span: 'normal' },
    { src: '/images/login/supercar.png', label: 'Supercar Finish', tag: 'Ceramic Coating', span: 'normal' },
    { src: '/images/login/hero.png', label: 'Elite Showroom', tag: 'Full Protection', span: 'tall' },
];

const INITIAL_COUNT = 6;

/* ── Span helpers ── */
const colSpan: Record<string, string> = {
    wide: 'sm:col-span-2',
    tall: '',
    normal: '',
};
const rowSpan: Record<string, string> = {
    wide: '',
    tall: 'row-span-2',
    normal: '',
};

/* ════════════════════════════════════════
   COMPONENT
════════════════════════════════════════ */
export default function GallerySection() {
    const [showAll, setShowAll] = useState(false);
    const visible = showAll ? GALLERY_ITEMS : GALLERY_ITEMS.slice(0, INITIAL_COUNT);

    return (
        <section id="gallery" className="relative py-28 px-6 overflow-hidden bg-[#0B1120]">
            {/* Ambient glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-orange-500/4 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-[400px] h-[300px] bg-indigo-500/4 blur-[100px] rounded-full pointer-events-none" />

            <div className="max-w-6xl mx-auto relative z-[1]">
                {/* ── Header ── */}
                <motion.div
                    variants={stagger} initial="hidden" whileInView="visible"
                    viewport={{ once: true, margin: '-80px' }}
                    className="text-center mb-14"
                >
                    <motion.p variants={fadeUp}
                        className="text-[11px] uppercase tracking-[0.4em] text-orange-400/70 font-semibold mb-3">
                        Our Work
                    </motion.p>
                    <motion.h2 variants={fadeUp}
                        className="text-4xl md:text-6xl font-serif font-medium text-white tracking-tight mb-5">
                        The Gallery
                    </motion.h2>
                    <motion.p variants={fadeUp}
                        className="text-white/35 text-base max-w-md mx-auto font-light">
                        Every shot tells the story of obsessive craftsmanship. Real cars, real results.
                    </motion.p>
                </motion.div>

                {/* ── Masonry grid ── */}
                <motion.div
                    variants={stagger} initial="hidden" whileInView="visible"
                    viewport={{ once: true, margin: '-40px' }}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-[220px]"
                >
                    <AnimatePresence mode="popLayout">
                        {visible.map((item, i) => (
                            <motion.div
                                key={item.src}
                                variants={fadeUp}
                                layout
                                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.25 } }}
                                className={`relative group overflow-hidden rounded-2xl cursor-pointer
                                    border border-white/8 hover:border-orange-500/30 transition-colors duration-300
                                    ${colSpan[item.span ?? 'normal']} ${rowSpan[item.span ?? 'normal']}`}
                            >
                                {/* Image */}
                                <img
                                    src={item.src}
                                    alt={item.label}
                                    className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                                />

                                {/* Permanent dark gradient at bottom */}
                                <div className="absolute inset-0 bg-gradient-to-t from-[#0B1120]/80 via-transparent to-transparent" />

                                {/* Hover overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-[#0B1120]/90 via-[#0B1120]/30 to-transparent
                                                opacity-0 group-hover:opacity-100 transition-opacity duration-400" />

                                {/* Orange glow ring on hover */}
                                <div className="absolute inset-0 rounded-2xl ring-0 group-hover:ring-2 group-hover:ring-orange-500/40
                                                transition-all duration-300 pointer-events-none" />

                                {/* Bottom label */}
                                <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-1 group-hover:translate-y-0 transition-transform duration-300">
                                    <span className="block text-[10px] uppercase tracking-widest text-orange-400/80 font-semibold mb-0.5">
                                        {item.tag}
                                    </span>
                                    <p className="text-white font-semibold text-sm tracking-tight leading-tight">
                                        {item.label}
                                    </p>
                                </div>

                                {/* Item index badge */}
                                <div className="absolute top-4 right-4 w-7 h-7 rounded-full bg-black/40 backdrop-blur-sm
                                                border border-white/15 flex items-center justify-center
                                                opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <span className="text-[9px] font-bold text-white/70">
                                        {String(i + 1).padStart(2, '0')}
                                    </span>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </motion.div>

                {/* ── Show More / Less ── */}
                <motion.div
                    variants={fadeUp} initial="hidden" whileInView="visible"
                    viewport={{ once: true }}
                    className="mt-10 flex items-center justify-center gap-5"
                >
                    <button
                        onClick={() => setShowAll(v => !v)}
                        className="inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-semibold
                                   uppercase tracking-widest border border-white/15 text-white/50
                                   hover:border-orange-500/50 hover:text-orange-400 hover:bg-orange-500/5
                                   transition-all duration-300"
                    >
                        {showAll ? (
                            <><ChevronUp className="w-4 h-4" /> Show Less</>
                        ) : (
                            <><ChevronDown className="w-4 h-4" /> Show All {GALLERY_ITEMS.length} Photos</>
                        )}
                    </button>

                    <a href="/login"
                        className="inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-semibold
                                   text-white bg-gradient-to-r from-orange-500 to-amber-600
                                   hover:from-orange-600 hover:to-amber-700 shadow-lg shadow-orange-500/25
                                   transition-all duration-200">
                        Book a Detail <ArrowRight className="w-4 h-4" />
                    </a>
                </motion.div>
            </div>
        </section>
    );
}
