import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Car } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function Navbar() {
    const { t, lang, setLang } = useLanguage();
    const [scrolled, setScrolled] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const location = useLocation();

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 50);
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    useEffect(() => {
        setMenuOpen(false);
    }, [location.pathname]);

    const navLinks = [
        { label: t("nav.home"), to: "/" },
        { label: t("nav.services"), to: "/services" },
        { label: t("nav.gallery"), to: "/gallery" },
        { label: t("nav.about"), to: "/about" },
        { label: t("nav.contact"), to: "/contact" },
    ];

    const isActive = (path: string) =>
        path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

    return (
        <>
            <nav
                className={cn(
                    "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
                    scrolled
                        ? "glass border-b border-gold/20 py-3"
                        : "bg-transparent py-5"
                )}
            >
                <div className="container max-w-7xl mx-auto px-6 flex items-center justify-between">
                    {/* Logo */}
                    <Link
                        to="/"
                        className="flex items-center gap-2.5 group"
                    >
                        <div className="w-9 h-9 rounded-lg bg-gradient-gold flex items-center justify-center animate-pulse-gold group-hover:scale-110 transition-transform duration-300">
                            <Car className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <span className="text-xl font-bold tracking-tight">
                            <span className="gradient-text">Auto</span>
                            <span className="text-foreground">Shine</span>
                        </span>
                    </Link>

                    {/* Desktop Links */}
                    <div className="hidden lg:flex items-center gap-1">
                        {navLinks.map((link) => (
                            <Link
                                key={link.to}
                                to={link.to}
                                className={cn(
                                    "relative px-4 py-2 text-sm font-medium transition-all duration-300 rounded-md group",
                                    isActive(link.to)
                                        ? "text-primary"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {link.label}
                                <span
                                    className={cn(
                                        "absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 bg-gradient-gold rounded-full transition-all duration-300",
                                        isActive(link.to) ? "w-4/5 opacity-100" : "w-0 opacity-0 group-hover:w-4/5 group-hover:opacity-60"
                                    )}
                                />
                            </Link>
                        ))}
                    </div>

                    {/* Right Actions */}
                    <div className="hidden lg:flex items-center gap-3">
                        {/* Language Toggle */}
                        <button
                            onClick={() => setLang(lang === "en" ? "fil" : "en")}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gold/25 text-xs font-semibold text-primary hover:bg-gold/10 transition-all duration-300"
                        >
                            <span className={cn("transition-opacity", lang === "en" ? "opacity-100" : "opacity-40")}>EN</span>
                            <span className="text-muted-foreground">|</span>
                            <span className={cn("transition-opacity", lang === "fil" ? "opacity-100" : "opacity-40")}>FIL</span>
                        </button>

                        <Link to="/login">
                            <Button variant="outline" size="sm" className="border-gold/30 text-primary hover:bg-gold/10 hover:border-gold/60 transition-all duration-300">
                                {t("nav.login")}
                            </Button>
                        </Link>

                        <Link to="/booking">
                            <Button size="sm" className="bg-gradient-gold text-primary-foreground hover:opacity-90 glow-gold-sm font-semibold transition-all duration-300">
                                {t("nav.booking")}
                            </Button>
                        </Link>
                    </div>

                    {/* Mobile Menu Button */}
                    <div className="flex lg:hidden items-center gap-3">
                        <button
                            onClick={() => setLang(lang === "en" ? "fil" : "en")}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-gold/25 text-xs font-semibold text-primary"
                        >
                            <span>{lang === "en" ? "EN" : "FIL"}</span>
                        </button>
                        <button
                            onClick={() => setMenuOpen(!menuOpen)}
                            className="p-2 text-foreground hover:text-primary transition-colors"
                            aria-label="Toggle menu"
                        >
                            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
            </nav>

            {/* Mobile Menu */}
            <div
                className={cn(
                    "fixed inset-0 z-40 lg:hidden transition-all duration-400",
                    menuOpen ? "pointer-events-auto" : "pointer-events-none"
                )}
            >
                {/* Overlay */}
                <div
                    className={cn(
                        "absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity duration-300",
                        menuOpen ? "opacity-100" : "opacity-0"
                    )}
                    onClick={() => setMenuOpen(false)}
                />

                {/* Drawer */}
                <div
                    className={cn(
                        "absolute top-0 right-0 h-full w-72 glass border-l border-gold/20 flex flex-col pt-20 px-6 pb-8 transition-transform duration-400",
                        menuOpen ? "translate-x-0" : "translate-x-full"
                    )}
                >
                    <div className="flex flex-col gap-2 flex-1">
                        {navLinks.map((link, i) => (
                            <Link
                                key={link.to}
                                to={link.to}
                                style={{ animationDelay: `${i * 60}ms` }}
                                className={cn(
                                    "py-3 px-4 rounded-lg text-base font-medium transition-all duration-300",
                                    menuOpen ? "animate-slide-in-right" : "",
                                    isActive(link.to)
                                        ? "text-primary bg-gold/10 border border-gold/20"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                )}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </div>
                    <div className="flex flex-col gap-3 mt-6">
                        <Link to="/login" className="w-full">
                            <Button variant="outline" className="w-full border-gold/30 text-primary hover:bg-gold/10">
                                {t("nav.login")}
                            </Button>
                        </Link>
                        <Link to="/booking" className="w-full">
                            <Button className="w-full bg-gradient-gold text-primary-foreground glow-gold-sm">
                                {t("nav.booking")}
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        </>
    );
}
