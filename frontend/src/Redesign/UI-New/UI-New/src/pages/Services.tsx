import { Link } from "react-router-dom";
import { Sparkles, Wind, Layers, Shield, Wrench, Package, CheckCircle, ArrowRight } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Button } from "@/components/ui/button";
import PageLayout from "@/components/PageLayout";
import BookingCTA from "@/components/BookingCTA";
import { cn } from "@/lib/utils";

const serviceData = [
    {
        key: "exterior",
        icon: Sparkles,
        price: "₱499",
        duration: "2–3 hrs",
        features: ["Hand wash & rinse", "Clay bar treatment", "Spray wax application", "Tire & rim cleaning", "Window cleaning"],
        gradient: "from-sky-900/40 to-sky-950/60",
    },
    {
        key: "interior",
        icon: Wind,
        price: "₱699",
        duration: "3–4 hrs",
        features: ["Deep vacuum all surfaces", "Steam cleaning", "Leather conditioning", "Dashboard detailing", "Odor elimination"],
        gradient: "from-emerald-900/40 to-emerald-950/60",
    },
    {
        key: "paint",
        icon: Layers,
        price: "₱1,499",
        duration: "5–8 hrs",
        features: ["Paint inspection", "Single-stage machine polish", "Swirl removal", "Scratch reduction", "Paint sealant"],
        gradient: "from-red-900/40 to-red-950/60",
        popular: false,
    },
    {
        key: "ceramic",
        icon: Shield,
        price: "₱3,999",
        duration: "1–2 days",
        features: ["Paint correction prep", "Nano-ceramic application", "2-year protection", "UV & chemical resistance", "Hydrophobic coating"],
        gradient: "from-purple-900/40 to-purple-950/60",
        popular: true,
    },
    {
        key: "engine",
        icon: Wrench,
        price: "₱799",
        duration: "2–3 hrs",
        features: ["Degreaser application", "Soft brush agitation", "Low-pressure rinse", "Plastic dressing", "Corrosion inhibitor"],
        gradient: "from-amber-900/40 to-amber-950/60",
    },
    {
        key: "full",
        icon: Package,
        price: "₱5,499",
        duration: "2 days",
        features: ["Full exterior wash", "Interior deep clean", "Paint correction", "Ceramic coating", "Engine bay detail", "Final inspection"],
        gradient: "from-indigo-900/40 to-indigo-950/60",
        popular: false,
    },
] as const;

function ServiceCard({
    service,
    index,
    isVisible,
}: {
    service: (typeof serviceData)[number];
    index: number;
    isVisible: boolean;
}) {
    const { t } = useLanguage();
    const Icon = service.icon;

    return (
        <div
            className={cn(
                "reveal relative glass rounded-2xl overflow-hidden hover:-translate-y-2 transition-all duration-500 hover:border-gold/40 hover:glow-gold-sm group",
                isVisible ? "visible" : ""
            )}
            style={{ transitionDelay: `${index * 100}ms` }}
        >
            {service.popular && (
                <div className="absolute top-0 left-0 right-0 py-1 text-center text-xs font-bold tracking-wide text-primary-foreground bg-gradient-gold">
                    {t("services.popular")}
                </div>
            )}

            {/* Top gradient */}
            <div className={cn("h-24 bg-gradient-to-br relative", service.gradient, service.popular ? "mt-7" : "")}>
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-14 h-14 rounded-2xl bg-background/60 backdrop-blur-sm border border-gold/20 flex items-center justify-center group-hover:border-gold/50 transition-all duration-300">
                        <Icon className="w-6 h-6 text-primary" />
                    </div>
                </div>
            </div>

            <div className="p-6">
                <div className="flex items-start justify-between mb-3">
                    <div>
                        <h3 className="text-lg font-bold text-foreground">{t(`services.items.${service.key}.name`)}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{service.duration}</p>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-muted-foreground">{t("services.startingAt")}</div>
                        <div className="text-xl font-bold gradient-text">{service.price}</div>
                    </div>
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                    {t(`services.items.${service.key}.desc`)}
                </p>

                <ul className="space-y-2 mb-6">
                    {service.features.map((feat) => (
                        <li key={feat} className="flex items-center gap-2 text-sm text-muted-foreground">
                            <CheckCircle className="w-3.5 h-3.5 text-primary shrink-0" />
                            {feat}
                        </li>
                    ))}
                </ul>

                <Link to="/booking">
                    <Button className="w-full bg-gradient-gold text-primary-foreground hover:opacity-90 font-semibold group/btn">
                        {t("services.bookNow")}
                        <ArrowRight className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
                    </Button>
                </Link>
            </div>
        </div>
    );
}

export default function Services() {
    const { t } = useLanguage();
    const { ref, isVisible } = useScrollAnimation<HTMLDivElement>({ threshold: 0.05 });

    return (
        <PageLayout>
            {/* Hero */}
            <section className="relative pt-32 pb-20 section-dark overflow-hidden">
                <div className="absolute inset-0 bg-hero-pattern" />
                <div className="container max-w-7xl mx-auto px-6 relative z-10 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-gold/20 text-xs font-semibold text-primary mb-6 animate-slide-up">
                        <Sparkles className="w-3.5 h-3.5" />
                        {t("services.title")}
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4 animate-slide-up" style={{ animationDelay: "0.1s" }}>
                        {t("services.subtitle")}
                    </h1>
                    <p className="text-muted-foreground max-w-xl mx-auto animate-slide-up" style={{ animationDelay: "0.2s" }}>
                        Premium detailing packages tailored for every vehicle type and budget.
                    </p>
                </div>
            </section>

            {/* Services Grid */}
            <section className="py-20 section-darker">
                <div
                    ref={ref}
                    className="container max-w-7xl mx-auto px-6"
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {serviceData.map((service, i) => (
                            <ServiceCard key={service.key} service={service} index={i} isVisible={isVisible} />
                        ))}
                    </div>
                </div>
            </section>

            <BookingCTA />
        </PageLayout>
    );
}
