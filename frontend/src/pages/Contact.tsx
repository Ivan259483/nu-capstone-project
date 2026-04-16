import { useState } from "react";
import {
    MapPin, Phone, Mail, Clock, Send, CheckCircle,
    MessageSquare, ArrowRight, Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageLayout from "@/components/PageLayout";
import LocationMapSection from "@/components/LocationMapSection";
import { cn } from "@/lib/utils";

/* ── Framer Variants ── */
const EASE = [0.16, 1, 0.3, 1] as const;

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

const stagger: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};

const slideLeft: Variants = {
    hidden: { opacity: 0, x: -50 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.75, ease: EASE } },
};

const slideRight: Variants = {
    hidden: { opacity: 0, x: 50 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.75, ease: EASE } },
};

const cardReveal: Variants = {
    hidden: { opacity: 0, y: 30, scale: 0.95 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.55, ease: EASE, delay: i * 0.1 },
    }),
};

const formReveal: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, ease: EASE, delay: 0.2 + i * 0.08 },
    }),
};

/* ── Contact info data ── */
const contactInfo = [
    { icon: MapPin, key: "address", valueKey: "addressValue", color: "from-rose-500 to-pink-600", glowColor: "rgba(244,63,94,0.12)" },
    { icon: Phone, key: "phone", valueKey: "phoneValue", color: "from-emerald-500 to-teal-600", glowColor: "rgba(16,185,129,0.12)" },
    { icon: Mail, key: "email", valueKey: "emailValue", color: "from-amber-500 to-orange-600", glowColor: "rgba(245,158,11,0.12)" },
    { icon: Clock, key: "hours", valueKey: "hoursValue", color: "from-violet-500 to-purple-600", glowColor: "rgba(139,92,246,0.12)" },
] as const;

