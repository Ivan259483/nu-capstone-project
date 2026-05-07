import PageLayout from "@/components/PageLayout";
import HeroSection from "@/components/HeroSection";
import StatsSection from "@/components/StatsSection";
import GalleryPreview from "@/components/GalleryPreview";
import TestimonialsSection from "@/components/TestimonialsSection";
import BookingCTA from "@/components/BookingCTA";

export default function Home() {
    return (
        <PageLayout>
            <HeroSection />
            <StatsSection />
            <GalleryPreview />
            <TestimonialsSection />
            <BookingCTA />
        </PageLayout>
    );
}
