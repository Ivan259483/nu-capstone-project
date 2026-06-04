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
        <section className="relative overflow-hidden bg-[#050608] py-20">
            <div
                className="pointer-events-none absolute inset-0"
                aria-hidden
                style={{
                    background:
                        "radial-gradient(ellipse 44% 36% at 50% 58%, rgba(244,180,63,0.15) 0%, rgba(218,132,32,0.065) 36%, transparent 72%), radial-gradient(ellipse 70% 46% at 50% 12%, rgba(88,101,112,0.08) 0%, transparent 68%), linear-gradient(180deg, #08090c 0%, #050608 48%, #030406 100%)",
                }}
            />
            <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent via-[#030406]/70 to-[#030406]"
                aria-hidden
            />
            <div
                className="pointer-events-none absolute left-1/2 top-[62%] h-28 w-[min(42rem,88vw)] -translate-x-1/2 rounded-full bg-[#f4b43f]/10 blur-3xl"
                aria-hidden
            />
            <div className="absolute top-0 left-0 right-0 gold-line opacity-45" />

            <div
                ref={ref}
                className={cn(
                    "container max-w-4xl mx-auto px-6 text-center relative z-10 reveal",
                    isVisible ? "visible" : ""
                )}
            >
                {/* Badge */}
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-gold/20 text-xs font-semibold text-[#F4B63D] mb-6">
                    <Calendar className="w-3.5 h-3.5" />
                    Book Today
                </div>

                <h2 className="text-3xl sm:text-5xl font-serif font-medium text-[#F8F7F2] mb-4">
                    {t("cta.title")}
                </h2>
                <p className="text-[#B8BEC8] text-lg max-w-xl mx-auto mb-10 leading-relaxed">
                    {t("cta.subtitle")}
                </p>

                <div className="relative flex flex-wrap justify-center gap-4">
                    <div
                        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-24 w-[min(34rem,86vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f4b43f]/12 blur-2xl"
                        aria-hidden
                    />
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
                            className="border-gold/30 text-foreground hover:bg-gold/10 hover:border-gold/60 hover:text-[#F4B63D] transition-all duration-300 px-10"
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
