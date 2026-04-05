import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown, Star, Shield, Zap } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";

// Animated floating particles
function Particles() {
    const particles = Array.from({ length: 20 }, (_, i) => ({
        id: i,
        size: Math.random() * 4 + 2,
        x: Math.random() * 100,
        delay: Math.random() * 6,
        duration: Math.random() * 4 + 5,
    }));

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {particles.map((p) => (
                <span
                    key={p.id}
                    className="absolute rounded-full bg-primary/60"
                    style={{
                        width: p.size,
                        height: p.size,
                        left: `${p.x}%`,
                        bottom: "10%",
                        animationName: "particle-float",
                        animationDuration: `${p.duration}s`,
                        animationDelay: `${p.delay}s`,
                        animationIterationCount: "infinite",
                        animationTimingFunction: "ease-in-out",
                    }}
                />
            ))}
        </div>
    );
}

// Animated rotating ring
function RotatingRing() {
    return (
        <div className="absolute right-[-5%] top-1/2 -translate-y-1/2 hidden xl:block pointer-events-none">
            <div className="relative w-[520px] h-[520px]">
                <div className="absolute inset-0 rounded-full border border-gold/10 animate-spin-slow" />
                <div className="absolute inset-8 rounded-full border border-gold/20" style={{ animation: "spin-slow 14s linear infinite reverse" }} />
                <div className="absolute inset-16 rounded-full border border-gold/15" style={{ animation: "spin-slow 20s linear infinite" }} />
                <div className="absolute inset-0 rounded-full bg-gradient-radial-gold" />
                {/* Car silhouette placeholder */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-64 h-32 glass rounded-2xl border border-gold/20 flex items-center justify-center">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-gradient-gold rounded-full mx-auto mb-2 flex items-center justify-center glow-gold">
                                <span className="text-2xl font-bold text-primary-foreground">AS</span>
                            </div>
                            <p className="text-xs text-muted-foreground">Premium Detail</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function HeroSection() {
    const { t } = useLanguage();
    const typingRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const texts = ["Excellence.", "Perfection.", "Brilliance.", "Prestige."];
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

    const badges = [
        { icon: Star, label: "4.9/5 Rating" },
        { icon: Shield, label: "Certified Pro" },
        { icon: Zap, label: "Same Day" },
    ];

    return (
        <section className="relative min-h-screen flex items-center overflow-hidden bg-background">
            {/* Background layers */}
            <div className="absolute inset-0 bg-hero-pattern" />
            <div className="absolute bottom-0 left-0 right-0 h-px gold-line opacity-40" />
            <Particles />
            <RotatingRing />

            <div className="container max-w-7xl mx-auto px-6 pt-24 pb-16 relative z-10">
                <div className="max-w-3xl">
                    {/* Badge */}
                    <div
                        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-gold/25 text-xs font-semibold text-primary mb-8 animate-slide-up"
                        style={{ animationDelay: "0.1s" }}
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        {t("hero.badge")}
                    </div>

                    {/* Heading */}
                    <h1
                        className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.08] mb-6 animate-slide-up"
                        style={{ animationDelay: "0.2s" }}
                    >
                        {t("hero.title")}
                        <br />
                        <span className="gradient-text text-glow-gold">
                            {t("hero.titleHighlight")}
                        </span>
                        <br />
                        <span className="text-foreground/70">
                            <span ref={typingRef} className="text-primary" />
                            <span className="border-r-2 border-primary ml-0.5 animate-blink" />
                        </span>
                    </h1>

                    {/* Subtitle */}
                    <p
                        className="text-lg text-muted-foreground leading-relaxed max-w-xl mb-10 animate-slide-up"
                        style={{ animationDelay: "0.35s" }}
                    >
                        {t("hero.subtitle")}
                    </p>

                    {/* CTA Buttons */}
                    <div
                        className="flex flex-wrap gap-4 mb-14 animate-slide-up"
                        style={{ animationDelay: "0.45s" }}
                    >
                        <Link to="/booking">
                            <Button
                                size="lg"
                                className="bg-gradient-gold text-primary-foreground glow-gold font-semibold px-8 hover:opacity-90 hover:scale-105 transition-all duration-300"
                            >
                                {t("hero.cta")}
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </Link>
                        <Link to="/gallery">
                            <Button
                                size="lg"
                                variant="outline"
                                className="border-gold/30 text-foreground hover:bg-gold/10 hover:border-gold/60 hover:text-primary transition-all duration-300 px-8"
                            >
                                {t("hero.ctaSecondary")}
                            </Button>
                        </Link>
                    </div>

                    {/* Trust badges */}
                    <div
                        className="flex flex-wrap items-center gap-4 animate-fade-in"
                        style={{ animationDelay: "0.6s" }}
                    >
                        {badges.map(({ icon: Icon, label }) => (
                            <div key={label} className="flex items-center gap-2 px-3 py-2 rounded-lg glass-subtle text-xs text-muted-foreground">
                                <Icon className="w-3.5 h-3.5 text-primary" />
                                <span>{label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Scroll indicator */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-bounce text-muted-foreground">
                <span className="text-xs tracking-widest uppercase opacity-60">{t("hero.scrollDown")}</span>
                <ChevronDown className="w-4 h-4 opacity-60" />
            </div>
        </section>
    );
}
