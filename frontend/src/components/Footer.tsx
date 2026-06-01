import { Link } from "react-router-dom";
import { Instagram, Facebook, Phone, Mail, MapPin } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { COMPANY_BRANDING } from "@/lib/company-branding";
import { cn } from "@/lib/utils";

export default function Footer() {
    const { t } = useLanguage();

    const navLinks = [
        { label: t("nav.home"), to: "/" },
        { label: t("nav.services"), to: "/services" },

        { label: t("nav.booking"), to: "/login" },
        { label: t("nav.about"), to: "/about" },
        { label: t("nav.contact"), to: "/contact" },
    ];

    const socials = [
        {
            icon: Instagram,
            label: "Instagram",
            href: "https://www.instagram.com/auto.spf/",
            customClass: "border-[#E1306C]/30 text-[#E1306C] shadow-[0_0_10px_rgba(225,48,108,0.2)] hover:border-pink-500 hover:text-pink-400 hover:shadow-[0_0_25px_rgba(225,48,108,0.6),_4px_4px_25px_rgba(249,206,52,0.5),_-4px_-4px_25px_rgba(98,40,215,0.5)] hover:bg-[#E1306C]/10"
        },
        {
            icon: Facebook,
            label: "Facebook",
            href: COMPANY_BRANDING.facebookUrl,
            customClass: "border-[#1877F2]/30 text-[#1877F2] shadow-[0_0_10px_rgba(24,119,242,0.2)] hover:border-[#1877F2] hover:text-[#1877F2] hover:shadow-[0_0_25px_rgba(24,119,242,0.6)] hover:bg-[#1877F2]/10"
        }
    ];

    return (
        <footer className="relative border-t border-gold/10 bg-card">
            {/* Gold line top */}
            <div className="gold-line" />

            <div className="container max-w-7xl mx-auto px-6 py-16">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
                    {/* Brand */}
                    <div className="lg:col-span-2">
                        <Link to="/" className="flex items-center mb-5 group w-fit hover:opacity-80 transition-opacity">
                            <img 
                                src="/images/autospf-logo.png" 
                                alt="AutoSPF+" 
                                className="h-10 md:h-12 object-contain"
                            />
                        </Link>
                        <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mb-1">
                            {t("footer.tagline")}
                        </p>
                        <p className="text-muted-foreground/80 text-xs leading-relaxed max-w-xs mb-6">
                            {COMPANY_BRANDING.tagline}
                        </p>
                        <div className="flex items-center gap-3">
                            {socials.map(({ icon: Icon, label, href, customClass }) => (
                                <a
                                    key={label}
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={label}
                                    className={cn(
                                        "w-9 h-9 border rounded-full glass flex items-center justify-center transition-all duration-300 hover:scale-110",
                                        customClass
                                    )}
                                >
                                    <Icon className="w-4 h-4" />
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Quick Links */}
                    <div>
                        <h4 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-widest">
                            {t("footer.quickLinks")}
                        </h4>
                        <ul className="space-y-2.5">
                            {navLinks.map((link) => (
                                <li key={link.to}>
                                    <Link
                                        to={link.to}
                                        className="text-sm text-muted-foreground hover:text-[#F4B63D] transition-colors duration-200 flex items-center gap-1.5 group"
                                    >
                                        <span className="w-1 h-1 rounded-full bg-[#F4B63D]/40 group-hover:bg-[#F4B63D] transition-colors" />
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Contact Info */}
                    <div>
                        <h4 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-widest">
                            {t("footer.connect")}
                        </h4>
                        <ul className="space-y-3">
                            <li className="flex items-start gap-2.5">
                                <MapPin className="w-4 h-4 text-[#F4B63D] mt-0.5 shrink-0" />
                                <span className="text-sm text-muted-foreground">{COMPANY_BRANDING.address}</span>
                            </li>
                            <li className="flex items-center gap-2.5">
                                <Phone className="w-4 h-4 text-[#F4B63D] shrink-0" />
                                <a href={`tel:${COMPANY_BRANDING.phoneTel}`} className="text-sm text-muted-foreground hover:text-[#F4B63D] transition-colors">
                                    {COMPANY_BRANDING.phone}
                                </a>
                            </li>
                            <li className="flex items-center gap-2.5">
                                <Mail className="w-4 h-4 text-[#F4B63D] shrink-0" />
                                <a href={`mailto:${COMPANY_BRANDING.email}`} className="text-sm text-muted-foreground hover:text-[#F4B63D] transition-colors">
                                    {COMPANY_BRANDING.email}
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Bottom Bar */}
            <div className="border-t border-gold/10">
                <div className="container max-w-7xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
                    <p>
                        © {new Date().getFullYear()} AutoSPF+. {t("footer.rights")}
                    </p>
                    <div className="flex items-center gap-4">
                        <a href="#" className="hover:text-[#F4B63D] transition-colors">{t("footer.privacy")}</a>
                        <a href="#" className="hover:text-[#F4B63D] transition-colors">{t("footer.terms")}</a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
