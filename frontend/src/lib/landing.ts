import type { ElementType } from "react";
import * as LucideIcons from "lucide-react";
import { Award, Clock, Shield, Star, Users, Zap } from "lucide-react";

export interface LandingStat {
    id?: string;
    label: string;
    value: string;
    icon?: string | ElementType;
}

export interface LandingService {
    id?: string;
    title: string;
    subtitle?: string;
    desc: string;
    image?: string;
    badge?: string;
    badgeColor?: string;
    features?: string[];
    icon?: string | ElementType;
    glow?: string;
    price?: string;
}

export interface LandingPackage {
    id: string;
    tier: string;
    icon?: string | ElementType;
    tagline: string;
    focus: string;
    price: string;
    recommended?: boolean;
    borderClass?: string;
    glowColor?: string;
    badgeLabel?: string;
    accentFrom?: string;
    accentTo?: string;
    features: string[];
    btnClass?: string;
}

export interface LandingGalleryItem {
    id?: string;
    url?: string;
    src?: string;
    caption?: string;
    label?: string;
    tag?: string;
    span?: "wide" | "tall" | "normal";
}

export const DEFAULT_LANDING_SERVICES: LandingService[] = [
    {
        title: "Paint Protection Film",
        subtitle: "Invisible armour",
        desc: "Military-grade urethane film that shields your paint from rock chips, scratches, and UV degradation.",
        image: "/images/login/coating.png",
        badge: "Most Popular",
        badgeColor: "bg-orange-500/20 text-orange-400 border-orange-500/30",
        features: ["Self-healing top coat", "10-year warranty", "Hydrophobic surface"],
        icon: Shield,
        glow: "rgba(249,115,22,0.15)",
        price: "₱12,500",
    },
    {
        title: "Interior Detailing",
        subtitle: "Pristine sanctuary",
        desc: "Deep-clean every surface, leather conditioning, and odour elimination for a factory-fresh cabin finish.",
        image: "/images/login/interior.png",
        badge: "Premium",
        badgeColor: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
        features: ["Leather restoration", "Steam sanitisation", "Fabric protection"],
        icon: Star,
        glow: "rgba(99,102,241,0.15)",
        price: "₱4,500",
    },
    {
        title: "Paint Correction",
        subtitle: "Mirror finish",
        desc: "Multi-stage machine polishing removes swirls, holograms, and oxidation to reveal deeper gloss.",
        image: "/images/login/correction.png",
        badge: "Expert Level",
        badgeColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
        features: ["2-stage correction", "Paint depth analysis", "Ceramic top coat"],
        icon: Zap,
        glow: "rgba(16,185,129,0.15)",
        price: "₱8,500",
    },
];

export const DEFAULT_LANDING_STATS: LandingStat[] = [
    { icon: Award, value: "500+", label: "Cars Detailed" },
    { icon: Clock, value: "8 yrs", label: "In Business" },
    { icon: Users, value: "98%", label: "Satisfaction Rate" },
    { icon: Star, value: "4.9★", label: "Average Rating" },
];

export function resolveLandingIcon(name: unknown, fallback: ElementType): ElementType {
    if (!name) return fallback;
    if (typeof name !== "string") return name as ElementType;
    const normalizedName = name in LucideIcons
        ? name
        : name.charAt(0).toUpperCase() + name.slice(1);
    return ((LucideIcons as unknown as Record<string, ElementType>)[normalizedName] ?? fallback);
}
