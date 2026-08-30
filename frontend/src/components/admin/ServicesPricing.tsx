import { useEffect, useMemo, useRef, useState, type ElementType } from 'react';
import {
    Car,
    CarFront,
    Check,
    Crown,
    Eye,
    Loader2,
    Pencil,
    RefreshCw,
    RotateCcw,
    Save,
    Truck,
} from 'lucide-react';
import { toast } from 'sonner';
import { AdminServicesLivePreview } from '@/components/admin/AdminServicesLivePreview';
import {
    CATALOG_ICON_KEYS,
    mergePublishedPricingIntoPackages,
    spfPackages,
    type SPFPackage,
    type VehicleType,
} from '@/components/services/services-catalog-data';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { DetailService } from '@/lib/detail-service-api';
import {
    VEHICLE_PRICE_FIELDS,
    findPublishedServiceForPackage,
    getServiceId,
    type ServiceCatalogCard,
} from '@/lib/service-pricing';
import type { Service } from '@/types';

interface ServicesPricingProps {
    services: Service[];
    onRefresh: () => void | Promise<void>;
}

type PriceField = 'base' | 'original' | 'addon';
type PriceDraft = Record<PriceField, string>;
type VehiclePriceDrafts = Record<VehicleType, PriceDraft>;

interface PackageDraft {
    key: string;
    serviceId: string;
    status: 'Active' | 'Inactive';
    pricing: VehiclePriceDrafts;
    catalogCard: ServiceCatalogCard;
}

const vehicleOptions: { type: VehicleType; label: string; compactLabel: string; icon: ElementType }[] = [
    { type: 'hatchback', label: 'Hatchback', compactLabel: 'Hatchback', icon: CarFront },
    { type: 'sedan', label: 'Sedan', compactLabel: 'Sedan', icon: Car },
    { type: 'midsized', label: 'Midsized', compactLabel: 'Midsized', icon: Car },
    { type: 'suv', label: 'SUV', compactLabel: 'SUV', icon: Truck },
    { type: 'pickup', label: 'Pick Up', compactLabel: 'Pick Up', icon: Truck },
    { type: 'largesuv', label: 'Large SUV / Van', compactLabel: 'Large SUV', icon: Truck },
    { type: 'highend', label: 'Highend Sedan', compactLabel: 'Highend', icon: Crown },
];

const priceToString = (value: number | null | undefined) => (value == null ? '' : String(value));
const cloneDrafts = (drafts: PackageDraft[]) => JSON.parse(JSON.stringify(drafts)) as PackageDraft[];

function iconKeyFromPackage(pkg: SPFPackage): ServiceCatalogCard['iconKey'] {
    const keys = Object.keys(CATALOG_ICON_KEYS) as (keyof typeof CATALOG_ICON_KEYS)[];
    return keys.find((key) => CATALOG_ICON_KEYS[key] === pkg.icon) || 'sparkles';
}

function buildDrafts(services: Service[]): PackageDraft[] {
    const packages = mergePublishedPricingIntoPackages(spfPackages, services);

    return packages.map((pkg) => {
        const service = findPublishedServiceForPackage(services, pkg.key, pkg.label) as Service | undefined;
        const pricing = Object.fromEntries(
            vehicleOptions.map(({ type }) => [
                type,
                {
                    base: priceToString(pkg.prices[type]),
                    original: priceToString(pkg.originalPrices?.[type]),
                    addon: priceToString(pkg.tintPrices[type]),
                },
            ]),
        ) as VehiclePriceDrafts;

        return {
            key: pkg.key,
            serviceId: service ? getServiceId(service) : '',
            status: service?.status || 'Inactive',
            pricing,
            catalogCard: {
                badge: pkg.badge,
                warrantyLabel: pkg.years,
                tagline: pkg.tagline,
                tierLabel: pkg.tier,
                features: [...pkg.features],
                highlighted: [...pkg.highlighted],
                addonLabel: pkg.addonLabel || '',
                discountBadge: pkg.discountBadge || '',
                iconKey: iconKeyFromPackage(pkg),
                accentFrom: pkg.accentFrom,
                accentMid: pkg.accentMid,
                accentTo: pkg.accentTo,
                popular: pkg.popular,
                flagship: pkg.flagship,
            },
        };
    });
}

