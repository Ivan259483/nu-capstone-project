import { useEffect, useState, type ReactNode } from "react";
import { LayoutGroup, motion } from "motion/react";
import { Link, useLocation } from "react-router-dom";
import {
    IconBriefcase,
    IconCheck,
    IconChevronDown,
    IconHome,
    IconInfoCircle,
    IconLanguage,
    IconMail,
    IconMenu2,
    IconX,
} from "@tabler/icons-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
                        "flex min-h-9 items-center gap-1.5 rounded-full px-2.5 py-2",
                        "text-[#e0a020] text-xs font-semibold uppercase tracking-wide",
                        "transition-colors hover:bg-white/[0.06] hover:text-[#f4c96b]",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e0a020]/50 focus-visible:ring-offset-0",
                        className
                    )}
                >
                    <IconLanguage className="h-4 w-4 shrink-0" stroke={2} />
                    <span>{current.label}</span>
                    <IconChevronDown className="h-3.5 w-3.5 shrink-0 opacity-90" stroke={2.5} />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="z-[5010] flex min-w-[10.5rem] flex-col gap-1 border-white/10 bg-[#0c1018]/98 p-1.5 text-white shadow-[0_18px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl"
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
        <Link to="/" className="flex items-center transition-opacity hover:opacity-85">
            <img
                src="/images/autospf-logo.png"
                alt="AutoSPF+"
                className="h-9 w-auto object-contain sm:h-10"
            />
        </Link>
    );

    const actions = (
        <>
            <LanguageSwitcher />

            <Link
                to="/login"
                className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-[#e0a020] transition-colors hover:bg-white/[0.06] hover:text-[#f4c96b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e0a020]/45"
            >
                {t("nav.login")}
            </Link>

            <Button
                asChild
                size="sm"
                className="h-9 shrink-0 rounded-full bg-[#e0a020] px-4 text-sm font-semibold text-[#0a0c10] shadow-none transition-colors hover:bg-[#f0b832] focus-visible:ring-[#e0a020]/50 focus-visible:ring-offset-0"
            >
                <Link to="/login" className="whitespace-nowrap">
                    {t("nav.booking")}
                </Link>
            </Button>
        </>
    );

    const mobileActions = (
        <>
            <LanguageSwitcher className="min-h-10 px-3" />
            <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="flex min-h-10 min-w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white transition-colors hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e0a020]/60"
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
                forceVisible={menuOpen}
                renderNavItem={renderNavItem}
            />

            <div
                className={cn(
                    "fixed inset-0 z-[4990] lg:hidden transition-all duration-300",
                    menuOpen ? "pointer-events-auto" : "pointer-events-none"
                )}
            >
                <button
                    type="button"
                    aria-label="Close menu"
                    className={cn(
                        "absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300",
                        menuOpen ? "opacity-100" : "opacity-0"
                    )}
                    onClick={() => setMenuOpen(false)}
                />

                <div
                    className={cn(
                        "floating-nav-shell absolute right-3 top-[4.75rem] flex w-[min(20rem,calc(100vw-1.5rem))] flex-col rounded-2xl bg-[#070a12]/96 p-3 backdrop-blur-xl transition-all duration-300 sm:top-24",
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
                                            className="absolute inset-0 rounded-xl bg-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]"
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
                        <Button
                            asChild
                            variant="outline"
                            className="min-h-11 w-full rounded-full border-[#e0a020]/35 bg-transparent text-[#f4c96b] hover:bg-[#e0a020]/10 hover:text-white"
                        >
                            <Link to="/login">
                                {t("nav.login")}
                            </Link>
                        </Button>
                        <Button
                            asChild
                            className="min-h-11 w-full rounded-full bg-[#e0a020] font-semibold text-white hover:bg-[#c98d17]"
                        >
                            <Link to="/login">
                                {t("nav.booking")}
                            </Link>
                        </Button>
                    </div>
                </div>
            </div>
        </>
    );
}
