import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, ChevronDown, Shield, Zap, Star, CheckCircle2, Award, Clock, Users } from 'lucide-react';
import ContactSection from '@/components/ContactSection';
import GallerySection from '@/components/GallerySection';
import Pricing from '@/components/Pricing';
import AboutSection from '@/components/AboutSection';

/* ── Assets ── */
const HERO_IMAGE = '/images/login/hero.png';
const COATING_IMG = '/images/login/coating.png';
const INTERIOR_IMG = '/images/login/interior.png';
const CORRECTION_IMG = '/images/login/correction.png';

import type { Variants } from 'framer-motion';

/* ── Framer variants ── */
const EASE = [0.16, 1, 0.3, 1] as const;

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

const stagger: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.13 } },
};

/* ── Service card data ── */
const SERVICES = [
    {
        title: 'Paint Protection Film',
        subtitle: 'Invisible armour',
        desc: 'Military-grade urethane film that shields your paint from rock chips, scratches, and UV degradation — virtually invisible.',
        image: COATING_IMG,
        badge: 'Most Popular',
        badgeColor: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
        features: ['Self-healing top coat', '10-year warranty', 'Hydrophobic surface'],
        icon: Shield,
        glow: 'rgba(249,115,22,0.15)',
    },
    {
        title: 'Interior Detailing',
        subtitle: 'Pristine sanctuary',
        desc: 'Deep-clean every surface, leather conditioning, and odour elimination — restoring that unmistakable new-car feel.',
        image: INTERIOR_IMG,
        badge: 'Premium',
        badgeColor: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
        features: ['Leather restoration', 'Steam sanitisation', 'Fabric protection'],
        icon: Star,
        glow: 'rgba(99,102,241,0.15)',
    },
    {
        title: 'Paint Correction',
        subtitle: 'Mirror finish',
        desc: 'Multi-stage machine polishing erases swirl marks, holograms, and oxidation — revealing the true depth of your factory paint.',
        image: CORRECTION_IMG,
        badge: 'Expert Level',
        badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        features: ['2-stage correction', 'Paint depth analysis', 'Ceramic top coat'],
        icon: Zap,
        glow: 'rgba(16,185,129,0.15)',
    },
];

/* ── Stats ── */
const STATS = [
    { icon: Award, value: '500+', label: 'Cars Detailed' },
    { icon: Clock, value: '8 yrs', label: 'In Business' },
    { icon: Users, value: '98%', label: 'Satisfaction Rate' },
    { icon: Star, value: '4.9★', label: 'Average Rating' },
];

