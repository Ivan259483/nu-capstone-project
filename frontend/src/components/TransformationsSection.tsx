import { Sparkles } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import BeforeAfterSlider from "./BeforeAfterSlider";
import { cn } from "@/lib/utils";

export default function TransformationsSection() {
    const { t } = useLanguage();
    const { ref, isVisible } = useScrollAnimation<HTMLDivElement>({ threshold: 0.1 });

    const beforeImage = "https://images.unsplash.com/photo-1601362840469-51e4d8d58785?q=80&w=2000&auto=format&fit=crop"; // Dirty/unpolished car paint (placeholder)
    const afterImage = "https://images.unsplash.com/photo-1619682817481-e994891cd1f5?q=80&w=2000&auto=format&fit=crop"; // Shiny ceramic coated car (placeholder)

    return (
        <section className="relative py-24 section-dark z-20 overflow-hidden isolate border-y border-gold/10">
            {/* Background elements */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-full blur-3xl opacity-20 bg-gradient-radial from-gold to-transparent pointer-events-none" />

            <div className="container max-w-7xl mx-auto px-6 relative z-10">
                <div
                    ref={ref}
                    className={cn(
                        "text-center mb-16 reveal",
                        isVisible ? "visible" : ""
                    )}
                >
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-gold/20 text-xs font-semibold text-primary mb-4">
                        <Sparkles className="w-3.5 h-3.5" />
                        See The Difference
                    </div>
                    <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                        Real Results. Real Perfection.
                    </h2>
                    <p className="text-muted-foreground max-w-2xl mx-auto">
                        Experience the transformation of professional automotive detailing. Slide to see the before and after comparison of our paint correction and ceramic coating treatments.
                    </p>
                </div>

                <div 
                    className={cn(
                        "reveal transition-all duration-1000 delay-200",
                        isVisible ? "visible" : ""
                    )}
                >
                    <BeforeAfterSlider 
                        beforeImage={beforeImage}
                        afterImage={afterImage}
                        beforeLabel="Before Treatment"
                        afterLabel="After Ceramic Coating"
                    />
                </div>
            </div>
        </section>
    );
}
