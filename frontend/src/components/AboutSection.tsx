import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { Shield, Star, Users } from 'lucide-react';

/* ── Easing ── */
const EASE = [0.16, 1, 0.3, 1] as const;

const slideLeft: Variants = {
    hidden: { opacity: 0, x: -60 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.85, ease: EASE } },
};

const slideRight: Variants = {
    hidden: { opacity: 0, x: 60 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.85, ease: EASE } },
};

const stagger: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

/* ── Stats ── */
const STATS = [
    { icon: Shield, value: '500+', label: 'Cars Protected' },
    { icon: Star, value: '100%', label: 'Satisfaction Rate' },
    { icon: Users, value: '5+ yrs', label: 'In the Game' },
];

/* ════════════════════════════════════════
   COMPONENT
════════════════════════════════════════ */
export default function AboutSection() {
    const sectionRef = useRef<HTMLElement>(null);
    const { scrollYProgress } = useScroll({
        target: sectionRef,
        offset: ['start end', 'end start'],
    });

    /* Gentle parallax — image drifts upward as user scrolls down */
    const imageY = useTransform(scrollYProgress, [0, 1], ['6%', '-6%']);

    return (
        <section
            id="about"
            ref={sectionRef}
            className="relative py-28 px-6 overflow-hidden"
        >
            {/* Ambient blobs */}
            <div className="absolute top-0 right-0 w-[500px] h-[400px] bg-gold/5 blur-[130px] rounded-full pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[400px] h-[300px] bg-zinc-800/20 blur-[110px] rounded-full pointer-events-none" />

            {/* Section border top */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/10 to-transparent" />

            <div className="max-w-6xl mx-auto relative z-[1]">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-20 items-center">

                    {/* ── LEFT: Text ── */}
                    <motion.div
                        variants={stagger}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: '-80px' }}
                    >
                        {/* Eyebrow */}
                        <motion.p variants={slideLeft}
                            className="text-[11px] uppercase tracking-[0.4em] text-gold/70 font-semibold mb-4">
                            Our Story
                        </motion.p>

                        {/* Headline */}
                        <motion.h2 variants={slideLeft}
                            className="text-4xl md:text-5xl lg:text-6xl font-serif font-medium tracking-tight leading-[1.05] mb-5">
                            The{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-gold italic">
                                AutoSPF+
                            </span>{' '}
                            Story
                        </motion.h2>

                        {/* Sub-header */}
                        <motion.p variants={slideLeft}
                            className="text-base font-semibold text-white/60 tracking-wide mb-6 uppercase">
                            Precision. Protection. Perfection.
                        </motion.p>

                        {/* Body */}
                        <motion.div variants={slideLeft} className="space-y-4 text-white/45 text-[15px] leading-[1.8] font-light mb-10">
                            <p>
                                AutoSPF+ was born from a simple conviction: every car deserves the same care lavished on
                                a supercar. Founded in Las Piñas City, we set out to bring world-class Paint Protection
                                Film, Nano Ceramic Coating, and deep-detail craftsmanship to Metro Manila — without
                                the premium-brand gatekeeping.
                            </p>
                            <p>
                                Our technicians are factory-certified and obsessive by nature. Every project starts with
                                a meticulous inspection, every panel receives equal attention, and no car leaves our
                                bay until it surpasses our — and your — expectations.
                            </p>
                            <p>
                                We don't just protect paint. We protect the relationship between a driver and their
                                machine. That philosophy is baked into everything we do, from the products we source
                                to the warranty we back them with.
                            </p>
                        </motion.div>

                        {/* Stats strip */}
                        <motion.div
                            variants={stagger}
                            className="flex items-center gap-8 flex-wrap"
                        >
                            {STATS.map(({ icon: Icon, value, label }) => (
                                <motion.div key={label} variants={fadeUp} className="group text-center sm:text-left">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-7 h-7 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center group-hover:bg-gold/20 transition-colors">
                                            <Icon className="w-3.5 h-3.5 text-gold" />
                                        </div>
                                        <p className="text-2xl font-black text-white tracking-tight">{value}</p>
                                    </div>
                                    <p className="text-[10px] uppercase tracking-widest text-white/30 font-medium pl-9">{label}</p>
                                </motion.div>
                            ))}
                        </motion.div>
                    </motion.div>

                    {/* ── RIGHT: Image with parallax ── */}
                    <motion.div
                        variants={slideRight}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: '-80px' }}
                        className="relative order-first lg:order-last"
                    >
                        {/* Glow behind image */}
                        <div className="absolute -inset-4 bg-gradient-to-br from-gold/10 via-transparent to-zinc-500/10 blur-3xl rounded-3xl pointer-events-none" />

                        {/* Parallax wrapper */}
                        <motion.div style={{ y: imageY }} className="relative">
                            <img
                                src="/images/login/supercar.png"
                                alt="AutoSPF+ detailing in action"
                                className="w-full h-[480px] lg:h-[580px] object-cover rounded-2xl shadow-2xl border border-gold/20"
                            />

                            {/* Subtle inner vignette */}
                            <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-[#0D0D12]/60 via-transparent to-transparent pointer-events-none" />

                            {/* Floating badge */}
                            <div className="absolute bottom-6 left-6 right-6">
                                <div className="glass inline-flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl">
                                    <div className="w-9 h-9 rounded-lg bg-gradient-gold flex items-center justify-center shrink-0 shadow-lg shadow-gold/20">
                                        <span className="text-black font-black text-xs">A+</span>
                                    </div>
                                    <div>
                                        <p className="text-white text-xs font-semibold leading-none mb-0.5">AutoSPF+ Certified</p>
                                        <p className="text-white/40 text-[10px]">Las Piñas City, Metro Manila</p>
                                    </div>
                                    <div className="ml-auto flex items-center gap-1">
                                        {[0, 1, 2, 3, 4].map(i => (
                                            <Star key={i} className="w-3 h-3 fill-gold text-gold" />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>

                </div>
            </div>
        </section>
    );
}
