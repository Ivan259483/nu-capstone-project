import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import type { Variants } from 'framer-motion';
import {
    Shield, Star, Users, ArrowRight, Search, Wrench,
    Sparkles, CheckCircle2, ChevronDown,
} from 'lucide-react';

/* ─────────────────────── Animation variants ─────────────────────── */
const EASE = [0.16, 1, 0.3, 1] as const;

const slideLeft: Variants = {
    hidden: { opacity: 0, x: -60 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.85, ease: EASE } },
};
const slideRight: Variants = {
    hidden: { opacity: 0, x: 60 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.85, ease: EASE } },
};
const fadeUp: Variants = {
    hidden: { opacity: 0, y: 32 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
};
const stagger: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.11, delayChildren: 0.05 } },
};

/* ─────────────────────── Data ─────────────────────── */
const STATS = [
    { icon: Shield, value: '500+', label: 'Cars Protected' },
    { icon: Star, value: '100%', label: 'Satisfaction Rate' },
    { icon: Users, value: '5+ yrs', label: 'In the Industry' },
];

const PROCESS = [
    {
        step: '01',
        icon: Search,
        title: 'Thorough Inspection',
        desc: 'We begin with a full surface assessment under controlled lighting — measuring paint depth, cataloguing imperfections, and building a bespoke treatment plan for your vehicle.',
    },
    {
        step: '02',
        icon: Wrench,
        title: 'Precision Preparation',
        desc: 'Every surface is decontaminated, clay-barred, and dried before any correction or protection is applied. No shortcuts. The prep is where the quality lives.',
    },
    {
        step: '03',
        icon: Sparkles,
        title: 'Expert Application',
        desc: 'Whether it\'s multi-stage correction, PPF installation, or ceramic coating, our certified technicians execute with clinical precision using only professional-grade products.',
    },
    {
        step: '04',
        icon: CheckCircle2,
        title: 'Final QC & Report',
        desc: 'Before handover, every panel is inspected under high-intensity lighting. You receive a full post-service report documenting what was done and how to maintain it.',
    },
];