export default function Contact() {
    const { t } = useLanguage();
    const [form, setForm] = useState({ name: "", email: "", message: "" });
    const [sent, setSent] = useState(false);
    const [focused, setFocused] = useState<string | null>(null);
    const update = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

    return (
        <PageLayout>
            {/* ══════════════════════════════════
                HERO SECTION
            ══════════════════════════════════ */}
            <section className="relative pt-36 pb-24 overflow-hidden">
                <div className="absolute inset-0 bg-hero-pattern" />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
                <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-amber-500/[0.06] blur-[150px] rounded-full pointer-events-none" />
                <div className="absolute top-40 right-0 w-[400px] h-[300px] bg-violet-500/[0.04] blur-[120px] rounded-full pointer-events-none" />

                <div className="container max-w-5xl mx-auto px-6 relative z-10 text-center">
                    <motion.div
                        variants={stagger}
                        initial="hidden"
                        animate="visible"
                    >
                        {/* Badge */}
                        <motion.div
                            variants={fadeUp}
                            className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-bold uppercase tracking-[0.3em] text-amber-400/80 mb-6 backdrop-blur-sm"
                        >
                            <MessageSquare className="w-3.5 h-3.5" />
                            {t("contact.title")}
                        </motion.div>

                        {/* Headline */}
                        <motion.h1
                            variants={fadeUp}
                            className="text-5xl sm:text-6xl lg:text-7xl font-serif font-medium text-white tracking-tight mb-5 leading-[1.05]"
                        >
                            Get in{" "}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 italic">
                                Touch
                            </span>
                        </motion.h1>

                        {/* Subtitle */}
                        <motion.p
                            variants={fadeUp}
                            className="text-white/35 text-base md:text-lg max-w-2xl mx-auto font-light leading-relaxed"
                        >
                            {t("contact.subtitle")}
                        </motion.p>

                        {/* Trust pills */}
                        <motion.div
                            variants={fadeUp}
                            className="flex items-center justify-center gap-6 mt-8"
                        >
                            {["Las Piñas City", "Same-Day Reply", "Free Consultation"].map((item) => (
                                <span
                                    key={item}
                                    className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/20 px-3 py-1.5 rounded-full border border-white/5"
                                >
                                    {item}
                                </span>
                            ))}
                        </motion.div>
                    </motion.div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/15 to-transparent" />
            </section>

            {/* ══════════════════════════════════
                CONTACT INFO + FORM
            ══════════════════════════════════ */}
            <section className="relative py-20 overflow-hidden">
                {/* Ambient blobs */}
                <div className="absolute top-20 left-0 w-[500px] h-[500px] bg-indigo-500/[0.02] blur-[140px] rounded-full pointer-events-none" />
                <div className="absolute bottom-20 right-0 w-[400px] h-[400px] bg-amber-500/[0.03] blur-[120px] rounded-full pointer-events-none" />

                <div className="container max-w-6xl mx-auto px-6 relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-16">
                    {/* ── Contact Info Cards ── */}
                    <motion.div
                        variants={stagger}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-60px" }}
                        className="space-y-5"
                    >
                        <motion.div variants={slideLeft}>
                            <h2 className="text-3xl sm:text-4xl font-serif font-medium text-white tracking-tight mb-2">
                                Contact{" "}
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 italic">
                                    Information
                                </span>
                            </h2>
                            <p className="text-white/30 text-sm font-light mb-8">
                                Reach out through any channel — we're always ready to help.
                            </p>
                        </motion.div>

                        {contactInfo.map(({ icon: Icon, key, valueKey, color, glowColor }, i) => (
                            <motion.div
                                key={key}
                                custom={i}
                                variants={cardReveal}
                                whileHover={{ y: -4, transition: { duration: 0.25 } }}
                                className="group relative flex items-start gap-4 p-5 rounded-2xl overflow-hidden
                                           ring-1 ring-white/[0.07] hover:ring-amber-500/20 transition-all duration-500"
                                style={{
                                    background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
                                    backdropFilter: "blur(12px)",
                                }}
                            >
                                {/* Hover glow */}
                                <div
                                    className="absolute top-0 right-0 w-32 h-32 rounded-full blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                                    style={{ background: glowColor }}
                                />

                                {/* Icon */}
                                <motion.div
                                    className={cn(
                                        "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-500",
                                        "bg-white/[0.05] border-white/10 group-hover:border-transparent",
                                        `group-hover:bg-gradient-to-br group-hover:${color}`
                                    )}
                                    whileHover={{ rotate: [0, -5, 5, 0], scale: 1.05 }}
                                    transition={{ duration: 0.5 }}
                                    style={{
                                        // Apply gradient on hover with inline style as fallback
                                    }}
                                >
                                    <Icon className="w-5 h-5 text-white/50 group-hover:text-white transition-colors duration-300" />
                                </motion.div>

                                {/* Text */}
                                <div className="relative z-10">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/25 mb-1.5">
                                        {t(`contact.${key}`)}
                                    </div>
                                    <div className="text-sm font-semibold text-white/70 group-hover:text-white transition-colors duration-300 leading-relaxed">
                                        {t(`contact.${valueKey}`)}
                                    </div>
                                </div>
                            </motion.div>
                        ))}

                        {/* Social badges */}
                        <motion.div
                            variants={fadeUp}
                            className="flex items-center gap-3 pt-4"
                        >
                            {["Facebook", "Instagram", "TikTok"].map((social) => (
                                <motion.span
                                    key={social}
                                    whileHover={{ scale: 1.05, y: -2 }}
                                    whileTap={{ scale: 0.97 }}
                                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white/40 hover:text-white/70
                                               bg-white/[0.03] border border-white/8 hover:border-amber-500/20 hover:bg-white/[0.06]
                                               transition-all duration-300 cursor-pointer"
                                >
                                    {social}
                                </motion.span>
                            ))}
                        </motion.div>
                    </motion.div>

                    {/* ── Contact Form ── */}
                    <motion.div
                        variants={slideRight}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-60px" }}
                    >
                        <AnimatePresence mode="wait">
                            {sent ? (
                                <motion.div
                                    key="success"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    transition={{ duration: 0.5, ease: EASE }}
                                    className="h-full flex flex-col items-center justify-center text-center p-12 rounded-3xl
                                               ring-1 ring-amber-500/20 overflow-hidden relative"
                                    style={{
                                        background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
                                        backdropFilter: "blur(12px)",
                                    }}
                                >
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[200px] bg-amber-500/[0.08] blur-[100px] rounded-full pointer-events-none" />
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ duration: 0.5, delay: 0.2, type: "spring", stiffness: 200 }}
                                        className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mb-6 shadow-2xl shadow-amber-500/30"
                                    >
                                        <CheckCircle className="w-10 h-10 text-white" />
                                    </motion.div>
                                    <h3 className="text-2xl font-bold text-white mb-2">{t("contact.sent")}</h3>
                                    <p className="text-white/40 text-sm mb-8">{t("contact.sentMsg")}</p>
                                    <motion.button
                                        whileHover={{ scale: 1.04 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={() => { setSent(false); setForm({ name: "", email: "", message: "" }); }}
                                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white/60 hover:text-white border border-white/15 hover:border-amber-500/30 transition-all duration-300"
                                    >
                                        Send Another <ArrowRight className="w-4 h-4" />
                                    </motion.button>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="form"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="relative rounded-3xl p-8 ring-1 ring-white/[0.07] overflow-hidden"
                                    style={{
                                        background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
                                        backdropFilter: "blur(12px)",
                                    }}
                                >
                                    {/* Corner glow */}
                                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-amber-500/[0.06] blur-[60px] rounded-full pointer-events-none" />

                                    <motion.div
                                        variants={stagger}
                                        initial="hidden"
                                        whileInView="visible"
                                        viewport={{ once: true }}
                                    >
                                        <motion.div variants={fadeUp} className="mb-7">
                                            <h2 className="text-2xl font-bold text-white mb-1.5 tracking-tight">
                                                {t("contact.sendMessage")}
                                            </h2>
                                            <p className="text-white/25 text-xs">We'll get back to you within 24 hours.</p>
                                        </motion.div>

                                        <div className="space-y-5">
                                            {/* Name field */}
                                            <motion.div custom={0} variants={formReveal}>
                                                <Label className="text-[11px] text-white/30 uppercase tracking-[0.2em] font-semibold mb-2 block">
                                                    {t("contact.yourName")}
                                                </Label>
                                                <div className="relative">
                                                    <Input
                                                        value={form.name}
                                                        onChange={(e) => update("name", e.target.value)}
                                                        onFocus={() => setFocused("name")}
                                                        onBlur={() => setFocused(null)}
                                                        placeholder="Juan dela Cruz"
                                                        className={cn(
                                                            "bg-white/[0.03] border border-white/10 rounded-xl h-12 text-sm text-white placeholder:text-white/20 transition-all duration-500",
                                                            focused === "name" && "border-amber-500/40 ring-1 ring-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.08)]"
                                                        )}
                                                    />
                                                    <motion.div
                                                        className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-amber-400 to-orange-500 rounded-full"
                                                        animate={{ width: focused === "name" ? "100%" : "0%" }}
                                                        transition={{ duration: 0.4, ease: EASE }}
                                                    />
                                                </div>
                                            </motion.div>

                                            {/* Email field */}
                                            <motion.div custom={1} variants={formReveal}>
                                                <Label className="text-[11px] text-white/30 uppercase tracking-[0.2em] font-semibold mb-2 block">
                                                    {t("contact.yourEmail")}
                                                </Label>
                                                <div className="relative">
                                                    <Input
                                                        type="email"
                                                        value={form.email}
                                                        onChange={(e) => update("email", e.target.value)}
                                                        onFocus={() => setFocused("email")}
                                                        onBlur={() => setFocused(null)}
                                                        placeholder="juan@email.com"
                                                        className={cn(
                                                            "bg-white/[0.03] border border-white/10 rounded-xl h-12 text-sm text-white placeholder:text-white/20 transition-all duration-500",
                                                            focused === "email" && "border-amber-500/40 ring-1 ring-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.08)]"
                                                        )}
                                                    />
                                                    <motion.div
                                                        className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-amber-400 to-orange-500 rounded-full"
                                                        animate={{ width: focused === "email" ? "100%" : "0%" }}
                                                        transition={{ duration: 0.4, ease: EASE }}
                                                    />
                                                </div>
                                            </motion.div>

                                            {/* Message field */}
                                            <motion.div custom={2} variants={formReveal}>
                                                <Label className="text-[11px] text-white/30 uppercase tracking-[0.2em] font-semibold mb-2 block">
                                                    {t("contact.yourMessage")}
                                                </Label>
                                                <div className="relative">
                                                    <textarea
                                                        value={form.message}
                                                        onChange={(e) => update("message", e.target.value)}
                                                        onFocus={() => setFocused("message")}
                                                        onBlur={() => setFocused(null)}
                                                        placeholder={t("contact.messagePlaceholder")}
                                                        rows={5}
                                                        className={cn(
                                                            "w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-white/20 outline-none resize-none transition-all duration-500",
                                                            focused === "message" && "border-amber-500/40 ring-1 ring-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.08)]"
                                                        )}
                                                    />
                                                    <motion.div
                                                        className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-amber-400 to-orange-500 rounded-full"
                                                        animate={{ width: focused === "message" ? "100%" : "0%" }}
                                                        transition={{ duration: 0.4, ease: EASE }}
                                                    />
                                                </div>
                                            </motion.div>

                                            {/* Submit button */}
                                            <motion.div custom={3} variants={formReveal}>
                                                <motion.button
                                                    whileHover={{ scale: 1.02 }}
                                                    whileTap={{ scale: 0.98 }}
                                                    onClick={() => setSent(true)}
                                                    disabled={!form.name || !form.email || !form.message}
                                                    className={cn(
                                                        "w-full h-13 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-300 group/btn cursor-pointer",
                                                        "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20",
                                                        "hover:shadow-amber-500/40 hover:from-amber-600 hover:to-orange-700",
                                                        "disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-none"
                                                    )}
                                                    style={{ height: "52px" }}
                                                >
                                                    <Send className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
                                                    {t("contact.send")}
                                                    <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                                                </motion.button>
                                            </motion.div>
                                        </div>
                                    </motion.div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </div>
            </section>

            {/* ══════════════════════════════════
                MAP CTA
            ══════════════════════════════════ */}
            <section className="relative py-20 px-6 overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-amber-500/[0.03] blur-[140px] rounded-full pointer-events-none" />

                <motion.div
                    variants={stagger}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-80px" }}
                    className="max-w-3xl mx-auto text-center relative z-10 mb-12"
                >
                    <motion.div
                        variants={fadeUp}
                        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs font-bold uppercase tracking-[0.2em] text-amber-400/80 mb-5"
                    >
                        <MapPin className="w-3.5 h-3.5" />
                        Visit Our Shop
                    </motion.div>
                    <motion.h2
                        variants={fadeUp}
                        className="text-3xl md:text-5xl font-serif font-medium text-white tracking-tight mb-5"
                    >
                        Find{" "}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 italic">
                            Us
                        </span>
                    </motion.h2>
                    <motion.p variants={fadeUp} className="text-white/35 text-base font-light">
                        Drop by our shop in Las Piñas City or book online — we're ready when you are.
                    </motion.p>
                </motion.div>
            </section>

            <LocationMapSection />
        </PageLayout>
    );
}
