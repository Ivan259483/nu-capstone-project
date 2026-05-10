import { useEffect, useMemo, useState } from 'react';
import {
    BadgePercent,
    CarFront,
    CheckCircle2,
    Layers,
    Loader2,
    Package,
    Palette,
    RefreshCw,
    Save,
    Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DetailService } from '@/lib/detail-service-api';
import {
    VEHICLE_PRICE_FIELDS,
    getDefaultAddonPrice,
    getDefaultBasePrice,
    getDefaultOriginalPrice,
    getPackageKeyFromName,
    getServiceId,
    getServicePricingEntry,
    type ApiVehiclePriceKey,
    type ServiceCatalogCard,
} from '@/lib/service-pricing';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import type { Service } from '@/types';

interface ServicesPricingProps {
    services: Service[];
    onRefresh: () => void | Promise<void>;
}

type DraftField = 'basePrice' | 'originalPrice' | 'addonPrice';
type PriceDraft = Record<DraftField, string>;
type DraftsByVehicle = Record<ApiVehiclePriceKey, PriceDraft>;

const SPF_ORDER: Record<string, number> = {
    spf80: 1,
    spf89: 2,
    spf99: 3,
    spf101: 4,
};

const blankDraft = (): PriceDraft => ({
    basePrice: '',
    originalPrice: '',
    addonPrice: '',
});

const emptyDrafts = (): DraftsByVehicle =>
    VEHICLE_PRICE_FIELDS.reduce((acc, field) => {
        acc[field.apiKey] = blankDraft();
        return acc;
    }, {} as DraftsByVehicle);

type CatalogFormState = {
    badge: string;
    warrantyLabel: string;
    tagline: string;
    tierLabel: string;
    addonLabel: string;
    discountBadge: string;
    iconKey: string;
    accentFrom: string;
    accentTo: string;
    accentMid: string;
    featuresText: string;
    highlightedText: string;
    popular: boolean;
    flagship: boolean;
    originalPriceMultiplier: string;
};

const emptyCatalogForm = (): CatalogFormState => ({
    badge: '',
    warrantyLabel: '',
    tagline: '',
    tierLabel: '',
    addonLabel: '',
    discountBadge: '',
    iconKey: '',
    accentFrom: '',
    accentTo: '',
    accentMid: '',
    featuresText: '',
    highlightedText: '',
    popular: false,
    flagship: false,
    originalPriceMultiplier: '',
});

const catalogCardToForm = (card?: ServiceCatalogCard | null): CatalogFormState => {
    const base = emptyCatalogForm();
    if (!card) return base;
    return {
        badge: card.badge ?? '',
        warrantyLabel: card.warrantyLabel ?? '',
        tagline: card.tagline ?? '',
        tierLabel: card.tierLabel ?? '',
        addonLabel: card.addonLabel ?? '',
        discountBadge: card.discountBadge ?? '',
        iconKey: card.iconKey ?? '',
        accentFrom: card.accentFrom ?? '',
        accentTo: card.accentTo ?? '',
        accentMid: card.accentMid ?? '',
        featuresText: Array.isArray(card.features) ? card.features.join('\n') : '',
        highlightedText: Array.isArray(card.highlighted) ? card.highlighted.join('\n') : '',
        popular: !!card.popular,
        flagship: !!card.flagship,
        originalPriceMultiplier:
            card.originalPriceMultiplier != null && Number.isFinite(card.originalPriceMultiplier)
                ? String(card.originalPriceMultiplier)
                : '',
    };
};

/** Radix `<SelectItem>` cannot use `value=""` (empty string is reserved for clearing). */
const ICON_KEY_SELECT_BUILTIN = '__catalog_icon_builtin__';

const ICON_OPTIONS: { value: string; label: string }[] = [
    { value: ICON_KEY_SELECT_BUILTIN, label: 'Default (built-in for this package)' },
    { value: 'sparkles', label: 'Sparkles' },
    { value: 'shield', label: 'Shield' },
    { value: 'star', label: 'Star' },
    { value: 'crown', label: 'Crown' },
    { value: 'zap', label: 'Zap' },
];

const toInputValue = (value: number | null | undefined) => (value == null ? '' : String(value));

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