/* ════════════════════════════════════════
   COMPONENT
════════════════════════════════════════ */
export default function LandingPage() {
    const heroRef = useRef<HTMLDivElement>(null);
    const { scrollY } = useScroll();

    /* Parallax: image moves up at half scroll speed */
    const bgY = useTransform(scrollY, [0, 700], ['0%', '20%']);
    const heroOp = useTransform(scrollY, [0, 500], [1, 0]);

    const scrollToServices = () => {
        document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <div className="bg-[#0B1120] text-white font-sans selection:bg-orange-500/30 overflow-x-hidden">
            {/* ══════════════════════════════════════
                HERO — full-screen immersive
            ══════════════════════════════════════ */}
            <section ref={heroRef} className="relative w-full h-screen overflow-hidden flex items-center justify-center">

                {/* Parallax background */}
                <motion.div
                    className="absolute inset-0 z-0 will-change-transform"
                    style={{ y: bgY }}
                    initial={{ scale: 1.12 }}
                    animate={{ scale: 1.0 }}
                    transition={{ duration: 2.8, ease: 'easeOut' }}
                >
                    <img src={HERO_IMAGE} alt="AutoSPF+ hero" className="w-full h-[115%] object-cover" />
                </motion.div>

                {/* Overlays */}
                <div className="absolute inset-0 z-[1] bg-gradient-to-b from-[#0B1120]/70 via-[#0B1120]/35 to-[#0B1120]/90" />
                <div className="absolute inset-0 z-[1] bg-gradient-to-r from-[#0B1120]/50 via-transparent to-transparent" />

                {/* Giant wordmark */}
                <motion.div
                    className="absolute inset-0 z-[2] flex items-center justify-center pointer-events-none select-none overflow-hidden"
                    initial={{ opacity: 0, y: -30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                    style={{ opacity: heroOp }}
                >
                    <span
                        className="text-[22vw] xl:text-[18vw] font-black uppercase tracking-tighter leading-none whitespace-nowrap"
                        style={{ color: 'transparent', WebkitTextStroke: '1.5px rgba(255,255,255,0.055)' }}
                    >
                        AUTOSPF+
                    </span>
                </motion.div>

                {/* Hero copy */}
                <motion.div
                    className="relative z-[5] text-center px-6 max-w-5xl"
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1.1, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
                    style={{ opacity: heroOp }}
                >
                    <p className="text-[11px] uppercase tracking-[0.45em] text-orange-400/80 font-semibold mb-5">
                        Premium Automotive Detailing
                    </p>
                    <h1 className="text-6xl sm:text-8xl lg:text-[110px] font-serif font-medium text-white tracking-tight drop-shadow-2xl leading-[0.92] mb-8">
                        Defined by<br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-500 italic">
                            Detail.
                        </span>
                    </h1>
                    <p className="text-white/40 text-base md:text-lg font-light max-w-xl mx-auto mb-10">
                        Where every surface is treated as a canvas. Book your premium detailing session today.
                    </p>
                    <div className="flex items-center justify-center gap-4 flex-wrap">
                        <Link to="/login">
                            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 shadow-xl shadow-orange-500/30 transition-all duration-200 cursor-pointer"
                            >
                                Book Now <ArrowRight className="w-4 h-4" />
                            </motion.div>
                        </Link>
                        <button onClick={scrollToServices}
                            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm text-white/70 hover:text-white border border-white/15 hover:border-white/30 backdrop-blur-sm transition-all duration-200"
                        >
                            Our Services
                        </button>
                    </div>
                </motion.div>

                {/* Scroll indicator */}
                <motion.button
                    onClick={scrollToServices}
                    className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[5] flex flex-col items-center gap-2 cursor-pointer group"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 1.6 }}
                    style={{ opacity: heroOp }}
                >
                    <span className="text-[10px] uppercase tracking-[0.4em] text-white/25 group-hover:text-white/50 transition-colors font-medium">
                        Scroll to Explore
                    </span>
                    <motion.div animate={{ y: [0, 6, 0] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}>
                        <ChevronDown className="w-5 h-5 text-white/25 group-hover:text-orange-400 transition-colors" />
                    </motion.div>
                </motion.button>
            </section>

            {/* ══════════════════════════════════════
                STATS STRIP
            ══════════════════════════════════════ */}
            <section className="relative py-14 border-y border-white/5 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-500/3 to-transparent" />
                <motion.div
                    variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }}
                    className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8"
                >
                    {STATS.map(({ icon: Icon, value, label }) => (
                        <motion.div key={label} variants={fadeUp} className="text-center group">
                            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center mx-auto mb-3 group-hover:bg-orange-500/10 group-hover:border-orange-500/20 transition-all duration-300">
                                <Icon className="w-5 h-5 text-white/30 group-hover:text-orange-400 transition-colors" />
                            </div>
                            <p className="text-3xl font-bold tracking-tight text-white mb-1">{value}</p>
                            <p className="text-xs text-white/30 uppercase tracking-widest font-medium">{label}</p>
                        </motion.div>
                    ))}
                </motion.div>
            </section>

            {/* ══════════════════════════════════════
                SERVICES SECTION
            ══════════════════════════════════════ */}
            <section id="services" className="relative py-28 px-6 overflow-hidden">
                {/* Ambient blobs */}
                <div className="absolute top-20 left-10 w-96 h-96 bg-indigo-500/4 blur-[120px] rounded-full pointer-events-none" />
                <div className="absolute bottom-10 right-10 w-80 h-80 bg-orange-500/5 blur-[100px] rounded-full pointer-events-none" />

                <div className="max-w-6xl mx-auto">
                    {/* Section header */}
                    <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} className="text-center mb-16">
                        <motion.p variants={fadeUp} className="text-[11px] uppercase tracking-[0.4em] text-orange-400/70 font-semibold mb-3">
                            What We Offer
                        </motion.p>
                        <motion.h2 variants={fadeUp} className="text-4xl md:text-6xl font-serif font-medium text-white tracking-tight mb-5">
                            Premium Services
                        </motion.h2>
                        <motion.p variants={fadeUp} className="text-white/35 text-base max-w-lg mx-auto font-light">
                            Every service is performed by certified detailers using only the finest professional-grade products.
                        </motion.p>
                    </motion.div>

                    {/* Service cards */}
                    <motion.div
                        variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }}
                        className="grid grid-cols-1 md:grid-cols-3 gap-6"
                    >
                        {SERVICES.map(({ title, subtitle, desc, image, badge, badgeColor, features, icon: Icon, glow }) => (
                            <motion.div
                                key={title}
                                variants={fadeUp}
                                whileHover={{ y: -8, transition: { duration: 0.25 } }}
                                className="group relative rounded-2xl overflow-hidden border border-white/10 bg-white/[0.04] backdrop-blur-sm hover:border-white/20 transition-all duration-300"
                                style={{ boxShadow: `0 0 0 0 ${glow}` }}
                                whileInView={{ boxShadow: `0 20px 60px ${glow}` } as any}
                            >
                                {/* Card image */}
                                <div className="relative h-52 overflow-hidden">
                                    <img
                                        src={image} alt={title}
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-70"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#0B1120] via-[#0B1120]/40 to-transparent" />
                                    {/* Badge */}
                                    <span className={`absolute top-4 left-4 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${badgeColor}`}>
                                        {badge}
                                    </span>
                                    {/* Icon */}
                                    <div className="absolute bottom-4 right-4 w-9 h-9 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 flex items-center justify-center">
                                        <Icon className="w-4 h-4 text-white/70" />
                                    </div>
                                </div>

                                {/* Card content */}
                                <div className="p-6">
                                    <p className="text-[10px] uppercase tracking-widest text-white/30 font-medium mb-1">{subtitle}</p>
                                    <h3 className="text-xl font-semibold text-white tracking-tight mb-3">{title}</h3>
                                    <p className="text-white/40 text-sm leading-relaxed mb-5 font-light">{desc}</p>

                                    {/* Feature list */}
                                    <ul className="space-y-2 mb-6">
                                        {features.map(f => (
                                            <li key={f} className="flex items-center gap-2.5 text-xs text-white/50">
                                                <CheckCircle2 className="w-3.5 h-3.5 text-orange-500/70 shrink-0" />
                                                {f}
                                            </li>
                                        ))}
                                    </ul>

                                    <Link to="/login">
                                        <button className="w-full h-10 rounded-xl text-xs font-semibold uppercase tracking-wider text-white/60 hover:text-white border border-white/10 hover:border-orange-500/40 hover:bg-orange-500/8 transition-all duration-200 flex items-center justify-center gap-2 group/btn">
                                            Book This Service
                                            <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform" />
                                        </button>
                                    </Link>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                </div>
            </section>

            {/* ══════════════════════════════════════
                ABOUT SECTION
            ══════════════════════════════════════ */}
            <AboutSection />

            {/* ══════════════════════════════════════
                GALLERY SECTION
            ══════════════════════════════════════ */}
            <GallerySection />

            {/* ══════════════════════════════════════
                PRICING SECTION
            ══════════════════════════════════════ */}
            <Pricing />

            {/* ══════════════════════════════════════
                CTA SECTION
            ══════════════════════════════════════ */}
            <section className="relative py-28 px-6 overflow-hidden">
                <motion.div
                    className="max-w-3xl mx-auto text-center"
                    variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }}
                >
                    <motion.p variants={fadeUp} className="text-[11px] uppercase tracking-[0.4em] text-orange-400/70 font-semibold mb-4">
                        Ready?
                    </motion.p>
                    <motion.h2 variants={fadeUp} className="text-5xl md:text-7xl font-serif font-medium text-white tracking-tight mb-6">
                        Elevate your<br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-500 italic">drive today.</span>
                    </motion.h2>
                    <motion.p variants={fadeUp} className="text-white/35 text-base mb-10 font-light max-w-md mx-auto">
                        Join hundreds of automotive enthusiasts who trust AutoSPF+ with their most prized possessions.
                    </motion.p>
                    <motion.div variants={fadeUp} className="flex items-center justify-center gap-4 flex-wrap">
                        <Link to="/login">
                            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 shadow-2xl shadow-orange-500/30 hover:shadow-orange-500/50 transition-all duration-200 cursor-pointer"
                            >
                                Get Started <ArrowRight className="w-4 h-4" />
                            </motion.div>
                        </Link>
                    </motion.div>
                </motion.div>
            </section>

            {/* ══════════════════════════════════════
                CONTACT SECTION
            ══════════════════════════════════════ */}
            <ContactSection />

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
                    <div className="flex items-center gap-6 text-[11px] text-white/25 hover:[&>*]:text-white/60 transition-colors">
                        <button className="transition-colors">Privacy</button>
                        <button className="transition-colors">Terms</button>
                        <button className="transition-colors">Contact</button>
                    </div>
                </div>
            </footer>
        </div>
    );
}
