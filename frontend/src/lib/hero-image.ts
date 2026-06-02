/** Local responsive hero assets (WebP + AVIF), generated at ~3840px max width. */

const BASE = "/images/hero";

export const HERO_IMAGE = {
    altKey: "hero.imageAlt" as const,
    avif: {
        mobile: `${BASE}/hero-mobile.avif`,
        tablet: `${BASE}/hero-tablet.avif`,
        desktop: `${BASE}/hero-desktop.avif`,
        desktop2x: `${BASE}/hero-desktop-2x.avif`,
        fourK: `${BASE}/hero-4k.avif`,
    },
    webp: {
        mobile: `${BASE}/hero-mobile.webp`,
        tablet: `${BASE}/hero-tablet.webp`,
        desktop: `${BASE}/hero-desktop.webp`,
        desktop2x: `${BASE}/hero-desktop-2x.webp`,
        fourK: `${BASE}/hero-4k.webp`,
    },
    /** Default img src — desktop WebP for broad support. */
    fallback: `${BASE}/hero-desktop.webp`,
    srcSetAvif: [
        `${BASE}/hero-mobile.avif 768w`,
        `${BASE}/hero-tablet.avif 1280w`,
        `${BASE}/hero-desktop.avif 1920w`,
        `${BASE}/hero-desktop-2x.avif 2560w`,
        `${BASE}/hero-4k.avif 3840w`,
    ].join(", "),
    srcSetWebp: [
        `${BASE}/hero-mobile.webp 768w`,
        `${BASE}/hero-tablet.webp 1280w`,
        `${BASE}/hero-desktop.webp 1920w`,
        `${BASE}/hero-desktop-2x.webp 2560w`,
        `${BASE}/hero-4k.webp 3840w`,
    ].join(", "),
    sizes: "100vw",
    preloadHref: `${BASE}/hero-desktop.webp`,
} as const;
