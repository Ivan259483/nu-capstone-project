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
import { ArrowRight, ChevronRight } from "lucide-react";
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
    onOpenBooking: (opts?: { presetPackageId?: string }) => void;
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

    return (
        <div className="space-y-8">
            <section
                className={cn(
                    "overflow-hidden rounded-2xl border-0 bg-white",
                    "shadow-[0_4px_16px_rgba(15,23,42,0.06),0_16px_40px_-16px_rgba(15,23,42,0.1)]"
                )}
            >
                <header className="border-0 px-5 py-6 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.08)] sm:px-8 sm:py-7">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="min-w-0 max-w-2xl">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
                                Service catalog
                            </p>
                            <div className="mt-2 h-0.5 w-10 rounded-full bg-blue-600" aria-hidden />
                            <h2 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                                Ceramic &amp; protection lineup
                            </h2>
                            <p className="mt-2 text-sm leading-relaxed text-slate-600">
                                Indicative pricing by vehicle class. Final totals are confirmed after you submit a booking and our
                                team reviews your vehicle.
                            </p>
                        </div>
                        <div className="flex w-full flex-col gap-1.5 sm:max-w-xs lg:w-56 lg:shrink-0">
                            <label htmlFor="customer-price-tier" className="text-xs font-medium text-slate-600">
                                Vehicle class
                            </label>
                            <select
                                id="customer-price-tier"
                                value={priceTier}
                                onChange={(e) => setPriceTier(e.target.value as VehiclePriceKey)}
                                className={cn(
                                    "w-full cursor-pointer rounded-xl border-0 bg-white px-3 py-2.5",
                                    "text-sm font-medium text-slate-900 shadow-[0_2px_8px_rgba(15,23,42,0.06)] outline-none transition-all",
                                    "hover:shadow-[0_4px_14px_-4px_rgba(37,99,235,0.12)] focus:ring-2 focus:ring-blue-500/25"
                                )}
                            >
                                {CUSTOMER_BOOKING_PRICE_TIERS.map((t) => (
                                    <option key={t.key} value={t.key}>
                                        {t.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </header>

                <div className="flex flex-col gap-3 px-5 pb-5 pt-1 sm:px-8 sm:pb-6">
                    {packages.map((pkg) => {
                        const price = pkg.prices[priceTier] ?? null;
                        const isUnavailable = price === null;
                        const isFlagship = pkg.id === "spf101";
                        return (
                            <div
                                key={pkg.id}
                                className={cn(
                                    "rounded-2xl px-5 py-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)] sm:px-8 sm:py-7",
                                    isFlagship && "bg-blue-50/45 shadow-[0_4px_18px_-6px_rgba(37,99,235,0.12)]"
                                )}
                            >
                                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8 lg:items-start">
                                    <div className="lg:col-span-5">
                                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                            {isFlagship && (
                                                <span className="rounded-md border-0 bg-blue-100/90 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-blue-800 shadow-sm shadow-blue-600/10">
                                                    Flagship
                                                </span>
                                            )}
                                            <h3 className="text-base font-semibold leading-snug tracking-tight text-slate-900 sm:text-[17px]">
                                                {pkg.name}
                                            </h3>
                                        </div>
                                        <p className="mt-1.5 text-sm font-normal leading-relaxed text-slate-500">{pkg.duration}</p>
                                        <p className="mt-3 text-sm leading-relaxed text-slate-600">{pkg.description}</p>
                                    </div>

                                    <ul className="space-y-2 lg:col-span-4">
                                        {pkg.features.map((f) => (
                                            <li key={f} className="flex gap-3 text-sm leading-snug text-slate-600">
                                                <span
                                                    className="mt-2 h-1 w-1 shrink-0 rounded-full bg-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.15)]"
                                                    aria-hidden
                                                />
                                                <span>{f}</span>
                                            </li>
                                        ))}
                                    </ul>

                                    <div className="flex flex-col gap-3 border-0 pt-4 lg:col-span-3 lg:pl-8 lg:pt-0 lg:shadow-[inset_12px_0_24px_-20px_rgba(15,23,42,0.05)]">
                                        <div>
                                            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                                From
                                            </p>
                                            <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
                                                {isUnavailable ? "N/A" : `₱${price.toLocaleString()}`}
                                            </p>
                                            <p className="mt-1 text-[11px] leading-snug text-slate-500">Selected vehicle class</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => onOpenBooking({ presetPackageId: pkg.id })}
                                            disabled={isUnavailable}
                                            className={cn(
                                                "inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5",
                                                "text-sm font-semibold text-white transition-colors",
                                                isUnavailable ? "cursor-not-allowed bg-slate-300 text-slate-500" : "bg-blue-600 hover:bg-blue-700",
                                                !isUnavailable && "shadow-md shadow-blue-600/25",
                                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35 focus-visible:ring-offset-2"
                                            )}
                                        >
                                            {isUnavailable ? "Unavailable" : "Book"}
                                            <ChevronRight className="h-4 w-4 opacity-90" strokeWidth={2} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <footer className="flex flex-col gap-3 border-0 bg-blue-50/50 px-5 py-4 shadow-[inset_0_8px_20px_-16px_rgba(37,99,235,0.08)] sm:flex-row sm:items-center sm:justify-between sm:px-8">
                    <p className="text-xs leading-relaxed text-slate-600">
                        Rates shown are list prices for the selected class. Promotions, if any, apply at checkout.
                    </p>
                    <button
                        type="button"
                        onClick={() => onOpenBooking()}
                        className={cn(
                            "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border-0 bg-white",
                            "px-4 py-2 text-sm font-semibold text-blue-700 shadow-md shadow-blue-600/15 transition-all",
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
                    "rounded-2xl border-0 bg-white px-5 py-6 sm:px-8 sm:py-7",
                    "shadow-[0_4px_16px_rgba(15,23,42,0.06),0_12px_36px_-14px_rgba(15,23,42,0.09)]"
                )}
            >
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">Detailing menu</p>
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
                            "inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl border-0",
                            "bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 shadow-md shadow-blue-600/15 transition-all",
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
                                "flex flex-col rounded-xl border-0 bg-white p-4",
                                "shadow-[0_2px_10px_rgba(15,23,42,0.05)] transition-all hover:shadow-[0_6px_20px_-6px_rgba(37,99,235,0.12)]"
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
                            <p className="mt-3 text-sm font-semibold tabular-nums text-blue-700">{s.price}</p>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
