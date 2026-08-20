import { useEffect, useState } from "react";

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

        let disposed = false;
        let lenis: { destroy: () => void } | undefined;

        const startSmoothScroll = () => {
            window.removeEventListener("wheel", startSmoothScroll);
            window.removeEventListener("touchstart", startSmoothScroll);
            window.removeEventListener("pointerdown", startSmoothScroll);

            void import("lenis").then(({ default: Lenis }) => {
                if (disposed) return;
                lenis = new Lenis({
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
            });
        };

        window.addEventListener("wheel", startSmoothScroll, { passive: true, once: true });
        window.addEventListener("touchstart", startSmoothScroll, { passive: true, once: true });
        window.addEventListener("pointerdown", startSmoothScroll, { passive: true, once: true });

        return () => {
            disposed = true;
            window.removeEventListener("wheel", startSmoothScroll);
            window.removeEventListener("touchstart", startSmoothScroll);
            window.removeEventListener("pointerdown", startSmoothScroll);
            lenis?.destroy();
        };
    }, [prefersReducedMotion]);
}
