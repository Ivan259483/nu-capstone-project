import { useEffect, useState, type ReactNode } from "react";
import { LayoutGroup, motion } from "motion/react";
import { Link, useLocation } from "react-router-dom";
import {
    IconBriefcase,
    IconCheck,
    IconChevronDown,
    IconHome,
    IconInfoCircle,
    IconMail,
    IconMenu2,
    IconX,
} from "@tabler/icons-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import {
    FloatingNav,
    NAV_ACTIVE_PILL_TRANSITION,
    type FloatingNavItem,
} from "@/components/ui/floating-navbar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LANGUAGES = [
    { code: "en" as const, label: "EN", nameKey: "language.english" as const },
    { code: "fil" as const, label: "FIL", nameKey: "language.filipino" as const },
];

function LanguageSwitcher({ className }: { className?: string }) {
    const { lang, setLang, t } = useLanguage();
    const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={t("language.select")}
                    className={cn(
                        "inline-flex h-9 min-w-[3.75rem] items-center justify-center gap-1 rounded-full border border-white/12 bg-white/[0.045] px-3",
                        "text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-white/82",
                        "shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors hover:border-[#e0a020]/40 hover:bg-white/[0.08] hover:text-[#f4c96b]",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e0a020]/50 focus-visible:ring-offset-0",
                        className
                    )}
                >
                    <span>{current.label}</span>
                    <IconChevronDown className="h-3 w-3 shrink-0 opacity-75" stroke={2.5} />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="z-[5010] flex min-w-[10.5rem] flex-col gap-1 rounded-2xl border-white/12 bg-[#070a12]/88 p-1.5 text-white shadow-[0_18px_42px_rgba(0,0,0,0.24)] backdrop-blur-xl"
            >
                {LANGUAGES.map((language) => (
                    <DropdownMenuItem
                        key={language.code}
                        onClick={() => setLang(language.code)}
                        className="cursor-pointer gap-2 rounded-lg border-0 px-3 py-2.5 text-white focus:bg-white/[0.08] focus:text-white data-[highlighted]:bg-white/[0.08] data-[highlighted]:text-white"
                    >
                        <span className="w-7 font-semibold text-[#f4c96b]">{language.label}</span>
                        <span className="text-white/55">{t(language.nameKey)}</span>
                        {lang === language.code && (
                            <IconCheck className="ml-auto h-4 w-4 text-[#e0a020]" stroke={2.5} />
                        )}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export default function Navbar() {
    const { t } = useLanguage();
    const [menuOpen, setMenuOpen] = useState(false);
    const location = useLocation();
    const isHomePage = location.pathname === "/";

    useEffect(() => {
        setMenuOpen(false);
    }, [location.pathname]);

    const isActive = (path: string) =>
        path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

    const navLinks: FloatingNavItem[] = [
        {
            name: t("nav.home"),
            link: "/",
            icon: <IconHome className="h-4 w-4" />,
            active: isActive("/"),
        },
        {
            name: t("nav.services"),
            link: "/services",
            icon: <IconBriefcase className="h-4 w-4" />,
            active: isActive("/services"),
        },
        {
            name: t("nav.about"),
            link: "/about",
            icon: <IconInfoCircle className="h-4 w-4" />,
            active: isActive("/about"),
        },
        {
            name: t("nav.contact"),
            link: "/contact",
            icon: <IconMail className="h-4 w-4" />,
            active: isActive("/contact"),
        },
    ];

    const renderNavItem = (
        navItem: FloatingNavItem,
        className: string,
        children: ReactNode
    ) => (
        <Link to={navItem.link} className={cn("public-nav-link", className)}>
            {children}
        </Link>
    );

    const logo = (
        <Link
            to="/"
            aria-label="AutoSPF+ home"
            className={cn(
                "flex h-full items-center justify-center transition-opacity hover:opacity-90",
                isHomePage ? "px-0" : "px-2"
            )}
        >
            <img
                src="/images/autospf-logo.png"
                alt="AutoSPF+"
                className={cn(
                    "h-auto w-[92px] max-w-none object-contain sm:w-[96px]",
                    isHomePage && "w-[96px] sm:w-[100px]"
                )}
            />
        </Link>
    );

    const actions = (
        <>
            <LanguageSwitcher
                className={cn(
                    isHomePage &&
                    "border-white/15 bg-white/[0.03] text-white/90 shadow-none backdrop-blur-sm hover:border-white/25 hover:bg-white/[0.07] hover:text-white"
                )}
            />

            <span aria-hidden className={cn("h-6 w-px", isHomePage ? "bg-white/18" : "bg-white/10")} />

            <Link
                to="/login"
                className={cn(
                    "whitespace-nowrap rounded-full px-2 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e0a020]/45",
                    isHomePage ? "text-white/82 drop-shadow-[0_1px_8px_rgba(0,0,0,0.45)] hover:text-white" : "text-white/72 hover:text-[#f4c96b]"
                )}
            >
                {t("nav.login")}
            </Link>

            <Link
                to="/login"
                className={cn(
                    "public-luxury-cta public-luxury-cta--primary public-luxury-cta--nav whitespace-nowrap",
                    isHomePage && "public-luxury-cta--hero-nav"
                )}
            >
                {t("nav.booking")}
            </Link>
        </>
    );

    const mobileActions = (
        <>
            <LanguageSwitcher
                className={cn(
                    "h-10 min-w-[4rem] px-3",
                    isHomePage &&
                    "border-white/15 bg-white/[0.03] text-white/90 shadow-none backdrop-blur-sm hover:border-white/25 hover:bg-white/[0.07] hover:text-white"
                )}
            />
            <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className={cn(
                    "flex min-h-10 min-w-10 items-center justify-center rounded-full border text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e0a020]/60",
                    isHomePage
                        ? "border-white/15 bg-white/[0.03] backdrop-blur-sm hover:bg-white/[0.07]"
                        : "border-white/12 bg-white/[0.055] hover:bg-white/[0.09]"
                )}
                aria-label="Toggle menu"
                aria-expanded={menuOpen}
            >
                {menuOpen ? <IconX className="h-5 w-5" /> : <IconMenu2 className="h-5 w-5" />}
            </button>
        </>
    );

    return (
        <>
            <FloatingNav
                navItems={navLinks}
                logo={logo}
                actions={actions}
                mobileActions={mobileActions}
                variant={isHomePage ? "hero" : "glass"}
                renderNavItem={renderNavItem}
            />

            <div
                className={cn(
                    "absolute inset-x-0 top-0 z-[4990] min-h-screen lg:hidden transition-all duration-300",
                    menuOpen ? "pointer-events-auto" : "pointer-events-none"
                )}
            >
                <button
                    type="button"
                    aria-label="Close menu"
                    className={cn(
                        "absolute inset-0 bg-black/55 backdrop-blur-sm transition-opacity duration-300",
                        menuOpen ? "opacity-100" : "opacity-0"
                    )}
                    onClick={() => setMenuOpen(false)}
                />

                <div
                    className={cn(
                        "public-nav-menu-panel absolute right-3 flex w-[min(20rem,calc(100vw-1.5rem))] flex-col rounded-2xl border border-white/10 bg-[#05070c]/78 p-3 backdrop-blur-xl transition-all duration-300",
                        "top-[5.75rem] sm:top-[6.25rem]",
                        menuOpen ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
                    )}
                >
                    <LayoutGroup id="public-nav-mobile">
                        <div className="flex flex-col gap-0.5">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.link}
                                    to={link.link}
                                    className={cn(
                                        "relative flex min-h-11 items-center gap-3 overflow-hidden rounded-xl px-4 text-sm font-medium transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                        link.active
                                            ? "z-[1] text-[#e0a020]"
                                            : "z-[1] text-white/65 hover:bg-white/[0.06] hover:text-white"
                                    )}
                                >
                                    {link.active && (
                                        <motion.span
                                            layoutId="public-nav-active-pill-mobile"
                                            className="absolute inset-0 rounded-xl border border-white/[0.08] bg-white/[0.085] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                                            transition={NAV_ACTIVE_PILL_TRANSITION}
                                            aria-hidden
                                        />
                                    )}
                                    <span className="relative z-[2] flex items-center gap-3">
                                        {link.icon}
                                        {link.name}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </LayoutGroup>

                    <div className="mt-4 grid gap-3 border-t border-white/10 pt-4">
                        <Link
                            to="/login"
                            className="public-luxury-cta public-luxury-cta--secondary min-h-11 w-full"
                        >
                            {t("nav.login")}
                        </Link>
                        <Link
                            to="/login"
                            className="public-luxury-cta public-luxury-cta--primary min-h-11 w-full"
                        >
                            {t("nav.booking")}
                        </Link>
                    </div>
                </div>
            </div>
        </>
    );
}
