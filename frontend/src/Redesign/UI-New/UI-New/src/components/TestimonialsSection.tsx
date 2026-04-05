import { Star, Quote } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { cn } from "@/lib/utils";

const testimonials = [
    {
        name: "Carlos Reyes",
        role: "BMW M3 Owner",
        text: "AutoShine transformed my car completely. The ceramic coating they applied is phenomenal — water beads off like magic!",
        rating: 5,
        initials: "CR",
        color: "from-blue-500/30 to-blue-600/20",
    },
    {
        name: "Maria Santos",
        role: "Toyota Fortuner Owner",
        text: "Napakagaling ng kanilang serbisyo! Ang aking SUV ay mukhang bago pagkatapos ng full detail package. Highly recommended!",
        rating: 5,
        initials: "MS",
        color: "from-emerald-500/30 to-emerald-600/20",
    },
    {
        name: "Jake Lim",
        role: "Porsche 911 Owner",
        text: "The paint correction work they did on my 911 is absolutely stunning. Worth every peso. Professional team from start to finish.",
        rating: 5,
        initials: "JL",
        color: "from-amber-500/30 to-amber-600/20",
    },
    {
        name: "Ana Villanueva",
        role: "Honda Civic Owner",
        text: "Very professional and thorough. My car came back looking better than when I first bought it. Will definitely be back!",
        rating: 5,
        initials: "AV",
        color: "from-rose-500/30 to-rose-600/20",
    },
    {
        name: "Ricky Tan",
        role: "Ford Ranger Owner",
        text: "Great experience from booking to pickup. The team kept me updated and the results exceeded my expectations.",
        rating: 5,
        initials: "RT",
        color: "from-purple-500/30 to-purple-600/20",
    },
    {
        name: "Dianne Cruz",
        role: "Hyundai Tucson Owner",
        text: "Sulit na sulit! Pinagaling nila ang mga gasgas sa aking sasakyan. Talagang may pagmamahal sila sa kanilang trabaho.",
        rating: 5,
        initials: "DC",
        color: "from-indigo-500/30 to-indigo-600/20",
    },
];

function TestimonialCard({ t: testimonial }: { t: (typeof testimonials)[0] }) {
    return (
        <div className="w-80 shrink-0 glass rounded-2xl p-6 border border-gold/10 hover:border-gold/30 transition-all duration-300 group">
            <div className="flex items-start gap-3 mb-4">
                <div className={cn("w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-sm font-bold text-white shrink-0", testimonial.color)}>
                    {testimonial.initials}
                </div>
                <div>
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
            <div className="relative">
                {/* Fade edges */}
                <div className="absolute left-0 top-0 bottom-0 w-32 z-10 bg-gradient-to-r from-card to-transparent pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-32 z-10 bg-gradient-to-l from-card to-transparent pointer-events-none" />

                <div className="flex gap-6 animate-marquee w-max">
                    {[...testimonials, ...testimonials].map((t, i) => (
                        <TestimonialCard key={i} t={t} />
                    ))}
                </div>
            </div>
        </section>
    );
}
