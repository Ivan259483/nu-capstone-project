import { useState } from "react";
import { MapPin, Phone, Mail, Clock, Send, CheckCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageLayout from "@/components/PageLayout";
import { cn } from "@/lib/utils";

const contactInfo = [
    { icon: MapPin, key: "address", valueKey: "addressValue" },
    { icon: Phone, key: "phone", valueKey: "phoneValue" },
    { icon: Mail, key: "email", valueKey: "emailValue" },
    { icon: Clock, key: "hours", valueKey: "hoursValue" },
] as const;

export default function Contact() {
    const { t } = useLanguage();
    const { ref, isVisible } = useScrollAnimation({ threshold: 0.1 });
    const [form, setForm] = useState({ name: "", email: "", message: "" });
    const [sent, setSent] = useState(false);
    const update = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

    return (
        <PageLayout>
            {/* Hero */}
            <section className="relative pt-32 pb-16 section-dark overflow-hidden">
                <div className="absolute inset-0 bg-hero-pattern" />
                <div className="container max-w-7xl mx-auto px-6 relative z-10 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-gold/20 text-xs font-semibold text-primary mb-6 animate-slide-up">
                        <Mail className="w-3.5 h-3.5" />
                        {t("contact.title")}
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4 animate-slide-up" style={{ animationDelay: "0.1s" }}>
                        {t("contact.title")}
                    </h1>
                    <p className="text-muted-foreground animate-slide-up" style={{ animationDelay: "0.2s" }}>
                        {t("contact.subtitle")}
                    </p>
                </div>
            </section>

            <section className="py-16 section-darker">
                <div
                    ref={ref}
                    className="container max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12"
                >
                    {/* Contact Info */}
                    <div className={cn("reveal-left space-y-6", isVisible ? "visible" : "")}>
                        <h2 className="text-2xl font-bold text-foreground mb-6">{t("contact.sendMessage")}</h2>

                        {contactInfo.map(({ icon: Icon, key, valueKey }, i) => (
                            <div
                                key={key}
                                className="flex items-start gap-4 glass rounded-xl p-4 border border-gold/10 hover:border-gold/25 transition-all duration-300 group"
                                style={{ transitionDelay: `${i * 80}ms` }}
                            >
                                <div className="w-10 h-10 rounded-lg bg-gold/10 border border-gold/15 flex items-center justify-center shrink-0 group-hover:bg-gold/20 transition-colors">
                                    <Icon className="w-4 h-4 text-primary" />
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{t(`contact.${key}`)}</div>
                                    <div className="text-sm font-medium text-foreground">{t(`contact.${valueKey}`)}</div>
                                </div>
                            </div>
                        ))}

                        {/* Map placeholder */}
                        <div className="glass rounded-2xl overflow-hidden border border-gold/10 h-52 flex items-center justify-center relative">
                            <div className="absolute inset-0 bg-gradient-to-br from-zinc-900/60 to-zinc-950/80" />
                            <div className="absolute inset-0 opacity-10"
                                style={{
                                    backgroundImage: "repeating-linear-gradient(0deg, rgba(212,175,55,0.1) 0px, rgba(212,175,55,0.1) 1px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, rgba(212,175,55,0.1) 0px, rgba(212,175,55,0.1) 1px, transparent 1px, transparent 40px)"
                                }}
                            />
                            <div className="relative z-10 flex flex-col items-center gap-2 text-muted-foreground">
                                <MapPin className="w-8 h-8 text-primary animate-bounce" />
                                <span className="text-sm">Las Piñas, Philippines</span>
                            </div>
                        </div>
                    </div>

                    {/* Contact Form */}
                    <div className={cn("reveal-right", isVisible ? "visible" : "")}>
                        {sent ? (
                            <div className="glass rounded-3xl p-12 text-center border border-gold/20 animate-scale-in h-full flex flex-col items-center justify-center">
                                <div className="w-16 h-16 rounded-full bg-gradient-gold mx-auto mb-5 flex items-center justify-center glow-gold">
                                    <CheckCircle className="w-8 h-8 text-primary-foreground" />
                                </div>
                                <h3 className="text-xl font-bold text-foreground mb-2">{t("contact.sent")}</h3>
                                <p className="text-muted-foreground">{t("contact.sentMsg")}</p>
                                <Button
                                    onClick={() => { setSent(false); setForm({ name: "", email: "", message: "" }); }}
                                    variant="outline"
                                    className="mt-6 border-gold/30 text-primary hover:bg-gold/10"
                                >
                                    Send Another
                                </Button>
                            </div>
                        ) : (
                            <div className="glass rounded-3xl p-8 border border-gold/15 space-y-5">
                                <h2 className="text-2xl font-bold text-foreground mb-2">{t("contact.sendMessage")}</h2>
                                <div>
                                    <Label className="text-sm text-muted-foreground mb-1.5 block">{t("contact.yourName")}</Label>
                                    <Input
                                        value={form.name}
                                        onChange={(e) => update("name", e.target.value)}
                                        placeholder="Juan dela Cruz"
                                        className="bg-background/40 border border-gold/20 focus:border-gold/50 focus:ring-1 focus:ring-gold/50 transition-colors"
                                    />
                                </div>
                                <div>
                                    <Label className="text-sm text-muted-foreground mb-1.5 block">{t("contact.yourEmail")}</Label>
                                    <Input
                                        type="email"
                                        value={form.email}
                                        onChange={(e) => update("email", e.target.value)}
                                        placeholder="juan@email.com"
                                        className="bg-background/40 border border-gold/20 focus:border-gold/50 focus:ring-1 focus:ring-gold/50 transition-colors"
                                    />
                                </div>
                                <div>
                                    <Label className="text-sm text-muted-foreground mb-1.5 block">{t("contact.yourMessage")}</Label>
                                    <textarea
                                        value={form.message}
                                        onChange={(e) => update("message", e.target.value)}
                                        placeholder={t("contact.messagePlaceholder")}
                                        rows={5}
                                        className="w-full px-3 py-2 rounded-lg bg-background/40 border border-gold/20 focus:border-gold/50 focus:ring-1 focus:ring-gold/50 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none transition-colors"
                                    />
                                </div>
                                <Button
                                    onClick={() => setSent(true)}
                                    disabled={!form.name || !form.email || !form.message}
                                    className="w-full bg-gradient-gold text-primary-foreground hover:opacity-90 glow-gold-sm disabled:opacity-40 group"
                                >
                                    <Send className="w-4 h-4 mr-2 group-hover:translate-x-1 transition-transform" />
                                    {t("contact.send")}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </PageLayout>
    );
}
