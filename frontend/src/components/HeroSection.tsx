import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Star, Sparkles } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from "framer-motion";

export default function HeroSection() {
    const { t } = useLanguage();
    const [activeService, setActiveService] = useState("Ceramic Coating");
    const typingRef = useRef<HTMLSpanElement>(null);

    /* ── Mouse Parallax ── */
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);
    const springConfig = { damping: 50, stiffness: 200, mass: 0.5 };
    const smoothX = useSpring(mouseX, springConfig);
    const smoothY = useSpring(mouseY, springConfig);

    const handleMouseMove = (e: React.MouseEvent) => {
        const { innerWidth, innerHeight } = window;
        const x = (e.clientX / innerWidth) - 0.5;
        const y = (e.clientY / innerHeight) - 0.5;
        mouseX.set(x);
        mouseY.set(y);
    };

    const bgX = useTransform(smoothX, [-0.5, 0.5], ["-1.5%", "1.5%"]);
    const bgY = useTransform(smoothY, [-0.5, 0.5], ["-1.5%", "1.5%"]);
    const elementsX = useTransform(smoothX, [-0.5, 0.5], ["12px", "-12px"]);
    const elementsY = useTransform(smoothY, [-0.5, 0.5], ["12px", "-12px"]);

    const services = [
        "Ceramic Coating",
        "Full Detail",
        "Paint Correction",
        "PPF",
        "Interior Detail",
        "Tinting"
    ];

    /* ── Particles ── */
    const [particles] = useState(() => 
        Array.from({ length: 20 }).map((_, i) => ({
            id: i,
            size: Math.random() * 3 + 1,
            x: Math.random() * 100,
            y: Math.random() * 100,
            duration: Math.random() * 15 + 15,
            delay: Math.random() * 5
        }))
    );

    /* ── Typing Effect ── */
    useEffect(() => {
        const texts = ["The Best.", "Excellence.", "Perfection.", "Prestige."];
        let textIndex = 0;
        let charIndex = 0;
        let isDeleting = false;
        let timeout: ReturnType<typeof setTimeout>;

        const type = () => {
            const el = typingRef.current;
            if (!el) return;
            const current = texts[textIndex];
            if (!isDeleting) {
                el.textContent = current.slice(0, charIndex + 1);
                charIndex++;
                if (charIndex === current.length) {
                    isDeleting = true;
                    timeout = setTimeout(type, 2000);
                    return;
                }
            } else {
                el.textContent = current.slice(0, charIndex - 1);
                charIndex--;
                if (charIndex === 0) {
                    isDeleting = false;
                    textIndex = (textIndex + 1) % texts.length;
                }
            }
            timeout = setTimeout(type, isDeleting ? 40 : 80);
        };
        timeout = setTimeout(type, 800);
        return () => clearTimeout(timeout);
    }, []);

    /* ── Animations ── */
    const staggerChildren = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1, delayChildren: 0.2 }
        }
    };

    const slideUp = {
        hidden: { opacity: 0, y: 40 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } }
    };

    return (
        <section 
            className="relative min-h-screen w-full flex items-center overflow-hidden" 
            style={{ backgroundColor: "#040508" }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => { mouseX.set(0); mouseY.set(0); }}
        >
            
            {/* ── Background Layer ── */}
            <div className="absolute top-0 right-0 w-full lg:w-[70%] h-full z-0 overflow-hidden">
                <motion.div 
                    className="w-full h-full"
                    style={{ x: bgX, y: bgY, scale: 1.05 }}
                    initial={{ opacity: 0, scale: 1.1 }}
                    animate={{ opacity: 1, scale: 1.05 }}
                    transition={{ duration: 2, ease: "easeOut" }}
                >
                    <img 
                        src="https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?q=80&w=2670&auto=format&fit=crop"
                        alt="Luxury Car Detailing"
                        className="w-full h-full object-cover object-center opacity-30 lg:opacity-90"
                    />
                </motion.div>

                {/* Seamless Gradients */}
                <div 
                    className="absolute inset-0 z-10 hidden lg:block"
                    style={{
                        background: "linear-gradient(to right, #040508 0%, rgba(4,5,8,0.95) 15%, rgba(4,5,8,0.4) 40%, transparent 70%)"
                    }}
                />
                <div 
                    className="absolute inset-0 z-10 hidden lg:block"
                    style={{
                        background: "linear-gradient(to bottom, #040508 0%, transparent 15%, transparent 85%, #040508 100%)"
                    }}
                />
                <div 
                    className="absolute inset-0 z-10 lg:hidden"
                    style={{
                        background: "linear-gradient(to top, #040508 0%, rgba(4,5,8,0.85) 60%, rgba(4,5,8,0.2) 100%)"
                    }}
                />
            </div>

            {/* ── Floating Cinematic Dust Particles ── */}
            <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden mix-blend-screen">
                {particles.map((p) => (
                    <motion.div
                        key={p.id}
                        className="absolute rounded-full bg-orange-200"
                        style={{
                            left: `${p.x}%`,
                            top: `${p.y}%`,
                            width: p.size,
                            height: p.size,
                            filter: "blur(1px)",
                            boxShadow: `0 0 ${p.size * 2}px rgba(240,165,0,0.8)`
                        }}
                        animate={{
                            y: [0, -150, -300],
                            x: [0, Math.random() * 50 - 25, Math.random() * 100 - 50],
                            opacity: [0, Math.random() * 0.5 + 0.2, 0],
                        }}
                        transition={{
                            duration: p.duration,
                            repeat: Infinity,
                            delay: p.delay,
                            ease: "linear",
                        }}
                    />
                ))}
            </div>

            {/* ── Content Container ── */}
            <div className="container max-w-7xl mx-auto px-6 relative z-20 h-full flex flex-col lg:flex-row pt-32 pb-20 lg:py-0 pointer-events-none">
                
                {/* Left Column */}
                <motion.div 
                    className="w-full lg:w-[60%] flex flex-col justify-center min-h-[calc(100vh-160px)] lg:min-h-screen pt-10 pointer-events-auto"
                    variants={staggerChildren}
                    initial="hidden"
                    animate="visible"
                >
                    {/* Badge */}
                    <motion.div variants={slideUp} className="mb-6 inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#F0A500]/30 bg-[#F0A500]/10 backdrop-blur-md w-fit">
                        <Sparkles className="w-3.5 h-3.5 text-[#F0A500]" />
                        <span className="text-[10px] uppercase font-semibold tracking-widest text-[#F0A500]">Elite Detailing Studio</span>
                    </motion.div>

                    {/* Headline */}
                    <motion.h1 
                        variants={slideUp}
                        className="text-5xl sm:text-6xl lg:text-[84px] leading-[1.05] mb-8 text-white flex flex-col drop-shadow-2xl"
                        style={{ fontFamily: 'Georgia, serif' }}
                    >
                        <span className="font-light tracking-tight pb-1">Your Car</span>
                        <span className="font-light tracking-tight pb-1">Deserves</span>
                        <span className="italic font-bold relative w-fit" style={{ color: "#F0A500" }}>
                            {/* Glowing text shadow */}
                            <span className="absolute inset-0 blur-2xl opacity-40 text-[#F0A500]" ref={typingRef} />
                            <span ref={typingRef} className="relative z-10 drop-shadow-[0_0_15px_rgba(240,165,0,0.5)]"></span>
                            <span className="border-r-[3px] border-[#F0A500] ml-1 animate-blink drop-shadow-[0_0_8px_#F0A500]" />
                        </span>
                    </motion.h1>

                    <motion.div variants={slideUp} className="w-16 h-[2px] bg-gradient-to-r from-[#F0A500] to-transparent mb-8" />

                    {/* Subtitle */}
                    <motion.p variants={slideUp} className="text-[15px] leading-relaxed max-w-md mb-10 font-sans text-white/60">
                        {t("hero.subtitle") || "Professional detailing services that bring out the brilliance in every vehicle. We treat your car like our own with premium protection and unmatched aesthetic perfection."}
                    </motion.p>

                    {/* Star rating row */}
                    <motion.div variants={slideUp} className="flex items-center gap-5 mb-12 group">
                        <span className="text-[48px] font-light text-white leading-none group-hover:text-[#F0A500] transition-colors duration-500" style={{ fontFamily: 'Georgia, serif' }}>4.9</span>
                        <div className="flex flex-col gap-1">
                            <div className="flex text-[#F0A500] gap-1">
                                {[...Array(5)].map((_, i) => (
                                    <motion.div 
                                        key={i}
                                        initial={{ opacity: 0, scale: 0 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: 0.8 + (i * 0.1), type: 'spring' }}
                                    >
                                        <Star className="w-4 h-4 fill-current drop-shadow-[0_0_5px_rgba(240,165,0,0.8)]" />
                                    </motion.div>
                                ))}
                            </div>
                            <span className="text-[10px] font-sans uppercase tracking-[0.2em] text-white/40">From 2,400+ Elites</span>
                        </div>
                    </motion.div>

                    {/* CTA Buttons */}
                    <motion.div variants={slideUp} className="flex flex-wrap items-center gap-4 mb-16 font-sans">
                        <Link to={`/booking?service=${encodeURIComponent(activeService)}`}>
                            <motion.button 
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className="group relative px-9 py-4 font-bold text-[13px] tracking-wider uppercase overflow-hidden flex items-center gap-3 transition-all rounded-lg"
                                style={{ 
                                    background: "linear-gradient(135deg, #F0A500 0%, #D4920A 100%)",
                                    color: "#040508",
                                    boxShadow: "0 10px 30px -10px rgba(240,165,0,0.6), inset 0 1px 0 rgba(255,255,255,0.3)"
                                }}
                            >
                                <span className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                                <span className="relative z-10 flex items-center gap-2">
                                    Book a Service 
                                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
                                </span>
                            </motion.button>
                        </Link>
                        
                        <Link to="/gallery">
                            <motion.button 
                                whileHover={{ scale: 1.02, backgroundColor: "rgba(240,165,0,0.08)" }}
                                whileTap={{ scale: 0.98 }}
                                className="group px-9 py-4 font-semibold text-[13px] tracking-wider uppercase transition-all rounded-lg border border-white/10 hover:border-[#F0A500]/40 text-white/80 hover:text-[#F0A500] backdrop-blur-sm"
                            >
                                View Gallery
                            </motion.button>
                        </Link>
                    </motion.div>

                    {/* Glowing Segmented Control for Services */}
                    <motion.div variants={slideUp} className="relative flex flex-wrap items-center gap-1 max-w-[600px] p-1 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md">
                        {services.map((service) => {
                            const isActive = activeService === service;
                            return (
                                <button
                                    key={service}
                                    onClick={() => setActiveService(service)}
                                    className={`relative px-4 py-2 text-[10px] sm:text-xs tracking-widest uppercase transition-colors duration-300 rounded-lg z-10 ${
                                        isActive ? "text-[#040508] font-bold" : "text-white/40 hover:text-white"
                                    }`}
                                >
                                    {isActive && (
                                        <motion.div
                                            layoutId="active-pill"
                                            className="absolute inset-0 bg-gradient-to-r from-[#F0A500] to-[#D4920A] rounded-lg shadow-[0_0_15px_rgba(240,165,0,0.4)]"
                                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                            style={{ zIndex: -1 }}
                                        />
                                    )}
                                    {service}
                                </button>
                            );
                        })}
                    </motion.div>
                </motion.div>

                {/* Right Column (Floating Elements) - Hidden on mobile */}
                <div className="hidden lg:flex w-[40%] relative flex-col justify-center items-end pr-0 xl:pr-10 pointer-events-none">
                    
                    {/* Animated architectural brackets floating around */}
                    <motion.div 
                        className="absolute top-[25%] right-0 w-12 h-12 border-t-2 border-r-2 border-[#F0A500]/50"
                        style={{ x: elementsX, y: elementsY }}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 1, duration: 1 }}
                    />
                    <motion.div 
                        className="absolute bottom-[20%] left-10 w-12 h-12 border-b-2 border-l-2 border-[#F0A500]/50"
                        style={{ x: elementsX, y: elementsY }}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 1.2, duration: 1 }}
                    />

                    {/* Vertical text stamp */}
                    <motion.div 
                        className="absolute top-1/2 right-[-60px] rotate-[270deg] origin-center z-10 translate-y-[-50%]"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 1.5, duration: 1 }}
                    >
                        <span className="text-[10px] uppercase tracking-[0.5em] text-[#F0A500]/40 font-semibold font-sans whitespace-nowrap drop-shadow-[0_0_5px_rgba(240,165,0,0.2)]">
                            AutoSPF+ Premium Studio · Est 2026
                        </span>
                    </motion.div>
                </div>
            </div>
            
            {/* Ambient vignette */}
            <div className="absolute inset-0 z-0 pointer-events-none shadow-[inset_0_0_150px_rgba(0,0,0,0.9)]" />
        </section>
    );
}