function parsePrice(value: string, label: string): number | null {
    const cleaned = value.replace(/[₱,\s]/g, '').trim();
    if (!cleaned) return null;
    const amount = Number(cleaned);
    if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(`${label} must be a positive amount or left blank.`);
    }
    return Math.round(amount * 100) / 100;
}

const getDiscount = (pricing: PriceDraft) => {
    if (!pricing.base.trim() || !pricing.original.trim()) return null;
    const base = Number(pricing.base);
    const original = Number(pricing.original);
    if (!Number.isFinite(base) || !Number.isFinite(original) || original <= base || original <= 0) return null;
    return Math.round((1 - base / original) * 100);
};

const getPreviewPrice = (value: string) => {
    try {
        return parsePrice(value, 'Price');
    } catch {
        return null;
    }
};

function draftToPreviewPackages(drafts: PackageDraft[]): SPFPackage[] {
    return spfPackages.map((pkg) => {
        const draft = drafts.find((entry) => entry.key === pkg.key);
        if (!draft) return pkg;

        const prices = { ...pkg.prices };
        const originalPrices = { ...(pkg.originalPrices || {}) } as SPFPackage['prices'];
        const tintPrices = { ...pkg.tintPrices };
        vehicleOptions.forEach(({ type }) => {
            prices[type] = getPreviewPrice(draft.pricing[type].base);
            originalPrices[type] = getPreviewPrice(draft.pricing[type].original);
            tintPrices[type] = getPreviewPrice(draft.pricing[type].addon);
        });

        const iconKey = draft.catalogCard.iconKey || 'sparkles';
        return {
            ...pkg,
            badge: draft.catalogCard.badge?.trim() || pkg.badge,
            years: draft.catalogCard.warrantyLabel?.trim() || pkg.years,
            tagline: draft.catalogCard.tagline?.trim() || pkg.tagline,
            tier: draft.catalogCard.tierLabel?.trim() || pkg.tier,
            features: draft.catalogCard.features?.map((item) => item.trim()).filter(Boolean).length
                ? draft.catalogCard.features.map((item) => item.trim()).filter(Boolean)
                : pkg.features,
            highlighted: draft.catalogCard.highlighted?.map((item) => item.trim()).filter(Boolean) || [],
            addonLabel: draft.catalogCard.addonLabel || '',
            discountBadge: draft.catalogCard.discountBadge || '',
            icon: CATALOG_ICON_KEYS[iconKey] || pkg.icon,
            popular: Boolean(draft.catalogCard.popular),
            flagship: Boolean(draft.catalogCard.flagship),
            prices,
            originalPrices,
            tintPrices,
        };
    });
}

function MoneyInput({
    value,
    onChange,
    label,
    compact = false,
    disabled = false,
}: {
    value: string;
    onChange: (value: string) => void;
    label: string;
    compact?: boolean;
    disabled?: boolean;
}) {
    return (
        <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">₱</span>
            <Input
                aria-label={label}
                inputMode="decimal"
                value={value}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value)}
                placeholder="—"
                className={cn(
                    'border-slate-200 bg-white pl-6 font-semibold text-slate-900 shadow-none focus-visible:border-blue-500 focus-visible:ring-blue-500/15',
                    compact ? 'h-8 w-[116px] rounded-lg text-xs' : 'h-10 rounded-xl text-sm',
                )}
            />
        </div>
    );
}

