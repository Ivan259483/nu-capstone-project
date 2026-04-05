import { Shield, Star, Zap, Award, Users, Car } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScrollAnimation, useCounter } from "@/hooks/useScrollAnimation";
import PageLayout from "@/components/PageLayout";
import BookingCTA from "@/components/BookingCTA";
import { cn } from "@/lib/utils";

const team = [
    { name: "Marcos dela Cruz", role: "Head Detailer & Founder", initials: "MC", years: "14 yrs", color: "from-amber-500/30 to-amber-600/20" },
    { name: "Rico Santiago", role: "Ceramic Coating Specialist", initials: "RS", years: "9 yrs", color: "from-sky-500/30 to-sky-600/20" },
    { name: "Liza Buenaventura", role: "Interior Detail Expert", initials: "LB", years: "7 yrs", color: "from-purple-500/30 to-purple-600/20" },
];

const values = [
    { icon: Star, key: "quality", keyDesc: "qualityDesc" },
    { icon: Shield, key: "trust", keyDesc: "trustDesc" },
    { icon: Zap, key: "passion", keyDesc: "passionDesc" },
] as const;

function CounterStat({ value, suffix, label, isVisible }: { value: number; suffix: string; label: string; isVisible: boolean }) {
    const count = useCounter(value, 2200, isVisible);
    return (
        <div className="text-center">
            <div className="text-3xl font-bold gradient-text mb-1">{count.toLocaleString()}{suffix}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-widest">{label}</div>
        </div>
    );
}

