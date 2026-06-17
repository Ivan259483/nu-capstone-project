import { useEffect, useState } from "react";
import Lenis from "lenis";

const NAV_OFFSET = -92;
const easeOutExpo = (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t));

export function useLandingSmoothScroll() {
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );

    useEffect(() => {
        const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        const updateMotionPreference = () => setPrefersReducedMotion(mediaQuery.matches);

        updateMotionPreference();
        mediaQuery.addEventListener("change", updateMotionPreference);

        return () => mediaQuery.removeEventListener("change", updateMotionPreference);
    }, []);

    useEffect(() => {
        if (prefersReducedMotion) return;

        const lenis = new Lenis({
            autoRaf: true,
            smoothWheel: true,
            syncTouch: false,
            lerp: 0.082,
            duration: 1.16,
            easing: easeOutExpo,
            wheelMultiplier: 0.92,
            touchMultiplier: 1,
            anchors: {
                offset: NAV_OFFSET,
                duration: 1.08,
                easing: easeOutExpo,
            },
            gestureOrientation: "vertical",
            stopInertiaOnNavigate: true,
            prevent: (node) =>
                Boolean(
                    node.closest(
                        [
                            "[data-lenis-prevent]",
                            "[role='dialog']",
                            "[data-radix-popper-content-wrapper]",
                            ".public-nav-menu-panel",
                        ].join(",")
                    )
                ),
        });

        return () => lenis.destroy();
    }, [prefersReducedMotion]);
}