export function ServicesPricing({ services, onRefresh }: ServicesPricingProps) {
    const initialDrafts = useMemo(() => buildDrafts(services), [services]);
    const [drafts, setDrafts] = useState<PackageDraft[]>(() => cloneDrafts(initialDrafts));
    const [baseline, setBaseline] = useState<PackageDraft[]>(() => cloneDrafts(initialDrafts));
    const [vehicleType, setVehicleType] = useState<VehicleType>('sedan');
    const [selectedPackageKey, setSelectedPackageKey] = useState<string | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewVehicleType, setPreviewVehicleType] = useState<VehicleType>('sedan');
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const servicesSignature = JSON.stringify(services);
    const appliedServicesSignature = useRef(servicesSignature);

    const dirtyKeys = useMemo(
        () => drafts.filter((draft, index) => JSON.stringify(draft) !== JSON.stringify(baseline[index])).map((draft) => draft.key),
        [baseline, drafts],
    );
    const hasUnsavedChanges = dirtyKeys.length > 0;

    useEffect(() => {
        if (servicesSignature === appliedServicesSignature.current || hasUnsavedChanges) return;
        appliedServicesSignature.current = servicesSignature;
        setDrafts(cloneDrafts(initialDrafts));
        setBaseline(cloneDrafts(initialDrafts));
    }, [hasUnsavedChanges, initialDrafts, servicesSignature]);

    useEffect(() => {
        if (!hasUnsavedChanges) return;
        const guard = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', guard);
        return () => window.removeEventListener('beforeunload', guard);
    }, [hasUnsavedChanges]);

    const selectedDraft = drafts.find((draft) => draft.key === selectedPackageKey) || null;
    const selectedPackage = spfPackages.find((pkg) => pkg.key === selectedPackageKey) || null;
    const previewPackages = useMemo(() => draftToPreviewPackages(drafts), [drafts]);

    const updateDraft = (packageKey: string, updater: (draft: PackageDraft) => PackageDraft) => {
        setDrafts((current) => current.map((draft) => (draft.key === packageKey ? updater(draft) : draft)));
    };

    const updatePrice = (packageKey: string, field: PriceField, value: string) => {
        updateDraft(packageKey, (draft) => ({
            ...draft,
            pricing: {
                ...draft.pricing,
                [vehicleType]: { ...draft.pricing[vehicleType], [field]: value },
            },
        }));
    };

    const updateCatalog = <K extends keyof ServiceCatalogCard>(packageKey: string, field: K, value: ServiceCatalogCard[K]) => {
        updateDraft(packageKey, (draft) => ({
            ...draft,
            catalogCard: { ...draft.catalogCard, [field]: value },
        }));
    };

    const handleRefresh = async () => {
        if (hasUnsavedChanges) {
            toast.error('Save or discard your changes before refreshing.');
            return;
        }
        setRefreshing(true);
        try {
            await onRefresh();
        } finally {
            setRefreshing(false);
        }
    };

    const handleDiscard = () => {
        setDrafts(cloneDrafts(baseline));
        toast.success('Unsaved changes discarded.');
    };

    const handleSaveAll = async () => {
        if (!hasUnsavedChanges || saving) return;
        setSaving(true);
        try {
            for (const draft of drafts) {
                const original = baseline.find((entry) => entry.key === draft.key);
                if (!original || JSON.stringify(draft) === JSON.stringify(original)) continue;
                if (!draft.serviceId) throw new Error(`${draft.key.toUpperCase()} is not linked to a database service.`);

                for (const option of vehicleOptions) {
                    const nextPrice = draft.pricing[option.type];
                    const previousPrice = original.pricing[option.type];
                    if (JSON.stringify(nextPrice) === JSON.stringify(previousPrice)) continue;
                    await DetailService.updateServicePricing(draft.serviceId, {
                        vehicleType: VEHICLE_PRICE_FIELDS.find((field) => field.publicKey === option.type)?.apiKey || option.type,
                        basePrice: parsePrice(nextPrice.base, 'Current price'),
                        originalPrice: parsePrice(nextPrice.original, 'Original price'),
                        addonPrice: parsePrice(nextPrice.addon, 'Add-on price'),
                    });
                }

                if (
                    draft.status !== original.status
                    || JSON.stringify(draft.catalogCard) !== JSON.stringify(original.catalogCard)
                ) {
                    await DetailService.updateService(draft.serviceId, {
                        status: draft.status,
                        catalogCard: {
                            ...draft.catalogCard,
                            features: draft.catalogCard.features?.map((item) => item.trim()).filter(Boolean),
                            highlighted: draft.catalogCard.highlighted?.map((item) => item.trim()).filter(Boolean),
                        },
                    });
                }
            }

            const savedDrafts = cloneDrafts(drafts);
            setBaseline(savedDrafts);
            appliedServicesSignature.current = servicesSignature;
            toast.success(`${dirtyKeys.length} package${dirtyKeys.length === 1 ? '' : 's'} saved successfully.`);
            await onRefresh();
        } catch (error: unknown) {
            const err = error as { message?: string; response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || err.message || 'Unable to save pricing changes.');
        } finally {
            setSaving(false);
        }
    };

    const openPreview = () => {
        setPreviewVehicleType(vehicleType);
        setPreviewOpen(true);
    };

    return (
        <div className="space-y-4 text-slate-900">
            <section className="rounded-[20px] border border-slate-200/80 bg-white px-4 py-4 shadow-[0_10px_35px_-24px_rgba(15,23,42,0.28)] sm:px-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">Services catalog</p>
                        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Package pricing matrix</h1>
                        <p className="mt-1 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">
                            Update package prices by vehicle type. Open a package to manage customer-facing details and availability.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={openPreview}
                            className="h-10 rounded-xl border-slate-200 bg-white text-slate-700 shadow-none hover:bg-slate-50"
                        >
                            <Eye className="mr-2 h-4 w-4" />
                            Preview Customer View
                        </Button>
                        <Button
                            variant="outline"
                            onClick={handleRefresh}
                            disabled={refreshing || saving}
                            className="h-10 rounded-xl border-slate-200 bg-white text-slate-700 shadow-none hover:bg-slate-50"
                        >
                            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Refresh
                        </Button>
                    </div>
                </div>
            </section>

            <section className="overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-[0_16px_50px_-34px_rgba(15,23,42,0.3)]">
                <div className="border-b border-slate-200 bg-slate-50/70 px-3 py-3 sm:px-4">
                    <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
                        {vehicleOptions.map((option) => {
                            const Icon = option.icon;
                            const active = vehicleType === option.type;
                            return (
                                <button
                                    key={option.type}
                                    type="button"
                                    onClick={() => setVehicleType(option.type)}
                                    className={cn(
                                        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors',
                                        active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                                    )}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">{option.label}</span>
                                    <span className="sm:hidden">{option.compactLabel}</span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 px-1">
                        <p className="text-xs font-medium text-slate-500">
                            Showing prices for <span className="font-semibold text-slate-800">{vehicleOptions.find((option) => option.type === vehicleType)?.label}</span>
                        </p>
                        <p className={cn('text-xs font-semibold', hasUnsavedChanges ? 'text-amber-700' : 'text-emerald-700')}>
                            {hasUnsavedChanges ? `${dirtyKeys.length} unsaved package${dirtyKeys.length === 1 ? '' : 's'}` : 'All changes saved'}
                        </p>
                    </div>
                </div>

                <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[980px] border-collapse text-left">
                        <thead>
                            <tr className="border-b border-slate-200 bg-white text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                                <th className="px-5 py-3">Package</th>
                                <th className="px-3 py-3">Current Price</th>
                                <th className="px-3 py-3">Original Price</th>
                                <th className="px-3 py-3">Discount</th>
                                <th className="px-3 py-3">Add-on Price</th>
                                <th className="px-3 py-3">Status</th>
                                <th className="px-5 py-3 text-right">Edit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {drafts.map((draft) => {
                                const pkg = spfPackages.find((entry) => entry.key === draft.key)!;
                                const pricing = draft.pricing[vehicleType];
                                const discount = getDiscount(pricing);
                                const dirty = dirtyKeys.includes(draft.key);
                                return (
                                    <tr key={draft.key} className="group bg-white transition-colors hover:bg-slate-50/80">
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-black text-white" style={{ backgroundColor: pkg.accentFrom }}>
                                                    {pkg.label.replace('SPF ', '')}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm font-bold text-slate-950">{pkg.label}</p>
                                                        {dirty ? <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="Unsaved" /> : null}
                                                    </div>
                                                    <p className="mt-0.5 text-[11px] font-medium text-slate-500">{draft.catalogCard.tierLabel}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3.5"><MoneyInput compact label={`${pkg.label} current price`} value={pricing.base} onChange={(value) => updatePrice(draft.key, 'base', value)} disabled={!draft.serviceId} /></td>
                                        <td className="px-3 py-3.5"><MoneyInput compact label={`${pkg.label} original price`} value={pricing.original} onChange={(value) => updatePrice(draft.key, 'original', value)} disabled={!draft.serviceId} /></td>
                                        <td className="px-3 py-3.5"><span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-bold', discount == null ? 'bg-slate-100 text-slate-500' : 'bg-rose-50 text-rose-700')}>{discount == null ? '—' : `${discount}% OFF`}</span></td>
                                        <td className="px-3 py-3.5"><MoneyInput compact label={`${pkg.label} add-on price`} value={pricing.addon} onChange={(value) => updatePrice(draft.key, 'addon', value)} disabled={!draft.serviceId} /></td>
                                        <td className="px-3 py-3.5">
                                            {draft.serviceId ? (
                                                <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', draft.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>
                                                    <span className={cn('h-1.5 w-1.5 rounded-full', draft.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-400')} />{draft.status}
                                                </span>
                                            ) : <span className="text-xs font-semibold text-rose-600">Not linked</span>}
                                        </td>
                                        <td className="px-5 py-3.5 text-right">
                                            <Button variant="ghost" size="sm" onClick={() => setSelectedPackageKey(draft.key)} className="h-8 rounded-lg px-2.5 text-blue-700 hover:bg-blue-50 hover:text-blue-800">
                                                <Pencil className="mr-1.5 h-3.5 w-3.5" />Edit
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="grid gap-3 p-3 md:hidden">
                    {drafts.map((draft) => {
                        const pkg = spfPackages.find((entry) => entry.key === draft.key)!;
                        const pricing = draft.pricing[vehicleType];
                        const discount = getDiscount(pricing);
                        const dirty = dirtyKeys.includes(draft.key);
                        return (
                            <article key={draft.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl text-xs font-black text-white" style={{ backgroundColor: pkg.accentFrom }}>{pkg.label.replace('SPF ', '')}</div>
                                        <div>
                                            <div className="flex items-center gap-2"><h3 className="text-sm font-bold text-slate-950">{pkg.label}</h3>{dirty ? <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> : null}</div>
                                            <p className="text-xs font-medium text-slate-500">{draft.catalogCard.tierLabel}</p>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={() => setSelectedPackageKey(draft.key)} className="h-8 rounded-lg px-2 text-blue-700"><Pencil className="mr-1 h-3.5 w-3.5" /> Edit</Button>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    <div><Label className="mb-1.5 block text-[10px] uppercase tracking-wide text-slate-500">Current price</Label><MoneyInput label={`${pkg.label} current price`} value={pricing.base} onChange={(value) => updatePrice(draft.key, 'base', value)} disabled={!draft.serviceId} /></div>
                                    <div><Label className="mb-1.5 block text-[10px] uppercase tracking-wide text-slate-500">Original price</Label><MoneyInput label={`${pkg.label} original price`} value={pricing.original} onChange={(value) => updatePrice(draft.key, 'original', value)} disabled={!draft.serviceId} /></div>
                                    <div><Label className="mb-1.5 block text-[10px] uppercase tracking-wide text-slate-500">Add-on price</Label><MoneyInput label={`${pkg.label} add-on price`} value={pricing.addon} onChange={(value) => updatePrice(draft.key, 'addon', value)} disabled={!draft.serviceId} /></div>
                                    <div className="flex flex-col justify-end">
                                        <Label className="mb-1.5 block text-[10px] uppercase tracking-wide text-slate-500">Discount</Label>
                                        <div className="flex h-10 items-center justify-between rounded-xl bg-slate-50 px-3">
                                            <span className="text-sm font-bold text-rose-700">{discount == null ? '—' : `${discount}% OFF`}</span>
                                            <span className={cn('text-xs font-semibold', draft.status === 'Active' ? 'text-emerald-700' : 'text-slate-500')}>{draft.serviceId ? draft.status : 'Not linked'}</span>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                        <span className={cn('flex h-6 w-6 items-center justify-center rounded-full', hasUnsavedChanges ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}>
                            {hasUnsavedChanges ? dirtyKeys.length : <Check className="h-3.5 w-3.5" />}
                        </span>
                        {hasUnsavedChanges ? 'Changes are stored locally until you save.' : 'Pricing is up to date.'}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={handleDiscard} disabled={!hasUnsavedChanges || saving} className="h-9 rounded-xl text-slate-600 hover:bg-white"><RotateCcw className="mr-2 h-4 w-4" />Discard</Button>
                        <Button onClick={handleSaveAll} disabled={!hasUnsavedChanges || saving} className="h-9 rounded-xl bg-blue-600 px-4 text-white hover:bg-blue-700">
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save All
                        </Button>
                    </div>
                </div>
            </section>

            <Sheet open={Boolean(selectedDraft)} onOpenChange={(open) => !open && setSelectedPackageKey(null)}>
                <SheetContent side="right" className="flex w-full flex-col gap-0 border-l border-slate-200 bg-white p-0 text-slate-900 sm:max-w-xl lg:max-w-2xl">
                    {selectedDraft && selectedPackage ? (
                        <>
                            <SheetHeader className="border-b border-slate-200 px-5 py-5 pr-12 text-left sm:px-6">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl text-xs font-black text-white" style={{ backgroundColor: selectedPackage.accentFrom }}>{selectedPackage.label.replace('SPF ', '')}</div>
                                    <div><SheetTitle className="text-lg font-bold text-slate-950">Edit {selectedPackage.label}</SheetTitle><SheetDescription className="mt-1 text-xs text-slate-500">Package details and {vehicleOptions.find((option) => option.type === vehicleType)?.label} pricing</SheetDescription></div>
                                </div>
                            </SheetHeader>

                            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
                                <section className="space-y-4">
                                    <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-950">Package details</p><p className="mt-1 text-xs text-slate-500">Content shown on the customer package card.</p></div>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div><Label className="mb-1.5 block text-xs text-slate-600">Package</Label><Input value={selectedPackage.label} disabled className="h-10 rounded-xl border-slate-200 bg-slate-50" /></div>
                                        <div><Label className="mb-1.5 block text-xs text-slate-600">Tier label</Label><Input value={selectedDraft.catalogCard.tierLabel || ''} onChange={(event) => updateCatalog(selectedDraft.key, 'tierLabel', event.target.value)} className="h-10 rounded-xl border-slate-200" /></div>
                                        <div><Label className="mb-1.5 block text-xs text-slate-600">Warranty</Label><Input value={selectedDraft.catalogCard.warrantyLabel || ''} onChange={(event) => updateCatalog(selectedDraft.key, 'warrantyLabel', event.target.value)} className="h-10 rounded-xl border-slate-200" /></div>
                                        <div><Label className="mb-1.5 block text-xs text-slate-600">Add-on label</Label><Input value={selectedDraft.catalogCard.addonLabel || ''} onChange={(event) => updateCatalog(selectedDraft.key, 'addonLabel', event.target.value)} placeholder="Nano Ceramic Window Tint" className="h-10 rounded-xl border-slate-200" /></div>
                                    </div>
                                    <div><Label className="mb-1.5 block text-xs text-slate-600">Tagline</Label><Input value={selectedDraft.catalogCard.tagline || ''} onChange={(event) => updateCatalog(selectedDraft.key, 'tagline', event.target.value)} className="h-10 rounded-xl border-slate-200" /></div>
                                </section>

                                <section className="space-y-4 border-t border-slate-200 pt-5">
                                    <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-950">Included services</p><p className="mt-1 text-xs text-slate-500">Add one included service per line.</p></div>
                                    <Textarea value={(selectedDraft.catalogCard.features || []).join('\n')} onChange={(event) => updateCatalog(selectedDraft.key, 'features', event.target.value.split('\n'))} className="min-h-36 rounded-xl border-slate-200 bg-white text-sm leading-relaxed" />
                                    <div>
                                        <Label className="mb-1.5 block text-xs text-slate-600">Highlighted service phrases</Label>
                                        <Input value={(selectedDraft.catalogCard.highlighted || []).join(', ')} onChange={(event) => updateCatalog(selectedDraft.key, 'highlighted', event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} placeholder="PPF, SONAX, Full Recoat" className="h-10 rounded-xl border-slate-200" />
                                    </div>
                                </section>

                                <section className="space-y-4 border-t border-slate-200 pt-5">
                                    <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-950">Promo badge</p><p className="mt-1 text-xs text-slate-500">Control the package badge and optional discount wording.</p></div>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div><Label className="mb-1.5 block text-xs text-slate-600">Package badge</Label><Input value={selectedDraft.catalogCard.badge || ''} onChange={(event) => updateCatalog(selectedDraft.key, 'badge', event.target.value)} placeholder="RECOMMENDED" className="h-10 rounded-xl border-slate-200" /></div>
                                        <div><Label className="mb-1.5 block text-xs text-slate-600">Discount badge override</Label><Input value={selectedDraft.catalogCard.discountBadge || ''} onChange={(event) => updateCatalog(selectedDraft.key, 'discountBadge', event.target.value)} placeholder={`${getDiscount(selectedDraft.pricing[vehicleType]) || 0}% OFF`} className="h-10 rounded-xl border-slate-200" /></div>
                                    </div>
                                </section>

                                <section className="space-y-4 border-t border-slate-200 pt-5">
                                    <div className="flex items-center justify-between gap-3">
                                        <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-950">Pricing</p><p className="mt-1 text-xs text-slate-500">{vehicleOptions.find((option) => option.type === vehicleType)?.label} vehicle</p></div>
                                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{getDiscount(selectedDraft.pricing[vehicleType]) == null ? 'No discount' : `${getDiscount(selectedDraft.pricing[vehicleType])}% OFF`}</span>
                                    </div>
                                    <div className="grid gap-4 sm:grid-cols-3">
                                        <div><Label className="mb-1.5 block text-xs text-slate-600">Current price</Label><MoneyInput label="Current price" value={selectedDraft.pricing[vehicleType].base} onChange={(value) => updatePrice(selectedDraft.key, 'base', value)} /></div>
                                        <div><Label className="mb-1.5 block text-xs text-slate-600">Original price</Label><MoneyInput label="Original price" value={selectedDraft.pricing[vehicleType].original} onChange={(value) => updatePrice(selectedDraft.key, 'original', value)} /></div>
                                        <div><Label className="mb-1.5 block text-xs text-slate-600">Add-on price</Label><MoneyInput label="Add-on price" value={selectedDraft.pricing[vehicleType].addon} onChange={(value) => updatePrice(selectedDraft.key, 'addon', value)} /></div>
                                    </div>
                                </section>

                                <section className="flex items-center justify-between gap-4 border-t border-slate-200 pt-5">
                                    <div><p className="text-sm font-bold text-slate-950">Package status</p><p className="mt-1 text-xs text-slate-500">Inactive packages are unavailable for new customer bookings.</p></div>
                                    <div className="flex items-center gap-3">
                                        <span className={cn('text-xs font-semibold', selectedDraft.status === 'Active' ? 'text-emerald-700' : 'text-slate-500')}>{selectedDraft.status}</span>
                                        <Switch checked={selectedDraft.status === 'Active'} disabled={!selectedDraft.serviceId} onCheckedChange={(checked) => updateDraft(selectedDraft.key, (draft) => ({ ...draft, status: checked ? 'Active' : 'Inactive' }))} className="data-[state=checked]:bg-emerald-600" />
                                    </div>
                                </section>
                            </div>

                            <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
                                <p className="text-xs font-medium text-slate-500">Changes remain pending until Save All.</p>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" onClick={() => setSelectedPackageKey(null)} className="h-9 rounded-xl border-slate-200 bg-white">Done</Button>
                                    <Button onClick={handleSaveAll} disabled={!hasUnsavedChanges || saving} className="h-9 rounded-xl bg-blue-600 px-4 hover:bg-blue-700">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save All</Button>
                                </div>
                            </div>
                        </>
                    ) : null}
                </SheetContent>
            </Sheet>

            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                <DialogContent overlayClassName="bg-slate-950/75" className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-[1480px] gap-0 overflow-hidden rounded-[22px] border-0 bg-slate-100 p-0 shadow-2xl">
                    <DialogHeader className="border-b border-slate-200 bg-white px-5 py-4 pr-12 text-left">
                        <DialogTitle className="text-lg font-bold text-slate-950">Customer package preview</DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">Preview only — pending changes are shown but are not published until you save.</DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[calc(92vh-76px)] overflow-y-auto p-3 sm:p-4">
                        <AdminServicesLivePreview services={services} packages={previewPackages} vehicleType={previewVehicleType} onVehicleTypeChange={setPreviewVehicleType} selectedPackageKey={selectedPackageKey} />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
