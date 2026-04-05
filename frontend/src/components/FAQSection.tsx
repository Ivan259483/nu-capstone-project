import { useState } from "react";
import { ChevronDown, MessageCircleQuestion } from "lucide-react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { cn } from "@/lib/utils";

const faqs = [
    {
        question: "Gaano katagal ang isang full detail?",
        answer: "Depende sa condition ng sasakyan at sa package na kukunin. Ang basic exterior wash at interior detailing ay usually 2-3 hours. Para sa full detail with paint correction at ceramic coating, inaabot ito ng 1-2 days para masiguro ang quality at curing time ng coating."
    },
    {
        question: "May pick-up and delivery ba kayo?",
        answer: "Yes! Nag-ooffer kami ng pick-up and delivery service para sa mga abalang car owners. Paki-message lang po ang location ninyo para ma-schedule namin nang maayos at mai-check kung pasok sa aming service area."
    },
    {
        question: "Anong products ang ginagamit ninyo?",
        answer: "Gumagamit lang kami ng premium at professional-grade detailing products, ceramics, at tools mula sa top international brands para masigurong safe ang paint ng sasakyan ninyo at mag-last nang matagal ang protection."
    },
    {
        question: "Pwede ba kahit anong sasakyan?",
        answer: "Kahit anong sasakyan—sedan, SUV, pickup, van, o sports car—kayang-kaya ng aming team! Nag-ccustomize rin kami ng process depende sa klase at condition ng paint ng sasakyan niyo."
    },
    {
        question: "Paano mag-book ng appointment?",
        answer: "Madali lang! Pwede kayong mag-book directly sa website namin gamit ang 'Book Now' button, o i-message kami sa aming Facebook/Instagram pages. Tumatanggap din kami ng walk-ins pero highly recommended ang booking para sure na may slot kayo."
    }
];

export default function FAQSection() {
    const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation();
    const { ref: faqRef, isVisible: faqVisible } = useScrollAnimation({ threshold: 0.2 });
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    const toggleFAQ = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <section className="py-24 section-darker relative overflow-hidden border-t border-gold/10">
            {/* Background elements */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] pointer-events-none" />

            <div className="container max-w-4xl mx-auto px-6 relative z-10">
                <div
                    ref={headerRef}
                    className={cn(
                        "text-center mb-16 reveal",
                        headerVisible ? "visible" : ""
                    )}
                >
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-gold/20 text-xs font-semibold text-primary mb-6">
                        <MessageCircleQuestion className="w-3.5 h-3.5" />
                        Frequently Asked Questions
                    </div>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-4">
                        Katanungan? <span className="gradient-text">Sagot Namin.</span>
                    </h2>
                    <p className="text-muted-foreground max-w-2xl mx-auto">
                        Alamin ang lahat ng detalye tungkol sa aming premium auto detailing, paint protection, at iba pang services.
                    </p>
                </div>

                <div 
                    ref={faqRef}
                    className={cn(
                        "w-full max-w-3xl mx-auto flex flex-col gap-4 reveal",
                        faqVisible ? "visible" : ""
                    )}
                >
                    {faqs.map((faq, index) => {
                        const isOpen = openIndex === index;
                        return (
                            <div 
                                key={index} 
                                className={cn(
                                    "glass rounded-2xl border transition-all duration-300 overflow-hidden",
                                    isOpen ? "border-gold/30 bg-background/60 shadow-[0_0_20px_rgba(212,175,55,0.05)]" : "border-border/50 hover:border-gold/20"
                                )}
                            >
                                <button
                                    onClick={() => toggleFAQ(index)}
                                    className="w-full flex items-center justify-between p-5 sm:p-6 text-left focus:outline-none"
                                >
                                    <h3 className="text-base sm:text-lg font-semibold pr-8 text-foreground group-hover:text-primary transition-colors">
                                        {faq.question}
                                    </h3>
                                    <div className={cn(
                                        "w-8 h-8 rounded-full rounded-2xl flex-shrink-0 flex items-center justify-center transition-all stroke-gold",
                                        isOpen ? "border border-gold/40 text-primary rotate-180" : "glass-subtle text-muted-foreground"
                                    )}>
                                        <ChevronDown className="w-4 h-4" />
                                    </div>
                                </button>
                                <div 
                                    className={cn(
                                        "overflow-hidden transition-all duration-300",
                                        isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                                    )}
                                >
                                    <div className="p-5 sm:p-6 pt-0 text-muted-foreground leading-relaxed">
                                        {faq.answer}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