export default function About() {
    const { t } = useLanguage();
    const { ref: heroRef, isVisible: heroVisible } = useScrollAnimation({ threshold: 0.1 });
    const { ref: statsRef, isVisible: statsVisible } = useScrollAnimation({ threshold: 0.3 });
    const { ref: teamRef, isVisible: teamVisible } = useScrollAnimation({ threshold: 0.1 });
    const { ref: valuesRef, isVisible: valuesVisible } = useScrollAnimation({ threshold: 0.1 });

    return (
        <PageLayout>
            {/* Hero */}
            <section className="relative pt-32 pb-20 section-dark overflow-hidden">
                <div className="absolute inset-0 bg-hero-pattern" />
                <div className="container max-w-7xl mx-auto px-6 relative z-10 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-gold/20 text-xs font-semibold text-primary mb-6 animate-slide-up">
                        <Car className="w-3.5 h-3.5" />
                        {t("about.title")}
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4 animate-slide-up" style={{ animationDelay: "0.1s" }}>
                        {t("about.title")}
                    </h1>
                    <p className="text-muted-foreground max-w-xl mx-auto animate-slide-up" style={{ animationDelay: "0.2s" }}>
                        {t("about.subtitle")}
                    </p>
                </div>
            </section>

            {/* Story Section */}
            <section className="py-20 section-darker">
                <div
                    ref={heroRef}
                    className="container max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center"
                >
                    <div className={cn("reveal-left", heroVisible ? "visible" : "")}>
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-gold/20 text-xs font-semibold text-primary mb-5">
                            {t("about.story")}
                        </div>
                        <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-6 leading-tight">
                            {t("about.story")}
                        </h2>
                        <p className="text-muted-foreground leading-relaxed text-base">
                            {t("about.storyText")}
                        </p>
                        <div className="mt-8 flex items-center gap-6">
                            <div className="text-center">
                                <div className="text-2xl font-bold gradient-text">2010</div>
                                <div className="text-xs text-muted-foreground">Founded</div>
                            </div>
                            <div className="w-px h-10 bg-border" />
                            <div className="text-center">
                                <div className="text-2xl font-bold gradient-text">3</div>
                                <div className="text-xs text-muted-foreground">Locations</div>
                            </div>
                            <div className="w-px h-10 bg-border" />
                            <div className="text-center">
                                <div className="text-2xl font-bold gradient-text">5k+</div>
                                <div className="text-xs text-muted-foreground">Cars Detailed</div>
                            </div>
                        </div>
                    </div>

                    <div className={cn("reveal-right", heroVisible ? "visible" : "")}>
                        <div className="relative">
                            <div className="w-full h-80 glass rounded-3xl border border-gold/15 flex items-center justify-center overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-amber-900/30 to-amber-950/60" />
                                <div className="relative z-10 text-center p-8">
                                    <div className="w-20 h-20 rounded-full bg-gradient-gold mx-auto mb-4 flex items-center justify-center glow-gold animate-pulse-gold">
                                        <Award className="w-10 h-10 text-primary-foreground" />
                                    </div>
                                    <div className="text-lg font-bold text-foreground mb-2">AutoShine</div>
                                    <div className="text-sm text-muted-foreground">Premium Auto Detailing</div>
                                    <div className="flex justify-center gap-1 mt-3">
                                        {[...Array(5)].map((_, i) => (
                                            <Star key={i} className="w-4 h-4 fill-primary text-primary" />
                                        ))}
                                    </div>
                                </div>
                            </div>
                            {/* Floating badge */}
                            <div className="absolute -bottom-4 -right-4 glass rounded-2xl px-4 py-3 border border-gold/20 animate-float">
                                <div className="text-xs text-muted-foreground">Since</div>
                                <div className="text-xl font-bold gradient-text">2010</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Stats */}
            <section className="py-16 section-dark border-y border-gold/10 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-radial-gold opacity-50" />
                <div
                    ref={statsRef}
                    className={cn("container max-w-4xl mx-auto px-6 reveal", statsVisible ? "visible" : "")}
                >
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-10">
                        <CounterStat value={5000} suffix="+" label={t("stats.carsDetailed")} isVisible={statsVisible} />
                        <CounterStat value={14} suffix="+" label={t("stats.yearsExperience")} isVisible={statsVisible} />
                        <CounterStat value={4} suffix=".9" label={t("stats.rating")} isVisible={statsVisible} />
                        <CounterStat value={2500} suffix="+" label={t("stats.happyClients")} isVisible={statsVisible} />
                    </div>
                </div>
            </section>

            {/* Team */}
            <section className="py-20 section-darker">
                <div className="container max-w-6xl mx-auto px-6">
                    <div
                        ref={teamRef}
                        className={cn("text-center mb-14 reveal", teamVisible ? "visible" : "")}
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-gold/20 text-xs font-semibold text-primary mb-4">
                            <Users className="w-3.5 h-3.5" />
                            {t("about.team")}
                        </div>
                        <h2 className="text-3xl font-bold text-foreground mb-3">{t("about.team")}</h2>
                        <p className="text-muted-foreground">{t("about.teamSubtitle")}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        {team.map((member, i) => (
                            <div
                                key={member.name}
                                className={cn(
                                    "reveal glass rounded-2xl p-8 text-center hover:-translate-y-2 transition-all duration-400 hover:border-gold/30 hover:glow-gold-sm group",
                                    teamVisible ? "visible" : ""
                                )}
                                style={{ transitionDelay: `${i * 100}ms` }}
                            >
                                <div className={cn(
                                    "w-20 h-20 rounded-full bg-gradient-to-br mx-auto mb-4 flex items-center justify-center text-xl font-bold text-white group-hover:scale-110 transition-transform",
                                    member.color
                                )}>
                                    {member.initials}
                                </div>
                                <h3 className="text-base font-semibold text-foreground mb-1">{member.name}</h3>
                                <p className="text-sm text-primary mb-2">{member.role}</p>
                                <p className="text-xs text-muted-foreground">{member.years} experience</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Values */}
            <section className="py-20 section-dark">
                <div className="container max-w-5xl mx-auto px-6">
                    <div
                        ref={valuesRef}
                        className={cn("text-center mb-14 reveal", valuesVisible ? "visible" : "")}
                    >
                        <h2 className="text-3xl font-bold text-foreground mb-3">{t("about.values")}</h2>
                        <div className="w-24 h-0.5 bg-gradient-gold mx-auto" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        {values.map(({ icon: Icon, key, keyDesc }, i) => (
                            <div
                                key={key}
                                className={cn(
                                    "reveal glass rounded-2xl p-8 text-center hover:-translate-y-1 transition-all duration-400 hover:border-gold/30 group",
                                    valuesVisible ? "visible" : ""
                                )}
                                style={{ transitionDelay: `${i * 100}ms` }}
                            >
                                <div className="w-12 h-12 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center mx-auto mb-4 group-hover:bg-gold/20 transition-colors">
                                    <Icon className="w-6 h-6 text-primary" />
                                </div>
                                <h3 className="text-base font-semibold text-foreground mb-2">{t(`about.${key}`)}</h3>
                                <p className="text-sm text-muted-foreground">{t(`about.${keyDesc}`)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <BookingCTA />
        </PageLayout>
    );
}