const buildDraftsFromService = (service: Service | undefined): DraftsByVehicle => {
    const drafts = emptyDrafts();
    if (!service) return drafts;

    const packageKey = getPackageKeyFromName(service.name);
    VEHICLE_PRICE_FIELDS.forEach((field) => {
        const entry = getServicePricingEntry(service, field.publicKey);
        const base = entry.base ?? getDefaultBasePrice(packageKey, field.publicKey);
        const original = entry.original ?? getDefaultOriginalPrice(base, packageKey, field.publicKey);
        const addon = entry.addon ?? getDefaultAddonPrice(packageKey, field.publicKey);

        drafts[field.apiKey] = {
            basePrice: toInputValue(base),
            originalPrice: toInputValue(original),
            addonPrice: toInputValue(addon),
        };
    });

    return drafts;
};

export function ServicesPricing({ services, onRefresh }: ServicesPricingProps) {
    const [selectedServiceId, setSelectedServiceId] = useState('');
    const [selectedVehicle, setSelectedVehicle] = useState<ApiVehiclePriceKey>('sedan');
    const [drafts, setDrafts] = useState<DraftsByVehicle>(() => emptyDrafts());
    const [savingVehicle, setSavingVehicle] = useState<ApiVehiclePriceKey | null>(null);
    const [savingAll, setSavingAll] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [catalogForm, setCatalogForm] = useState<CatalogFormState>(emptyCatalogForm);
    const [savingCatalog, setSavingCatalog] = useState(false);

    const serviceOptions = useMemo(() => {
        const spfServices = services.filter((service) => getPackageKeyFromName(service.name));
        const options = spfServices.length ? spfServices : services;

        return [...options].sort((a, b) => {
            const aOrder = SPF_ORDER[getPackageKeyFromName(a.name) || ''] || 99;
            const bOrder = SPF_ORDER[getPackageKeyFromName(b.name) || ''] || 99;
            return aOrder - bOrder || a.name.localeCompare(b.name);
        });
    }, [services]);

    useEffect(() => {
        if (!serviceOptions.length) {
            setSelectedServiceId('');
            return;
        }

        if (!serviceOptions.some((service) => getServiceId(service) === selectedServiceId)) {
            setSelectedServiceId(getServiceId(serviceOptions[0]));
        }
    }, [selectedServiceId, serviceOptions]);

    const selectedService = useMemo(
        () => serviceOptions.find((service) => getServiceId(service) === selectedServiceId),
        [selectedServiceId, serviceOptions],
    );

    useEffect(() => {
        setDrafts(buildDraftsFromService(selectedService));
    }, [selectedService]);

    useEffect(() => {
        setCatalogForm(catalogCardToForm(selectedService?.catalogCard));
    }, [selectedService]);

    const selectedVehicleMeta = VEHICLE_PRICE_FIELDS.find((field) => field.apiKey === selectedVehicle) || VEHICLE_PRICE_FIELDS[1];
    const selectedDraft = drafts[selectedVehicle] || blankDraft();
    const activeServices = services.filter((service) => service.status === 'Active').length;
    const publishedServices = services.filter((service) => service.isPublished !== false).length;
    const selectedRange = useMemo(() => {
        const values = VEHICLE_PRICE_FIELDS
            .map((field) => Number((drafts[field.apiKey]?.basePrice || '').replace(/[₱,\s]/g, '')))
            .filter((value) => Number.isFinite(value) && value > 0);

        if (!values.length) return formatCurrency(selectedService?.basePrice || 0);
        const min = Math.min(...values);
        const max = Math.max(...values);
        return min === max ? formatCurrency(min) : `${formatCurrency(min)} - ${formatCurrency(max)}`;
    }, [drafts, selectedService?.basePrice]);

    const updateDraft = (vehicleKey: ApiVehiclePriceKey, field: DraftField, value: string) => {
        setDrafts((prev) => ({
            ...prev,
            [vehicleKey]: {
                ...(prev[vehicleKey] || blankDraft()),
                [field]: value,
            },
        }));
    };

    const buildPayload = (vehicleKey: ApiVehiclePriceKey) => {
        const draft = drafts[vehicleKey] || blankDraft();
        return {
            vehicleType: vehicleKey,
            basePrice: parseMoneyInput(draft.basePrice, 'Base price'),
            originalPrice: parseMoneyInput(draft.originalPrice, 'Original price'),
            addonPrice: parseMoneyInput(draft.addonPrice, 'Nano ceramic add-on price'),
        };
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await onRefresh();
        } finally {
            setRefreshing(false);
        }
    };

    const saveVehicle = async (vehicleKey: ApiVehiclePriceKey) => {
        const serviceId = selectedService ? getServiceId(selectedService) : '';
        if (!serviceId) {
            toast.error('Select a package first');
            return;
        }

        setSavingVehicle(vehicleKey);
        try {
            await DetailService.updateServicePricing(serviceId, buildPayload(vehicleKey));
            toast.success(`${selectedService?.name || 'Service'} ${VEHICLE_PRICE_FIELDS.find((field) => field.apiKey === vehicleKey)?.compactLabel || 'vehicle'} pricing saved`);
            await onRefresh();
        } catch (error: any) {
            toast.error(error?.response?.data?.message || error?.message || 'Failed to save pricing');
        } finally {
            setSavingVehicle(null);
        }
    };

    const saveAllVehicles = async () => {
        const serviceId = selectedService ? getServiceId(selectedService) : '';
        if (!serviceId) {
            toast.error('Select a package first');
            return;
        }

        setSavingAll(true);
        try {
            const payloads = VEHICLE_PRICE_FIELDS.map((field) => buildPayload(field.apiKey));
            for (const payload of payloads) {
                await DetailService.updateServicePricing(serviceId, payload);
            }
            toast.success(`All vehicle pricing saved for ${selectedService?.name || 'selected package'}`);
            await onRefresh();
        } catch (error: any) {
            toast.error(error?.response?.data?.message || error?.message || 'Failed to save all pricing');
        } finally {
            setSavingAll(false);
        }
    };

    const buildCatalogPayload = (): ServiceCatalogCard | null => {
        const out: ServiceCatalogCard = {};
        if (catalogForm.badge.trim()) out.badge = catalogForm.badge.trim();
        if (catalogForm.warrantyLabel.trim()) out.warrantyLabel = catalogForm.warrantyLabel.trim();
        if (catalogForm.tagline.trim()) out.tagline = catalogForm.tagline.trim();
        if (catalogForm.tierLabel.trim()) out.tierLabel = catalogForm.tierLabel.trim();
        if (catalogForm.addonLabel.trim()) out.addonLabel = catalogForm.addonLabel.trim();
        if (catalogForm.discountBadge.trim()) out.discountBadge = catalogForm.discountBadge.trim();
        if (catalogForm.accentFrom.trim()) out.accentFrom = catalogForm.accentFrom.trim();
        if (catalogForm.accentTo.trim()) out.accentTo = catalogForm.accentTo.trim();
        if (catalogForm.accentMid.trim()) out.accentMid = catalogForm.accentMid.trim();

        const icon = catalogForm.iconKey.trim();
        if (icon && ['sparkles', 'shield', 'star', 'crown', 'zap'].includes(icon)) {
            out.iconKey = icon as ServiceCatalogCard['iconKey'];
        }

        const lines = catalogForm.featuresText.split('\n').map((s) => s.trim()).filter(Boolean);
        if (lines.length) out.features = lines;

        const highlights = catalogForm.highlightedText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
        if (highlights.length) out.highlighted = highlights;

        const mult = catalogForm.originalPriceMultiplier.trim();
        if (mult !== '' && Number.isFinite(Number(mult))) {
            out.originalPriceMultiplier = Number(mult);
        }

        const hasStringsOrArrays =
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

        if (!hasStringsOrArrays && !catalogForm.popular && !catalogForm.flagship) {
            return null;
        }

        out.popular = catalogForm.popular;
        out.flagship = catalogForm.flagship;
        return out;
    };

    const saveCatalogCard = async () => {
        const serviceId = selectedService ? getServiceId(selectedService) : '';
        if (!serviceId) {
            toast.error('Select a package first');
            return;
        }

        setSavingCatalog(true);
        try {
            const catalogCard = buildCatalogPayload();
            await DetailService.updateService(serviceId, { catalogCard });
            toast.success(
                catalogCard
                    ? 'Website card saved. Open /services to verify (cache may take a moment).'
                    : 'Cleared custom card — built-in defaults apply on /services.',
            );
            await onRefresh();
        } catch (error: any) {
            toast.error(error?.response?.data?.message || error?.message || 'Failed to save website card');
        } finally {
            setSavingCatalog(false);
        }
    };

    if (!serviceOptions.length) {
        return (
            <div className="rounded-[28px] bg-white p-8 text-center shadow-[0_28px_90px_-28px_rgba(15,23,42,0.14),0_12px_40px_-18px_rgba(15,23,42,0.08)]">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                    <Package className="h-6 w-6" />
                </div>
                <h1 className="mt-4 text-xl font-bold text-slate-950">Service Pricing Management</h1>
                <p className="mt-2 text-sm text-slate-500">No service packages are loaded yet.</p>
                <Button onClick={handleRefresh} className="mt-5 bg-orange-500 text-white hover:bg-orange-600">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh services
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6 text-slate-900">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-600">Services catalog</p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">SPF packages & public pricing</h1>
                    <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
                        Step 1: edit what visitors see on the Services page. Step 2: set base, original strikethrough, and tint add-on per vehicle size. OFFICE ADMIN has the same access as the bootstrap administrator.
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="h-10 border-0 bg-white text-slate-700 shadow-[0_8px_28px_-8px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.05)] hover:bg-slate-50/90"
                >
                    {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Refresh
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                {[
                    { label: 'Packages', value: serviceOptions.length, icon: Package, tone: 'blue' },
                    { label: 'Active services', value: activeServices, icon: CheckCircle2, tone: 'green' },
                    { label: 'Vehicle types', value: VEHICLE_PRICE_FIELDS.length, icon: CarFront, tone: 'slate' },
                    { label: 'Published', value: publishedServices, icon: BadgePercent, tone: 'blue' },
                ].map((item) => {
                    const Icon = item.icon;
                    const toneClass =
                        item.tone === 'green'
                            ? 'bg-emerald-50 text-emerald-600'
                            : item.tone === 'blue'
                                ? 'bg-blue-50 text-blue-600'
                                : 'bg-slate-100 text-slate-600';

                    return (
                        <div
                            key={item.label}
                            className="rounded-2xl bg-white p-5 shadow-[0_10px_40px_-12px_rgba(15,23,42,0.12),0_4px_14px_-4px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_18px_48px_-14px_rgba(15,23,42,0.14)]"
                        >
                            <div className="flex items-center gap-3">
                                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClass}`}>
                                    <Icon className="h-5 w-5" />
                                </span>
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{item.label}</p>
                                    <p className="text-2xl font-bold text-slate-950">{item.value}</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <section className="overflow-hidden rounded-[28px] bg-white shadow-[0_28px_90px_-28px_rgba(15,23,42,0.14),0_12px_40px_-18px_rgba(15,23,42,0.08)]">
                <div className="bg-gradient-to-b from-white via-white to-slate-50/50 px-5 py-5 shadow-[inset_0_-1px_0_0_rgba(15,23,42,0.04)] sm:px-6">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div className="min-w-0 max-w-xl flex-1">
                            <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Package</Label>
                            <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                                <SelectTrigger className="mt-2 h-11 border-0 bg-slate-50/80 text-sm font-semibold text-slate-900 shadow-sm focus:ring-2 focus:ring-slate-900/10">
                                    <SelectValue placeholder="Select package" />
                                </SelectTrigger>
                                <SelectContent className="border-slate-200 bg-white text-slate-900">
                                    {serviceOptions
                                        .filter((service) => getServiceId(service))
                                        .map((service) => {
                                            const id = getServiceId(service);
                                            return (
                                                <SelectItem key={id} value={id}>
                                                    {service.name}
                                                </SelectItem>
                                            );
                                        })}
                                </SelectContent>
                            </Select>
                            <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                Packages are detected from the name (SPF 80, 89, 99, 101). Pick one, then use the tabs below to edit the marketing card and vehicle prices.
                            </p>
                        </div>
                    </div>
                </div>

                <Tabs defaultValue="card" className="w-full">
                    <div className="bg-slate-50/80 px-4 py-3 shadow-[inset_0_-1px_0_0_rgba(15,23,42,0.04)] sm:px-6">
                        <TabsList className="grid h-auto w-full max-w-lg grid-cols-2 gap-1 rounded-2xl bg-white/95 p-1 shadow-[0_8px_28px_-8px_rgba(15,23,42,0.1),0_2px_8px_rgba(15,23,42,0.04)] sm:inline-flex sm:w-auto">
                            <TabsTrigger value="card" className="rounded-xl px-3 py-2 text-xs font-semibold data-[state=active]:shadow-sm sm:text-sm">
                                1 · Website card
                            </TabsTrigger>
                            <TabsTrigger value="prices" className="rounded-xl px-3 py-2 text-xs font-semibold data-[state=active]:shadow-sm sm:text-sm">
                                2 · Vehicle prices
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="card" className="m-0 border-0 p-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0">
                        <div className="space-y-6 px-5 py-6 sm:px-8 sm:py-8">
                            <div className="rounded-2xl border border-transparent bg-violet-50/65 p-5 shadow-[0_12px_40px_-12px_rgba(109,40,217,0.14),0_4px_14px_-4px_rgba(15,23,42,0.05)]">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
                                        <Sparkles className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-900">Public Services page</p>
                                        <p className="mt-1 text-xs leading-relaxed text-slate-600">
                                            These fields control the luxury SPF cards on <span className="font-mono text-slate-800">/services</span>. Empty fields fall back to the app defaults. Saving with an empty form removes saved overrides for this package (pricing is not affected).
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Badge (top-left)</Label>
                                    <Input
                                        className="mt-2 h-10 border-0 bg-slate-50/80 shadow-sm focus-visible:ring-2 focus-visible:ring-slate-900/10"
                                        value={catalogForm.badge}
                                        onChange={(e) => setCatalogForm((f) => ({ ...f, badge: e.target.value }))}
                                        placeholder="e.g. SPECIAL OFFER"
                                    />
                                </div>
                                <div>
                                    <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Warranty line (top-right)</Label>
                                    <Input
                                        className="mt-2 h-10 border-0 bg-slate-50/80 shadow-sm focus-visible:ring-2 focus-visible:ring-slate-900/10"
                                        value={catalogForm.warrantyLabel}
                                        onChange={(e) => setCatalogForm((f) => ({ ...f, warrantyLabel: e.target.value }))}
                                        placeholder="e.g. 3 Years"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Tagline (under package name)</Label>
                                    <Input
                                        className="mt-2 h-10 border-0 bg-slate-50/80 shadow-sm focus-visible:ring-2 focus-visible:ring-slate-900/10"
                                        value={catalogForm.tagline}
                                        onChange={(e) => setCatalogForm((f) => ({ ...f, tagline: e.target.value }))}
                                        placeholder="Short subtitle"
                                    />
                                </div>
                                <div>
                                    <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Internal tier label</Label>
                                    <Input
                                        className="mt-2 h-10 border-0 bg-slate-50/80 shadow-sm focus-visible:ring-2 focus-visible:ring-slate-900/10"
                                        value={catalogForm.tierLabel}
                                        onChange={(e) => setCatalogForm((f) => ({ ...f, tierLabel: e.target.value }))}
                                        placeholder="Essential / Advanced…"
                                    />
                                </div>
                                <div>
                                    <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Card icon</Label>
                                    <Select
                                        value={
                                            catalogForm.iconKey.trim() === ''
                                                ? ICON_KEY_SELECT_BUILTIN
                                                : catalogForm.iconKey
                                        }
                                        onValueChange={(value) =>
                                            setCatalogForm((f) => ({
                                                ...f,
                                                iconKey: value === ICON_KEY_SELECT_BUILTIN ? '' : value,
                                            }))
                                        }
                                    >
                                        <SelectTrigger className="mt-2 h-10 border-0 bg-slate-50/80 shadow-sm focus:ring-2 focus:ring-slate-900/10">
                                            <SelectValue placeholder="Default" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {ICON_OPTIONS.map((opt) => (
                                                <SelectItem key={opt.value} value={opt.value}>
                                                    {opt.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Discount pill text</Label>
                                    <Input
                                        className="mt-2 h-10 border-0 bg-slate-50/80 shadow-sm focus-visible:ring-2 focus-visible:ring-slate-900/10"
                                        value={catalogForm.discountBadge}
                                        onChange={(e) => setCatalogForm((f) => ({ ...f, discountBadge: e.target.value }))}
                                        placeholder="e.g. 50% OFF — or leave empty to auto-calc"
                                    />
                                </div>
                                <div>
                                    <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Tint bundle line</Label>
                                    <Input
                                        className="mt-2 h-10 border-0 bg-slate-50/80 shadow-sm focus-visible:ring-2 focus-visible:ring-slate-900/10"
                                        value={catalogForm.addonLabel}
                                        onChange={(e) => setCatalogForm((f) => ({ ...f, addonLabel: e.target.value }))}
                                        placeholder="+ Nano Ceramic Window Tint"
                                    />
                                </div>
                                <div>
                                    <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Original price multiplier (fallback)</Label>
                                    <Input
                                        className="mt-2 h-10 border-0 bg-slate-50/80 shadow-sm focus-visible:ring-2 focus-visible:ring-slate-900/10"
                                        inputMode="decimal"
                                        value={catalogForm.originalPriceMultiplier}
                                        onChange={(e) => setCatalogForm((f) => ({ ...f, originalPriceMultiplier: e.target.value }))}
                                        placeholder="e.g. 2 when no original price set"
                                    />
                                </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-3">
                                <div>
                                    <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Accent from (hex)</Label>
                                    <Input
                                        className="mt-2 h-10 border-0 bg-slate-50/80 font-mono text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-slate-900/10"
                                        value={catalogForm.accentFrom}
                                        onChange={(e) => setCatalogForm((f) => ({ ...f, accentFrom: e.target.value }))}
                                        placeholder="#38bdf8"
                                    />
                                </div>
                                <div>
                                    <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Accent mid</Label>
                                    <Input
                                        className="mt-2 h-10 border-0 bg-slate-50/80 font-mono text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-slate-900/10"
                                        value={catalogForm.accentMid}
                                        onChange={(e) => setCatalogForm((f) => ({ ...f, accentMid: e.target.value }))}
                                        placeholder="#0ea5e9"
                                    />
                                </div>
                                <div>
                                    <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Accent to</Label>
                                    <Input
                                        className="mt-2 h-10 border-0 bg-slate-50/80 font-mono text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-slate-900/10"
                                        value={catalogForm.accentTo}
                                        onChange={(e) => setCatalogForm((f) => ({ ...f, accentTo: e.target.value }))}
                                        placeholder="#0284c7"
                                    />
                                </div>
                            </div>

                            <div>
                                <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">What&apos;s included — one line per bullet</Label>
                                <Textarea
                                    className="mt-2 min-h-[140px] border-0 bg-slate-50/80 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-slate-900/10"
                                    value={catalogForm.featuresText}
                                    onChange={(e) => setCatalogForm((f) => ({ ...f, featuresText: e.target.value }))}
                                    placeholder={'One feature per line, e.g.\n3 Layers Graphene…\nGraphene Sealant'}
                                />
                            </div>

                            <div>
                                <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Highlighted phrases (optional)</Label>
                                <Textarea
                                    className="mt-2 min-h-[72px] border-0 bg-slate-50/80 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-slate-900/10"
                                    value={catalogForm.highlightedText}
                                    onChange={(e) => setCatalogForm((f) => ({ ...f, highlightedText: e.target.value }))}
                                    placeholder="Comma or new line — substrings that get brighter styling inside the list"
                                />
                            </div>

                            <div className="flex flex-col gap-4 rounded-xl bg-slate-50/70 p-4 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.08),0_1px_4px_-1px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:gap-8">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="catalog-popular"
                                        checked={catalogForm.popular}
                                        onCheckedChange={(c) => setCatalogForm((f) => ({ ...f, popular: c === true }))}
                                    />
                                    <Label htmlFor="catalog-popular" className="cursor-pointer text-sm font-medium text-slate-800">
                                        Featured layout (recommended style)
                                    </Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="catalog-flagship"
                                        checked={catalogForm.flagship}
                                        onCheckedChange={(c) => setCatalogForm((f) => ({ ...f, flagship: c === true }))}
                                    />
                                    <Label htmlFor="catalog-flagship" className="cursor-pointer text-sm font-medium text-slate-800">
                                        Flagship layout (crown, strongest glow)
                                    </Label>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-3">
                                <Button
                                    type="button"
                                    onClick={() => void saveCatalogCard()}
                                    disabled={savingCatalog}
                                    className="bg-violet-600 font-bold text-white hover:bg-violet-700"
                                >
                                    {savingCatalog ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Palette className="mr-2 h-4 w-4" />}
                                    Save website card
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="border-0 bg-white shadow-[0_8px_28px_-8px_rgba(15,23,42,0.1),0_2px_8px_rgba(15,23,42,0.04)] hover:bg-slate-50/90"
                                    disabled={savingCatalog}
                                    onClick={() => setCatalogForm(catalogCardToForm(selectedService?.catalogCard))}
                                >
                                    Reload from server
                                </Button>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="prices" className="m-0 border-0 p-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0">
                        <div className="flex flex-col gap-4 bg-white px-5 py-4 shadow-[inset_0_-1px_0_0_rgba(15,23,42,0.04)] sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
                            <div className="min-w-[200px] max-w-xs flex-1">
                                <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Vehicle (quick editor)</Label>
                                <Select value={selectedVehicle} onValueChange={(value) => setSelectedVehicle(value as ApiVehiclePriceKey)}>
                                    <SelectTrigger className="mt-2 h-11 border-0 bg-slate-50/80 text-sm font-semibold text-slate-900 shadow-sm focus:ring-2 focus:ring-slate-900/10">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="border-slate-200 bg-white text-slate-900">
                                        {VEHICLE_PRICE_FIELDS.map((field) => (
                                            <SelectItem key={field.apiKey} value={field.apiKey}>
                                                {field.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Badge className="rounded-full border-0 bg-blue-50 px-3 py-1.5 text-blue-700 shadow-[0_2px_8px_-2px_rgba(37,99,235,0.2)] hover:bg-blue-50">
                                    {selectedRange}
                                </Badge>
                                <Badge className="rounded-full border-0 bg-emerald-50 px-3 py-1.5 text-emerald-700 shadow-[0_2px_8px_-2px_rgba(5,150,105,0.18)] hover:bg-emerald-50">
                                    Live catalog
                                </Badge>
                            </div>
                        </div>

                        <div className="grid gap-6 px-5 py-6 sm:px-6 xl:grid-cols-[0.9fr_1.1fr]">
                    <div className="rounded-2xl bg-slate-50/70 p-5 shadow-[0_10px_40px_-12px_rgba(15,23,42,0.1),0_4px_14px_-4px_rgba(15,23,42,0.05)]">
                        <div className="mb-5 flex items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-600/25">
                                <CarFront className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-950">{selectedService?.name}</p>
                                <p className="mt-1 text-xs font-semibold text-slate-500">{selectedVehicleMeta.label} pricing</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Base Price</Label>
                                <div className="relative mt-2">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₱</span>
                                    <Input
                                        inputMode="decimal"
                                        value={selectedDraft.basePrice}
                                        onChange={(event) => updateDraft(selectedVehicle, 'basePrice', event.target.value)}
                                        className="h-11 border-0 bg-slate-50/80 pl-8 text-base font-bold text-slate-950 shadow-sm focus-visible:ring-2 focus-visible:ring-slate-900/10"
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                            <div>
                                <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Original Price</Label>
                                <div className="relative mt-2">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₱</span>
                                    <Input
                                        inputMode="decimal"
                                        value={selectedDraft.originalPrice}
                                        onChange={(event) => updateDraft(selectedVehicle, 'originalPrice', event.target.value)}
                                        className="h-11 border-0 bg-slate-50/80 pl-8 text-base font-bold text-slate-950 shadow-sm focus-visible:ring-2 focus-visible:ring-slate-900/10"
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                            <div>
                                <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">+ Nano Ceramic Add-on Price</Label>
                                <div className="relative mt-2">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₱</span>
                                    <Input
                                        inputMode="decimal"
                                        value={selectedDraft.addonPrice}
                                        onChange={(event) => updateDraft(selectedVehicle, 'addonPrice', event.target.value)}
                                        className="h-11 border-0 bg-slate-50/80 pl-8 text-base font-bold text-slate-950 shadow-sm focus-visible:ring-2 focus-visible:ring-slate-900/10"
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                        </div>

                        <Button
                            onClick={() => saveVehicle(selectedVehicle)}
                            disabled={savingVehicle === selectedVehicle || savingAll}
                            className="mt-5 h-11 w-full bg-orange-500 font-bold text-white hover:bg-orange-600"
                        >
                            {savingVehicle === selectedVehicle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Save Changes
                        </Button>
                    </div>

                    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_10px_40px_-12px_rgba(15,23,42,0.1),0_4px_14px_-4px_rgba(15,23,42,0.05)]">
                        <div className="flex flex-col gap-3 bg-slate-50/40 px-5 py-4 shadow-[inset_0_-1px_0_0_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-sm font-bold text-slate-950">All Vehicle Types - {selectedService?.name || 'Package'}</p>
                                <p className="mt-1 text-xs font-semibold text-slate-500">Edit base, original, and add-on prices together.</p>
                            </div>
                            <Badge className="w-fit rounded-full border-0 bg-white px-3 py-1.5 text-slate-600 shadow-sm hover:bg-white">
                                <Layers className="mr-1.5 h-3.5 w-3.5" />
                                {VEHICLE_PRICE_FIELDS.length} tiers
                            </Badge>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[760px] text-sm">
                                <thead>
                                    <tr className="bg-slate-50/80 shadow-[inset_0_-1px_0_0_rgba(15,23,42,0.05)]">
                                        <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Vehicle</th>
                                        <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Base</th>
                                        <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Original</th>
                                        <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Nano Add-on</th>
                                        <th className="px-5 py-3 text-right text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {VEHICLE_PRICE_FIELDS.map((field) => {
                                        const draft = drafts[field.apiKey] || blankDraft();
                                        const isSaving = savingVehicle === field.apiKey;
                                        return (
                                            <tr
                                                key={field.apiKey}
                                                className={
                                                    selectedVehicle === field.apiKey
                                                        ? 'bg-blue-50/45 transition-colors hover:bg-blue-50/60'
                                                        : 'transition-colors even:bg-slate-50/[0.35] hover:bg-slate-50/70'
                                                }
                                            >
                                                <td className="px-5 py-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedVehicle(field.apiKey)}
                                                        className="text-left"
                                                    >
                                                        <span className="block font-bold text-slate-900">{field.compactLabel}</span>
                                                        <span className="text-xs font-semibold text-slate-400">{field.apiKey}</span>
                                                    </button>
                                                </td>
                                                {(['basePrice', 'originalPrice', 'addonPrice'] as DraftField[]).map((draftField) => (
                                                    <td key={draftField} className="px-3 py-3">
                                                        <div className="relative">
                                                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₱</span>
                                                            <Input
                                                                inputMode="decimal"
                                                                value={draft[draftField]}
                                                                onChange={(event) => updateDraft(field.apiKey, draftField, event.target.value)}
                                                                className="h-9 border-0 bg-slate-50/80 pl-7 text-sm font-bold text-slate-900 shadow-sm focus-visible:ring-2 focus-visible:ring-slate-900/10"
                                                                placeholder="0"
                                                            />
                                                        </div>
                                                    </td>
                                                ))}
                                                <td className="px-5 py-3 text-right">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => saveVehicle(field.apiKey)}
                                                        disabled={isSaving || savingAll}
                                                        className="h-9 border-0 bg-white text-slate-700 shadow-sm hover:bg-slate-50/90"
                                                    >
                                                        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end bg-slate-50/60 px-5 py-4 shadow-[inset_0_1px_0_0_rgba(15,23,42,0.04)]">
                            <Button
                                onClick={saveAllVehicles}
                                disabled={savingAll || !!savingVehicle}
                                className="h-10 bg-orange-500 font-bold text-white hover:bg-orange-600"
                            >
                                {savingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Save All Changes
                            </Button>
                        </div>
                    </div>
                </div>
                </TabsContent>
                </Tabs>
            </section>
        </div>
    );
}
