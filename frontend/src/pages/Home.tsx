import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import PageLayout from "@/components/PageLayout";
import HeroSection from "@/components/HeroSection";
import type { HeroParallaxProduct } from "@/components/ui/hero-parallax";
import { useLanguage } from "@/contexts/LanguageContext";

import { useLandingSmoothScroll } from "@/hooks/useLandingSmoothScroll";

const TransformationsSection = lazy(() => import("@/components/TransformationsSection"));
const TestimonialsSection = lazy(() => import("@/components/TestimonialsSection"));
const HeroParallax = lazy(() =>
    import("@/components/ui/hero-parallax").then((module) => ({ default: module.HeroParallax })),
);
const PARALLAX_PRODUCTS: HeroParallaxProduct[] = Array.from({ length: 19 }, (_, index) => {
    const imageNumber = index + 1;
    const basePath = `/images/transformations/autospf-${imageNumber}`;
    return {
        title: "",
        link: "/gallery",
        thumbnail: `${basePath}-480.webp`,
        thumbnailSrcSet: `${basePath}-480.webp 480w, ${basePath}-960.webp 960w`,
        thumbnailSizes: "480px",
        alt: `AutoSPF vehicle transformation ${imageNumber}`,
    };
});

function DeferredHeroParallax({ title, description }: { title: ReactNode; description: string }) {
    const sentinelRef = useRef<HTMLDivElement>(null);
    const [shouldRender, setShouldRender] = useState(false);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || typeof IntersectionObserver === "undefined") {
            setShouldRender(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry.isIntersecting) return;
                setShouldRender(true);
                observer.disconnect();
            },
            { rootMargin: "0px 0px -160px 0px" },
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, []);

    if (!shouldRender) {
        return <div ref={sentinelRef} id="transformation" className="min-h-[185vh] scroll-mt-24 bg-[#07070A]" aria-hidden />;
    }

    return (
        <Suspense fallback={<div id="transformation" className="min-h-[185vh] bg-[#07070A]" aria-hidden />}>
            <HeroParallax
                sectionId="transformation"
                products={PARALLAX_PRODUCTS}
                title={title}
                description={description}
                titleSerif
            />
        </Suspense>
    );
}

function DeferredLandingSections() {
    const sentinelRef = useRef<HTMLDivElement>(null);
    const [shouldRender, setShouldRender] = useState(false);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || typeof IntersectionObserver === "undefined") {
            setShouldRender(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry.isIntersecting) return;
                setShouldRender(true);
                observer.disconnect();
            },
            { rootMargin: "200px 0px" },
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, []);

    if (!shouldRender) {
        return <div ref={sentinelRef} className="min-h-[120vh] bg-[#07070A]" aria-hidden />;
    }

    return (
        <Suspense fallback={<div className="min-h-[120vh] bg-[#07070A]" aria-hidden />}>
            <TransformationsSection />
            <TestimonialsSection />
        </Suspense>
    );
}

export default function Home() {
    const { t } = useLanguage();
    useLandingSmoothScroll();

    const transformationTitle = (
        <>
            {t("home.transformationTitleLead")} <br />
            <span className="italic text-[#F4B63D] font-semibold">
                {t("home.transformationTitleHighlight")}
            </span>
        </>
    );

    return (
        <PageLayout>
            <HeroSection />
            <DeferredHeroParallax title={transformationTitle} description={t("home.transformationDescription")} />

            <DeferredLandingSections />
        </PageLayout>
    );
}
