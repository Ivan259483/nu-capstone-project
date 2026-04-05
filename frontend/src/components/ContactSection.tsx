import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { Mail, Clock, MapPin, ChevronRight, Send } from 'lucide-react';

/* ── Framer variants ── */
const EASE = [0.16, 1, 0.3, 1] as const;

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 32 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
};

const stagger: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.1 } },
};

/* ── Shared input style ── */
const inputCls =
    'w-full h-11 px-4 rounded-none bg-transparent border-0 border-b border-white/15 ' +
    'text-white text-sm placeholder:text-white/25 ' +
    'focus:outline-none focus:border-gold/60 transition-colors duration-200';

const ENQUIRY_OPTIONS = [
    'Paint Protection Film',
    'Car Foil',
    'Ceramic Coating',
    'Window Tints',
    'Other',
];

const BULLET_POINTS = [
    'Need to get in touch with the team?',
    'Curious about a product or service?',
    'Need some professional advice?',
    'Want to schedule an appointment?',
];

export default function ContactSection() {
    const [form, setForm] = useState({
        name: '', email: '', tel: '', enquiry: '', details: '',
    });
    const [submitted, setSubmitted] = useState(false);

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // TODO: wire up to backend / email service
        setSubmitted(true);
        setTimeout(() => setSubmitted(false), 4000);
        setForm({ name: '', email: '', tel: '', enquiry: '', details: '' });
    };

    return (
        <section
            id="contact"
            className="relative py-28 px-6 overflow-hidden border-t border-white/5"
        >
            {/* Ambient glows */}
            <div className="absolute top-10 left-1/4 w-[500px] h-[300px] bg-zinc-800/20 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-10 right-1/4 w-[400px] h-[250px] bg-gold/5 blur-[100px] rounded-full pointer-events-none" />

            <div className="max-w-6xl mx-auto relative z-10">

                {/* ── Section header ── */}
                <motion.div
                    variants={stagger}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-80px' }}
                    className="mb-16"
                >
                    <motion.p
                        variants={fadeUp}
                        className="text-[10px] uppercase tracking-[0.5em] text-gold/70 font-semibold mb-3"
                    >
                        Get in touch
                    </motion.p>
                    <motion.h2
                        variants={fadeUp}
                        className="text-5xl md:text-7xl font-serif font-medium text-white tracking-tight mb-3"
                    >
                        Contact Us
                    </motion.h2>
                    <motion.p
                        variants={fadeUp}
                        className="text-[11px] uppercase tracking-[0.45em] text-white/25 font-medium"
                    >
                        How Can We Help?
                    </motion.p>
                </motion.div>

                {/* ── Top info grid ── */}
                <motion.div
                    variants={stagger}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-60px' }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/5 mb-px"
                >
                    {[
                        {
                            icon: Mail,
                            label: 'Email Us',
                            value: 'support@autospf.com',
                            sub: 'We respond within 24 hours',
                        },
                        {
                            icon: Clock,
                            label: 'Support Hours',
                            value: 'Mon – Sat: 9am – 6pm',
                            sub: 'Closed on Sundays & public holidays',
                        },
                        {
                            icon: MapPin,
                            label: 'Visit At HQ',
                            value: 'Marcos Alvarez Ave.',
                            sub: 'Las Piñas City, Metro Manila',
                        },
                    ].map(({ icon: Icon, label, value, sub }) => (
                        <motion.div
                            key={label}
                            variants={fadeUp}
                            className="group flex items-start gap-5 p-8 glass hover:bg-white/[0.06] border-white/5 hover:border-gold/20 transition-all duration-300"
                        >
                            <div className="w-10 h-10 shrink-0 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center group-hover:bg-gold/10 group-hover:border-gold/30 transition-all duration-300 mt-0.5">
                                <Icon className="w-4 h-4 text-white/40 group-hover:text-gold transition-colors duration-300" />
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.4em] text-white/30 font-semibold mb-1.5">
                                    {label}
                                </p>
                                <p className="text-white font-medium text-sm mb-1">{value}</p>
                                <p className="text-white/30 text-xs font-light">{sub}</p>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>

                {/* ── Split layout ── */}
                <motion.div
                    variants={stagger}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-60px' }}
                    className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-white/5"
                >
                    {/* LEFT — Get in touch copy */}
                    <motion.div
                        variants={fadeUp}
                        className="p-10 bg-white/[0.03] border border-white/5 flex flex-col justify-between"
                    >
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.45em] text-white/25 font-semibold mb-6">
                                Get In Touch With The Team
                            </p>
                            <h3 className="text-3xl md:text-4xl font-serif font-medium text-white tracking-tight mb-8 leading-snug">
                                We're here to<br />
                                <span className="text-transparent bg-clip-text bg-gradient-gold">
                                    help you.
                                </span>
                            </h3>
                            <ul className="space-y-4 mb-10">
                                {BULLET_POINTS.map(point => (
                                    <li key={point} className="flex items-start gap-3 text-sm text-white/50 font-light">
                                        <ChevronRight className="w-3.5 h-3.5 text-gold/60 shrink-0 mt-0.5" />
                                        {point}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Support hours card */}
                        <div className="border border-white/8 p-6 mt-2">
                            <p className="text-[10px] uppercase tracking-[0.4em] text-white/25 font-semibold mb-4">
                                Support Hours
                            </p>
                            <div className="space-y-2.5">
                                {[
                                    { day: 'Monday – Friday', time: '9:00am – 6:00pm' },
                                    { day: 'Saturday', time: '10:00am – 4:00pm' },
                                    { day: 'Sunday', time: 'Closed' },
                                ].map(({ day, time }) => (
                                    <div key={day} className="flex items-center justify-between text-xs">
                                        <span className="text-white/40 font-medium">{day}</span>
                                        <span className={`font-semibold tracking-wide ${time === 'Closed' ? 'text-white/20' : 'text-white/70'}`}>
                                            {time}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>

                    {/* RIGHT — Contact form */}
                    <motion.div
                        variants={fadeUp}
                        className="p-10 bg-white/[0.04] border border-white/5"
                    >
                        <p className="text-[10px] uppercase tracking-[0.45em] text-white/25 font-semibold mb-8">
                            Send An Email To Our Team
                        </p>

                        {submitted ? (
                            <motion.div
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex flex-col items-center justify-center h-64 text-center gap-4"
                            >
                                <div className="w-12 h-12 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center">
                                    <Send className="w-5 h-5 text-gold-light" />
                                </div>
                                <p className="text-white font-semibold text-lg tracking-tight">Enquiry Sent</p>
                                <p className="text-white/35 text-sm font-light max-w-xs">
                                    Thank you for reaching out. Our team will respond within 24 hours.
                                </p>
                            </motion.div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-6">
                                {/* Name */}
                                <div>
                                    <label className="block text-[10px] uppercase tracking-[0.4em] text-white/25 font-semibold mb-2">
                                        Full Name
                                    </label>
                                    <input
                                        name="name" value={form.name} onChange={handleChange}
                                        placeholder="John Doe" required
                                        className={inputCls}
                                    />
                                </div>

                                {/* Email + Tel */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-[10px] uppercase tracking-[0.4em] text-white/25 font-semibold mb-2">
                                            Email Address
                                        </label>
                                        <input
                                            name="email" type="email" value={form.email} onChange={handleChange}
                                            placeholder="name@example.com" required
                                            className={inputCls}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] uppercase tracking-[0.4em] text-white/25 font-semibold mb-2">
                                            Telephone
                                        </label>
                                        <input
                                            name="tel" type="tel" value={form.tel} onChange={handleChange}
                                            placeholder="+63 9XX XXX XXXX"
                                            className={inputCls}
                                        />
                                    </div>
                                </div>

                                {/* Enquiry type */}
                                <div>
                                    <label className="block text-[10px] uppercase tracking-[0.4em] text-white/25 font-semibold mb-2">
                                        Nature of Enquiry
                                    </label>
                                    <select
                                        name="enquiry" value={form.enquiry} onChange={handleChange}
                                        required
                                        className={`${inputCls} cursor-pointer`}
                                        style={{ background: 'transparent' }}
                                    >
                                        <option value="" disabled className="bg-[#0D0D12] text-white/40">
                                            Select a service...
                                        </option>
                                        {ENQUIRY_OPTIONS.map(opt => (
                                            <option key={opt} value={opt} className="bg-[#0D0D12] text-white">
                                                {opt}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Enquiry details */}
                                <div>
                                    <label className="block text-[10px] uppercase tracking-[0.4em] text-white/25 font-semibold mb-2">
                                        Enquiry Details
                                    </label>
                                    <textarea
                                        name="details" value={form.details} onChange={handleChange}
                                        placeholder="Please describe your enquiry in as much detail as possible..."
                                        rows={4}
                                        required
                                        className={`${inputCls} h-auto py-3 resize-none`}
                                    />
                                </div>

                                {/* Submit */}
                                <motion.button
                                    type="submit"
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="flex items-center justify-center gap-2.5 px-8 py-3.5
                                               bg-gradient-gold hover:shadow-[0_0_20px_rgba(212,175,55,0.4)]
                                               text-black text-xs font-semibold uppercase tracking-[0.2em]
                                               shadow-lg shadow-gold/20
                                               transition-all duration-200"
                                >
                                    <Send className="w-3.5 h-3.5" />
                                    Submit Enquiry
                                </motion.button>
                            </form>
                        )}
                    </motion.div>
                </motion.div>

            </div>
        </section>
    );
}
