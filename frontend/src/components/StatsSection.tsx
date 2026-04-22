import { useLanguage } from "@/contexts/LanguageContext";
import { useScrollAnimation, useCounter } from "@/hooks/useScrollAnimation";

interface StatItemProps {
    value: number;
    suffix: string;
    label: string;
    delay: number;
    isVisible: boolean;
}

function StatItem({ value, suffix, label, delay, isVisible }: StatItemProps) {
    const count = useCounter(value, 2200, isVisible);
    return (
        <div
            className="text-center"
            style={{ transitionDelay: `${delay}ms` }}
        >
            <div className="text-4xl sm:text-5xl font-bold gradient-text mb-1">
                {count.toLocaleString()}{suffix}
            </div>
            <div className="text-sm text-muted-foreground font-medium uppercase tracking-widest">
                {label}
            </div>
        </div>
    );
}

export default function StatsSection() {
    const { t } = useLanguage();
    const { ref, isVisible } = useScrollAnimation<HTMLDivElement>({ threshold: 0.1 });

    const stats = [
        { value: 5000, suffix: "+", label: t("stats.carsDetailed"), delay: 0 },
        { value: 14, suffix: "+", label: t("stats.yearsExperience"), delay: 100 },
        { value: 4, suffix: ".9", label: t("stats.rating"), delay: 200 },
        { value: 3, suffix: "", label: t("stats.locations"), delay: 300 },
    ];

    return (
        <section className="relative py-16 section-darker overflow-hidden">
            <div className="absolute inset-0 bg-gradient-radial-gold opacity-50" />
            <div className="gold-line absolute top-0 left-0 right-0" />
            <div className="gold-line absolute bottom-0 left-0 right-0" />

            <div
                ref={ref}
                className="container max-w-5xl mx-auto px-6"
            >
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-10">
                    {stats.map((stat) => (
                        <StatItem
                            key={stat.label}
                            {...stat}
                            isVisible={isVisible}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}
