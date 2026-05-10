import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { ArrowRight, Check, Crown, Loader2, Pencil, Save, Shield, Sparkles, Star, Zap } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { DetailService } from '@/lib/detail-service-api';
import {
    CATALOG_ICON_KEYS,
    type SPFPackage,
    type VehicleType,
} from '@/components/services/services-catalog-data';
import {
    VEHICLE_PRICE_FIELDS,
    getServiceId,
    type ApiVehiclePriceKey,
    type PublishedServicePricingSource,
    type ServiceCatalogCard,
} from '@/lib/service-pricing';
import { toast } from 'sonner';

const EASE = [0.16, 1, 0.3, 1] as const;

const priceFlip: Variants = {
    exit: { opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.1 } },
    enter: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: EASE } },
};

function vehicleTypeToApiKey(vt: VehicleType): ApiVehiclePriceKey {
    const row = VEHICLE_PRICE_FIELDS.find((f) => f.publicKey === vt);
    return row?.apiKey ?? 'sedan';
}

function iconKeyFromPackage(pkg: SPFPackage): ServiceCatalogCard['iconKey'] {
    const Icon = pkg.icon;
    const keys = Object.keys(CATALOG_ICON_KEYS) as (keyof typeof CATALOG_ICON_KEYS)[];
    for (const k of keys) {
        if (CATALOG_ICON_KEYS[k] === Icon) return k as ServiceCatalogCard['iconKey'];
    }
    return 'sparkles';
}

const parseMoneyInput = (value: string, label: string, required = false) => {
    const clean = value.replace(/[₱,\s]/g, '').trim();
    if (!clean) {
        if (required) throw new Error(`${label} is required`);
        return null;
    }
    const numeric = Number(clean);
    if (!Number.isFinite(numeric) || numeric < 0) {
        throw new Error(`${label} must be a valid positive amount`);
    }
    return Math.round(numeric * 100) / 100;
};

function safeMoney(v: string): number | null {
    try {
        return parseMoneyInput(v, 'x', false);
    } catch {
        return null;
    }
}

const inputDark =
    'w-full min-w-0 rounded-lg bg-white/[0.07] border border-white/[0.14] px-2.5 py-1.5 text-white placeholder:text-white/35 focus:border-amber-400/55 focus:outline-none focus:ring-1 focus:ring-amber-400/25';

interface Props {
    pkg: SPFPackage;
    index: number;
    vehicleType: VehicleType;
    service: PublishedServicePricingSource | undefined;
    adminHighlight?: boolean;
    onSaved: () => void | Promise<void>;
}

