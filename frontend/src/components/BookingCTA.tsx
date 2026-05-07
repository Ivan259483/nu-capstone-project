import { Link } from "react-router-dom";
import { Calendar, Phone, ArrowRight } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function BookingCTA() {
    const { t } = useLanguage();
    const { ref, isVisible } = useScrollAnimation<HTMLDivElement>({ threshold: 0.25 });

    return (
        <section className="py-24 section-darker relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute inset-0 bg-gradient-radial-gold opacity-60" />
            <div className="absolute top-0 left-0 right-0 gold-line" />
            <div className="absolute bottom-0 left-0 right-0 gold-line" />

            {/* Rotating decorative rings */}
            <div className="absolute -right-32 -top-32 w-96 h-96 rounded-full border border-gold/5 animate-spin-slow pointer-events-none" />
            <div className="absolute -left-20 -bottom-20 w-64 h-64 rounded-full border border-gold/8 pointer-events-none" style={{ animation: "spin-slow 18s linear infinite reverse" }} />

            <div
                ref={ref}
                className={cn(
                    "container max-w-4xl mx-auto px-6 text-center relative z-10 reveal",
                    isVisible ? "visible" : ""
                )}
            >
                {/* Badge */}
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-gold/20 text-xs font-semibold text-primary mb-6">
                    <Calendar className="w-3.5 h-3.5" />
                    Book Today
                </div>

                <h2 className="text-3xl sm:text-5xl font-serif font-medium text-foreground mb-4">
                    {t("cta.title")}
                </h2>
                <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-10 leading-relaxed">
                    {t("cta.subtitle")}
                </p>

                <div className="flex flex-wrap justify-center gap-4">
                    <Link to="/login">
                        <Button
                            size="lg"
                            className="bg-gradient-gold text-primary-foreground glow-gold font-semibold px-10 hover:opacity-90 hover:scale-105 transition-all duration-300 group"
                        >
                            <Calendar className="w-4 h-4 mr-2" />
                            {t("cta.button")}
                            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                        </Button>
                    </Link>
                    <a href="tel:+639123456789">
                        <Button
                            size="lg"
                            variant="outline"
                            className="border-gold/30 text-foreground hover:bg-gold/10 hover:border-gold/60 hover:text-primary transition-all duration-300 px-10"
                        >
                            <Phone className="w-4 h-4 mr-2" />
                            {t("cta.call")}
                        </Button>
                    </a>
                </div>
            </div>
        </section>
    );
}
