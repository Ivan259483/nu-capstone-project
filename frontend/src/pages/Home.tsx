import PageLayout from "@/components/PageLayout";
import HeroSection from "@/components/HeroSection";
import { HeroParallax, type HeroParallaxProduct } from "@/components/ui/hero-parallax";
import { useLanguage } from "@/contexts/LanguageContext";

import TransformationsSection from "@/components/TransformationsSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import BookingCTA from "@/components/BookingCTA";

const PARALLAX_PRODUCTS: HeroParallaxProduct[] = [
    { title: "Ceramic Coating Application", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1567808291548-fc3ee04dbcf0?auto=format&fit=crop&q=80&w=800" },
    { title: "Paint Correction Detail", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1605437241278-c1806d14a4d9?auto=format&fit=crop&q=80&w=800" },
    { title: "Full Interior Restoration", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1619431856706-ca2cc58258f6?auto=format&fit=crop&q=80&w=800" },
    { title: "Premium Exterior Wash", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1528597469186-bddab681a37f?auto=format&fit=crop&q=80&w=800" },
    { title: "Ceramic on BMW M4", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1620584899131-a5ff5f8fbb03?auto=format&fit=crop&q=80&w=800" },
    { title: "Scratch & Swirl Removal", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1622329821376-a19fd6002562?auto=format&fit=crop&q=80&w=800" },
    { title: "Leather Conditioning", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1632823469850-2f77dd9c7f93?auto=format&fit=crop&q=80&w=800" },
    { title: "Supercar Detailing", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1632823471799-c3812077da2d?auto=format&fit=crop&q=80&w=800" },
    { title: "Multi-Stage Polish", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1633014041037-f5446fb4ce99?auto=format&fit=crop&q=80&w=800" },
    { title: "Nano Coating on Range Rover", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1633014332834-c94559ff5439?auto=format&fit=crop&q=80&w=800" },
    { title: "SUV Exterior Detail", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1620584898989-d39f7f9ed1b7?auto=format&fit=crop&q=80&w=800" },
    { title: "Dashboard & Console Detail", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1652454449601-e83b62eabe94?auto=format&fit=crop&q=80&w=800" },
    { title: "Headlight Restoration", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1518306727298-4c17e1bf6942?auto=format&fit=crop&q=80&w=800" },
    { title: "PPF Installation", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1619431856706-ca2cc58258f6?auto=format&fit=crop&q=80&w=800" },
    { title: "Engine Bay Detailing", link: "/gallery", thumbnail: "https://images.unsplash.com/photo-1605437241278-c1806d14a4d9?auto=format&fit=crop&q=80&w=800" },
];

export default function Home() {
    const { t } = useLanguage();

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
            <HeroParallax
                sectionId="transformation"
                products={PARALLAX_PRODUCTS}
                title={transformationTitle}
                description={t("home.transformationDescription")}
                titleSerif
            />

            <TransformationsSection />
            <TestimonialsSection />

            <BookingCTA />
        </PageLayout>
    );
}