/* ════════════════════════════════════════
   COMPONENT
════════════════════════════════════════ */
export default function AboutPage() {
    const heroRef = useRef<HTMLElement>(null);
    const storyRef = useRef<HTMLDivElement>(null);

    const { scrollYProgress: heroScroll } = useScroll({
        target: heroRef,
        offset: ['start start', 'end start'],
    });
    const { scrollYProgress: storyScroll } = useScroll({
        target: storyRef,
        offset: ['start end', 'end start'],
    });

    const heroBgY = useTransform(heroScroll, [0, 1], ['0%', '30%']);
    const heroOp = useTransform(heroScroll, [0, 0.8], [1, 0]);
    const imageY = useTransform(storyScroll, [0, 1], ['6%', '-6%']);

    return (
        <div className="bg-[#0B1120] text-white font-sans selection:bg-orange-500/30 overflow-x-hidden">
            {/* ══════════════════════════════════════
                HERO
            ══════════════════════════════════════ */}
            <section ref={heroRef} className="relative w-full h-[70vh] flex items-end overflow-hidden">
                {/* Parallax bg */}
                <motion.div
                    className="absolute inset-0 z-0 will-change-transform"
                    style={{ y: heroBgY }}
                    initial={{ scale: 1.1 }}
                    animate={{ scale: 1.0 }}
                    transition={{ duration: 2.4, ease: 'easeOut' }}
                >
                    <img
                        src="/images/login/porsche.png"
                        alt="Premium detailing hero"
                        className="w-full h-[115%] object-cover"
                    />
                </motion.div>

                {/* Overlays */}
                <div className="absolute inset-0 z-[1] bg-gradient-to-b from-[#0B1120]/60 via-[#0B1120]/20 to-[#0B1120]" />
                <div className="absolute inset-0 z-[1] bg-gradient-to-r from-[#0B1120]/70 via-transparent to-transparent" />

                {/* Hero copy */}
                <motion.div
                    className="relative z-[5] w-full max-w-6xl mx-auto px-6 pb-20"
                    variants={stagger} initial="hidden" animate="visible"
                    style={{ opacity: heroOp }}
                >
                    <motion.p variants={fadeUp}
                        className="text-[11px] uppercase tracking-[0.45em] text-orange-400/80 font-semibold mb-4">
                        Who We Are
                    </motion.p>
                    <motion.h1 variants={fadeUp}
                        className="text-5xl sm:text-7xl lg:text-8xl font-serif font-medium tracking-tight leading-[0.95] mb-6">
                        The{' '}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-500 italic">
                            AutoSPF+
                        </span>
                        <br />Story
                    </motion.h1>
                    <motion.p variants={fadeUp}
                        className="text-white/40 text-base md:text-lg font-light max-w-lg">
                        Precision. Protection. Perfection. — Las Piñas City, Metro Manila.
                    </motion.p>
                </motion.div>

                {/* Scroll hint */}
                <motion.div
                    className="absolute bottom-6 right-8 z-[5] flex flex-col items-center gap-1.5"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2, duration: 0.8 }}
                >
                    <span className="text-[9px] uppercase tracking-[0.4em] text-white/20 rotate-90 origin-center mb-3">
                        Scroll
                    </span>
                    <motion.div animate={{ y: [0, 5, 0] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}>
                        <ChevronDown className="w-4 h-4 text-white/20" />
                    </motion.div>
                </motion.div>
            </section>

            {/* ══════════════════════════════════════
                OUR STORY
            ══════════════════════════════════════ */}
            <section className="relative py-28 px-6 overflow-hidden">
                <div className="absolute top-0 right-0 w-[500px] h-[400px] bg-orange-500/4 blur-[130px] rounded-full pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[300px] bg-indigo-500/4 blur-[110px] rounded-full pointer-events-none" />

                <div ref={storyRef} className="max-w-6xl mx-auto">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-20 items-center">

                        {/* Left: text */}
                        <motion.div
                            variants={stagger} initial="hidden"
                            whileInView="visible" viewport={{ once: true, margin: '-80px' }}
                        >
                            <motion.p variants={slideLeft}
                                className="text-[11px] uppercase tracking-[0.4em] text-orange-400/70 font-semibold mb-4">
                                Our Story
                            </motion.p>
                            <motion.h2 variants={slideLeft}
                                className="text-4xl md:text-5xl font-serif font-medium tracking-tight leading-[1.05] mb-5">
                                Built on a{' '}
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-500 italic">
                                    passion
                                </span>{' '}
                                for perfection.
                            </motion.h2>
                            <motion.p variants={slideLeft}
                                className="text-sm font-semibold text-white/50 tracking-widest mb-7 uppercase">
                                Precision · Protection · Perfection
                            </motion.p>

                            <motion.div variants={slideLeft} className="space-y-4 text-white/45 text-[15px] leading-[1.85] font-light mb-10">
                                <p>
                                    AutoSPF+ was born from a simple conviction: every car deserves the same
                                    obsessive care lavished on a supercar. Founded in Las Piñas City, we set out
                                    to bring world-class Paint Protection Film, Nano Ceramic Coating, and
                                    deep-detail craftsmanship to Metro Manila — without the premium-brand gatekeeping.
                                </p>
                                <p>
                                    Our technicians are factory-certified and obsessive by nature. Every project
                                    starts with a meticulous inspection, every panel receives equal attention, and
                                    no vehicle leaves our bay until it surpasses our — and your — expectations.
                                </p>
                                <p>
                                    We don't just protect paint. We protect the relationship between a driver and
                                    their machine. That philosophy is baked into everything we do: the products we
                                    source, the coatings we apply, and the warranty we stand behind.
                                </p>
                            </motion.div>

                            {/* Stats */}
                            <motion.div variants={stagger} className="flex items-center gap-8 flex-wrap mb-10">
                                {STATS.map(({ icon: Icon, value, label }) => (
                                    <motion.div key={label} variants={fadeUp} className="group">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
                                                <Icon className="w-3.5 h-3.5 text-orange-400" />
                                            </div>
                                            <p className="text-2xl font-black text-white tracking-tight">{value}</p>
                                        </div>
                                        <p className="text-[10px] uppercase tracking-widest text-white/30 font-medium pl-9">{label}</p>
                                    </motion.div>
                                ))}
                            </motion.div>

                            <motion.div variants={fadeUp}>
                                <Link to="/login">
                                    <motion.span
                                        whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                                        className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm text-white
                                                   bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700
                                                   shadow-xl shadow-orange-500/25 transition-all duration-200 cursor-pointer"
                                    >
                                        Book a Session <ArrowRight className="w-4 h-4" />
                                    </motion.span>
                                </Link>
                            </motion.div>
                        </motion.div>

                        {/* Right: image with parallax */}
                        <motion.div
                            variants={slideRight} initial="hidden"
                            whileInView="visible" viewport={{ once: true, margin: '-80px' }}
                            className="relative"
                        >
                            <div className="absolute -inset-4 bg-gradient-to-br from-orange-500/8 via-transparent to-indigo-500/8 blur-3xl rounded-3xl pointer-events-none" />
                            <motion.div style={{ y: imageY }}>
                                <img
                                    src="/images/login/supercar.png"
                                    alt="AutoSPF+ detailing"
                                    className="w-full h-[500px] lg:h-[600px] object-cover rounded-2xl shadow-2xl border border-white/10"
                                />
                                <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-[#0B1120]/50 via-transparent to-transparent pointer-events-none" />

                                {/* Floating badge */}
                                <div className="absolute bottom-6 left-6 right-6">
                                    <div className="inline-flex items-center gap-3 px-4 py-3 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 shadow-xl">
                                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/30">
                                            <span className="text-white font-black text-xs">A+</span>
                                        </div>
                                        <div>
                                            <p className="text-white text-xs font-semibold leading-none mb-0.5">AutoSPF+ Certified</p>
                                            <p className="text-white/40 text-[10px]">Las Piñas City, Metro Manila</p>
                                        </div>
                                        <div className="ml-auto flex items-center gap-0.5">
                                            {[...Array(5)].map((_, i) => (
                                                <Star key={i} className="w-3 h-3 fill-orange-400 text-orange-400" />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════
                OUR PROCESS
            ══════════════════════════════════════ */}
            <section className="relative py-28 px-6 overflow-hidden border-t border-white/5">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-500/4 blur-[120px] rounded-full pointer-events-none" />

                <div className="max-w-6xl mx-auto relative z-[1]">
                    <motion.div
                        variants={stagger} initial="hidden" whileInView="visible"
                        viewport={{ once: true, margin: '-80px' }}
                        className="text-center mb-16"
                    >
                        <motion.p variants={fadeUp}
                            className="text-[11px] uppercase tracking-[0.4em] text-orange-400/70 font-semibold mb-3">
                            How We Work
                        </motion.p>
                        <motion.h2 variants={fadeUp}
                            className="text-4xl md:text-6xl font-serif font-medium text-white tracking-tight mb-5">
                            Our Process
                        </motion.h2>
                        <motion.p variants={fadeUp}
                            className="text-white/35 text-base max-w-md mx-auto font-light">
                            A repeatable, four-step framework built around one goal — a result that speaks for itself.
                        </motion.p>
                    </motion.div>

                    <motion.div
                        variants={stagger} initial="hidden" whileInView="visible"
                        viewport={{ once: true, margin: '-40px' }}
                        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
                    >
                        {PROCESS.map(({ step, icon: Icon, title, desc }) => (
                            <motion.div
                                key={step}
                                variants={fadeUp}
                                whileHover={{ y: -6, transition: { duration: 0.2 } }}
                                className="group relative p-7 rounded-2xl border border-white/8 bg-white/[0.04]
                                           hover:border-orange-500/25 hover:bg-white/[0.07] transition-all duration-300"
                            >
                                {/* Step number watermark */}
                                <span className="absolute top-5 right-5 text-5xl font-black text-white/4 select-none leading-none">
                                    {step}
                                </span>

                                <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20
                                                flex items-center justify-center mb-5
                                                group-hover:bg-orange-500/15 group-hover:border-orange-500/30 transition-all">
                                    <Icon className="w-5 h-5 text-orange-400" />
                                </div>

                                <h3 className="text-base font-semibold text-white tracking-tight mb-3">{title}</h3>
                                <p className="text-white/40 text-sm leading-relaxed font-light">{desc}</p>
                            </motion.div>
                        ))}
                    </motion.div>
                </div>
            </section>

            {/* ══════════════════════════════════════
                CTA STRIP
            ══════════════════════════════════════ */}
            <section className="relative py-20 px-6 border-t border-white/5 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-orange-500/4 via-transparent to-amber-500/4 pointer-events-none" />
                <motion.div
                    className="max-w-3xl mx-auto text-center relative z-[1]"
                    variants={stagger} initial="hidden" whileInView="visible"
                    viewport={{ once: true, margin: '-60px' }}
                >
                    <motion.h2 variants={fadeUp}
                        className="text-3xl md:text-5xl font-serif font-medium text-white tracking-tight mb-5">
                        Ready to protect your{' '}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-500 italic">
                            investment?
                        </span>
                    </motion.h2>
                    <motion.p variants={fadeUp} className="text-white/35 text-base mb-9 font-light">
                        Book your free consultation today. No pressure — just honest advice from people who love cars.
                    </motion.p>
                    <motion.div variants={fadeUp} className="flex items-center justify-center gap-4 flex-wrap">
                        <Link to="/login">
                            <motion.span
                                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-sm text-white
                                           bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700
                                           shadow-2xl shadow-orange-500/30 hover:shadow-orange-500/50 transition-all duration-200 cursor-pointer"
                            >
                                Get Started <ArrowRight className="w-4 h-4" />
                            </motion.span>
                        </Link>
                        <Link to="/">
                            <span className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold text-white/50
                                            hover:text-white border border-white/12 hover:border-white/25 transition-all duration-200">
                                Back to Home
                            </span>
                        </Link>
                    </motion.div>
                </motion.div>
            </section>

            {/* ══════════════════════════════════════
                FOOTER
            ══════════════════════════════════════ */}
            <footer className="border-t border-white/5 py-8 px-8">
                <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                            <span className="text-white font-black text-[10px]">A+</span>
                        </div>
                        <span className="text-white/30 text-xs font-medium">
                            AutoSPF<span className="text-orange-400/60">+</span>
                        </span>
                    </div>
                    <p className="text-[11px] text-white/20">© 2026 AutoSPF+ Inc. All rights reserved.</p>
                    <div className="flex items-center gap-6 text-[11px] text-white/25">
                        <button className="hover:text-white/50 transition-colors">Privacy</button>
                        <button className="hover:text-white/50 transition-colors">Terms</button>
                        <Link to="/#contact" className="hover:text-white/50 transition-colors">Contact</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
