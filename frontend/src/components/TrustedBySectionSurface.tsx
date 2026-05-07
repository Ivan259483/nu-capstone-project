import * as React from "react";

/**
 * Same hue as app `--background` (Login / Register: `bg-background`).
 * First trusted-style band on the page (e.g. Hero Parallax).
 */
export const TRUSTED_BY_SECTION_BG: React.CSSProperties = {
    background: "linear-gradient(180deg, hsl(221 50% 5%) 0%, hsl(221 48% 8%) 42%, hsl(221 50% 6%) 100%)",
};

/**
 * Seamless continuation — starts at the bottom tone of `TRUSTED_BY_SECTION_BG`
 * so no horizontal band between stacked sections.
 */
export const TRUSTED_BY_SECTION_BG_FOLLOW: React.CSSProperties = {
    background: "linear-gradient(180deg, hsl(221 50% 6%) 0%, hsl(221 48% 8%) 40%, hsl(221 52% 5%) 100%)",
};

/** Login-style ambient: orange rings + soft center glow (Tailwind `orange-500`). */
export function TrustedBySectionAmbient() {
    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute top-1/4 -left-32 h-80 w-80 rounded-full border border-orange-500/10 opacity-80" />
            <div className="absolute bottom-1/4 -right-32 h-96 w-96 rounded-full border border-orange-500/10 opacity-80" />
            <div className="absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.12)_0%,transparent_70%)] opacity-40" />
        </div>
    );
}
