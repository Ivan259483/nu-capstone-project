import { Link } from "react-router-dom";
import { Sparkles, Wind, Layers, Shield, Wrench, Package, ArrowRight } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const serviceIcons = [Sparkles, Wind, Layers, Shield, Wrench, Package];
const servicePrices = ["₱499", "₱699", "₱1,499", "₱3,999", "₱799", "₱5,499"];
const serviceKeys = ["exterior", "interior", "paint", "ceramic", "engine", "full"] as const;

interface ServiceCardProps {
    icon: React.ComponentType<{ className?: string }>;
    name: string;
    desc: string;
    price: string;
    isPopular?: boolean;
    delay: number;
    isVisible: boolean;
}

function ServiceCard({ icon: Icon, name, desc, price, isPopular, delay, isVisible }: ServiceCardProps) {
    const { t } = useLanguage();
    return (
        <div
            className={cn(
                "reveal group relative glass rounded-2xl p-6 hover:-translate-y-2 transition-all duration-500 hover:border-gold/40 hover:glow-gold-sm cursor-pointer",
                isVisible ? "visible" : ""
            )}
            style={{ transitionDelay: `${delay}ms` }}
        >
            {isPopular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-gold text-primary-foreground text-xs font-bold tracking-wide whitespace-nowrap">
                    {t("services.popular")}
                </span>
            )}

            {/* Icon */}
            <div className="w-12 h-12 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center mb-4 group-hover:bg-gold/20 group-hover:border-gold/40 transition-all duration-300">
                <Icon className="w-5 h-5 text-primary" />
            </div>

            <h3 className="text-base font-semibold text-foreground mb-2">{name}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-5">{desc}</p>

            <div className="flex items-center justify-between">
                <div>
                    <span className="text-xs text-muted-foreground">{t("services.startingAt")}</span>
                    <div className="text-lg font-bold gradient-text">{price}</div>
                </div>
                <Link to="/booking">
                    <Button size="sm" variant="outline" className="border-gold/25 text-primary hover:bg-gold/10 hover:border-gold/50 text-xs">
                        {t("services.bookNow")}
                    </Button>
                </Link>
            </div>
        </div>
    );
}

export default function ServicesSection() {
    const { t } = useLanguage();
    const { ref, isVisible } = useScrollAnimation<HTMLDivElement>({ threshold: 0.1 });

    return (
        <section className="py-24 section-dark">
            <div className="container max-w-7xl mx-auto px-6">
                {/* Header */}
                <div
                    ref={ref}
                    className={cn("text-center mb-16 reveal", isVisible ? "visible" : "")}
                >
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-gold/20 text-xs font-semibold text-primary mb-4">
                        <Sparkles className="w-3.5 h-3.5" />
                        {t("services.title")}
                    </div>
                    <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                        {t("services.subtitle")}
                    </h2>
                    <div className="w-24 h-0.5 bg-gradient-gold mx-auto rounded-full" />
                </div>

                {/* Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                    {serviceKeys.map((key, i) => (
                        <ServiceCard
                            key={key}
                            icon={serviceIcons[i]}
                            name={t(`services.items.${key}.name`)}
                            desc={t(`services.items.${key}.desc`)}
                            price={servicePrices[i]}
                            isPopular={key === "full"}
                            delay={i * 80}
                            isVisible={isVisible}
                        />
                    ))}
                </div>

                <div className="text-center">
                    <Link to="/services">
                        <Button variant="outline" className="border-gold/30 text-primary hover:bg-gold/10 hover:border-gold/60 group">
                            {t("services.viewAll")}
                            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                        </Button>
                    </Link>
                </div>
            </div>
        </section>
    );
}
