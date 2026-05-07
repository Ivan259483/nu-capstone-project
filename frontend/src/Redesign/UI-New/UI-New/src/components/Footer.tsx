import { Link } from "react-router-dom";
import { Car, Instagram, Facebook, Twitter, Youtube, Phone, Mail, MapPin } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Footer() {
    const { t } = useLanguage();

    const navLinks = [
        { label: t("nav.home"), to: "/" },
        { label: t("nav.services"), to: "/services" },
        { label: t("nav.gallery"), to: "/gallery" },
        { label: t("nav.booking"), to: "/login" },
        { label: t("nav.about"), to: "/about" },
        { label: t("nav.contact"), to: "/contact" },
    ];

    const socials = [
        { icon: Instagram, label: "Instagram", href: "#" },
        { icon: Facebook, label: "Facebook", href: "#" },
        { icon: Twitter, label: "Twitter", href: "#" },
        { icon: Youtube, label: "YouTube", href: "#" },
    ];

    return (
        <footer className="relative border-t border-gold/10 bg-card">
            {/* Gold line top */}
            <div className="gold-line" />

            <div className="container max-w-7xl mx-auto px-6 py-16">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
                    {/* Brand */}
                    <div className="lg:col-span-2">
                        <Link to="/" className="flex items-center gap-2.5 mb-4 group w-fit">
                            <div className="w-9 h-9 rounded-lg bg-gradient-gold flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Car className="w-5 h-5 text-primary-foreground" />
                            </div>
                            <span className="text-xl font-bold">
                                <span className="gradient-text">Auto</span>
                                <span className="text-foreground">Shine</span>
                            </span>
                        </Link>
                        <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mb-6">
                            {t("footer.tagline")}. {t("about.storyText").slice(0, 100)}...
                        </p>
                        <div className="flex items-center gap-3">
                            {socials.map(({ icon: Icon, label, href }) => (
                                <a
                                    key={label}
                                    href={href}
                                    aria-label={label}
                                    className="w-9 h-9 rounded-full glass flex items-center justify-center text-muted-foreground hover:text-primary hover:border-gold/40 transition-all duration-300 hover:scale-110 hover:glow-gold-sm"
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
                                        className="text-sm text-muted-foreground hover:text-primary transition-colors duration-200 flex items-center gap-1.5 group"
                                    >
                                        <span className="w-1 h-1 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
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
                                <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                                <span className="text-sm text-muted-foreground">{t("contact.addressValue")}</span>
                            </li>
                            <li className="flex items-center gap-2.5">
                                <Phone className="w-4 h-4 text-primary shrink-0" />
                                <a href="tel:+639123456789" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                                    {t("contact.phoneValue")}
                                </a>
                            </li>
                            <li className="flex items-center gap-2.5">
                                <Mail className="w-4 h-4 text-primary shrink-0" />
                                <a href="mailto:hello@autoshine.ph" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                                    {t("contact.emailValue")}
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
                        © {new Date().getFullYear()} AutoShine. {t("footer.rights")}
                    </p>
                    <div className="flex items-center gap-4">
                        <a href="#" className="hover:text-primary transition-colors">{t("footer.privacy")}</a>
                        <a href="#" className="hover:text-primary transition-colors">{t("footer.terms")}</a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
