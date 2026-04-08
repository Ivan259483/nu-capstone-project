import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
    ArrowRight, ChevronDown, Shield, Zap, Star, CheckCircle2,
    Award, Clock, Users, Droplets, Palette, Eye, Gem, HandMetal,
    ScanLine, ShieldCheck
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useState, useEffect } from 'react';
import { SettingsService } from '@/lib/settings-service';
import type { BusinessSettings } from '@/types';
import ContactSection from '@/components/ContactSection';
import GallerySection from '@/components/GallerySection';
import AboutSection from '@/components/AboutSection';
import FAQSection from '@/components/FAQSection';

import type { Variants } from 'framer-motion';

/* ── Assets ── */
const HERO_IMAGE = '/images/login/hero.png';
const COATING_IMG = '/images/login/coating.png';
const INTERIOR_IMG = '/images/login/interior.png';
const CORRECTION_IMG = '/images/login/correction.png';

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

const scaleIn: Variants = {
    hidden: { opacity: 0, scale: 0.85 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: EASE } },
};

const cardReveal: Variants = {
    hidden: { opacity: 0, y: 60, rotateX: 8, scale: 0.95 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        rotateX: 0,
        scale: 1,
        transition: { duration: 0.65, ease: EASE, delay: i * 0.1 },
    }),
};

const featureItem: Variants = {
    hidden: { opacity: 0, x: -12 },
    visible: (i: number) => ({
        opacity: 1,
        x: 0,
        transition: { duration: 0.35, ease: 'easeOut', delay: 0.4 + i * 0.08 },
    }),
};

const shimmer: Variants = {
    hidden: { x: '-100%' },
    visible: { x: '200%', transition: { duration: 2, ease: 'easeInOut', repeat: Infinity, repeatDelay: 4 } },
};

