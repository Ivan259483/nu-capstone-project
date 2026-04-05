import { Link } from "react-router-dom";
import { ArrowRight, Image } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const galleryItems = [
    { label: "Exterior", color: "from-blue-900/60 to-blue-950/80", aspect: "tall" },
    { label: "Ceramic", color: "from-purple-900/60 to-purple-950/80", aspect: "wide" },
    { label: "Paint Correction", color: "from-red-900/60 to-red-950/80", aspect: "normal" },
    { label: "Interior", color: "from-emerald-900/60 to-emerald-950/80", aspect: "wide" },
    { label: "Engine Bay", color: "from-amber-900/60 to-amber-950/80", aspect: "normal" },
    { label: "Full Detail", color: "from-indigo-900/60 to-indigo-950/80", aspect: "tall" },
];

function GalleryItem({
    item,
    index,
    isVisible,
}: {
    item: (typeof galleryItems)[0];
    index: number;
    isVisible: boolean;
}) {
    return (
        <div
            className={cn(
                "reveal group relative overflow-hidden rounded-2xl glass cursor-pointer",
                item.aspect === "tall" ? "row-span-2" : "row-span-1",
                isVisible ? "visible" : ""
            )}
            style={{ transitionDelay: `${index * 80}ms` }}
        >
            {/* Gradient background placeholder */}
            <div className={cn("absolute inset-0 bg-gradient-to-br", item.color)} />

            {/* Pattern overlay */}
            <div className="absolute inset-0 opacity-10"
                style={{
                    backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(212,175,55,0.1) 10px, rgba(212,175,55,0.1) 11px)"
                }}
            />

            {/* Icon */}
            <div className="absolute inset-0 flex items-center justify-center">
                <Image className="w-10 h-10 text-white/20" />
            </div>

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-400 flex items-end p-4">
                <span className="text-sm font-semibold text-white">{item.label}</span>
            </div>

            {/* Gold border on hover */}
            <div className="absolute inset-0 rounded-2xl border-2 border-gold/0 group-hover:border-gold/40 transition-all duration-400" />
        </div>
    );
}

export default function GalleryPreview() {
    const { t } = useLanguage();
    const { ref, isVisible } = useScrollAnimation<HTMLDivElement>({ threshold: 0.1 });

    return (
        <section className="py-24 section-darker">
            <div className="container max-w-7xl mx-auto px-6">
                {/* Header */}
                <div
                    ref={ref}
                    className={cn("text-center mb-16 reveal", isVisible ? "visible" : "")}
                >
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-gold/20 text-xs font-semibold text-primary mb-4">
                        <Image className="w-3.5 h-3.5" />
                        {t("gallery.title")}
                    </div>
                    <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                        {t("gallery.subtitle")}
                    </h2>
                    <div className="w-24 h-0.5 bg-gradient-gold mx-auto rounded-full" />
                </div>

                {/* Masonry Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-[180px] mb-10">
                    {galleryItems.map((item, i) => (
                        <GalleryItem key={i} item={item} index={i} isVisible={isVisible} />
                    ))}
                </div>

                <div className="text-center">
                    <Link to="/gallery">
                        <Button variant="outline" className="border-gold/30 text-primary hover:bg-gold/10 hover:border-gold/60 group">
                            {t("gallery.viewGallery")}
                            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                        </Button>
                    </Link>
                </div>
            </div>
        </section>
    );
}
