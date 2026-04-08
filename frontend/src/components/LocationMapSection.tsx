import { useRef, useEffect, useState } from "react";
import { MapPin, Navigation, Clock, Phone, ExternalLink } from "lucide-react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { cn } from "@/lib/utils";

export default function LocationMapSection() {
    const { ref, isVisible } = useScrollAnimation<HTMLElement>({ threshold: 0.12 });
    const pinRef = useRef<HTMLDivElement>(null);
    const [pinLanded, setPinLanded] = useState(false);

    /* Trigger the pin-drop animation once the section is in view */
    useEffect(() => {
        if (isVisible && !pinLanded) {
            const timer = setTimeout(() => setPinLanded(true), 400);
            return () => clearTimeout(timer);
        }
    }, [isVisible, pinLanded]);

    return (
        <section
            ref={ref}
            className="relative py-28 overflow-hidden"
            style={{ backgroundColor: "#07070A" }}
        >
            {/* ── Ambient background glow ── */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background:
                        "radial-gradient(ellipse 70% 50% at 50% 60%, rgba(240,165,0,0.06) 0%, transparent 80%)",
                }}
            />

            {/* ── Top & bottom gold hairlines ── */}
            <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: "linear-gradient(90deg, transparent 5%, rgba(212,175,55,0.15) 50%, transparent 95%)" }} />
            <div className="absolute bottom-0 left-0 right-0 h-[1px]" style={{ background: "linear-gradient(90deg, transparent 5%, rgba(212,175,55,0.15) 50%, transparent 95%)" }} />

            {/* ── Section content ── */}
            <div className="container max-w-6xl mx-auto px-6 relative z-10">

                {/* ── Header ── */}
                <div
                    className={cn(
                        "text-center mb-16 transition-all duration-[1200ms]",
                        isVisible
                            ? "opacity-100 translate-y-0"
                            : "opacity-0 translate-y-10"
                    )}
                    style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
                >
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6"
                        style={{
                            background: "rgba(240,165,0,0.06)",
                            border: "1px solid rgba(240,165,0,0.15)",
                            backdropFilter: "blur(8px)",
                        }}
                    >
                        <Navigation className="w-3.5 h-3.5" style={{ color: "#F0A500" }} />
                        <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: "#F0A500" }}>
                            Visit Us
                        </span>
                    </div>

                    <h2
                        className="text-3xl sm:text-5xl font-bold mb-4"
                        style={{ color: "rgba(255,255,255,0.95)", fontFamily: "Georgia, serif" }}
                    >
                        Our <span style={{ color: "#F0A500" }}>Location</span>
                    </h2>

                    {/* Gold rule */}
                    <div className="mx-auto w-16 h-[1.5px] mb-5" style={{ background: "linear-gradient(90deg, transparent, #F0A500, transparent)" }} />

                    <p className="text-[15px] max-w-lg mx-auto leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                        Come experience premium automotive care firsthand. We're located in the heart of the metro — easy to find, hard to forget.
                    </p>
                </div>

                {/* ── Map Card ── */}
                <div
                    className={cn(
                        "relative rounded-2xl overflow-hidden transition-all duration-[1400ms] location-map-card",
                        isVisible
                            ? "opacity-100 translate-y-0"
                            : "opacity-0 translate-y-14"
                    )}
                    style={{
                        transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
                        transitionDelay: "200ms",
                    }}
                >
                    {/* Animated orange glow border */}
                    <div className="location-glow-border absolute -inset-[1px] rounded-2xl pointer-events-none z-20" />

                    {/* Glass background */}
                    <div
                        className="relative rounded-2xl overflow-hidden"
                        style={{
                            background: "rgba(11,17,32,0.7)",
                            backdropFilter: "blur(20px)",
                            border: "1px solid rgba(240,165,0,0.1)",
                        }}
                    >
                        {/* Map + Info layout */}
                        <div className="grid grid-cols-1 lg:grid-cols-5">
                            {/* Map iframe — spans 3 cols */}
                            <div className="lg:col-span-3 relative min-h-[320px] lg:min-h-[420px]">
                                <iframe
                                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3864.082067234038!2d120.99446747588276!3d14.422432486043148!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397d15b7b33f9c7%3A0xd1ecf6a0b6c85c10!2sAutoSPF%20PPF%20and%20Ceramic%20Coating!5e0!3m2!1sen!2sph!4v1775497704184!5m2!1sen!2sph"
                                    className="absolute inset-0 w-full h-full"
                                    style={{ border: 0, filter: "brightness(0.85) contrast(1.1) saturate(0.8)" }}
                                    allowFullScreen
                                    loading="lazy"
                                    referrerPolicy="no-referrer-when-downgrade"
                                    title="AutoSPF+ Location Map"
                                />

                                {/* Subtle inner shadow overlay */}
                                <div
                                    className="absolute inset-0 pointer-events-none z-10"
                                    style={{
                                        boxShadow: "inset 0 0 60px rgba(0,0,0,0.4)",
                                    }}
                                />
                            </div>

                            {/* Info sidebar — spans 2 cols */}
                            <div className="lg:col-span-2 p-8 lg:p-10 flex flex-col justify-center relative">

                                {/* Pin drop animation */}
                                <div
                                    ref={pinRef}
                                    className={cn(
                                        "mb-8 flex justify-center lg:justify-start",
                                        pinLanded ? "location-pin-landed" : "location-pin-waiting"
                                    )}
                                >
                                    <div className="relative">
                                        <div
                                            className="w-14 h-14 rounded-2xl flex items-center justify-center"
                                            style={{
                                                background: "linear-gradient(135deg, #F0A500 0%, #D4920A 100%)",
                                                boxShadow: pinLanded
                                                    ? "0 0 24px rgba(240,165,0,0.35), 0 0 48px rgba(240,165,0,0.12)"
                                                    : "none",
                                                transition: "box-shadow 0.6s ease",
                                            }}
                                        >
                                            <MapPin className="w-7 h-7" style={{ color: "#07070A" }} />
                                        </div>
                                        {/* Shadow/bounce mark */}
                                        <div
                                            className={cn(
                                                "absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full transition-all duration-700",
                                                pinLanded
                                                    ? "w-10 h-2 opacity-30"
                                                    : "w-0 h-0 opacity-0"
                                            )}
                                            style={{ background: "radial-gradient(ellipse, rgba(240,165,0,0.4), transparent)" }}
                                        />
                                    </div>
                                </div>

                                {/* Shop name */}
                                <h3
                                    className="text-xl font-bold mb-2"
                                    style={{ color: "rgba(255,255,255,0.95)", fontFamily: "Georgia, serif" }}
                                >
                                    AutoSPF+ PPF & Ceramic Coating
                                </h3>

                                {/* Thin gold divider */}
                                <div className="w-10 h-[1px] mb-6" style={{ background: "rgba(240,165,0,0.4)" }} />

                                {/* Info rows */}
                                <div className="space-y-5">
                                    <InfoRow
                                        icon={<MapPin className="w-4 h-4" />}
                                        label="Address"
                                        value="Muntinlupa City, Metro Manila, Philippines"
                                        delay={pinLanded}
                                        idx={0}
                                    />
                                    <InfoRow
                                        icon={<Clock className="w-4 h-4" />}
                                        label="Hours"
                                        value="Mon – Sat: 8:00 AM – 6:00 PM"
                                        delay={pinLanded}
                                        idx={1}
                                    />
                                    <InfoRow
                                        icon={<Phone className="w-4 h-4" />}
                                        label="Contact"
                                        value="+63 912 345 6789"
                                        delay={pinLanded}
                                        idx={2}
                                    />
                                </div>

                                {/* Get Directions CTA */}
                                <a
                                    href="https://www.google.com/maps/search/?api=1&query=AutoSPF+PPF+and+Ceramic+Coating"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(
                                        "mt-10 inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold tracking-wide uppercase transition-all duration-500 group",
                                        pinLanded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                                    )}
                                    style={{
                                        background: "linear-gradient(135deg, #F0A500 0%, #D4920A 50%, #F0A500 100%)",
                                        color: "#07070A",
                                        boxShadow: "0 0 20px rgba(240,165,0,0.15)",
                                        transitionDelay: "600ms",
                                        transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
                                    }}
                                >
                                    <Navigation className="w-4 h-4" />
                                    Get Directions
                                    <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-300" />
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

/* ── Small helper for staggered info rows ── */
function InfoRow({
    icon,
    label,
    value,
    delay,
    idx,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    delay: boolean;
    idx: number;
}) {
    return (
        <div
            className={cn(
                "flex items-start gap-4 transition-all duration-700",
                delay ? "opacity-100 translate-x-0" : "opacity-0 translate-x-6"
            )}
            style={{
                transitionDelay: `${300 + idx * 150}ms`,
                transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
            }}
        >
            <div
                className="shrink-0 mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center"
                style={{
                    background: "rgba(240,165,0,0.08)",
                    border: "1px solid rgba(240,165,0,0.12)",
                    color: "#F0A500",
                }}
            >
                {icon}
            </div>
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] mb-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {label}
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.8)" }}>
                    {value}
                </p>
            </div>
        </div>
    );
}
