import { useState } from "react";
import { Image, ZoomIn, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import PageLayout from "@/components/PageLayout";
import { cn } from "@/lib/utils";

const categories = ["all", "exterior", "interior", "paint", "ceramic"] as const;
type Category = typeof categories[number];

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1518306727298-4c17e1bf6942?auto=format&fit=crop&q=80&w=1200";

const galleryData = [
    { id: 1, category: "exterior", label: "Premium Exterior Wash", src: "https://images.unsplash.com/photo-1528597469186-bddab681a37f?auto=format&fit=crop&q=80&w=1200", size: "tall" },
    { id: 2, category: "ceramic", label: "Ceramic Coating — Sedan", src: "https://images.unsplash.com/photo-1567808291548-fc3ee04dbcf0?auto=format&fit=crop&q=80&w=1200", size: "normal" },
    { id: 3, category: "paint", label: "Paint Correction Detail", src: "https://images.unsplash.com/photo-1605437241278-c1806d14a4d9?auto=format&fit=crop&q=80&w=1200", size: "normal" },
    { id: 4, category: "interior", label: "Full Interior Detail", src: "https://images.unsplash.com/photo-1619431856706-ca2cc58258f6?auto=format&fit=crop&q=80&w=1200", size: "wide" },
    { id: 5, category: "exterior", label: "SUV Exterior Shine", src: "https://images.unsplash.com/photo-1620584898989-d39f7f9ed1b7?auto=format&fit=crop&q=80&w=1200", size: "normal" },
    { id: 6, category: "ceramic", label: "Ceramic on BMW", src: "https://images.unsplash.com/photo-1620584899131-a5ff5f8fbb03?auto=format&fit=crop&q=80&w=1200", size: "tall" },
    { id: 7, category: "paint", label: "Scratch Removal", src: "https://images.unsplash.com/photo-1622329821376-a19fd6002562?auto=format&fit=crop&q=80&w=1200", size: "wide" },
    { id: 8, category: "interior", label: "Leather Conditioning", src: "https://images.unsplash.com/photo-1632823469850-2f77dd9c7f93?auto=format&fit=crop&q=80&w=1200", size: "normal" },
    { id: 9, category: "exterior", label: "Sports Car Detail", src: "https://images.unsplash.com/photo-1632823471799-c3812077da2d?auto=format&fit=crop&q=80&w=1200", size: "normal" },
    { id: 10, category: "paint", label: "Multi-Stage Polish", src: "https://images.unsplash.com/photo-1633014041037-f5446fb4ce99?auto=format&fit=crop&q=80&w=1200", size: "normal" },
    { id: 11, category: "ceramic", label: "Nano Coating SUV", src: "https://images.unsplash.com/photo-1633014332834-c94559ff5439?auto=format&fit=crop&q=80&w=1200", size: "normal" },
    { id: 12, category: "interior", label: "Dashboard Detail", src: "https://images.unsplash.com/photo-1652454449601-e83b62eabe94?auto=format&fit=crop&q=80&w=1200", size: "wide" },
] as const;

function GalleryCard({
    item,
    index,
    isVisible,
    onOpen,
}: {
    item: (typeof galleryData)[number];
    index: number;
    isVisible: boolean;
    onOpen: (item: (typeof galleryData)[number]) => void;
}) {
    const [imgSrc, setImgSrc] = useState(item.src);

    return (
        <div
            className={cn(
                "reveal group relative overflow-hidden rounded-2xl glass cursor-pointer",
                item.size === "tall" ? "row-span-2" : item.size === "wide" ? "col-span-2" : "",
                isVisible ? "visible" : ""
            )}
            style={{ transitionDelay: `${(index % 6) * 70}ms`, minHeight: 180 }}
            onClick={() => onOpen(item)}
        >
            <img 
                src={imgSrc} 
                alt={item.label}
                onError={() => setImgSrc(FALLBACK_IMAGE)}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
            {/* Subtle dark overlay for contrast */}
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors duration-500" />

            {/* Hover reveal */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-400 flex flex-col items-center justify-end p-4 gap-2">
                <ZoomIn className="w-6 h-6 text-primary mb-1 drop-shadow-md" />
                <span className="text-sm font-semibold text-white text-center drop-shadow-md">{item.label}</span>
            </div>

            {/* Gold border */}
            <div className="absolute inset-0 rounded-2xl border-2 border-gold/0 group-hover:border-gold/40 transition-all duration-300 pointer-events-none glow-gold-sm opacity-0 group-hover:opacity-100" />
        </div>
    );
}

export default function Gallery() {
    const { t } = useLanguage();
    const [activeCategory, setActiveCategory] = useState<Category>("all");
    const [lightbox, setLightbox] = useState<(typeof galleryData)[number] | null>(null);
    const { ref, isVisible } = useScrollAnimation<HTMLDivElement>({ threshold: 0.05 });

    const filtered = activeCategory === "all"
        ? galleryData
        : galleryData.filter((i) => i.category === activeCategory);

    const catLabels: Record<Category, string> = {
        all: t("gallery.all"),
        exterior: t("gallery.exterior"),
        interior: t("gallery.interior"),
        paint: t("gallery.paint"),
        ceramic: t("gallery.ceramic"),
    };

    return (
        <PageLayout>
            {/* Hero */}
            <section className="relative pt-32 pb-16 section-dark overflow-hidden">
                <div className="absolute inset-0 bg-hero-pattern" />
                <div className="container max-w-7xl mx-auto px-6 relative z-10 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-gold/20 text-xs font-semibold text-primary mb-6 animate-slide-up">
                        <Image className="w-3.5 h-3.5" />
                        {t("gallery.title")}
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4 animate-slide-up" style={{ animationDelay: "0.1s" }}>
                        {t("gallery.subtitle")}
                    </h1>
                </div>
            </section>

            {/* Filter */}
            <section className="py-8 section-darker border-b border-gold/10 sticky top-16 z-30">
                <div className="container max-w-7xl mx-auto px-6">
                    <div className="flex flex-wrap gap-2 justify-center">
                        {categories.map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={cn(
                                    "px-5 py-2 rounded-full text-sm font-medium transition-all duration-300",
                                    activeCategory === cat
                                        ? "bg-gradient-gold text-primary-foreground glow-gold-sm"
                                        : "glass border border-gold/15 text-muted-foreground hover:text-primary hover:border-gold/35"
                                )}
                            >
                                {catLabels[cat]}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            {/* Grid */}
            <section className="py-16 section-dark">
                <div ref={ref} className="container max-w-7xl mx-auto px-6">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-[180px]">
                        {filtered.map((item, i) => (
                            <GalleryCard
                                key={item.id}
                                item={item}
                                index={i}
                                isVisible={isVisible}
                                onOpen={setLightbox}
                            />
                        ))}
                    </div>
                </div>
            </section>

            {/* Lightbox */}
            {lightbox && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md animate-fade-in"
                    onClick={() => setLightbox(null)}
                >
                    <div
                        className="relative w-full max-w-2xl mx-6 glass rounded-3xl overflow-hidden border border-gold/20 animate-scale-in"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="relative h-80 sm:h-96 w-full overflow-hidden">
                            <img 
                                src={lightbox.src} 
                                alt={lightbox.label}
                                className="absolute inset-0 w-full h-full object-cover"
                            />
                        </div>
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-foreground mb-2">{lightbox.label}</h3>
                            <p className="text-sm text-muted-foreground capitalize">{lightbox.category} Service</p>
                        </div>
                        <button
                            onClick={() => setLightbox(null)}
                            className="absolute top-4 right-4 w-8 h-8 rounded-full glass border border-gold/20 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </PageLayout>
    );
}
