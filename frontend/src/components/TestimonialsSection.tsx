import { useState, useEffect } from "react";
import { Star, Quote, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { cn } from "@/lib/utils";

const testimonials = [
    {
        name: "Carlos Reyes",
        role: "BMW M3 Owner",
        text: "AutoSPF+ transformed my car completely. The ceramic coating they applied is phenomenal — water beads off like magic!",
        rating: 4,
        image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=faces",
    },
    {
        name: "Maria Santos",
        role: "Toyota Fortuner Owner",
        text: "Napakagaling ng kanilang serbisyo! Ang aking SUV ay mukhang bago pagkatapos ng full detail package. Highly recommended!",
        rating: 5,
        image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=faces",
    },
    {
        name: "Jake Lim",
        role: "Porsche 911 Owner",
        text: "The paint correction work they did on my 911 is absolutely stunning. Worth every peso. Professional team from start to finish.",
        rating: 5,
        image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=faces",
    },
    {
        name: "Ana Villanueva",
        role: "Honda Civic Owner",
        text: "Very professional and thorough. My car came back looking better than when I first bought it. Will definitely be back!",
        rating: 4,
        image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=faces",
    },
    {
        name: "Ricky Tan",
        role: "Ford Ranger Owner",
        text: "Great experience from booking to pickup. The team kept me updated and the results exceeded my expectations.",
        rating: 5,
        image: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&h=150&fit=crop&crop=faces",
    },
    {
        name: "Dianne Cruz",
        role: "Hyundai Tucson Owner",
        text: "Sulit na sulit! Pinagaling nila ang mga gasgas sa aking sasakyan. Talagang may pagmamahal sila sa kanilang trabaho.",
        rating: 4,
        image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=faces",
    },
];

function TestimonialCard({ t: testimonial, onClick }: { t: (typeof testimonials)[0]; onClick: () => void }) {
    return (
        <div 
            onClick={onClick}
            className="w-80 shrink-0 glass rounded-2xl p-6 border border-gold/10 hover:border-gold/30 transition-all duration-300 group cursor-pointer hover:shadow-[0_4px_20px_rgba(212,175,55,0.1)] hover:-translate-y-1"
        >
            <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 border border-gold/20 shadow-[0_0_12px_rgba(212,175,55,0.2)]">
                    <img
                        src={testimonial.image}
                        alt={testimonial.name}
                        className="w-full h-full object-cover"
                    />
                </div>
                <div className="flex-1">
                    <div className="text-sm font-semibold text-foreground">{testimonial.name}</div>
                    <div className="text-xs text-muted-foreground">{testimonial.role}</div>
                </div>
                <Quote className="w-6 h-6 text-primary/30 ml-auto shrink-0 group-hover:text-primary/60 transition-colors" />
            </div>
            <div className="flex gap-0.5 mb-3">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-primary text-primary" />
                ))}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{testimonial.text}</p>
        </div>
    );
}

export default function TestimonialsSection() {
    const { t } = useLanguage();
    const { ref, isVisible } = useScrollAnimation<HTMLDivElement>({ threshold: 0.1 });
    const [selected, setSelected] = useState<(typeof testimonials)[0] | null>(null);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (selected) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [selected]);

    return (
        <section className="py-24 section-dark overflow-hidden">
            <div className="container max-w-7xl mx-auto px-6">
                {/* Header */}
                <div
                    ref={ref}
                    className={cn("text-center mb-16 reveal", isVisible ? "visible" : "")}
                >
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-gold/20 text-xs font-semibold text-primary mb-4">
                        <Star className="w-3.5 h-3.5 fill-primary" />
                        {t("testimonials.title")}
                    </div>
                    <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                        {t("testimonials.subtitle")}
                    </h2>
                    <div className="w-24 h-0.5 bg-gradient-gold mx-auto rounded-full" />
                </div>
            </div>

            {/* Marquee */}
            <div className="relative group">
                {/* Fade edges */}
                <div className="absolute left-0 top-0 bottom-0 w-32 z-10 bg-gradient-to-r from-card to-transparent pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-32 z-10 bg-gradient-to-l from-card to-transparent pointer-events-none" />

                <div className="flex gap-6 animate-marquee w-max group-hover:[animation-play-state:paused] py-4">
                    {[...testimonials, ...testimonials].map((testimonial, i) => (
                        <TestimonialCard key={i} t={testimonial} onClick={() => setSelected(testimonial)} />
                    ))}
                </div>
            </div>

            {/* Custom Modal */}
            {selected && (
                <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div 
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" 
                        onClick={() => setSelected(null)}
                    />
                    
                    {/* Modal Content */}
                    <div 
                        className="relative w-full max-w-md bg-[#0a0a0a] border border-gold/20 p-8 rounded-2xl shadow-[0_0_40px_rgba(212,175,55,0.15)] animate-in fade-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button 
                            onClick={() => setSelected(null)}
                            className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors p-1"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex flex-col items-center text-center mt-2">
                            <Quote className="w-12 h-12 text-primary/20 mb-4 absolute top-6 left-6" />
                            
                            <div className="w-24 h-24 rounded-full overflow-hidden mb-4 border-2 border-gold/30 shadow-[0_0_20px_rgba(212,175,55,0.3)]">
                                <img
                                    src={selected.image}
                                    alt={selected.name}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            
                            <div className="text-xl font-bold text-foreground mb-1">{selected.name}</div>
                            <div className="text-sm text-muted-foreground mb-5">{selected.role}</div>
                            
                            <div className="flex gap-1.5 mb-6">
                                {Array.from({ length: selected.rating }).map((_, i) => (
                                    <Star key={i} className="w-5 h-5 fill-primary text-primary drop-shadow-[0_0_8px_rgba(212,175,55,0.5)]" />
                                ))}
                            </div>
                            
                            <p className="text-base text-muted-foreground leading-relaxed italic px-2">
                                "{selected.text}"
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
