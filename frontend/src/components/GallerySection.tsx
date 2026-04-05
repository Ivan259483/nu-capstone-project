import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Image, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { LandingGalleryItem } from "@/lib/landing";

// Using premium placeholders representing the actual services (Exterior, Interior, Paint, Ceramic)
const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1518306727298-4c17e1bf6942?auto=format&fit=crop&q=80&w=1200";

const fallbackGalleryItems = [
    { label: "Exterior Wash & Wax", src: "https://images.unsplash.com/photo-1620584898989-d39f7f9ed1b7?auto=format&fit=crop&q=80&w=1200", aspect: "normal" },
    { label: "Interior Detailing", src: "https://images.unsplash.com/photo-1620584899131-a5ff5f8fbb03?auto=format&fit=crop&q=80&w=1200", aspect: "wide" },
    { label: "Paint Correction", src: "https://images.unsplash.com/photo-1622329821376-a19fd6002562?auto=format&fit=crop&q=80&w=1200", aspect: "normal" },
    { label: "Ceramic Coating", src: "https://images.unsplash.com/photo-1632823469850-2f77dd9c7f93?auto=format&fit=crop&q=80&w=1200", aspect: "normal" },
    { label: "Full Paint Protection (PPF)", src: "https://images.unsplash.com/photo-1605437241278-c1806d14a4d9?auto=format&fit=crop&q=80&w=1200", aspect: "tall" },
    { label: "Premium Window Tint", src: "https://images.unsplash.com/photo-1528597469186-bddab681a37f?auto=format&fit=crop&q=80&w=1200", aspect: "normal" },
];

export const GALLERY_ITEMS = fallbackGalleryItems;

function GalleryItem({
    item,
    fallback,
    index,
    isVisible,
    onClick
}: {
    item: any;
    fallback: typeof fallbackGalleryItems[0];
    index: number;
    isVisible: boolean;
    onClick: (src: string, label: string) => void;
}) {
    const isTall = fallback.aspect === "tall";
    const isWide = fallback.aspect === "wide";
    const [imgSrc, setImgSrc] = useState(item?.url || fallback.src);
    const label = item?.caption || item?.label || fallback.label;

    return (
        <div
            onClick={() => onClick(imgSrc, label)}
            className={cn(
                "reveal group relative overflow-hidden rounded-2xl cursor-pointer shadow-lg hover:shadow-gold/20 transition-all duration-500",
                isTall ? "row-span-2" : isWide ? "col-span-2 md:col-span-1 lg:col-span-2" : "",
                isVisible ? "visible" : ""
            )}
            style={{
                transitionDelay: `${(index % 6) * 100}ms`,
                minHeight: isTall ? "400px" : "250px"
            }}
        >
            <div className="absolute inset-0 bg-zinc-900/40" />

            {/* Verified Safe Image Component */}
            <img 
                src={imgSrc} 
                alt={item?.label || fallback.label}
                onError={() => setImgSrc(FALLBACK_IMAGE)}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            />

            {/* Permanent dark gradient at bottom */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D12]/90 via-transparent to-transparent opacity-80" />

            {/* Hover overlay with label */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-gold/10 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-400 flex flex-col justify-end p-6">
                <div className="transform translate-y-4 group-hover:translate-y-0 transition-transform duration-400">
                    <span className="text-lg font-bold text-white drop-shadow-md">{label}</span>
                    <div className="w-8 h-1 bg-gradient-gold mt-2 rounded-full" />
                </div>
            </div>

            {/* Gold border and glow on hover */}
            <div className="absolute inset-0 rounded-2xl border-2 border-gold/0 group-hover:border-gold/40 transition-all duration-500 pointer-events-none shadow-none group-hover:shadow-[0_0_20px_rgba(212,175,55,0.15)]" />
        </div>
    );
}

interface GallerySectionProps {
    items?: LandingGalleryItem[];
}

export default function GallerySection({ items }: GallerySectionProps) {
    const { t } = useLanguage();
    const { ref, isVisible } = useScrollAnimation<HTMLDivElement>({ threshold: 0.1 });
    
    // Lightbox State
    const [selectedImage, setSelectedImage] = useState<{src: string, label: string} | null>(null);

    // Bypass Settings API for now to guarantee premium images render instead of db placeholders
    const resolvedGallery = items?.length ? items : fallbackGalleryItems;
    const loopCount = Math.max(resolvedGallery.length, fallbackGalleryItems.length) || fallbackGalleryItems.length;

    const displayItems = Array.from({ length: Math.min(loopCount, 6) }).map((_, i) => ({
        item: resolvedGallery[i],
        fallback: fallbackGalleryItems[i % fallbackGalleryItems.length],
    }));

    return (
        <section id="gallery" className="relative py-24 section-darker z-10 isolate min-h-max overflow-hidden bg-background/50">
            {/* Ambient glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-gold/5 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-[400px] h-[300px] bg-zinc-800/20 blur-[100px] rounded-full pointer-events-none" />

            <div className="container max-w-7xl mx-auto px-6 relative z-[1]">
                {/* Header */}
                <div
                    ref={ref}
                    className={cn("text-center mb-16 reveal", isVisible ? "visible" : "")}
                >
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-gold/20 text-xs font-semibold text-primary mb-4">
                        <Image className="w-3.5 h-3.5" />
                        {t("gallery.title") || "Our Work"}
                    </div>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-4">
                        {t("gallery.subtitle") || "See the transformation — before and after"}
                    </h2>
                    <div className="w-24 h-0.5 bg-gradient-gold mx-auto rounded-full" />
                </div>

                {/* Masonry Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-[180px] sm:auto-rows-[200px] mb-10">
                    {displayItems.map(({ item, fallback }, i) => (
                        <GalleryItem 
                            key={i} 
                            item={item} 
                            fallback={fallback} 
                            index={i} 
                            isVisible={isVisible}
                            onClick={(src, label) => setSelectedImage({ src, label })}
                        />
                    ))}
                </div>

                <div className={cn("text-center reveal", isVisible ? "visible" : "")} style={{ transitionDelay: "400ms" }}>
                    <Link to="/gallery">
                        <Button variant="outline" className="border-gold/30 text-primary hover:bg-gold/10 hover:border-gold/60 group px-6 py-5 rounded-xl">
                            {t("gallery.viewGallery") || "View Full Gallery"}
                            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Lightbox Dialog */}
            <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
                <DialogContent className="max-w-5xl bg-zinc-950 border-gold/20 p-1 sm:p-2 rounded-xl sm:rounded-2xl shadow-[0_0_50px_rgba(212,175,55,0.1)] gap-0">
                    {selectedImage && (
                        <div className="relative w-full h-full flex flex-col items-center justify-center bg-black/50 rounded-xl overflow-hidden">
                            <img 
                                src={selectedImage.src} 
                                alt={selectedImage.label} 
                                className="w-full h-auto max-h-[85vh] object-contain rounded-lg"
                            />
                            <div className="absolute bottom-0 inset-x-0 p-6 bg-gradient-to-t from-black/90 to-transparent">
                                <h3 className="text-xl sm:text-2xl font-bold text-white shadow-black drop-shadow-md">
                                    {selectedImage.label}
                                </h3>
                                <div className="w-12 h-1 bg-gradient-gold mt-3 rounded-full" />
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </section>
    );
}
