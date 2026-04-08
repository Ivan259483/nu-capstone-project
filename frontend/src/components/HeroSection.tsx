import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Star } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function HeroSection() {
    const { t } = useLanguage();
    const [activeService, setActiveService] = useState("Ceramic Coating");
    const typingRef = useRef<HTMLSpanElement>(null);

    const services = [
        "Ceramic Coating",
        "Full Detail",
        "Paint Correction",
        "PPF",
        "Interior Detail",
        "Tinting"
    ];

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
                    timeout = setTimeout(type, 1800);
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
            timeout = setTimeout(type, isDeleting ? 60 : 90);
        };
        timeout = setTimeout(type, 500);
        return () => clearTimeout(timeout);
    }, []);

    return (
        <section className="relative min-h-screen w-full flex items-center overflow-hidden" style={{ backgroundColor: "#07070A" }}>
            
            {/* Right side background image with gradient mask */}
            <div className="absolute top-0 right-0 w-full lg:w-[65%] h-full z-0 overflow-hidden">
                <img 
                    src="https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?q=80&w=2670&auto=format&fit=crop"
                    alt="Luxury Car Detailing"
                    className="w-full h-full object-cover object-center opacity-40 lg:opacity-100"
                    style={{ animation: "hero-car-drift 25s ease-in-out infinite", transformOrigin: "center center" }}
                />
                {/* Gradient mask bleeding into the background naturally */}
                <div 
                    className="absolute inset-0 z-10 hidden lg:block"
                    style={{
                        background: "linear-gradient(to right, #07070A 0%, rgba(7,7,10,0.85) 15%, rgba(7,7,10,0) 45%, rgba(7,7,10,0) 100%)"
                    }}
                />
                {/* Mobile overlay mask */}
                <div 
                    className="absolute inset-0 z-10 lg:hidden"
                    style={{
                        background: "linear-gradient(to top, #07070A 0%, rgba(7,7,10,0.8) 50%, rgba(7,7,10,0) 100%)"
                    }}
                />
            </div>

            {/* Thin diagonal gold hairline */}
            <div 
                className="hidden lg:block absolute top-[-10%] bottom-[-10%] z-10 pointer-events-none"
                style={{
                    left: "35%",
                    width: "1px",
                    background: "rgba(240,165,0,0.4)",
                    transform: "rotate(4deg)",
                    transformOrigin: "center"
                }}
            />

            {/* Content Container */}
            <div className="container max-w-7xl mx-auto px-6 relative z-20 h-full flex flex-col lg:flex-row pt-32 pb-20 lg:py-0">
                
                {/* Left Column (Content) */}
                <div className="w-full lg:w-[55%] flex flex-col justify-center min-h-[calc(100vh-160px)] lg:min-h-screen pt-10">


                    {/* Headline */}
                    <h1 
                        className="text-5xl sm:text-6xl lg:text-[76px] leading-[1.05] mb-8 text-white flex flex-col animate-slide-up"
                        style={{ fontFamily: 'Georgia, serif', animationDelay: "0.2s" }}
                    >
                        <span className="font-light tracking-tight pb-1">Your Car</span>
                        <span className="font-light tracking-tight pb-1">Deserves</span>
                        <span className="italic font-bold" style={{ color: "#F0A500" }}>
                            <span ref={typingRef}></span>
                            <span className="border-r-2 border-[#F0A500] ml-1 animate-blink" />
                        </span>
                    </h1>

                    {/* Short gold rule divider */}
                    <div className="w-12 h-[1.5px] bg-[#F0A500] mb-8 animate-slide-up" style={{ animationDelay: "0.3s" }} />

                    {/* Subtitle */}
                    <p className="text-[15px] leading-relaxed max-w-md mb-10 font-sans animate-slide-up" style={{ color: "rgba(255,255,255,0.6)", animationDelay: "0.4s" }}>
                        {t("hero.subtitle") || "Professional detailing services that bring out the brilliance in every vehicle. We treat your car like our own with premium protection and unmatched aesthetic perfection."}
                    </p>

                    {/* Star rating row */}
                    <div className="flex items-center gap-4 mb-12 animate-slide-up" style={{ animationDelay: "0.5s" }}>
                        <span className="text-[40px] font-light text-white leading-none" style={{ fontFamily: 'Georgia, serif' }}>4.9</span>
                        <div className="flex flex-col gap-1">
                            <div className="flex text-[#F0A500] gap-[2px]">
                                {[...Array(5)].map((_, i) => (
                                    <Star key={i} className="w-4 h-4 fill-current" />
                                ))}
                            </div>
                            <span className="text-[10px] font-sans uppercase tracking-widest text-[rgba(255,255,255,0.4)]">2,400+ Reviews</span>
                        </div>
                    </div>

                    {/* CTA Buttons */}
                    <div className="flex flex-wrap items-center gap-5 mb-14 animate-slide-up font-sans" style={{ animationDelay: "0.6s" }}>
                        <Link to={`/booking?service=${encodeURIComponent(activeService)}`}>
                            <button 
                                className="group relative px-10 py-[17px] font-semibold text-sm tracking-wide uppercase overflow-hidden rounded-none flex items-center gap-3 transition-all duration-500"
                                style={{ 
                                    background: "linear-gradient(135deg, #F0A500 0%, #D4920A 50%, #F0A500 100%)",
                                    color: "#07070A",
                                    boxShadow: "0 0 30px rgba(240,165,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2)"
                                }}
                            >
                                {/* Shimmer sweep */}
                                <span 
                                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                                    style={{
                                        background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%)",
                                        animation: "shimmer 2s ease-in-out infinite"
                                    }}
                                />
                                <span className="relative z-10 flex items-center gap-2">
                                    Book a Service 
                                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
                                </span>
                            </button>
                        </Link>
                        <Link to="/gallery">
                            <button 
                                className="group relative px-10 py-[16px] font-medium text-sm tracking-wide uppercase rounded-none overflow-hidden transition-all duration-500"
                                style={{ 
                                    border: "1px solid rgba(240,165,0,0.25)",
                                    color: "rgba(255,255,255,0.85)",
                                    backdropFilter: "blur(8px)",
                                    background: "rgba(240,165,0,0.04)"
                                }}
                            >
                                {/* Hover fill */}
                                <span 
                                    className="absolute inset-0 bg-[rgba(240,165,0,0.08)] scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left"
                                />
                                <span className="relative z-10 group-hover:text-[#F0A500] transition-colors duration-300">
                                    View Work
                                </span>
                            </button>
                        </Link>
                    </div>

                    {/* Service tags */}
                    <div className="flex flex-wrap items-center gap-x-1 gap-y-2 max-w-[560px] animate-slide-up font-sans" style={{ animationDelay: "0.7s" }}>
                        {services.map((service, index) => (
                            <div key={service} className="flex items-center">
                                <button
                                    onClick={() => setActiveService(service)}
                                    className={`relative px-3 py-1.5 text-[10px] tracking-[0.18em] uppercase transition-all duration-400 ${
                                        activeService === service 
                                        ? "text-[#F0A500]" 
                                        : "text-[rgba(255,255,255,0.35)] hover:text-[rgba(255,255,255,0.8)]"
                                    }`}
                                >
                                    {service}
                                    {/* Gold underline indicator */}
                                    <span 
                                        className={`absolute bottom-0 left-3 right-3 h-[1px] transition-all duration-400 ${
                                            activeService === service
                                            ? "bg-[#F0A500] opacity-100 scale-x-100"
                                            : "bg-white opacity-0 scale-x-0"
                                        }`}
                                        style={{ transformOrigin: "left" }}
                                    />
                                </button>
                                {index < services.length - 1 && (
                                    <span className="text-[rgba(255,255,255,0.1)] text-[8px] select-none">/</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Column (Floating Elements) - Hidden on mobile */}
                <div className="hidden lg:flex w-[45%] relative h-screen flex-col justify-center items-end pr-0 xl:pr-10">
                    
                    {/* Architectural framing - Corners */}
                    <div className="absolute top-[25%] right-[-10px] w-8 h-8 border-t border-r border-[#F0A500] opacity-80" />
                    <div className="absolute bottom-[25%] left-10 w-8 h-8 border-b border-l border-[#F0A500] opacity-80" />




                    {/* Vertical text stamp */}
                    <div className="absolute top-1/2 right-[-60px] rotate-[270deg] origin-center z-10 animate-fade-in translate-y-[-50%]">
                        <span className="text-[10px] uppercase tracking-[0.4em] text-[rgba(255,255,255,0.25)] font-sans whitespace-nowrap">
                            AutoSPF+ Premium · 2026
                        </span>
                    </div>

                </div>
            </div>
        </section>
    );
}