export function AdminEditableLuxuryCard({
    pkg,
    index,
    vehicleType,
    service,
    adminHighlight = false,
    onSaved,
}: Props) {
    const { t } = useLanguage();
    const serviceId = service ? getServiceId(service) : '';
    const [hovered, setHovered] = useState(false);
    const [saving, setSaving] = useState(false);

    const [badge, setBadge] = useState(pkg.badge);
    const [warrantyLabel, setWarrantyLabel] = useState(pkg.years);
    const [tagline, setTagline] = useState(pkg.tagline);
    const [tierLabel, setTierLabel] = useState(pkg.tier);
    const [addonLabel, setAddonLabel] = useState(pkg.addonLabel ?? '');
    const [discountBadge, setDiscountBadge] = useState(pkg.discountBadge ?? '');
    const [accentFrom, setAccentFrom] = useState(pkg.accentFrom);
    const [accentMid, setAccentMid] = useState(pkg.accentMid);
    const [accentTo, setAccentTo] = useState(pkg.accentTo);
    const [featuresText, setFeaturesText] = useState(() => pkg.features.join('\n'));
    const [highlightedText, setHighlightedText] = useState(() => pkg.highlighted.join(', '));
    const [popular, setPopular] = useState(pkg.popular);
    const [flagship, setFlagship] = useState(pkg.flagship);
    const [originalPriceMultiplier, setOriginalPriceMultiplier] = useState(
        String(pkg.originalPriceMultiplier ?? ''),
    );
    const [iconKey, setIconKey] = useState<ServiceCatalogCard['iconKey']>(() => iconKeyFromPackage(pkg));

    const [baseStr, setBaseStr] = useState('');
    const [originalStr, setOriginalStr] = useState('');
    const [addonStr, setAddonStr] = useState('');

    /** Collapsed = visitor-style card; expanded = full inline form */
    const [editing, setEditing] = useState(false);

    const liveAccent = useMemo(
        () => ({ from: accentFrom || pkg.accentFrom, mid: accentMid || pkg.accentMid, to: accentTo || pkg.accentTo }),
        [accentFrom, accentMid, accentTo, pkg.accentFrom, pkg.accentMid, pkg.accentTo],
    );

    const DisplayIcon = CATALOG_ICON_KEYS[iconKey ?? 'sparkles'] ?? Sparkles;

    useEffect(() => {
        setBadge(pkg.badge);
        setWarrantyLabel(pkg.years);
        setTagline(pkg.tagline);
        setTierLabel(pkg.tier);
        setAddonLabel(pkg.addonLabel ?? '');
        setDiscountBadge(pkg.discountBadge ?? '');
        setAccentFrom(pkg.accentFrom);
        setAccentMid(pkg.accentMid);
        setAccentTo(pkg.accentTo);
        setFeaturesText(pkg.features.join('\n'));
        setHighlightedText(pkg.highlighted.join(', '));
        setPopular(pkg.popular);
        setFlagship(pkg.flagship);
        setOriginalPriceMultiplier(
            pkg.originalPriceMultiplier != null && Number.isFinite(pkg.originalPriceMultiplier)
                ? String(pkg.originalPriceMultiplier)
                : '',
        );
        setIconKey(iconKeyFromPackage(pkg));

        const price = pkg.prices[vehicleType];
        const orig = pkg.originalPrices?.[vehicleType];
        const tint = pkg.tintPrices[vehicleType];
        setBaseStr(price != null ? String(price) : '');
        setOriginalStr(orig != null ? String(orig) : '');
        setAddonStr(tint != null ? String(tint) : '');
    }, [pkg, vehicleType]);

    useEffect(() => {
        if (!editing) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setEditing(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [editing]);

    const priceNum = safeMoney(baseStr);
    const origParsed = safeMoney(originalStr);
    const computedOriginal =
        origParsed != null
            ? origParsed
            : priceNum != null
                ? priceNum * (Number(originalPriceMultiplier) || pkg.originalPriceMultiplier || 2)
                : null;

    const discountLabel =
        discountBadge.trim()
        || (computedOriginal != null && priceNum != null && computedOriginal > priceNum
            ? `${Math.round((1 - priceNum / computedOriginal) * 100)}% OFF`
            : '50% OFF');

    const previewFeatures = useMemo(
        () => featuresText.split('\n').map((s) => s.trim()).filter(Boolean),
        [featuresText],
    );
    const previewHighlights = useMemo(
        () => highlightedText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
        [highlightedText],
    );

    const addonLinePreview = addonLabel.trim() || '+ Nano Ceramic Window Tint';

    const openEditor = () => setEditing(true);

    const clickToEditSurface =
        'cursor-pointer rounded-xl outline-none transition hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-amber-400/45';

    const tintPriceNum = safeMoney(addonStr);

    const buildCatalogPayload = useCallback((): ServiceCatalogCard | null => {
        const out: ServiceCatalogCard = {};
        if (badge.trim()) out.badge = badge.trim();
        if (warrantyLabel.trim()) out.warrantyLabel = warrantyLabel.trim();
        if (tagline.trim()) out.tagline = tagline.trim();
        if (tierLabel.trim()) out.tierLabel = tierLabel.trim();
        if (addonLabel.trim()) out.addonLabel = addonLabel.trim();
        if (discountBadge.trim()) out.discountBadge = discountBadge.trim();
        if (accentFrom.trim()) out.accentFrom = accentFrom.trim();
        if (accentTo.trim()) out.accentTo = accentTo.trim();
        if (accentMid.trim()) out.accentMid = accentMid.trim();
        if (iconKey && ['sparkles', 'shield', 'star', 'crown', 'zap'].includes(iconKey)) {
            out.iconKey = iconKey;
        }
        const lines = featuresText.split('\n').map((s) => s.trim()).filter(Boolean);
        if (lines.length) out.features = lines;
        const highlights = highlightedText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
        if (highlights.length) out.highlighted = highlights;
        const mult = originalPriceMultiplier.trim();
        if (mult !== '' && Number.isFinite(Number(mult))) out.originalPriceMultiplier = Number(mult);

        const hasContent =
            !!out.badge
            || !!out.warrantyLabel
            || !!out.tagline
            || !!out.tierLabel
            || !!out.addonLabel
            || !!out.discountBadge
            || !!out.accentFrom
            || !!out.accentTo
            || !!out.accentMid
            || !!out.iconKey
            || !!out.features?.length
            || !!out.highlighted?.length
            || out.originalPriceMultiplier != null;

        if (!hasContent && !popular && !flagship) return null;

        out.popular = popular;
        out.flagship = flagship;
        return out;
    }, [
        badge,
        warrantyLabel,
        tagline,
        tierLabel,
        addonLabel,
        discountBadge,
        accentFrom,
        accentMid,
        accentTo,
        iconKey,
        featuresText,
        highlightedText,
        originalPriceMultiplier,
        popular,
        flagship,
    ]);

    const handleSave = async () => {
        if (!serviceId) {
            toast.error('No linked service in database for this package.');
            return;
        }
        setSaving(true);
        try {
            const apiKey = vehicleTypeToApiKey(vehicleType);
            await DetailService.updateServicePricing(serviceId, {
                vehicleType: apiKey,
                basePrice: parseMoneyInput(baseStr, 'Base price', true),
                originalPrice: parseMoneyInput(originalStr, 'Original price', false),
                addonPrice: parseMoneyInput(addonStr, 'Add-on price', false),
            });
            const catalogCard = buildCatalogPayload();
            await DetailService.updateService(serviceId, { catalogCard });
            toast.success(`${pkg.label} saved for ${VEHICLE_PRICE_FIELDS.find((f) => f.apiKey === apiKey)?.label || vehicleType}.`);
            await onSaved();
            setEditing(false);
        } catch (e: unknown) {
            const err = e as { message?: string; response?: { data?: { message?: string } } };
            toast.error(err?.response?.data?.message || err?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const isFlagship = flagship;
    const isPopular = popular;
    const isHighlighted = isPopular || isFlagship;
    const BadgeLeadIcon = isFlagship ? Crown : isPopular ? Star : Zap;

    return (
        <motion.div
            custom={index}
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: '-30px' }}
            transition={{ duration: 0.6, ease: EASE, delay: index * 0.08 }}
            onHoverStart={() => setHovered(true)}
            onHoverEnd={() => setHovered(false)}
            className={cn(
                'group relative flex flex-col rounded-[24px] overflow-hidden w-full transition-all duration-300 ease-in-out',
                isHighlighted && 'lg:scale-[1.03] z-10',
                adminHighlight && 'ring-2 ring-amber-400/90 ring-offset-2 ring-offset-white z-20 rounded-[24px]',
            )}
            style={{
                willChange: 'transform',
                filter: hovered ? `drop-shadow(0 24px 48px ${liveAccent.from}28)` : 'drop-shadow(0 18px 36px rgba(15,23,42,0.12))',
                transition: 'filter 0.4s ease',
            }}
        >
            <div
                className="absolute -inset-[2px] rounded-[26px] z-0 pointer-events-none"
                style={{
                    opacity: hovered ? 0.55 : 0,
                    background: `linear-gradient(135deg, ${liveAccent.from}55 0%, transparent 42%, ${liveAccent.to}35 78%, transparent 100%)`,
                    transition: 'opacity 0.45s ease',
                }}
            />

            <div
                className="relative z-10 flex h-full flex-col overflow-hidden rounded-[24px]"
                style={{
                    background: `linear-gradient(170deg, 
                        ${hovered ? `${liveAccent.from}14` : `${liveAccent.from}08`} 0%, 
                        rgba(12,17,29,0.97) 35%, 
                        rgba(8,12,24,0.99) 100%)`,
                    boxShadow: hovered
                        ? `0 32px 64px -20px ${liveAccent.from}35, 0 18px 40px -22px rgba(15,23,42,0.45)`
                        : isHighlighted
                          ? `0 28px 56px -18px rgba(15,23,42,0.34), 0 14px 36px -16px rgba(15,23,42,0.2), 0 6px 16px -8px ${liveAccent.from}18`
                          : `0 26px 52px -16px rgba(15,23,42,0.28), 0 12px 32px -14px rgba(15,23,42,0.16), 0 4px 12px -6px rgba(15,23,42,0.1)`,
                    transition: 'box-shadow 0.5s ease, background 0.5s ease',
                }}
            >
                <div className="h-[3px] w-full relative overflow-hidden">
                    <div
                        className="absolute inset-0"
                        style={{
                            background: `linear-gradient(90deg, ${liveAccent.from}, ${liveAccent.mid}, ${liveAccent.to})`,
                        }}
                    />
                </div>

                <div className="absolute top-3 right-3 z-30 flex gap-2">
                    <button
                        type="button"
                        onClick={() => setEditing((v) => !v)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-black/45 px-2.5 py-1.5 text-[11px] font-bold text-white/95 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.55)] backdrop-blur-md hover:bg-white/10"
                    >
                        {editing ? (
                            'Preview'
                        ) : (
                            <>
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                            </>
                        )}
                    </button>
                </div>

                {editing ? (
                    <>
                <div className="px-4 pt-10 pb-0 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between gap-y-2">
                    <div className="flex-1 min-w-0 space-y-1">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-white/35">Badge</label>
                        <input className={cn(inputDark, 'text-[9px] font-black uppercase tracking-[0.2em]')} value={badge} onChange={(e) => setBadge(e.target.value)} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1 sm:text-right">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-white/35">Warranty</label>
                        <input className={cn(inputDark, 'text-[9px] font-bold uppercase tracking-wide')} value={warrantyLabel} onChange={(e) => setWarrantyLabel(e.target.value)} />
                    </div>
                </div>

                <div className="px-4 pt-5 pb-3 flex flex-col items-center text-center">
                    <div className="grid w-full grid-cols-3 gap-1.5 mb-3">
                        <div>
                            <label className="text-[8px] uppercase text-white/30 block mb-0.5">Accent A</label>
                            <input className={cn(inputDark, 'font-mono text-[10px]')} value={accentFrom} onChange={(e) => setAccentFrom(e.target.value)} placeholder="#hex" />
                        </div>
                        <div>
                            <label className="text-[8px] uppercase text-white/30 block mb-0.5">Accent B</label>
                            <input className={cn(inputDark, 'font-mono text-[10px]')} value={accentMid} onChange={(e) => setAccentMid(e.target.value)} placeholder="#hex" />
                        </div>
                        <div>
                            <label className="text-[8px] uppercase text-white/30 block mb-0.5">Accent C</label>
                            <input className={cn(inputDark, 'font-mono text-[10px]')} value={accentTo} onChange={(e) => setAccentTo(e.target.value)} placeholder="#hex" />
                        </div>
                    </div>

                    <div className="relative w-14 h-14 rounded-2xl flex items-center justify-center mb-3 mx-auto">
                        <div
                            className="absolute inset-0 rounded-2xl"
                            style={{
                                background: `linear-gradient(145deg, ${liveAccent.from}, ${liveAccent.to})`,
                                boxShadow: `0 6px 25px ${liveAccent.from}30`,
                            }}
                        />
                        <DisplayIcon className="w-7 h-7 text-white relative z-10" />
                    </div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-white/35 mb-1">Card icon</label>
                    <select
                        className={cn(inputDark, 'text-xs mb-2 cursor-pointer')}
                        value={iconKey ?? 'sparkles'}
                        onChange={(e) => setIconKey(e.target.value as ServiceCatalogCard['iconKey'])}
                    >
                        <option value="sparkles">Sparkles</option>
                        <option value="shield">Shield</option>
                        <option value="star">Star</option>
                        <option value="crown">Crown</option>
                        <option value="zap">Zap</option>
                    </select>

                    <h3 className="text-[20px] font-black tracking-tight mb-1 text-white">{pkg.label}</h3>
                    <input
                        className={cn(inputDark, 'text-center text-[11px] italic mb-2')}
                        value={tagline}
                        onChange={(e) => setTagline(e.target.value)}
                        placeholder="Tagline"
                    />
                    <input
                        className={cn(inputDark, 'text-center text-[10px]')}
                        value={tierLabel}
                        onChange={(e) => setTierLabel(e.target.value)}
                        placeholder="Tier label (Essential…)"
                    />

                    <div className="flex items-center justify-center gap-3 mt-3 text-[10px] text-white/70">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={popular} onChange={(e) => setPopular(e.target.checked)} className="rounded border-white/20" />
                            Popular
                        </label>
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={flagship} onChange={(e) => setFlagship(e.target.checked)} className="rounded border-white/20" />
                            Flagship
                        </label>
                    </div>
                </div>

                <div
                    className="relative mx-3 mb-2 overflow-hidden rounded-2xl p-4 sm:mx-4"
                    style={{
                        background: `linear-gradient(135deg, ${liveAccent.from}08, ${liveAccent.to}04, rgba(0,0,0,0.2))`,
                        boxShadow: `0 12px 36px -18px rgba(0,0,0,0.35), inset 0 1px 0 0 rgba(255,255,255,0.07)`,
                    }}
                >
                    <div className="relative z-10 space-y-2">
                        <div className="flex flex-wrap items-center justify-center gap-2 mb-1">
                            <span className="text-[9px] text-white/35 uppercase tracking-wider">{t('services.startingAt')}</span>
                            <span className="text-[10px] text-white/40 line-through font-medium">
                                ₱{computedOriginal != null ? computedOriginal.toLocaleString() : '—'}
                            </span>
                            <span className="text-[9px] px-2 py-0.5 rounded-full font-black uppercase bg-gradient-to-br from-red-500 to-red-700 text-white">{discountLabel}</span>
                        </div>
                        <label className="text-[8px] uppercase text-white/35 block text-center">Discount pill (optional override)</label>
                        <input className={cn(inputDark, 'text-[10px] text-center')} value={discountBadge} onChange={(e) => setDiscountBadge(e.target.value)} placeholder="Auto from prices if empty" />

                        <div className="grid grid-cols-3 gap-2 pt-2">
                            <div>
                                <label className="text-[8px] uppercase text-white/35">Base ₱</label>
                                <input className={cn(inputDark, 'text-sm font-bold tabular-nums')} value={baseStr} onChange={(e) => setBaseStr(e.target.value)} inputMode="decimal" />
                            </div>
                            <div>
                                <label className="text-[8px] uppercase text-white/35">Original ₱</label>
                                <input className={cn(inputDark, 'text-sm tabular-nums')} value={originalStr} onChange={(e) => setOriginalStr(e.target.value)} inputMode="decimal" />
                            </div>
                            <div>
                                <label className="text-[8px] uppercase text-white/35">Tint + ₱</label>
                                <input className={cn(inputDark, 'text-sm tabular-nums')} value={addonStr} onChange={(e) => setAddonStr(e.target.value)} inputMode="decimal" />
                            </div>
                        </div>
                        <p className="text-[9px] text-center text-amber-200/70">
                            Prices apply to <span className="font-semibold">{vehicleType}</span> only (selected tab above).
                        </p>
                        <label className="text-[8px] uppercase text-white/35 block text-center">Original × multiplier if original empty</label>
                        <input
                            className={cn(inputDark, 'text-xs text-center max-w-[120px] mx-auto')}
                            value={originalPriceMultiplier}
                            onChange={(e) => setOriginalPriceMultiplier(e.target.value)}
                            inputMode="decimal"
                            placeholder="e.g. 2"
                        />

                        <AnimatePresence mode="wait">
                            <motion.div
                                key={priceNum ?? 'empty'}
                                variants={priceFlip}
                                initial="exit"
                                animate="enter"
                                exit="exit"
                                className="flex items-baseline justify-center gap-1 pt-1"
                            >
                                <span className="text-lg font-bold text-white/50">₱</span>
                                <span
                                    className="text-[40px] sm:text-[44px] font-black tracking-tight leading-none"
                                    style={{
                                        backgroundImage: `linear-gradient(135deg, ${liveAccent.from}, ${liveAccent.mid}, ${liveAccent.to})`,
                                        WebkitBackgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent',
                                    }}
                                >
                                    {priceNum != null ? priceNum.toLocaleString() : '—'}
                                </span>
                                <span className="text-sm font-medium text-white/25 self-end mb-1">.00</span>
                            </motion.div>
                        </AnimatePresence>

                        <div className="pt-2 border-t border-white/[0.08] space-y-1">
                            <label className="text-[8px] uppercase text-white/35">Tint bundle label</label>
                            <input className={cn(inputDark, 'text-[10px]')} value={addonLabel} onChange={(e) => setAddonLabel(e.target.value)} placeholder="+ Nano Ceramic Window Tint" />
                        </div>
                    </div>
                </div>

                <div className="px-4 pb-4 flex-1 flex flex-col">
                    <div className="flex items-center gap-2 mb-2 pt-3 border-t border-white/[0.06]">
                        <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${liveAccent.from}20, transparent)` }} />
                        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/45">Included lines</span>
                        <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${liveAccent.from}20)` }} />
                    </div>
                    <textarea
                        className={cn(inputDark, 'min-h-[100px] text-[12px] leading-snug font-medium resize-y')}
                        value={featuresText}
                        onChange={(e) => setFeaturesText(e.target.value)}
                        placeholder="One feature per line"
                    />
                    <label className="text-[8px] uppercase text-white/35 mt-2">Highlight phrases (comma-separated)</label>
                    <input className={cn(inputDark, 'text-[11px]')} value={highlightedText} onChange={(e) => setHighlightedText(e.target.value)} />

                    <ul className="space-y-2 mt-3 pointer-events-none opacity-85">
                        {previewFeatures.map((feat, i) => {
                            const isHighlightedFeat = previewHighlights.some((h) => h && feat.includes(h));
                            return (
                                <li key={`${feat}-${i}`} className="flex items-start gap-2">
                                    <div
                                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg"
                                        style={{
                                            background: `${liveAccent.from}22`,
                                            boxShadow: `0 2px 8px -4px ${liveAccent.from}45`,
                                        }}
                                    >
                                        <Check className="w-3 h-3" style={{ color: liveAccent.from }} />
                                    </div>
                                    <span className={cn('text-[12px] leading-snug', isHighlightedFeat ? 'text-white/85' : 'text-white/55')}>{feat}</span>
                                </li>
                            );
                        })}
                    </ul>
                </div>

                <div className="px-4 pb-5 mt-auto pt-2">
                    <button
                        type="button"
                        disabled={saving || !serviceId}
                        onClick={() => void handleSave()}
                        className="w-full h-11 rounded-xl font-bold text-[12px] flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-900/30 hover:brightness-110"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {serviceId ? 'Save this package' : 'No DB service'}
                    </button>
                    <p className="mt-2 text-center text-[10px] text-white/35">Esc · back to preview</p>
                </div>
                    </>
                ) : (
                    <>
                        <div
                            role="button"
                            tabIndex={0}
                            className={cn(clickToEditSurface, 'mx-5 mt-5 flex items-center justify-between px-2 py-2 sm:mx-7')}
                            onClick={openEditor}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    openEditor();
                                }
                            }}
                        >
                            <span
                                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-[6px] text-[9px] font-black uppercase tracking-[0.25em]"
                                style={{
                                    background: `linear-gradient(135deg, ${liveAccent.from}20, ${liveAccent.to}10)`,
                                    boxShadow: `0 8px 22px -12px ${liveAccent.from}40`,
                                    color: liveAccent.from,
                                }}
                            >
                                <BadgeLeadIcon className="w-3 h-3" />
                                {badge}
                            </span>
                            <div className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-[5px] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]">
                                <Shield className="h-2.5 w-2.5 text-white/50" />
                                <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/50">{warrantyLabel}</span>
                            </div>
                        </div>

                        <div
                            role="button"
                            tabIndex={0}
                            className={cn(clickToEditSurface, 'mx-5 flex flex-col items-center px-4 pb-5 pt-6 text-center sm:mx-7')}
                            onClick={openEditor}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    openEditor();
                                }
                            }}
                        >
                            <div
                                className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
                                style={{
                                    background: `linear-gradient(145deg, ${liveAccent.from}, ${liveAccent.to})`,
                                    boxShadow: `0 6px 25px ${liveAccent.from}30`,
                                }}
                            >
                                <DisplayIcon className="relative z-10 h-7 w-7 text-white" />
                                <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/25 via-transparent to-transparent" />
                            </div>
                            <h3
                                className="mb-1 text-[22px] font-black tracking-tight transition-all duration-300"
                                style={{ color: hovered ? liveAccent.from : '#ffffff' }}
                            >
                                {pkg.label}
                            </h3>
                            <p className="text-[12px] font-medium italic tracking-wide text-white/45">{tagline}</p>
                            {tierLabel.trim() ? (
                                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">{tierLabel}</p>
                            ) : null}
                        </div>

                        <div
                            role="button"
                            tabIndex={0}
                            className={cn(clickToEditSurface, 'relative mx-5 mb-2 overflow-hidden rounded-2xl p-5 sm:mx-6')}
                            style={{
                                background: `linear-gradient(135deg, ${liveAccent.from}08, ${liveAccent.to}04, rgba(0,0,0,0.2))`,
                                boxShadow: `0 14px 36px -18px rgba(0,0,0,0.38), inset 0 1px 0 0 rgba(255,255,255,0.06)`,
                            }}
                            onClick={openEditor}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    openEditor();
                                }
                            }}
                        >
                            <div className="relative z-10">
                                <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
                                    <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/30">{t('services.startingAt')}</span>
                                    <span className="text-xs font-medium text-white/30 line-through">
                                        ₱{computedOriginal != null ? computedOriginal.toLocaleString() : '—'}
                                    </span>
                                    <span className="rounded-full bg-gradient-to-br from-red-500 to-red-700 px-2.5 py-[4px] text-[10px] font-black uppercase tracking-wider text-white">
                                        {discountLabel}
                                    </span>
                                </div>
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={priceNum ?? 'empty'}
                                        variants={priceFlip}
                                        initial="exit"
                                        animate="enter"
                                        exit="exit"
                                        className="flex items-baseline justify-center gap-1"
                                    >
                                        <span className="text-lg font-bold text-white/50">₱</span>
                                        <span
                                            className="text-[52px] font-black leading-none tracking-tight"
                                            style={{
                                                backgroundImage: `linear-gradient(135deg, ${liveAccent.from}, ${liveAccent.mid}, ${liveAccent.to})`,
                                                WebkitBackgroundClip: 'text',
                                                WebkitTextFillColor: 'transparent',
                                                filter: `drop-shadow(0 2px 8px ${liveAccent.from}30)`,
                                            }}
                                        >
                                            {priceNum != null ? priceNum.toLocaleString() : '—'}
                                        </span>
                                        <span className="mb-1.5 self-end text-sm font-medium text-white/25">.00</span>
                                    </motion.div>
                                </AnimatePresence>
                                {tintPriceNum != null || addonLabel.trim() ? (
                                    <div
                                        className="mt-3 flex items-center justify-center gap-2 pt-3 shadow-[0_-1px_0_0_rgba(255,255,255,0.06)]"
                                    >
                                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: `${liveAccent.from}90` }}>
                                            {addonLinePreview}
                                        </span>
                                        {tintPriceNum != null ? (
                                            <span className="text-sm font-bold" style={{ color: liveAccent.from }}>
                                                ₱{tintPriceNum.toLocaleString()}
                                            </span>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        <div
                            role="button"
                            tabIndex={0}
                            className={cn(clickToEditSurface, 'flex flex-1 flex-col px-5 pb-4 pt-1 sm:px-7')}
                            onClick={openEditor}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    openEditor();
                                }
                            }}
                        >
                            <div className="mb-4 flex items-center gap-2 border-t border-white/[0.06] pt-4">
                                <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${liveAccent.from}20, transparent)` }} />
                                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50">What&apos;s included</span>
                                <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${liveAccent.from}20)` }} />
                            </div>
                            <ul className="space-y-2.5">
                                {previewFeatures.map((feat, i) => {
                                    const isHighlightedFeat = previewHighlights.some((h) => h && feat.includes(h));
                                    return (
                                        <li key={`${feat}-${i}`} className="flex items-start gap-3">
                                            <div
                                                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg transition-all duration-300"
                                                style={{
                                                    background:
                                                        hovered || isHighlightedFeat ? `${liveAccent.from}22` : 'rgba(255,255,255,0.06)',
                                                    boxShadow:
                                                        hovered || isHighlightedFeat
                                                            ? `0 3px 10px -4px ${liveAccent.from}45`
                                                            : '0 2px 8px -4px rgba(0,0,0,0.25)',
                                                }}
                                            >
                                                <Check
                                                    className="h-3 w-3 transition-colors duration-300"
                                                    style={{
                                                        color: hovered || isHighlightedFeat ? liveAccent.from : 'rgba(255,255,255,0.50)',
                                                    }}
                                                />
                                            </div>
                                            <span
                                                className={cn(
                                                    'text-[13px] font-medium leading-snug transition-colors duration-300',
                                                    isHighlightedFeat ? 'text-white/85' : 'text-white/60',
                                                )}
                                            >
                                                {feat}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>

                        <div className="mt-auto px-5 pb-6 pt-3 sm:px-7">
                            <motion.button
                                type="button"
                                disabled
                                className="relative flex h-[52px] w-full cursor-default items-center justify-center gap-2 overflow-hidden rounded-xl text-[13px] font-bold opacity-90"
                                style={{
                                    background: isHighlighted
                                        ? `linear-gradient(135deg, ${liveAccent.from}, ${liveAccent.to})`
                                        : `linear-gradient(135deg, ${liveAccent.from}18, ${liveAccent.to}0a)`,
                                    color: isHighlighted ? '#fff' : 'rgba(255,255,255,0.80)',
                                    boxShadow: isHighlighted
                                        ? `0 14px 36px -14px ${liveAccent.from}45`
                                        : `0 10px 28px -14px rgba(0,0,0,0.35), 0 4px 14px -8px ${liveAccent.from}18`,
                                    letterSpacing: '0.08em',
                                }}
                            >
                                <span className="relative z-10 uppercase tracking-wider">{t('services.bookNow')} · preview</span>
                                <ArrowRight className="relative z-10 h-4 w-4 opacity-60" />
                            </motion.button>
                            <p className="mt-2 text-center text-[10px] text-white/35">
                                I-tap ang card o <span className="text-white/55">Edit</span> para baguhin ang copy at presyo
                            </p>
                        </div>
                    </>
                )}
            </div>
        </motion.div>
    );
}
