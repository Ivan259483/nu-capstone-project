import * as React from "react";

/**
 * Same page background as the Hero section.
 * First trusted-style band on the page (e.g. Hero Parallax).
 */
export const TRUSTED_BY_SECTION_BG: React.CSSProperties = {
    background: "#07070A",
};

/**
 * Seamless continuation for stacked sections.
 */
export const TRUSTED_BY_SECTION_BG_FOLLOW: React.CSSProperties = {
    background: "#07070A",
};

/** Login-style ambient: orange rings + soft center glow (Tailwind `orange-500`). */
export function TrustedBySectionAmbient() {
    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.12)_0%,transparent_70%)] opacity-40" />
        </div>
    );
}
