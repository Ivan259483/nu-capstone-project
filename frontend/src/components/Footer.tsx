import { Link } from "react-router-dom";
import { COMPANY_BRANDING } from "@/lib/company-branding";

function FooterIcon({ type, className = "h-4 w-4" }: { type: "facebook" | "instagram" | "map" | "phone"; className?: string }) {
    const paths = {
        phone: <path d="M6.6 2.8 9 7l-2 1.7a15 15 0 0 0 8.3 8.3l1.7-2 4.2 2.4-.8 3.5c-.2.7-.8 1.1-1.5 1.1C9.6 22 2 14.4 2 5.1c0-.7.4-1.3 1.1-1.5l3.5-.8Z" />,
        map: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
        facebook: <path d="M14 8h4V3h-4c-4 0-6 2.5-6 6v3H4v5h4v5h5v-5h4l1-5h-5V9c0-.7.3-1 1-1Z" />,
        instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".8" className="fill-current stroke-none" /></>,
    } as const;
    return <svg aria-hidden="true" viewBox="0 0 24 24" className={`${className} fill-none stroke-current`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
}

type FooterLink =
    | { label: string; to: string; href?: never; external?: never }
    | { label: string; href: string; to?: never; external?: boolean };

const footerColumns: Array<{ title: string; links: FooterLink[] }> = [
    {
        title: "Services",
        links: [
            { label: "Ceramic Coating", to: "/services" },
            { label: "Paint Protection Film", to: "/services" },
            { label: "Window Tinting", to: "/services" },
            { label: "Auto Detailing", to: "/services" },
            { label: "Paint Correction", to: "/services" },
        ],
    },
    {
        title: "Company",
        links: [
            { label: "Home", to: "/" },
            { label: "Services", to: "/services" },
            { label: "About", to: "/about" },
            { label: "Gallery", to: "/gallery" },
            { label: "Contact", to: "/contact" },
        ],
    },
    {
        title: "Customer",
        links: [
            { label: "Book a Service", to: "/booking" },
            { label: "Login", to: "/login" },
            { label: "Register", to: "/login" },
            { label: "My Bookings", to: "/customer/dashboard" },
            { label: "Payment History", to: "/customer/dashboard" },
        ],
    },
    {
        title: "Legal",
        links: [
            { label: "Terms of Service", href: "#terms-of-service" },
            { label: "Privacy Policy", href: "#privacy-policy" },
            { label: "Paint Protection Film Terms", href: "#paint-protection-film-terms" },
            { label: "Warranty Policy", href: "#warranty-policy" },
        ],
    },
];

const brandDescription =
    "Premium ceramic coating, paint protection film, window tinting, and auto detailing in Las Piñas.";

function FooterColumnLink({ link }: { link: FooterLink }) {
    const className =
        "inline-flex w-fit items-center text-sm leading-6 text-white/66 transition-colors duration-200 hover:text-[#f4b43f] focus:outline-none focus-visible:text-[#f4b43f]";

    if (link.to) {
        return (
            <Link to={link.to} className={className}>
                {link.label}
            </Link>
        );
    }

    return (
        <a
            href={link.href}
            className={className}
            target={link.external ? "_blank" : undefined}
            rel={link.external ? "noopener noreferrer" : undefined}
        >
            {link.label}
        </a>
    );
}

export default function Footer() {
    return (
        <footer className="relative isolate overflow-hidden bg-[#030406] text-white">
            <div
                className="pointer-events-none absolute inset-0 -z-10"
                aria-hidden
                style={{
                    background:
                        "radial-gradient(ellipse 62% 48% at 18% 4%, rgba(244,180,63,0.095) 0%, rgba(244,180,63,0.028) 34%, transparent 70%), radial-gradient(ellipse 50% 40% at 86% 10%, rgba(109,126,139,0.11) 0%, rgba(42,52,62,0.045) 38%, transparent 74%), linear-gradient(180deg, #06070a 0%, #030406 56%, #010203 100%)",
                }}
            />
            <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent"
                aria-hidden
            />
            <div
                className="pointer-events-none absolute left-1/2 top-0 h-px w-[min(34rem,82vw)] -translate-x-1/2 bg-gradient-to-r from-transparent via-[#f4b43f]/55 to-transparent shadow-[0_0_22px_rgba(244,180,63,0.2)]"
                aria-hidden
            />
            <div
                className="pointer-events-none absolute inset-x-0 -bottom-8 -z-10 select-none text-center font-serif text-[21vw] font-black leading-none tracking-[-0.08em] text-white/[0.046] sm:-bottom-14 sm:text-[18vw] lg:-bottom-20 lg:text-[13rem]"
                aria-hidden
            >
                AUTOSPF+
            </div>

            <div className="relative mx-auto max-w-7xl px-6 py-16 sm:py-20 lg:px-8">
                <div className="grid gap-12 lg:grid-cols-[1.45fr_repeat(4,minmax(0,1fr))] lg:gap-9">
                    <div className="max-w-sm">
                        <Link to="/" aria-label="AutoSPF+ home" className="inline-flex w-fit">
                            <img
                                src="/images/optimized/autospf-logo-194.webp"
                                srcSet="/images/optimized/autospf-logo-194.webp 194w, /images/optimized/autospf-logo-276.webp 276w"
                                sizes="138px"
                                alt="AutoSPF+"
                                width={194}
                                height={114}
                                loading="lazy"
                                decoding="async"
                                className="h-auto w-[138px] object-contain"
                            />
                        </Link>

                        <p className="mt-6 max-w-[21rem] text-[0.95rem] leading-7 text-white/68">
                            {brandDescription}
                        </p>

                        <div className="mt-7 space-y-3.5 text-sm leading-6 text-white/62">
                            <a
                                href={`tel:${COMPANY_BRANDING.phoneTel}`}
                                className="flex w-fit items-center gap-3 transition-colors duration-200 hover:text-[#f4b43f]"
                            >
                                <FooterIcon type="phone" className="h-4 w-4 shrink-0 text-[#f4b43f]/80" />
                                <span>{COMPANY_BRANDING.phone}</span>
                            </a>
                            <div className="flex items-start gap-3">
                                <FooterIcon type="map" className="mt-0.5 h-4 w-4 shrink-0 text-[#f4b43f]/80" />
                                <span>{COMPANY_BRANDING.address}</span>
                            </div>
                            <a
                                href={COMPANY_BRANDING.facebookUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex w-fit items-center gap-3 transition-colors duration-200 hover:text-[#f4b43f]"
                            >
                                <FooterIcon type="facebook" className="h-4 w-4 shrink-0 text-[#f4b43f]/80" />
                                <span>@AutoSPFmain</span>
                            </a>
                        </div>
                    </div>

                    {footerColumns.map((column) => (
                        <nav key={column.title} aria-label={column.title} className="text-center">
                            <h2 className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#f4b43f]/88">
                                {column.title}
                            </h2>
                            <ul className="mt-5 space-y-3">
                                {column.links.map((link) => (
                                    <li key={`${column.title}-${link.label}`} className="flex justify-center">
                                        <FooterColumnLink link={link} />
                                    </li>
                                ))}
                            </ul>
                        </nav>
                    ))}
                </div>

                <div className="relative mt-16 flex flex-col gap-5 pt-7 text-sm text-white/48 sm:flex-row sm:items-center sm:justify-between">
                    <div
                        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.1] to-transparent"
                        aria-hidden
                    />
                    <div
                        className="pointer-events-none absolute left-0 top-0 h-px w-56 bg-gradient-to-r from-[#f4b43f]/24 to-transparent"
                        aria-hidden
                    />
                    <div className="space-y-1">
                        <p>© 2026 AutoSPF+. All rights reserved.</p>
                        <p className="text-white/62">Premium Paint Protection &amp; Detailing</p>
                    </div>

                    <div className="flex items-center gap-3 sm:self-center">
                        <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/36">
                            Follow us
                        </span>
                        <a
                            href={COMPANY_BRANDING.facebookUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="AutoSPF+ on Facebook"
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] text-white/62 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#f4b43f]/45 hover:bg-[#f4b43f]/10 hover:text-[#f4b43f] hover:shadow-[0_0_22px_rgba(244,180,63,0.13)]"
                        >
                            <FooterIcon type="facebook" />
                        </a>
                        <a
                            href="https://www.instagram.com/auto.spf/"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="AutoSPF+ on Instagram"
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] text-white/62 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#f4b43f]/45 hover:bg-[#f4b43f]/10 hover:text-[#f4b43f] hover:shadow-[0_0_22px_rgba(244,180,63,0.13)]"
                        >
                            <FooterIcon type="instagram" />
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
