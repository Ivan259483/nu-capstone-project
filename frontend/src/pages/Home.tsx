import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import PageLayout from "@/components/PageLayout";
import HeroSection from "@/components/HeroSection";


import ServicesSection from "@/components/ServicesSection";

import TransformationsSection from "@/components/TransformationsSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import BookingCTA from "@/components/BookingCTA";
import { SettingsService } from "@/lib/settings-service";
import type { BusinessSettings } from "@/types";

/* ── Parallax products — 15 items for 3 rows of 5 ── */
const PARALLAX_PRODUCTS = [
    // Row 1
    { title: "Ceramic Coating Application", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1567808291548-fc3ee04dbcf0?auto=format&fit=crop&q=80&w=800" },
    { title: "Paint Correction Detail", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1605437241278-c1806d14a4d9?auto=format&fit=crop&q=80&w=800" },
    { title: "Full Interior Restoration", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1619431856706-ca2cc58258f6?auto=format&fit=crop&q=80&w=800" },
    { title: "Premium Exterior Wash", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1528597469186-bddab681a37f?auto=format&fit=crop&q=80&w=800" },
    { title: "Ceramic on BMW M4", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1620584899131-a5ff5f8fbb03?auto=format&fit=crop&q=80&w=800" },
    // Row 2
    { title: "Scratch & Swirl Removal", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1622329821376-a19fd6002562?auto=format&fit=crop&q=80&w=800" },
    { title: "Leather Conditioning", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1632823469850-2f77dd9c7f93?auto=format&fit=crop&q=80&w=800" },
    { title: "Supercar Detailing", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1632823471799-c3812077da2d?auto=format&fit=crop&q=80&w=800" },
    { title: "Multi-Stage Polish", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1633014041037-f5446fb4ce99?auto=format&fit=crop&q=80&w=800" },
    { title: "Nano Coating on Range Rover", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1633014332834-c94559ff5439?auto=format&fit=crop&q=80&w=800" },
    // Row 3
    { title: "SUV Exterior Detail", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1620584898989-d39f7f9ed1b7?auto=format&fit=crop&q=80&w=800" },
    { title: "Dashboard & Console Detail", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1652454449601-e83b62eabe94?auto=format&fit=crop&q=80&w=800" },
    { title: "Headlight Restoration", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1518306727298-4c17e1bf6942?auto=format&fit=crop&q=80&w=800" },
    { title: "PPF Installation", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1619431856706-ca2cc58258f6?auto=format&fit=crop&q=80&w=800" },
    { title: "Engine Bay Detailing", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1605437241278-c1806d14a4d9?auto=format&fit=crop&q=80&w=800" },
];

/* ── HeroParallax ── */
function HeroParallax() {
    const ref = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: ref,
        offset: ["start start", "end start"],
    });
    const spring = { stiffness: 300, damping: 30, bounce: 100 };

    const translateX = useSpring(useTransform(scrollYProgress, [0, 1], [0, 1000]), spring);
    const translateXReverse = useSpring(useTransform(scrollYProgress, [0, 1], [0, -1000]), spring);
    const rotateX = useSpring(useTransform(scrollYProgress, [0, 0.2], [15, 0]), spring);
    const rotateZ = useSpring(useTransform(scrollYProgress, [0, 0.2], [20, 0]), spring);
    const opacity = useSpring(useTransform(scrollYProgress, [0, 0.2], [0.4, 1]), spring);
    const translateY = useSpring(useTransform(scrollYProgress, [0, 0.2], [0, 500]), spring);

    const row1 = PARALLAX_PRODUCTS.slice(0, 5);
    const row2 = PARALLAX_PRODUCTS.slice(5, 10);
    const row3 = PARALLAX_PRODUCTS.slice(10, 15);

    return (
        <div
            ref={ref}
            style={{
                height: "300vh",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                overflowX: "hidden",
                background: "linear-gradient(180deg,#060a14 0%,#0a0f1c 100%)",
                perspective: "1000px",
            }}
            className="antialiased"
        >
            {/* Sticky header */}
            <div
                style={{ position: "sticky", top: 0, zIndex: 10 }}
                className="mx-auto w-full max-w-7xl px-6 py-10 md:py-14"
            >
                {/* Ambient glow */}
                <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-amber-500/[0.05] blur-[160px] rounded-full pointer-events-none" />


                {/* Headline */}
                <h1
                    className="text-5xl font-bold text-white md:text-7xl leading-[1.05]"
                    style={{ fontFamily: "Georgia, serif" }}
                >
                    See the{" "}
                    <br />
                    <span className="italic text-[#e68200]">Transformation</span>
                </h1>

                {/* Subheading */}
                <p className="mt-6 max-w-2xl text-base text-white/40 md:text-xl font-light">
                    Before and after — real results from real vehicles. Every image showcases
                    our commitment to precision, protection, and perfection.
                </p>
            </div>

            {/* 3-D animated rows wrapper */}
            <motion.div
                style={{ rotateX, rotateZ, translateY, opacity, transformStyle: "preserve-3d" }}
                className="mt-12 pb-32"
            >
                {/* Row 1 — right direction */}
                <div className="flex flex-row-reverse mb-20 gap-5 px-4">
                    {row1.map((p) => (
                        <ParallaxCard key={p.title} product={p} translate={translateX} />
                    ))}
                </div>

                {/* Row 2 — left direction */}
                <div className="flex flex-row mb-20 gap-5 px-4">
                    {row2.map((p) => (
                        <ParallaxCard key={p.title} product={p} translate={translateXReverse} />
                    ))}
                </div>

                {/* Row 3 — right direction */}
                <div className="flex flex-row-reverse gap-5 px-4">
                    {row3.map((p) => (
                        <ParallaxCard key={p.title} product={p} translate={translateX} />
                    ))}
                </div>
            </motion.div>
        </div>
    );
}

/* ── ParallaxCard ── */
function ParallaxCard({
    product,
    translate,
}: {
    product: { title: string; link: string; thumbnail: string };
    translate: ReturnType<typeof useSpring>;
}) {
    return (
        <motion.div
            style={{ x: translate }}
            whileHover={{ y: -20 }}
            className="group/card relative h-96 w-[28rem] shrink-0 overflow-hidden rounded-2xl border border-white/10"
        >
            <a href={product.link} className="block h-full w-full" aria-label={product.title}>
                <img
                    src={product.thumbnail}
                    alt={product.title}
                    className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700 group-hover/card:scale-110"
                    loading="lazy"
                />
            </a>

            {/* Hover overlay */}
            <div className="pointer-events-none absolute inset-0 bg-black opacity-0 transition-opacity duration-300 group-hover/card:opacity-70" />

            {/* Title on hover */}
            <h2 className="absolute bottom-4 left-4 text-base font-semibold text-white opacity-0 transition-opacity duration-300 group-hover/card:opacity-100">
                {product.title}
            </h2>

            {/* Orange accent bar */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#e68200] to-transparent opacity-0 transition-opacity duration-300 group-hover/card:opacity-75" />
        </motion.div>
    );
}

export default function Home() {
    const [publicSettings, setPublicSettings] = useState<BusinessSettings | null>(null);

    useEffect(() => {
        let isMounted = true;

        const loadPublicSettings = async () => {
            const response = await SettingsService.getPublicSettings();
            if (isMounted && response.success) {
                setPublicSettings(response.data);
            }
        };

        loadPublicSettings();

        return () => {
            isMounted = false;
        };
    }, []);

    const landingDetails = publicSettings?.landingDetails;

    const landingData = useMemo(() => ({
        stats: landingDetails?.stats?.length ? landingDetails.stats : undefined,
        services: landingDetails?.services?.length ? landingDetails.services : undefined,
        gallery: landingDetails?.gallery?.length ? landingDetails.gallery : undefined,
    }), [landingDetails]);

    return (
        <PageLayout>
            <HeroSection />
            <HeroParallax />


            <ServicesSection />
            <TransformationsSection />
            <TestimonialsSection />

            <BookingCTA />
        </PageLayout>
    );
}
