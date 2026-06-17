import { Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import BeforeAfterSlider from "./BeforeAfterSlider";
import { TRUSTED_BY_SECTION_BG_FOLLOW, TrustedBySectionAmbient } from "@/components/TrustedBySectionSurface";
import { useLanguage } from "@/contexts/LanguageContext";

const EASE = [0.16, 1, 0.3, 1] as const;

export default function TransformationsSection() {
    const { t } = useLanguage();
    const shouldReduceMotion = useReducedMotion();

    const beforeImage = "https://images.unsplash.com/photo-1601362840469-51e4d8d58785?q=80&w=2000&auto=format&fit=crop"; // Dirty/unpolished car paint (placeholder)
    const afterImage = "https://images.unsplash.com/photo-1619682817481-e994891cd1f5?q=80&w=2000&auto=format&fit=crop"; // Shiny ceramic coated car (placeholder)

    return (
        <section
            className="relative z-20 overflow-hidden pt-20 pb-28 md:pt-24 md:pb-32"
            style={TRUSTED_BY_SECTION_BG_FOLLOW}
        >
            <TrustedBySectionAmbient />

            <div className="container relative z-10 mx-auto max-w-7xl px-6">
                <motion.div
                    className="text-center mb-16"
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.32 }}
                    transition={{ duration: 0.76, ease: EASE }}
                >
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#F4B63D]/25 bg-white/[0.04] text-xs font-semibold text-[#F4B63D]/90 mb-4 backdrop-blur-sm">
                        <Sparkles className="h-3.5 w-3.5 text-[#F4B63D]" />
                        {t("transformations.badge")}
                    </div>
                    <h2 className="mb-4 font-serif text-3xl font-medium text-[#F8F7F2] sm:text-4xl">
                        {t("transformations.title")}{" "}
                        <span className="italic text-[#F4B63D] font-semibold">
                            {t("transformations.titleHighlight")}
                        </span>
                    </h2>
                    <p className="mx-auto max-w-2xl text-[#B8BEC8]">
                        {t("transformations.description")}
                    </p>
                </motion.div>

                <motion.div
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 22, scale: 0.985 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true, amount: 0.28 }}
                    transition={{ duration: 0.88, delay: 0.1, ease: EASE }}
                >
                    <BeforeAfterSlider 
                        beforeImage={beforeImage}
                        afterImage={afterImage}
                        beforeLabel={t("transformations.beforeLabel")}
                        afterLabel={t("transformations.afterLabel")}
                    />
                </motion.div>
            </div>
        </section>
    );
}
