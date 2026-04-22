import { useEffect, useMemo, useState } from "react";
import PageLayout from "@/components/PageLayout";
import HeroSection from "@/components/HeroSection";


import ServicesSection from "@/components/ServicesSection";
import GallerySection from "@/components/GallerySection";
import TransformationsSection from "@/components/TransformationsSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import BookingCTA from "@/components/BookingCTA";
import { SettingsService } from "@/lib/settings-service";
import type { BusinessSettings } from "@/types";

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
            <ServicesSection />
            <GallerySection items={landingData.gallery} />
            <TransformationsSection />
            <TestimonialsSection />

            <BookingCTA />
        </PageLayout>
    );
}