/* ── Service card data (expanded to 6) ── */
export const SERVICES = [
    {
        title: 'Paint Protection Film',
        subtitle: 'Invisible armour',
        desc: 'Military-grade self-healing urethane film that shields against rock chips, scratches, and UV degradation — virtually invisible, infinitely durable.',
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
        desc: 'Deep-clean every surface, leather conditioning, and odour elimination — restoring that unmistakable new-car feel from the inside out.',
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
    {
        title: 'Ceramic Coating',
        subtitle: 'Diamond shield',
        desc: 'Nano-ceramic technology that bonds to your paint at a molecular level, delivering years of hydrophobic protection with a candy-like gloss.',
        image: COATING_IMG,
        badge: 'Best Seller',
        badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        features: ['9H hardness rating', 'UV & chemical resistance', '5-year protection'],
        icon: Gem,
        glow: 'rgba(245,158,11,0.15)',
    },
    {
        title: 'Exterior Detailing',
        subtitle: 'Showroom finish',
        desc: 'A meticulous hand wash, clay bar decontamination, and protective wax finish that makes your vehicle look better than the day you bought it.',
        image: CORRECTION_IMG,
        badge: 'Essential',
        badgeColor: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
        features: ['Clay bar treatment', 'Tire & trim dressing', 'Glass polishing'],
        icon: Droplets,
        glow: 'rgba(6,182,212,0.12)',
    },
    {
        title: 'Full Detail Package',
        subtitle: 'The ultimate',
        desc: 'Our flagship service — a comprehensive inside-out restoration combining paint correction, ceramic coating, interior deep-clean, and engine bay detail.',
        image: INTERIOR_IMG,
        badge: 'Flagship',
        badgeColor: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
        features: ['Complete restoration', 'Multi-day process', 'Certificate of care'],
        icon: Palette,
        glow: 'rgba(244,63,94,0.12)',
    },
];

/* ── Stats ── */
export const STATS = [
    { icon: Award, value: '500+', label: 'Cars Detailed' },
    { icon: Clock, value: '8 yrs', label: 'In Business' },
    { icon: Users, value: '98%', label: 'Satisfaction Rate' },
    { icon: Star, value: '4.9★', label: 'Average Rating' },
];

/* ── Process Steps ── */
const PROCESS_STEPS = [
    {
        num: '01',
        title: 'Consultation',
        desc: "We assess your vehicle's condition, discuss your goals, and recommend the ideal service package.",
        icon: Eye,
        accent: 'from-orange-500 to-amber-600',
    },
    {
        num: '02',
        title: 'Inspection',
        desc: 'A thorough paint depth scan and 360° inspection to document every imperfection before we begin.',
        icon: ScanLine,
        accent: 'from-indigo-500 to-violet-600',
    },
    {
        num: '03',
        title: 'Execution',
        desc: 'Our certified technicians execute each step with surgical precision using world-class products.',
        icon: HandMetal,
        accent: 'from-emerald-500 to-teal-600',
    },
    {
        num: '04',
        title: 'Quality Assurance',
        desc: 'Final inspection under studio lighting ensures every surface meets our exacting standards.',
        icon: ShieldCheck,
        accent: 'from-rose-500 to-pink-600',
    },
];

/* ── Brands / Trust strip ── */
const TRUST_LABELS = ['XPEL', 'Gtechniq', 'Gyeon', 'Koch Chemie', 'CarPro', 'Rupes'];

/* ════════════════════════════════════════
   COMPONENT
════════════════════════════════════════ */
export default function LandingPage() {
    const heroRef = useRef<HTMLDivElement>(null);
    const { scrollY } = useScroll();

    const [publicData, setPublicData] = useState<BusinessSettings | null>(null);

    useEffect(() => {
        const fetchPublicSettings = async () => {
            const res = await SettingsService.getPublicSettings();
            if (res.success) {
                setPublicData(res.data);
            }
        };
        fetchPublicSettings();
    }, []);

    const dynamicLanding = publicData?.landingDetails;
    const activeServices = dynamicLanding?.services?.length > 0 ? dynamicLanding.services : SERVICES;
    const activeStats = dynamicLanding?.stats?.length > 0 ? dynamicLanding.stats : STATS;

    const getDynamicIcon = (name: any, Fallback: any) => {
        if (!name) return Fallback;
        if (typeof name !== 'string') return name;
        const IconMatch = (LucideIcons as any)[name] || (LucideIcons as any)[name.charAt(0).toUpperCase() + name.slice(1)];
        return IconMatch || Fallback;
    };

    /* Parallax */
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
                    {activeStats.map(({ icon, value, label }: any) => {
                        const Icon = getDynamicIcon(icon, Star);
                        return (
                        <motion.div key={label} variants={fadeUp} className="text-center group">
                            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center mx-auto mb-3 group-hover:bg-orange-500/10 group-hover:border-orange-500/20 transition-all duration-300">
                                <Icon className="w-5 h-5 text-white/30 group-hover:text-orange-400 transition-colors" />
                            </div>
                            <p className="text-3xl font-bold tracking-tight text-white mb-1">{value}</p>
                            <p className="text-xs text-white/30 uppercase tracking-widest font-medium">{label}</p>
                        </motion.div>
                    )})}
                </motion.div>
            </section>

            {/* ══════════════════════════════════════
                SERVICES SECTION — 6 premium cards
            ══════════════════════════════════════ */}
            <section id="services" className="relative py-32 px-6 overflow-hidden" style={{ perspective: '1400px' }}>
                {/* Ambient blobs */}
                <motion.div
                    className="absolute top-20 left-10 w-96 h-96 bg-indigo-500/4 blur-[120px] rounded-full pointer-events-none"
                    animate={{ scale: [1, 1.15, 1], opacity: [0.04, 0.07, 0.04] }}
                    transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                    className="absolute bottom-10 right-10 w-80 h-80 bg-orange-500/5 blur-[100px] rounded-full pointer-events-none"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.05, 0.09, 0.05] }}
                    transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
                />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[500px] bg-amber-500/[0.02] blur-[180px] rounded-full pointer-events-none" />

                <div className="max-w-7xl mx-auto">
                    {/* Section header */}
                    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} className="text-center mb-20">
                        <motion.p
                            variants={fadeUp}
                            className="text-[11px] uppercase tracking-[0.4em] text-orange-400/70 font-semibold mb-3 inline-flex items-center gap-2"
                        >
                            <motion.span
                                className="inline-block w-8 h-px bg-gradient-to-r from-transparent to-orange-400/40"
                                initial={{ scaleX: 0 }}
                                whileInView={{ scaleX: 1 }}
                                transition={{ duration: 0.8, delay: 0.3 }}
                                style={{ transformOrigin: 'left' }}
                            />
                            What We Offer
                            <motion.span
                                className="inline-block w-8 h-px bg-gradient-to-l from-transparent to-orange-400/40"
                                initial={{ scaleX: 0 }}
                                whileInView={{ scaleX: 1 }}
                                transition={{ duration: 0.8, delay: 0.3 }}
                                style={{ transformOrigin: 'right' }}
                            />
                        </motion.p>
                        <motion.h2
                            variants={fadeUp}
                            className="text-4xl md:text-6xl lg:text-7xl font-serif font-medium text-white tracking-tight mb-5"
                        >
                            Premium{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-500 italic">
                                Services
                            </span>
                        </motion.h2>
                        {/* Animated shimmer underline */}
                        <motion.div
                            className="relative w-24 h-[2px] mx-auto mb-6 overflow-hidden rounded-full"
                            initial={{ scaleX: 0 }}
                            whileInView={{ scaleX: 1 }}
                            transition={{ duration: 0.6, delay: 0.5 }}
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/30 via-amber-400/60 to-orange-500/30" />
                            <motion.div
                                className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent"
                                variants={shimmer}
                                initial="hidden"
                                animate="visible"
                            />
                        </motion.div>
                        <motion.p variants={fadeUp} className="text-white/35 text-base max-w-2xl mx-auto font-light">
                            Every service is performed by certified detailers using only the finest professional-grade products.
                            World-class results, right here in Metro Manila.
                        </motion.p>
                    </motion.div>

                    {/* Service cards — 3 columns */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {activeServices.map(({ title, subtitle, desc, image, badge, badgeColor, features, icon, glow }: any, idx: number) => {
                            const Icon = getDynamicIcon(icon, Shield);
                            return (
                            <motion.div
                                key={title || idx}
                                custom={idx}
                                variants={cardReveal}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true, margin: '-40px' }}
                                whileHover={{
                                    y: -12,
                                    scale: 1.02,
                                    transition: { duration: 0.35, ease: EASE },
                                }}
                                className="group relative rounded-2xl overflow-hidden border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm transition-all duration-500"
                                style={{
                                    boxShadow: `0 4px 30px ${glow || 'rgba(255,165,0,0.04)'}`,
                                }}
                            >
                                {/* Animated border glow on hover */}
                                <div
                                    className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none z-10"
                                    style={{
                                        boxShadow: `inset 0 0 0 1px rgba(249,115,22,0.2), 0 20px 80px ${glow || 'rgba(249,115,22,0.12)'}`,
                                    }}
                                />

                                {/* Card image */}
                                <div className="relative h-52 overflow-hidden">
                                    <motion.img
                                        src={image || COATING_IMG} alt={title}
                                        loading="lazy"
                                        className="w-full h-full object-cover opacity-70"
                                        whileHover={{ scale: 1.12 }}
                                        transition={{ duration: 0.8, ease: EASE }}
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#0B1120] via-[#0B1120]/40 to-transparent" />

                                    {/* Badge */}
                                    {badge && (
                                        <motion.span
                                            initial={{ opacity: 0, y: -10 }}
                                            whileInView={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.4, delay: 0.3 + idx * 0.1 }}
                                            className={`absolute top-4 left-4 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${badgeColor || 'bg-white/10 text-white/70 border-white/20'}`}
                                        >
                                            {badge}
                                        </motion.span>
                                    )}

                                    {/* Floating icon with glow */}
                                    <motion.div
                                        className="absolute bottom-4 right-4 w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 flex items-center justify-center group-hover:bg-orange-500/15 group-hover:border-orange-500/30 transition-all duration-300"
                                        whileHover={{ rotate: 12, scale: 1.15 }}
                                        transition={{ type: 'spring', stiffness: 300 }}
                                    >
                                        <Icon className="w-4.5 h-4.5 text-white group-hover:text-orange-400 transition-colors" />
                                    </motion.div>
                                </div>

                                {/* Content */}
                                <div className="p-7 relative">
                                    <motion.p
                                        className="text-[10px] uppercase tracking-widest text-white/30 font-medium mb-1"
                                        initial={{ opacity: 0 }}
                                        whileInView={{ opacity: 1 }}
                                        transition={{ delay: 0.2 + idx * 0.1 }}
                                    >
                                        {subtitle}
                                    </motion.p>
                                    <h3 className="text-xl font-bold text-white mb-3 group-hover:text-orange-400 transition-colors duration-300">
                                        {title}
                                    </h3>
                                    <p className="text-sm text-white/40 mb-6 leading-relaxed line-clamp-3">
                                        {desc}
                                    </p>
                                    {features && features.length > 0 && (
                                        <div className="space-y-4 pt-5 border-t border-white/5">
                                            <ul className="space-y-2.5 mb-6">
                                                {features.map((opt: string, i: number) => (
                                                    <motion.li
                                                        key={i}
                                                        custom={i}
                                                        variants={featureItem}
                                                        initial="hidden"
                                                        whileInView="visible"
                                                        viewport={{ once: true }}
                                                        className="flex items-center gap-2.5 text-xs text-white/50 group-hover:text-white/65 transition-colors duration-300"
                                                    >
                                                        <motion.div
                                                            initial={{ scale: 0 }}
                                                            whileInView={{ scale: 1 }}
                                                            transition={{ type: 'spring', stiffness: 400, delay: 0.5 + i * 0.1 }}
                                                        >
                                                            <CheckCircle2 className="w-3.5 h-3.5 text-orange-500/70 shrink-0" />
                                                        </motion.div>
                                                        {opt}
                                                    </motion.li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    <Link to="/login">
                                        <motion.button
                                            whileHover={{ scale: 1.02, y: -1 }}
                                            whileTap={{ scale: 0.98 }}
                                            className="w-full mt-4 h-11 rounded-xl text-xs font-semibold uppercase tracking-wider text-white/60 hover:text-white border border-white/10 hover:border-orange-500/40 hover:bg-orange-500/[0.08] transition-all duration-300 flex items-center justify-center gap-2 group/btn relative overflow-hidden"
                                        >
                                            {/* Button shimmer */}
                                            <div className="absolute inset-0 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
                                            Book This Service
                                            <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform duration-200" />
                                        </motion.button>
                                    </Link>
                                </div>
                            </motion.div>
                        )})}
                    </div>

                    {/* View all services link */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.4 }}
                        className="text-center mt-16"
                    >
                        <Link to="/services">
                            <motion.button
                                whileHover={{ scale: 1.04, y: -2 }}
                                whileTap={{ scale: 0.98 }}
                                className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl text-sm font-semibold text-orange-400/80 hover:text-orange-400 border border-orange-500/20 hover:border-orange-500/40 bg-orange-500/[0.04] hover:bg-orange-500/[0.08] backdrop-blur-sm transition-all duration-300 group/cta relative overflow-hidden"
                            >
                                <div className="absolute inset-0 -translate-x-full group-hover/cta:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-orange-400/[0.06] to-transparent" />
                                View Pricing & All Services
                                <ArrowRight className="w-4 h-4 group-hover/cta:translate-x-1 transition-transform duration-200" />
                            </motion.button>
                        </Link>
                    </motion.div>
                </div>
            </section>

            {/* ══════════════════════════════════════
                OUR PROCESS — 4 steps
            ══════════════════════════════════════ */}
            <section className="relative py-32 px-6 overflow-hidden">
                {/* Top gradient line */}
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />

                {/* Ambient blobs */}
                <div className="absolute top-1/3 right-0 w-[500px] h-[500px] bg-orange-500/[0.03] blur-[140px] rounded-full pointer-events-none" />
                <div className="absolute bottom-20 left-20 w-[400px] h-[400px] bg-indigo-500/[0.03] blur-[120px] rounded-full pointer-events-none" />

                <div className="max-w-6xl mx-auto">
                    {/* Header */}
                    <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} className="text-center mb-20">
                        <motion.p variants={fadeUp} className="text-[11px] uppercase tracking-[0.4em] text-orange-400/70 font-semibold mb-3">
                            How It Works
                        </motion.p>
                        <motion.h2 variants={fadeUp} className="text-4xl md:text-6xl font-serif font-medium text-white tracking-tight mb-5">
                            Our{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-500 italic">
                                Process
                            </span>
                        </motion.h2>
                        <motion.p variants={fadeUp} className="text-white/35 text-base max-w-lg mx-auto font-light">
                            A systematic, four-stage approach that guarantees consistent, world-class results on every vehicle.
                        </motion.p>
                    </motion.div>

                    {/* Steps Grid */}
                    <motion.div
                        variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }}
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
                    >
                        {PROCESS_STEPS.map((step, idx) => {
                            const Icon = step.icon;
                            return (
                                <motion.div
                                    key={step.num}
                                    variants={fadeUp}
                                    whileHover={{ y: -6, transition: { duration: 0.25 } }}
                                    className="group relative rounded-2xl p-7 border border-white/8 bg-white/[0.02] backdrop-blur-sm hover:border-white/15 hover:bg-white/[0.04] transition-all duration-300"
                                >
                                    {/* Number watermark */}
                                    <span className="absolute top-4 right-5 text-[72px] font-black text-white/[0.03] leading-none select-none pointer-events-none group-hover:text-white/[0.06] transition-colors duration-500">
                                        {step.num}
                                    </span>

                                    {/* Icon */}
                                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${step.accent} flex items-center justify-center mb-5 shadow-lg group-hover:shadow-xl transition-shadow duration-300`}>
                                        <Icon className="w-5 h-5 text-white" />
                                    </div>

                                    <h3 className="text-lg font-bold text-white mb-2 group-hover:text-orange-400 transition-colors duration-300">
                                        {step.title}
                                    </h3>
                                    <p className="text-sm text-white/35 leading-relaxed font-light">
                                        {step.desc}
                                    </p>

                                    {/* Connector line (hidden on last) */}
                                    {idx < PROCESS_STEPS.length - 1 && (
                                        <div className="hidden lg:block absolute top-1/2 -right-3 w-6 h-[1px] bg-gradient-to-r from-white/10 to-transparent" />
                                    )}
                                </motion.div>
                            );
                        })}
                    </motion.div>
                </div>
            </section>

            {/* ══════════════════════════════════════
                TRUSTED BY / BRANDS STRIP
            ══════════════════════════════════════ */}
            <section className="relative py-16 border-y border-white/5 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.01] to-transparent" />
                <motion.div
                    variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }}
                    className="max-w-5xl mx-auto px-6"
                >
                    <motion.p variants={fadeUp} className="text-center text-[11px] uppercase tracking-[0.5em] text-white/20 font-semibold mb-10">
                        Trusted Products We Use
                    </motion.p>
                    <motion.div variants={stagger} className="flex flex-wrap items-center justify-center gap-x-14 gap-y-6">
                        {TRUST_LABELS.map((brand) => (
                            <motion.div
                                key={brand}
                                variants={scaleIn}
                                whileHover={{ scale: 1.08, transition: { duration: 0.2 } }}
                                className="group"
                            >
                                <span className="text-xl md:text-2xl font-bold tracking-tight text-white/15 group-hover:text-white/40 transition-colors duration-300 cursor-default select-none">
                                    {brand}
                                </span>
                            </motion.div>
                        ))}
                    </motion.div>
                </motion.div>
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
                FAQ SECTION
            ══════════════════════════════════════ */}
            <FAQSection />

            {/* ══════════════════════════════════════
                CTA SECTION
            ══════════════════════════════════════ */}
            <section className="relative py-32 px-6 overflow-hidden">
                {/* Ambient glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-orange-500/[0.05] blur-[150px] rounded-full pointer-events-none" />

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
                        <Link to="/services">
                            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-sm text-white/60 hover:text-white border border-white/15 hover:border-white/30 transition-all duration-200 cursor-pointer"
                            >
                                Explore Services
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
