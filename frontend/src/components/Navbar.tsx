import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Globe, ChevronDown, Check } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LANGUAGES = [
    { code: "en" as const, label: "EN", name: "English" },
    { code: "fil" as const, label: "FIL", name: "Filipino" },
];

function LanguageSwitcher({ className }: { className?: string }) {
    const { lang, setLang } = useLanguage();
    const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label="Select language"
                    className={cn(
                        "flex items-center gap-2 px-3.5 py-2 rounded-full",
                        "bg-gradient-gold text-white text-xs font-semibold uppercase tracking-wide",
                        "hover:opacity-90 transition-opacity",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                        className
                    )}
                >
                    <Globe className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                    <span>{current.label}</span>
                    <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-90" strokeWidth={2.5} />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[9rem]">
                {LANGUAGES.map((language) => (
                    <DropdownMenuItem
                        key={language.code}
                        onClick={() => setLang(language.code)}
                        className="cursor-pointer gap-2"
                    >
                        <span className="font-semibold w-7">{language.label}</span>
                        <span className="text-muted-foreground">{language.name}</span>
                        {lang === language.code && (
                            <Check className="ml-auto h-4 w-4 text-primary" />
                        )}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

const SCROLL_TOP_REVEAL = 72;
const SCROLL_DIRECTION_DELTA = 6;

export default function Navbar() {
    const { t } = useLanguage();
    const [scrolled, setScrolled] = useState(false);
    const [hidden, setHidden] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const location = useLocation();
    const lastScrollY = useRef(0);
    const menuOpenRef = useRef(menuOpen);

    useEffect(() => {
        menuOpenRef.current = menuOpen;
        if (menuOpen) setHidden(false);
    }, [menuOpen]);

    useEffect(() => {
        const onScroll = () => {
            const currentY = window.scrollY;
            setScrolled(currentY > 50);

            if (menuOpenRef.current || currentY < SCROLL_TOP_REVEAL) {
                setHidden(false);
            } else if (currentY > lastScrollY.current + SCROLL_DIRECTION_DELTA) {
                setHidden(true);
            } else if (currentY < lastScrollY.current - SCROLL_DIRECTION_DELTA) {
                setHidden(false);
            }

            lastScrollY.current = currentY;
        };

        lastScrollY.current = window.scrollY;
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    useEffect(() => {
        setMenuOpen(false);
        setHidden(false);
        lastScrollY.current = 0;
    }, [location.pathname]);

    const navLinks = [
        { label: t("nav.home"), to: "/" },
        { label: t("nav.services"), to: "/services" },

        { label: t("nav.about"), to: "/about" },
        { label: t("nav.contact"), to: "/contact" },
    ];

    const isActive = (path: string) =>
        path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

    return (
        <>
            <nav
                className={cn(
                    "fixed top-0 left-0 right-0 z-50 transition-[transform,background-color,border-color,padding] duration-300 ease-out",
                    hidden && !menuOpen
                        ? "-translate-y-full pointer-events-none"
                        : "translate-y-0 pointer-events-auto",
                    scrolled
                        ? "glass border-b border-gold/20 py-2"
                        : "bg-transparent py-3"
                )}
            >
                <div className="container max-w-7xl mx-auto px-6 flex items-center justify-between relative">
                    {/* Logo */}
                    <Link
                        to="/"
                        className="flex items-center group hover:opacity-80 transition-opacity"
                    >
                        <img 
                            src="/images/autospf-logo.png" 
                            alt="AutoSPF+" 
                            className="h-12 w-auto sm:h-14 md:h-[4.5rem] object-contain"
                        />
                    </Link>

                    {/* Desktop Links — absolutely centered in navbar */}
                    <div className="hidden lg:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
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
                        <LanguageSwitcher />

                        <Link to="/login">
                            <Button variant="outline" size="sm" className="border-gold/30 text-primary hover:bg-gold/10 hover:border-gold/60 transition-all duration-300">
                                {t("nav.login")}
                            </Button>
                        </Link>

                        <Link to="/login">
                            <Button size="sm" className="bg-gradient-gold text-primary-foreground hover:opacity-90 glow-gold-sm font-semibold transition-all duration-300">
                                {t("nav.booking")}
                            </Button>
                        </Link>
                    </div>

                    {/* Mobile Menu Button */}
                    <div className="flex lg:hidden items-center gap-3">
                        <LanguageSwitcher className="min-h-[44px]" />
                        <button
                            onClick={() => setMenuOpen(!menuOpen)}
                            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-foreground hover:text-primary transition-colors"
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
                                    "py-3 px-4 min-h-[44px] flex items-center rounded-lg text-base font-medium transition-all duration-300",
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
                            <Button variant="outline" className="w-full min-h-[44px] border-gold/30 text-primary hover:bg-gold/10">
                                {t("nav.login")}
                            </Button>
                        </Link>
                        <Link to="/login" className="w-full">
                            <Button className="w-full min-h-[44px] bg-gradient-gold text-primary-foreground glow-gold-sm">
                                {t("nav.booking")}
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        </>
    );
}
