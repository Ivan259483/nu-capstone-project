import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, MessageCircleQuestion, Sparkles, HelpCircle, Search } from "lucide-react";

/* ── Animation variants ── */
const EASE = [0.16, 1, 0.3, 1] as const;

const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

const stagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.08 } },
};

const cardReveal = {
    hidden: { opacity: 0, y: 16, scale: 0.98 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.45, ease: EASE, delay: i * 0.05 },
    }),
};

const answerVariants = {
    collapsed: {
        height: 0,
        opacity: 0,
        transition: { duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] as const },
    },
    expanded: {
        height: "auto",
        opacity: 1,
        transition: { duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] as const },
    },
};

/* ── FAQ Data — International / English ── */
const faqs = [
    {
        question: "What exactly is auto detailing?",
        answer: "Auto detailing is a comprehensive, meticulous cleaning and restoration process that goes far beyond a standard car wash. It involves multi-stage paint decontamination, clay bar treatment, machine polishing, interior deep-cleaning, leather conditioning, and protective coatings — essentially restoring your vehicle to showroom condition while preserving its long-term value.",
        category: "basics",
    },
    {
        question: "How long does a full detail take?",
        answer: "Service times vary by package and vehicle condition. A basic exterior wash and interior detailing typically takes 2–3 hours. Full detail packages with paint correction and ceramic coating require 1–2 days to ensure proper curing times and quality assurance checks before delivery.",
        category: "basics",
    },
    {
        question: "What's the difference between a car wash and detailing?",
        answer: "A regular car wash is a surface-level rinse and wipe. Detailing is a multi-step professional process that includes paint decontamination, clay bar treatment, machine polishing, leather conditioning, engine bay cleaning, and protective coatings. Think of it as a spa treatment versus a quick shower — the results and longevity are incomparable.",
        category: "basics",
    },
    {
        question: "What is ceramic coating and how long does it last?",
        answer: "Ceramic coating is a nano-technology liquid polymer that chemically bonds with your vehicle's paint, forming a permanent protective layer. It guards against UV damage, chemical stains, bird droppings, and minor scratches while creating an intense hydrophobic surface. Our professional-grade ceramic coatings last 2–5 years depending on maintenance and the package selected.",
        category: "services",
    },
    {
        question: "Do I need paint correction before ceramic coating?",
        answer: "We strongly recommend paint correction before applying ceramic coating. Since ceramic coating locks in the current state of your paint, any existing swirl marks, scratches, or oxidation will be permanently sealed beneath the coating. Paint correction ensures a flawless, mirror-finish base that maximizes the coating's visual impact.",
        category: "services",
    },
    {
        question: "What products and brands do you use?",
        answer: "We exclusively use professional-grade products from internationally recognized brands including Gtechniq, Gyeon, Koch Chemie, and XPEL. All products are rigorously tested, safe for all vehicle surfaces, and environmentally responsible. We never compromise on quality — your vehicle deserves the absolute best.",
        category: "services",
    },
    {
        question: "What is Paint Protection Film (PPF)?",
        answer: "PPF is a military-grade, optically clear urethane film applied to high-impact areas of your vehicle. It provides unmatched protection against rock chips, road debris, bug acids, and minor abrasions. Our premium films feature self-healing technology — minor scratches disappear with heat exposure — and carry a 10-year manufacturer warranty.",
        category: "services",
    },
    {
        question: "Do you offer pick-up and delivery?",
        answer: "Yes! We offer complimentary pick-up and delivery within our primary service area. Simply schedule your appointment online or contact us with your location, and our logistics team will coordinate a convenient time. A minimal transport fee may apply for locations outside our standard coverage zone.",
        category: "logistics",
    },
    {
        question: "Can you work on any type of vehicle?",
        answer: "Absolutely. We service sedans, SUVs, trucks, vans, sports cars, luxury vehicles, and motorcycles. Our team customizes every process based on your vehicle's type, size, paint condition, and specific needs. Pricing is tiered by vehicle category to ensure fair and transparent costing.",
        category: "logistics",
    },
    {
        question: "How do I book an appointment?",
        answer: "Booking is simple — use the 'Book Now' button on our website to select your preferred service, date, and time slot. You can also reach us via our social media channels or by phone. Walk-ins are welcome, but we highly recommend booking in advance to guarantee availability and allow prep time.",
        category: "logistics",
    },
    {
        question: "How should I maintain my car after detailing?",
        answer: "For best results, we recommend a pH-neutral hand wash every two weeks. Avoid automated car washes with harsh brushes, and never wax over a ceramic coating. For ceramic-coated vehicles, we offer a dedicated maintenance kit that extends coating longevity. Park in shaded areas when possible and address contaminants (bird droppings, tree sap) promptly.",
        category: "aftercare",
    },
    {
        question: "Is there a warranty on your services?",
        answer: "Yes — all our coating and PPF services include manufacturer-backed warranties. Ceramic coatings carry a 2–5 year warranty depending on the package, and our PPF installations include a 10-year warranty against yellowing, cracking, and delamination. We also provide complimentary follow-up inspections within the first 30 days.",
        category: "aftercare",
    },
];

