/**
 * Customer dashboard — service catalog blocks
 *
 * Palette: white surfaces + neutral slate text + blue accents (aligned with booking / sales UI).
 *
 * Type scale (this module):
 *   11px — overlines, meta, price captions (uppercase where noted)
 *   12px — compact chips / card duration
 *   14px (text-sm) — body copy, feature bullets, buttons, select
 *   16px (text-base) — package titles
 *   20–24px (text-xl / text-2xl) — section headings, price numerals
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    HOMEPAGE_SERVICE_MENU,
    CUSTOMER_BOOKING_PRICE_TIERS,
    type BookingPackage,
    type VehiclePriceKey,
} from "@/lib/customer-booking-catalog";

export type CustomerDashboardServicesShowcaseProps = {
    vehicles: any[];
    packages: BookingPackage[];
    getVehiclePriceKey: (type: string) => string;
    onOpenBooking: (opts?: { presetPackageId?: string; priceTier?: VehiclePriceKey }) => void;
};

export function CustomerDashboardServicesShowcase({
    vehicles,
    packages,
    getVehiclePriceKey,
    onOpenBooking,
}: CustomerDashboardServicesShowcaseProps) {
    const defaultTier = useMemo((): VehiclePriceKey => {
        const v = vehicles[0];
        if (!v?.type) return "hatchback";
        const k = getVehiclePriceKey(String(v.type)) as VehiclePriceKey;
        return CUSTOMER_BOOKING_PRICE_TIERS.some((t) => t.key === k) ? k : "hatchback";
    }, [vehicles, getVehiclePriceKey]);

    const [priceTier, setPriceTier] = useState<VehiclePriceKey>(defaultTier);

    useEffect(() => {
        setPriceTier(defaultTier);
    }, [defaultTier]);

    const highlightedPackageId = useMemo(() => {
        return packages.reduce<{ id: string | null; price: number }>(
            (winner, pkg) => {
                const price = pkg.prices[priceTier] ?? null;
                if (typeof price !== "number") return winner;
                return price > winner.price ? { id: pkg.id, price } : winner;
            },
            { id: null, price: -1 }
        ).id;
    }, [packages, priceTier]);

    const getPackageDisplay = (name: string) => {
        const [codeRaw, labelRaw] = name.split("—").map((part) => part.trim());
        return {
            code: codeRaw || name,
            label: labelRaw || "Protection",
        };
    };

    return (
        <div className="space-y-8">
            <section
                className={cn(
                    "rounded-xl border border-slate-200/80 bg-white px-5 py-6 sm:px-8 sm:py-8",
                    "shadow-[0_4px_16px_rgba(15,23,42,0.06),0_16px_40px_-16px_rgba(15,23,42,0.1)]"
                )}
            >
                <header className="flex flex-col gap-6 border-b border-slate-100 pb-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0 max-w-2xl">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                            Service catalog
                        </p>
                        <div className="mt-2 h-0.5 w-10 rounded-full bg-blue-600" aria-hidden />
                        <h2 className="mt-4 text-[28px] font-bold tracking-tight text-slate-950">
                            Ceramic &amp; Protection Lineup
                        </h2>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-[15px]">
                            Indicative pricing by vehicle class. Final totals are confirmed after your booking is reviewed.
                        </p>
                    </div>
                    <div className="flex w-full flex-col gap-1.5 sm:max-w-xs lg:w-64 lg:shrink-0">
                        <label htmlFor="customer-price-tier" className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                            Vehicle class
                        </label>
                        <select
                            id="customer-price-tier"
                            value={priceTier}
                            onChange={(e) => setPriceTier(e.target.value as VehiclePriceKey)}
                            className={cn(
                                "w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-3",
                                "text-sm font-semibold text-slate-900 shadow-[0_2px_8px_rgba(15,23,42,0.06)] outline-none transition-all",
                                "hover:border-blue-200 hover:shadow-[0_4px_14px_-4px_rgba(37,99,235,0.12)] focus:border-blue-300 focus:ring-2 focus:ring-blue-500/25"
                            )}
                        >
                            {CUSTOMER_BOOKING_PRICE_TIERS.map((t) => (
                                <option key={t.key} value={t.key}>
                                    {t.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </header>

	                <div className="grid w-full grid-cols-1 gap-5 pt-6 lg:grid-cols-3">
	                    {packages.map((pkg) => {
	                        const price = pkg.prices[priceTier] ?? null;
	                        const isUnavailable = price === null;
	                        const isPopular = pkg.id === "spf89";
	                        const isPremiumHighlight = !isUnavailable && pkg.id === highlightedPackageId;
	                        const display = getPackageDisplay(pkg.name);
	                        const packageIntro = (
	                            <div className={cn(isPremiumHighlight ? "pr-0 lg:max-w-xl" : "pr-24")}>
	                                <span
	                                    className={cn(
	                                        "inline-flex rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em]",
	                                        isPopular || isPremiumHighlight ? "bg-blue-50 text-blue-600 ring-1 ring-blue-100" : "bg-slate-100 text-slate-600",
	                                        isPremiumHighlight && "customer-services-premium-chip"
	                                    )}
	                                >
	                                    {isPremiumHighlight ? "Highest protection tier" : display.label}
	                                </span>
	                                <h3 className={cn(
	                                    "mt-5 font-black tracking-tight text-slate-950",
	                                    isPremiumHighlight ? "text-4xl sm:text-5xl" : "text-4xl"
	                                )}>
	                                    {display.code}
	                                </h3>
	                                <p className={cn(
	                                    "mt-2 text-sm font-medium leading-relaxed text-slate-500",
	                                    isPremiumHighlight ? "max-w-xl" : "min-h-[44px]"
	                                )}>{pkg.duration}</p>
	                            </div>
	                        );
	                        const priceBlock = (
	                            <div className="mt-6">
		                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Indicative price</p>
		                            <p className={cn(
		                                "mt-1 font-bold tracking-tight text-blue-600",
		                                isPremiumHighlight ? "customer-services-premium-price text-4xl sm:text-[42px]" : "text-3xl"
		                            )}>
		                                {isUnavailable ? "N/A" : `FROM ₱${price.toLocaleString()}`}
	                                </p>
	                                <p className="mt-1 text-xs font-medium text-slate-500">Selected vehicle class</p>
	                            </div>
	                        );
	                        const featuresList = (
	                            <ul className={cn(
	                                "flex-1",
	                                isPremiumHighlight ? "grid gap-3 sm:grid-cols-2 lg:gap-x-5" : "space-y-3"
	                            )}>
	                                {pkg.features.map((feature) => (
	                                    <li key={feature} className="flex gap-3 text-sm leading-relaxed text-slate-700">
	                                        <span className={cn(
	                                            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 ring-1 ring-blue-100",
	                                            isPremiumHighlight && "customer-services-premium-check"
	                                        )}>
	                                            <Check className="h-3.5 w-3.5" strokeWidth={3} />
	                                        </span>
	                                        <span>{feature}</span>
	                                    </li>
	                                ))}
	                            </ul>
	                        );
	                        const bookingButton = (
	                            <button
	                                type="button"
	                                onClick={() => onOpenBooking({ presetPackageId: pkg.id, priceTier })}
	                                disabled={isUnavailable}
	                                className={cn(
	                                    "inline-flex w-full items-center justify-center rounded-lg px-4 py-3",
	                                    "text-sm font-black transition-all",
	                                    isPremiumHighlight ? "customer-services-premium-cta mt-6 lg:mt-8" : "mt-8",
	                                    isUnavailable
	                                        ? "cursor-not-allowed bg-slate-200 text-slate-500"
	                                        : "bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:-translate-y-0.5 hover:bg-blue-700",
	                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35 focus-visible:ring-offset-2"
	                                )}
	                            >
	                                {isUnavailable ? "Unavailable" : "Book This Package"}
	                            </button>
	                        );
	                        return (
	                            <article
	                                key={pkg.id}
	                                className={cn(
		                                    "customer-services-package-card relative overflow-hidden rounded-xl border bg-white transition-all",
		                                    "shadow-[0_10px_30px_-24px_rgba(15,23,42,0.35)] hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-[0_20px_42px_-28px_rgba(15,23,42,0.38)]",
	                                    isPremiumHighlight
	                                        ? "flex min-h-[520px] flex-col p-6 lg:col-span-3 lg:grid lg:min-h-[360px] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-8 lg:p-8"
	                                        : "flex min-h-[520px] flex-col p-6",
	                                    isPopular
	                                        ? "border-blue-500 shadow-[0_22px_60px_-30px_rgba(37,99,235,0.45)] ring-2 ring-blue-100/90"
	                                        : "border-slate-200/90",
	                                    isPremiumHighlight && "customer-services-premium-card border-blue-500 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_42%,#eff6ff_100%)] ring-2 ring-blue-100"
                                )}
                            >
                                {isPopular && !isPremiumHighlight && (
                                    <span className="absolute right-5 top-5 rounded-full bg-blue-600 px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-white shadow-lg shadow-blue-600/20">
	                                        Most Popular
	                                    </span>
	                                )}

	                                {isPremiumHighlight ? (
	                                    <>
	                                        <div className="flex flex-col justify-between">
	                                            <div>
                                                    <div className="customer-services-premium-badge" aria-label="Highest priced service">
                                                        <Sparkles className="h-3.5 w-3.5" strokeWidth={2.4} />
                                                        Flagship Pick
                                                    </div>
	                                                {packageIntro}
	                                                {priceBlock}
	                                            </div>
	                                            <p className="customer-services-premium-note mt-6 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm font-semibold leading-relaxed text-blue-700">
	                                                The highest-value package in this class, built for owners who want the most complete protection in one booking.
	                                            </p>
	                                        </div>
	                                        <div className="mt-6 flex flex-col border-t border-slate-200/80 pt-6 lg:mt-0 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
	                                            {featuresList}
	                                            {bookingButton}
	                                        </div>
	                                    </>
	                                ) : (
	                                    <>
	                                        {packageIntro}
	                                        {priceBlock}
	                                        <div className="my-6 h-px w-full bg-slate-200/80" />
	                                        {featuresList}
	                                        {bookingButton}
	                                    </>
	                                )}
	                            </article>
	                        );
	                    })}
	                </div>

                <footer className="flex flex-col gap-3 border-0 bg-blue-50/50 px-5 py-4 shadow-[inset_0_8px_20px_-16px_rgba(37,99,235,0.08)] sm:flex-row sm:items-center sm:justify-between sm:px-8">
                    <p className="text-xs leading-relaxed text-slate-600">
                        Rates shown are list prices for the selected class. Promotions, if any, apply at checkout.
                    </p>
                    <button
                        type="button"
                        onClick={() => onOpenBooking({ priceTier })}
                        className={cn(
	                            "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white",
                            "px-4 py-2 text-sm font-semibold text-blue-600 shadow-md shadow-blue-600/15 transition-all",
                            "hover:bg-blue-50/90 hover:shadow-lg"
                        )}
                    >
                        New booking
                        <ArrowRight className="h-4 w-4" strokeWidth={2} />
                    </button>
                </footer>
            </section>

            <section
                className={cn(
                    "rounded-xl border border-slate-200 bg-white px-5 py-6 sm:px-8 sm:py-7",
                    "shadow-[0_4px_16px_rgba(15,23,42,0.06),0_12px_36px_-14px_rgba(15,23,42,0.09)]"
                )}
            >
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
	                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Detailing menu</p>
                        <div className="mt-2 h-0.5 w-10 rounded-full bg-blue-600" aria-hidden />
                        <h2 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                            Signature services
                        </h2>
                        <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
                            Quick reference for popular treatments. See the public services page for the full story and visuals.
                        </p>
                    </div>
                    <Link
                        to="/services"
                        className={cn(
	                            "inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-slate-200",
                            "bg-white px-4 py-2.5 text-sm font-semibold text-blue-600 shadow-md shadow-blue-600/15 transition-all",
                            "hover:bg-blue-50/90 hover:shadow-lg sm:self-auto"
                        )}
                    >
                        View all services
                        <ArrowRight className="h-4 w-4" strokeWidth={2} />
                    </Link>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {HOMEPAGE_SERVICE_MENU.map((s) => (
                        <div
                            key={s.name}
                            className={cn(
	                                "flex flex-col rounded-xl border border-slate-200 bg-white p-4",
	                                "shadow-[0_2px_10px_rgba(15,23,42,0.05)] transition-all hover:bg-slate-50 hover:shadow-[0_6px_20px_-6px_rgba(37,99,235,0.12)]"
                            )}
                        >
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <span
                                    className="h-1.5 w-1.5 shrink-0 rounded-full ring-2 ring-blue-100"
                                    style={{ background: s.accent }}
                                />
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                    {s.duration}
                                </span>
                            </div>
                            <h3 className="text-sm font-semibold text-slate-900">{s.name}</h3>
                            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-600">{s.desc}</p>
                            <p className="mt-3 text-sm font-semibold tabular-nums text-blue-600">{s.price}</p>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
