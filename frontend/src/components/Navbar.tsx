import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import {
    FloatingNav,
    type FloatingNavItem,
} from "@/components/ui/floating-navbar";

const LANGUAGES = [
    { code: "en" as const, label: "EN", nameKey: "language.english" as const },
    { code: "fil" as const, label: "FIL", nameKey: "language.filipino" as const },
];

function LanguageSwitcher({ className }: { className?: string }) {
    const { lang, setLang, t } = useLanguage();
    const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];
    const detailsRef = useRef<HTMLDetailsElement>(null);

    return (
        <details ref={detailsRef} className="group relative">
                <summary
                    aria-label={`${current.label} — ${t("language.select")}`}
                    className={cn(
                        "inline-flex h-9 min-w-[3.75rem] cursor-pointer list-none items-center justify-center gap-1 rounded-full border border-white/12 bg-white/[0.045] px-3 [&::-webkit-details-marker]:hidden",
                        "text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-white/82",
                        "shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors hover:border-[#e0a020]/40 hover:bg-white/[0.08] hover:text-[#f4c96b]",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e0a020]/50 focus-visible:ring-offset-0",
                        className
                    )}
                >
                    <span>{current.label}</span>
                    <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3 shrink-0 fill-none stroke-current opacity-75 transition-transform group-open:rotate-180"><path d="m3 4.5 3 3 3-3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </summary>
            <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-[5010] flex min-w-[10.5rem] flex-col gap-1 rounded-2xl border border-white/12 bg-[#070a12]/95 p-1.5 text-white shadow-[0_18px_42px_rgba(0,0,0,0.24)] backdrop-blur-xl">
                {LANGUAGES.map((language) => (
                    <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={lang === language.code}
                        key={language.code}
                        onClick={() => {
                            setLang(language.code);
                            detailsRef.current?.removeAttribute("open");
                        }}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border-0 px-3 py-2.5 text-left text-white hover:bg-white/[0.08] focus:bg-white/[0.08] focus:text-white"
                    >
                        <span className="w-7 font-semibold text-[#f4c96b]">{language.label}</span>
                        <span className="text-white/55">{t(language.nameKey)}</span>
                        {lang === language.code && (
                            <svg aria-hidden="true" viewBox="0 0 16 16" className="ml-auto h-4 w-4 fill-none stroke-[#e0a020]"><path d="m3 8.2 3.1 3.1L13 4.8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        )}
                    </button>
                ))}
            </div>
        </details>
    );
}

function NavIcon({ type, className = "h-4 w-4" }: { type: "home" | "briefcase" | "info" | "mail" | "menu" | "close"; className?: string }) {
    const paths = {
        home: <><path d="m3 9 9-7 9 7" /><path d="M5 8v12h14V8M9 20v-7h6v7" /></>,
        briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V4h8v3M3 12h18" /></>,
        info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
        mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
        menu: <path d="M4 7h16M4 12h16M4 17h16" />,
        close: <path d="m6 6 12 12M18 6 6 18" />,
    } as const;
    return <svg aria-hidden="true" viewBox="0 0 24 24" className={`${className} fill-none stroke-current`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
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
            icon: <NavIcon type="home" />,
            active: isActive("/"),
        },
        {
            name: t("nav.services"),
            link: "/services",
            icon: <NavIcon type="briefcase" />,
            active: isActive("/services"),
        },
        {
            name: t("nav.about"),
            link: "/about",
            icon: <NavIcon type="info" />,
            active: isActive("/about"),
        },
        {
            name: t("nav.contact"),
            link: "/contact",
            icon: <NavIcon type="mail" />,
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
                src="/images/optimized/autospf-logo-194.webp"
                srcSet="/images/optimized/autospf-logo-194.webp 194w, /images/optimized/autospf-logo-388.webp 388w"
                sizes="100px"
                alt="AutoSPF+"
                width={194}
                height={114}
                decoding="async"
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
                    "h-[2.125rem] min-w-[3.45rem] border-white/[0.09] bg-white/[0.035] px-2.5 text-[0.7rem] tracking-[0.075em] text-white/84 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] backdrop-blur-sm hover:border-[#e0a020]/28 hover:bg-white/[0.06] hover:text-[#f4c96b] focus-visible:ring-[#e0a020]/42",
                    isHomePage &&
                    "border-white/[0.1] bg-white/[0.028] text-white/86 shadow-none hover:border-[#e0a020]/26 hover:bg-white/[0.052] hover:text-[#f4c96b]"
                )}
            />

            <span aria-hidden className={cn("h-5 w-px", isHomePage ? "bg-white/14" : "bg-white/10")} />

            <Link
                to="/login"
                className={cn(
                    "inline-flex h-[2.125rem] items-center whitespace-nowrap rounded-full px-2 text-sm font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e0a020]/45",
                    isHomePage ? "text-white/76 drop-shadow-[0_1px_8px_rgba(0,0,0,0.34)] hover:text-[#f4c96b]" : "text-white/68 hover:text-[#f4c96b]"
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
                {menuOpen ? <NavIcon type="close" className="h-5 w-5" /> : <NavIcon type="menu" className="h-5 w-5" />}
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
                                        <span
                                            data-layout-id="public-nav-active-pill-mobile"
                                            className="absolute inset-0 rounded-xl border border-white/[0.08] bg-white/[0.085] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
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
