import { useState } from "react";
import { Calendar, Car, User, CheckCircle, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageLayout from "@/components/PageLayout";
import { cn } from "@/lib/utils";

const serviceOptions = [
    { key: "exterior", price: "₱499" },
    { key: "interior", price: "₱699" },
    { key: "paint", price: "₱1,499" },
    { key: "ceramic", price: "₱3,999" },
    { key: "engine", price: "₱799" },
    { key: "full", price: "₱5,499" },
] as const;

const vehicleTypes = ["sedan", "suv", "truck", "van", "sports"] as const;
const timeSlots = ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"];

interface FormData {
    service: string;
    vehicle: string;
    vehicleMake: string;
    vehiclePlate: string;
    date: string;
    time: string;
    name: string;
    email: string;
    phone: string;
    notes: string;
}

export default function Booking() {
    const { t } = useLanguage();
    const [step, setStep] = useState(1);
    const [submitted, setSubmitted] = useState(false);
    const [form, setForm] = useState<FormData>({
        service: "",
        vehicle: "",
        vehicleMake: "",
        vehiclePlate: "",
        date: "",
        time: "",
        name: "",
        email: "",
        phone: "",
        notes: "",
    });

    const update = (key: keyof FormData, value: string) =>
        setForm((f) => ({ ...f, [key]: value }));

    const steps = [
        { label: t("booking.step1"), icon: Car, num: 1 },
        { label: t("booking.step2"), icon: Calendar, num: 2 },
        { label: t("booking.step3"), icon: User, num: 3 },
    ];

    const canNext = (s: number) => {
        if (s === 1) return form.service && form.vehicle;
        if (s === 2) return form.date && form.time;
        return form.name && form.email && form.phone;
    };

    const handleSubmit = () => setSubmitted(true);

    return (
        <PageLayout>
            {/* Hero */}
            <section className="relative pt-32 pb-12 section-dark overflow-hidden">
                <div className="absolute inset-0 bg-hero-pattern" />
                <div className="container max-w-3xl mx-auto px-6 relative z-10 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-gold/20 text-xs font-semibold text-primary mb-6 animate-slide-up">
                        <Calendar className="w-3.5 h-3.5" />
                        {t("booking.title")}
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-3 animate-slide-up" style={{ animationDelay: "0.1s" }}>
                        {t("booking.title")}
                    </h1>
                    <p className="text-muted-foreground animate-slide-up" style={{ animationDelay: "0.2s" }}>
                        {t("booking.subtitle")}
                    </p>
                </div>
            </section>

            <section className="py-16 section-darker">
                <div className="container max-w-2xl mx-auto px-6">
                    {submitted ? (
                        <div className="glass rounded-3xl p-12 text-center border border-gold/20 animate-scale-in">
                            <div className="w-20 h-20 rounded-full bg-gradient-gold mx-auto mb-6 flex items-center justify-center glow-gold animate-pulse-gold">
                                <CheckCircle className="w-10 h-10 text-primary-foreground" />
                            </div>
                            <h2 className="text-2xl font-bold text-foreground mb-3">{t("booking.success")}</h2>
                            <p className="text-muted-foreground mb-8">{t("booking.successMsg")}</p>
                            <Button
                                onClick={() => { setSubmitted(false); setStep(1); setForm({ service: "", vehicle: "", vehicleMake: "", vehiclePlate: "", date: "", time: "", name: "", email: "", phone: "", notes: "" }); }}
                                className="bg-gradient-gold text-primary-foreground hover:opacity-90"
                            >
                                {t("booking.bookAnother")}
                            </Button>
                        </div>
                    ) : (
                        <>
                            {/* Progress Steps */}
                            <div className="flex items-center justify-between mb-10 relative">
                                <div className="absolute top-5 left-12 right-12 h-0.5 bg-border" />
                                <div
                                    className="absolute top-5 left-12 h-0.5 bg-gradient-gold transition-all duration-500"
                                    style={{ width: `calc(${((step - 1) / 2) * 100}% - 2rem * ${(step - 1) / 2})` }}
                                />
                                {steps.map(({ label, icon: Icon, num }) => (
                                    <div key={num} className="relative flex flex-col items-center gap-2">
                                        <div
                                            className={cn(
                                                "w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all duration-400 z-10",
                                                num < step
                                                    ? "bg-gradient-gold border-gold text-primary-foreground"
                                                    : num === step
                                                        ? "bg-background border-primary text-primary glow-gold-sm"
                                                        : "bg-background border-border text-muted-foreground"
                                            )}
                                        >
                                            {num < step ? <CheckCircle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                                        </div>
                                        <span className={cn("text-xs font-medium hidden sm:block", num === step ? "text-primary" : "text-muted-foreground")}>
                                            {label}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {/* Form Card */}
                            <div className="glass rounded-3xl p-8 border border-gold/15">
                                {/* Step 1 */}
                                {step === 1 && (
                                    <div className="animate-slide-up space-y-6">
                                        <div>
                                            <Label className="text-sm text-muted-foreground mb-3 block">{t("booking.service")}</Label>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                {serviceOptions.map(({ key, price }) => (
                                                    <button
                                                        key={key}
                                                        onClick={() => update("service", key)}
                                                        className={cn(
                                                            "p-3 rounded-xl border text-left transition-all duration-300",
                                                            form.service === key
                                                                ? "border-gold/60 bg-gold/10 text-primary"
                                                                : "border-border hover:border-gold/30 text-muted-foreground hover:text-foreground"
                                                        )}
                                                    >
                                                        <div className="text-xs font-semibold leading-tight mb-1">{t(`services.items.${key}.name`)}</div>
                                                        <div className={cn("text-sm font-bold", form.service === key ? "text-primary" : "text-muted-foreground")}>{price}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <Label className="text-sm text-muted-foreground mb-3 block">{t("booking.vehicle")}</Label>
                                            <div className="flex flex-wrap gap-2">
                                                {vehicleTypes.map((v) => (
                                                    <button
                                                        key={v}
                                                        onClick={() => update("vehicle", v)}
                                                        className={cn(
                                                            "px-4 py-2 rounded-full border text-sm transition-all duration-300",
                                                            form.vehicle === v
                                                                ? "border-gold/60 bg-gold/10 text-primary"
                                                                : "border-border hover:border-gold/30 text-muted-foreground"
                                                        )}
                                                    >
                                                        {t(`booking.vehicles.${v}`)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <Label className="text-sm text-muted-foreground mb-1.5 block">{t("booking.vehicleMake")}</Label>
                                                <Input
                                                    value={form.vehicleMake}
                                                    onChange={(e) => update("vehicleMake", e.target.value)}
                                                    placeholder="e.g. Toyota Vios"
                                                    className="bg-muted/40 border-border focus:border-primary"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-sm text-muted-foreground mb-1.5 block">{t("booking.vehiclePlate")}</Label>
                                                <Input
                                                    value={form.vehiclePlate}
                                                    onChange={(e) => update("vehiclePlate", e.target.value)}
                                                    placeholder="e.g. ABC 1234"
                                                    className="bg-muted/40 border-border focus:border-primary"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Step 2 */}
                                {step === 2 && (
                                    <div className="animate-slide-up space-y-6">
                                        <div>
                                            <Label className="text-sm text-muted-foreground mb-1.5 block">{t("booking.date")}</Label>
                                            <Input
                                                type="date"
                                                value={form.date}
                                                onChange={(e) => update("date", e.target.value)}
                                                min={new Date().toISOString().split("T")[0]}
                                                className="bg-muted/40 border-border focus:border-primary"
                                            />
                                        </div>

                                        <div>
                                            <Label className="text-sm text-muted-foreground mb-3 block">{t("booking.time")}</Label>
                                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                                {timeSlots.map((slot) => (
                                                    <button
                                                        key={slot}
                                                        onClick={() => update("time", slot)}
                                                        className={cn(
                                                            "py-2.5 rounded-xl border text-sm font-medium transition-all duration-300",
                                                            form.time === slot
                                                                ? "border-gold/60 bg-gold/10 text-primary"
                                                                : "border-border hover:border-gold/30 text-muted-foreground"
                                                        )}
                                                    >
                                                        {slot}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Summary so far */}
                                        {form.service && (
                                            <div className="glass-subtle rounded-xl p-4 border border-gold/10">
                                                <div className="text-xs text-muted-foreground mb-2 uppercase tracking-widest">Summary</div>
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-foreground">{t(`services.items.${form.service}.name`)}</span>
                                                    <span className="text-primary font-semibold">
                                                        {serviceOptions.find((s) => s.key === form.service)?.price}
                                                    </span>
                                                </div>
                                                {form.vehicle && (
                                                    <div className="text-xs text-muted-foreground mt-1">
                                                        {t(`booking.vehicles.${form.vehicle}`)} {form.vehicleMake && `• ${form.vehicleMake}`}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Step 3 */}
                                {step === 3 && (
                                    <div className="animate-slide-up space-y-4">
                                        <div>
                                            <Label className="text-sm text-muted-foreground mb-1.5 block">{t("booking.name")}</Label>
                                            <Input
                                                value={form.name}
                                                onChange={(e) => update("name", e.target.value)}
                                                placeholder="Juan dela Cruz"
                                                className="bg-muted/40 border-border focus:border-primary"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-sm text-muted-foreground mb-1.5 block">{t("booking.email")}</Label>
                                            <Input
                                                type="email"
                                                value={form.email}
                                                onChange={(e) => update("email", e.target.value)}
                                                placeholder="juan@email.com"
                                                className="bg-muted/40 border-border focus:border-primary"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-sm text-muted-foreground mb-1.5 block">{t("booking.phone")}</Label>
                                            <Input
                                                type="tel"
                                                value={form.phone}
                                                onChange={(e) => update("phone", e.target.value)}
                                                placeholder="+63 912 345 6789"
                                                className="bg-muted/40 border-border focus:border-primary"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-sm text-muted-foreground mb-1.5 block">{t("booking.notes")} <span className="text-xs">({t("common.optional")})</span></Label>
                                            <textarea
                                                value={form.notes}
                                                onChange={(e) => update("notes", e.target.value)}
                                                placeholder={t("booking.notesPlaceholder")}
                                                rows={3}
                                                className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border focus:border-primary text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none transition-colors"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Navigation */}
                                <div className="flex justify-between mt-8 pt-6 border-t border-border">
                                    <Button
                                        variant="outline"
                                        onClick={() => setStep((s) => s - 1)}
                                        disabled={step === 1}
                                        className="border-border hover:border-gold/30 text-muted-foreground hover:text-foreground"
                                    >
                                        <ChevronLeft className="w-4 h-4 mr-1" />
                                        {t("booking.back")}
                                    </Button>

                                    {step < 3 ? (
                                        <Button
                                            onClick={() => setStep((s) => s + 1)}
                                            disabled={!canNext(step)}
                                            className="bg-gradient-gold text-primary-foreground hover:opacity-90 disabled:opacity-40"
                                        >
                                            {t("booking.next")}
                                            <ChevronRight className="w-4 h-4 ml-1" />
                                        </Button>
                                    ) : (
                                        <Button
                                            onClick={handleSubmit}
                                            disabled={!canNext(3)}
                                            className="bg-gradient-gold text-primary-foreground glow-gold-sm hover:opacity-90 disabled:opacity-40"
                                        >
                                            <Sparkles className="w-4 h-4 mr-2" />
                                            {t("booking.confirm")}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </section>
        </PageLayout>
    );
}