/* ── Category labels ── */
const categories = [
    { key: "all", label: "All Questions" },
    { key: "basics", label: "Basics" },
    { key: "services", label: "Services" },
    { key: "logistics", label: "Booking" },
    { key: "aftercare", label: "Aftercare" },
];

export default function FAQSection() {
    const [openIndex, setOpenIndex] = useState<number | null>(0);
    const [activeCategory, setActiveCategory] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");

    const filteredFaqs = faqs.filter((f) => {
        const matchesCategory = activeCategory === "all" || f.category === activeCategory;
        const matchesSearch =
            searchQuery === "" ||
            f.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
            f.answer.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    const toggleFAQ = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <section className="relative py-32 overflow-hidden">
            {/* Ambient glow blobs */}
            <div className="absolute top-20 right-10 w-[500px] h-[500px] bg-orange-500/[0.03] blur-[150px] rounded-full pointer-events-none" />
            <div className="absolute bottom-20 left-10 w-96 h-96 bg-amber-500/[0.04] blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/[0.02] blur-[160px] rounded-full pointer-events-none" />

            {/* Top divider line */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />

            <div className="max-w-4xl mx-auto px-6 relative z-10">
                {/* ── Header ── */}
                <motion.div
                    variants={stagger}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-80px" }}
                    className="text-center mb-14"
                >
                    <motion.div
                        variants={fadeUp}
                        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#F4B63D]/[0.06] border border-[#F4B63D]/25 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#F4B63D]/90 mb-5"
                    >
                        <MessageCircleQuestion className="w-3.5 h-3.5" />
                        FAQ
                    </motion.div>
                    <motion.h2
                        variants={fadeUp}
                        className="text-4xl md:text-6xl font-serif font-medium text-[#F8F7F2] tracking-tight mb-5"
                    >
                        Got{" "}
                        <span className="text-[#F4B63D] italic">
                            Questions?
                        </span>
                    </motion.h2>
                    <motion.p
                        variants={fadeUp}
                        className="text-[#B8BEC8] text-base max-w-lg mx-auto font-light"
                    >
                        Everything you need to know about our premium auto detailing,
                        paint protection, and ceramic coating services.
                    </motion.p>
                </motion.div>

                {/* ── Search Bar ── */}
                <motion.div
                    variants={fadeUp}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="flex justify-center mb-8"
                >
                    <div className="relative w-full max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search questions..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setOpenIndex(null);
                            }}
                            className="w-full pl-11 pr-4 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:border-[#F4B63D]/30 focus:bg-white/[0.05] backdrop-blur-md transition-all duration-300"
                        />
                    </div>
                </motion.div>

                {/* ── Category Filter ── */}
                <motion.div
                    variants={fadeUp}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="flex justify-center mb-10"
                >
                    <div className="inline-flex flex-wrap justify-center p-1 bg-white/[0.03] backdrop-blur-md rounded-2xl border border-white/8 gap-1">
                        {categories.map((cat) => (
                            <button
                                key={cat.key}
                                onClick={() => {
                                    setActiveCategory(cat.key);
                                    setOpenIndex(null);
                                }}
                                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-300 ${
                                    activeCategory === cat.key
                                        ? "bg-gradient-to-r from-[#F4B63D] to-[#D58A12] text-black shadow-lg shadow-[#F4B63D]/20"
                                        : "text-white/40 hover:text-white/70 hover:bg-white/5"
                                }`}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>
                </motion.div>

                {/* ── FAQ Accordion ── */}
                <motion.div
                    variants={stagger}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-40px" }}
                    className="flex flex-col gap-3"
                >
                    <AnimatePresence mode="wait">
                        {filteredFaqs.length === 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="text-center py-12"
                            >
                                <HelpCircle className="w-10 h-10 text-white/10 mx-auto mb-4" />
                                <p className="text-white/30 text-sm">No questions found. Try a different search or category.</p>
                            </motion.div>
                        )}
                        {filteredFaqs.map((faq, index) => {
                            const isOpen = openIndex === index;
                            return (
                                <motion.div
                                    key={faq.question}
                                    custom={index}
                                    variants={cardReveal}
                                    initial="hidden"
                                    animate="visible"
                                    exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
                                    layout
                                    className={`group relative rounded-2xl overflow-hidden border backdrop-blur-sm transition-all duration-300 ${
                                        isOpen
                                            ? "border-[#F4B63D]/25 bg-white/[0.06] shadow-[0_0_30px_rgba(244,182,61,0.06)]"
                                            : "border-white/8 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
                                    }`}
                                >
                                    {/* Glow line when open */}
                                    <div
                                        className={`absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#F4B63D]/50 to-transparent transition-opacity duration-500 ${
                                            isOpen ? "opacity-100" : "opacity-0"
                                        }`}
                                    />

                                    <button
                                        onClick={() => toggleFAQ(index)}
                                        className="w-full flex items-center justify-between p-5 sm:p-6 text-left focus:outline-none"
                                    >
                                        <div className="flex items-center gap-3.5 flex-1 pr-4">
                                            <div
                                                className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center transition-all duration-300 ${
                                                    isOpen
                                                        ? "bg-[#F4B63D]/10 border border-[#F4B63D]/30"
                                                        : "bg-white/5 border border-white/10 group-hover:bg-white/8"
                                                }`}
                                            >
                                                <HelpCircle
                                                    className={`w-3.5 h-3.5 transition-colors duration-300 ${
                                                        isOpen ? "text-[#F4B63D]" : "text-white/30 group-hover:text-white/50"
                                                    }`}
                                                />
                                            </div>
                                            <h3
                                                className={`text-sm sm:text-[15px] font-semibold transition-colors duration-300 ${
                                                    isOpen ? "text-white" : "text-white/70 group-hover:text-white/90"
                                                }`}
                                            >
                                                {faq.question}
                                            </h3>
                                        </div>
                                        <motion.div
                                            animate={{ rotate: isOpen ? 180 : 0 }}
                                            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                                            className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-300 ${
                                                isOpen
                                                    ? "bg-[#F4B63D]/10 border border-[#F4B63D]/30"
                                                    : "bg-white/5 border border-white/10"
                                            }`}
                                        >
                                            <ChevronDown
                                                className={`w-3.5 h-3.5 transition-colors ${
                                                    isOpen ? "text-[#F4B63D]" : "text-white/30"
                                                }`}
                                            />
                                        </motion.div>
                                    </button>

                                    <AnimatePresence initial={false}>
                                        {isOpen && (
                                            <motion.div
                                                initial="collapsed"
                                                animate="expanded"
                                                exit="collapsed"
                                                variants={answerVariants}
                                                className="overflow-hidden"
                                            >
                                                <div className="px-5 sm:px-6 pb-6 pl-[4.25rem]">
                                                    <p className="text-sm text-white/40 leading-relaxed">
                                                        {faq.answer}
                                                    </p>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </motion.div>

                {/* ── Bottom prompt ── */}
                <motion.div
                    variants={fadeUp}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="text-center mt-14"
                >
                    <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-white/[0.03] border border-[#F4B63D]/15 backdrop-blur-sm">
                        <Sparkles className="w-4 h-4 text-[#F4B63D]/60" />
                        <p className="text-xs text-[#B8BEC8] font-medium">
                            Still have questions?{" "}
                            <a
                                href="/contact"
                                className="text-[#F4B63D]/80 hover:text-[#F4B63D] transition-colors underline underline-offset-2"
                            >
                                Contact our team
                            </a>
                        </p>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
