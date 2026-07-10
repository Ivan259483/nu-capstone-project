import PageLayout from "@/components/PageLayout";
import HeroSection from "@/components/HeroSection";
import { HeroParallax, type HeroParallaxProduct } from "@/components/ui/hero-parallax";
import { useLanguage } from "@/contexts/LanguageContext";

import TransformationsSection from "@/components/TransformationsSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import { useLandingSmoothScroll } from "@/hooks/useLandingSmoothScroll";
import autospf1 from "@/assets/autospf-pictures/autospf-1.png";
import autospf2 from "@/assets/autospf-pictures/autospf-2.png";
import autospf3 from "@/assets/autospf-pictures/autospf-3.png";
import autospf4 from "@/assets/autospf-pictures/autospf-4.png";
import autospf5 from "@/assets/autospf-pictures/autospf-5.png";
import autospf6 from "@/assets/autospf-pictures/autospf-6.png";
import autospf7 from "@/assets/autospf-pictures/autospf-7.png";
import autospf8 from "@/assets/autospf-pictures/autospf-8.png";
import autospf9 from "@/assets/autospf-pictures/autospf-9.png";
import autospf10 from "@/assets/autospf-pictures/autospf-10.png";
import autospf11 from "@/assets/autospf-pictures/autospf-11.png";
import autospf12 from "@/assets/autospf-pictures/autospf-12.png";
import autospf13 from "@/assets/autospf-pictures/autospf-13.png";
import autospf14 from "@/assets/autospf-pictures/autospf-14.png";
import autospf15 from "@/assets/autospf-pictures/autospf-15.png";
import autospf16 from "@/assets/autospf-pictures/autospf-16.png";
import autospf17 from "@/assets/autospf-pictures/autospf-17.png";
import autospf18 from "@/assets/autospf-pictures/autospf-18.png";
import autospf19 from "@/assets/autospf-pictures/autospf-19.png";

const AUTOSPF_TRANSFORMATION_IMAGES = [
    autospf1,
    autospf2,
    autospf3,
    autospf4,
    autospf5,
    autospf6,
    autospf7,
    autospf8,
    autospf9,
    autospf10,
    autospf11,
    autospf12,
    autospf13,
    autospf14,
    autospf15,
    autospf16,
    autospf17,
    autospf18,
    autospf19,
] as const;

const PARALLAX_PRODUCTS: HeroParallaxProduct[] = AUTOSPF_TRANSFORMATION_IMAGES.map((thumbnail) => ({
    title: "",
    link: "/gallery",
    thumbnail,
}));

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
            <HeroParallax
                sectionId="transformation"
                products={PARALLAX_PRODUCTS}
                title={transformationTitle}
                description={t("home.transformationDescription")}
                titleSerif
            />

            <TransformationsSection />
            <TestimonialsSection />
        </PageLayout>
    );
}
