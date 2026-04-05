import { useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Wind, Layers, Shield, Wrench, Package, CheckCircle, ArrowRight, CarFront, Car, Truck } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Button } from "@/components/ui/button";
import PageLayout from "@/components/PageLayout";
import BookingCTA from "@/components/BookingCTA";
import { cn } from "@/lib/utils";

export type VehicleType = "sedan" | "suv" | "van";
export const vehicleMultipliers: Record<VehicleType, number> = {
    sedan: 1.0,
    suv: 1.3,
    van: 1.5,
};

const serviceData = [
    {
        key: "exterior",
        icon: Sparkles,
        basePrice: 499,
        duration: "2–3 hrs",
        features: ["Hand wash & rinse", "Clay bar treatment", "Spray wax application", "Tire & rim cleaning", "Window cleaning"],
        popular: false,
    },
    {
        key: "interior",
        icon: Wind,
        basePrice: 699,
        duration: "3–4 hrs",
        features: ["Deep vacuum all surfaces", "Steam cleaning", "Leather conditioning", "Dashboard detailing", "Odor elimination"],
        popular: false,
    },
    {
        key: "paint",
        icon: Layers,
        basePrice: 1499,
        duration: "5–8 hrs",
        features: ["Paint inspection", "Single-stage machine polish", "Swirl removal", "Scratch reduction", "Paint sealant"],
        popular: false,
    },
    {
        key: "ceramic",
        icon: Shield,
        basePrice: 3999,
        duration: "1–2 days",
        features: ["Paint correction prep", "Nano-ceramic application", "2-year protection", "UV & chemical resistance", "Hydrophobic coating"],
        popular: true,
    },
    {
        key: "engine",
        icon: Wrench,
        basePrice: 799,
        duration: "2–3 hrs",
        features: ["Degreaser application", "Soft brush agitation", "Low-pressure rinse", "Plastic dressing", "Corrosion inhibitor"],
        popular: false,
    },
    {
        key: "full",
        icon: Package,
        basePrice: 5499,
        duration: "2 days",
        features: ["Full exterior wash", "Interior deep clean", "Paint correction", "Ceramic coating", "Engine bay detail", "Final inspection"],
        popular: false,
    },
] as const;

function ServiceCard({
    service,
    index,
    isVisible,
    vehicleType,
}: {
    service: (typeof serviceData)[number];
    index: number;
    isVisible: boolean;
    vehicleType: VehicleType;
}) {
    const { t } = useLanguage();
    const Icon = service.icon;

    const multiplier = vehicleMultipliers[vehicleType];
    const computedPrice = Math.round(service.basePrice * multiplier);
    const formattedPrice = `₱${computedPrice.toLocaleString()}`;

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
            <div className={cn("h-24 bg-gradient-to-br relative from-gold/10 to-transparent", service.popular ? "mt-7" : "")}>
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
                        <div className="text-xl font-bold gradient-text">{formattedPrice}</div>
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
    const [vehicleType, setVehicleType] = useState<VehicleType>("sedan");

    const vehicleOptions: { type: VehicleType; label: string; icon: React.ElementType }[] = [
        { type: "sedan", label: "Sedan", icon: CarFront },
        { type: "suv", label: "SUV", icon: Car },
        { type: "van", label: "Van / AUV", icon: Truck },
    ];

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

            {/* Services Filter and Grid */}
            <section className="relative pt-12 pb-32 mb-12 section-darker z-20 min-h-max isolate">
                <div
                    ref={ref}
                    className="container max-w-7xl mx-auto px-6 relative z-10"
                >
                    {/* Vehicle Type Toggle */}
                    <div className={cn("reveal flex justify-center mb-12", isVisible ? "visible" : "")}>
                        <div className="inline-flex p-1.5 bg-background/50 backdrop-blur-md rounded-2xl border border-gold/10">
                            {vehicleOptions.map((opt) => {
                                const Icon = opt.icon;
                                const isActive = vehicleType === opt.type;
                                return (
                                    <button
                                        key={opt.type}
                                        onClick={() => setVehicleType(opt.type)}
                                        className={cn(
                                            "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300",
                                            isActive 
                                                ? "bg-gradient-gold text-primary-foreground shadow-lg shadow-gold/20 glow-gold-sm" 
                                                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                                        )}
                                    >
                                        <Icon className="w-4 h-4" />
                                        <span>{opt.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {serviceData.map((service, i) => (
                            <ServiceCard key={service.key} service={service} index={i} isVisible={isVisible} vehicleType={vehicleType} />
                        ))}
                    </div>
                </div>
            </section>

            <BookingCTA />
        </PageLayout>
    );
}
