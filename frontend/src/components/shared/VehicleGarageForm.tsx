import React from 'react';
import { AlertTriangle, Check, ChevronsUpDown } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getModelsForBrand, vehicleBrands } from '@/data/vehicleData';
import { patchVehicleForm } from '../../../../backend/constants/vehicleFormState.js';
import { useVehicleIntelligence } from '@/hooks/useVehicleIntelligence';
import { normalizePlateNumber } from '@/lib/plate';
import {
  ADD_VEHICLE_TYPE_LABELS,
  BOOKING_YEAR_OPTIONS,
  CAR_BRANDS,
  getVehiclePriceKey,
  getVehiclePricingCategory,
  getVehiclePricingCategoryLabel,
  getVehiclePriceKeyForPricingCategory,
  type VehicleGarageFormValues,
} from './vehicle-garage-constants';

export type BookingPackageTile = {
  id: string;
  name: string;
  prices: Record<string, number | null>;
};

type Props = {
  values: VehicleGarageFormValues;
  onChange: React.Dispatch<React.SetStateAction<VehicleGarageFormValues>>;
  errors: Record<string, string>;
  onClearError: (field: keyof VehicleGarageFormValues) => void;
  showCustomColorInput: boolean;
  onShowCustomColorInput: (show: boolean) => void;
  /** Customer add modal vs compact (edit / sales) */
  variant: 'customer-rich' | 'compact';
  apiError?: string;
  showPricingPreview?: boolean;
  bookingPackages?: BookingPackageTile[];
  /** Bottom hint — omit for sales */
  footerHint?: React.ReactNode;
  /** Customer Add Vehicle only: searchable brand/model database */
  enableVehicleDatabase?: boolean;
  /** Customer add/edit use system-controlled classification; staff presentation stays separate. */
  experience?: 'default' | 'customer-add' | 'customer-edit';
};

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

type VehicleSearchSelectProps = {
  value: string;
  displayValue?: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  options: string[];
  onSelect: (value: string) => void;
  rich: boolean;
  hasError?: boolean;
  disabled?: boolean;
  optionLabels?: Record<string, string>;
  optionLogos?: Record<string, string>;
  onSearchChange?: (value: string) => void;
};

function VehicleSearchSelect({
  value,
  displayValue,
  placeholder,
  searchPlaceholder,
  emptyText,
  options,
  onSelect,
  rich,
  hasError = false,
  disabled = false,
  optionLabels = {},
  optionLogos = {},
  onSearchChange,
}: VehicleSearchSelectProps) {
  const [open, setOpen] = React.useState(false);
  const selectedLabel = displayValue || value;

  const triggerClass = rich
    ? cx(
        'customer-vehicle-combobox flex w-full appearance-none items-center justify-between rounded-2xl border px-3.5 py-2.5 text-left text-sm font-normal outline-none transition-[border-color,box-shadow,background-color] duration-200 bg-gradient-to-b from-white to-slate-50/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_1px_2px_rgba(15,23,42,0.04)] focus-visible:outline-none focus-visible:border-slate-200/90 focus-visible:shadow-[inset_0_1px_0_#fff,0_0_0_3px_rgba(148,163,184,0.14)] data-[state=open]:border-slate-200/90 data-[state=open]:shadow-[inset_0_1px_0_#fff,0_0_0_3px_rgba(148,163,184,0.14)]',
        hasError && 'customer-vehicle-combobox--error',
        hasError
          ? 'border-red-100/95 bg-red-50/60 text-red-800 focus-visible:border-red-200/90'
          : selectedLabel
            ? 'border-slate-100 text-slate-900 hover:border-slate-200/90'
            : 'border-slate-100 text-slate-400 hover:border-slate-200/90',
        disabled && 'cursor-not-allowed opacity-60'
      )
    : cx(
        'flex w-full items-center justify-between rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80 px-3.5 py-2.5 text-left text-sm outline-none transition-[border-color,box-shadow,background-color] duration-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_1px_2px_rgba(15,23,42,0.04)] focus-visible:border-slate-300/90 focus-visible:shadow-[inset_0_1px_0_#fff,0_0_0_3px_rgba(148,163,184,0.12)] data-[state=open]:border-slate-300/90 data-[state=open]:shadow-[inset_0_1px_0_#fff,0_0_0_3px_rgba(148,163,184,0.12)]',
        hasError
          ? 'border-red-200/90 bg-red-50/70 text-red-800'
          : selectedLabel
            ? 'text-slate-900 hover:border-slate-300/85'
            : 'text-slate-400 hover:border-slate-300/85',
        disabled && 'cursor-not-allowed opacity-60'
      );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={triggerClass} disabled={disabled} aria-expanded={open}>
          <span className="flex min-w-0 items-center gap-2 truncate">
            {value && optionLogos[value] ? <img src={optionLogos[value]} alt="" className="h-5 w-5 rounded-full object-contain" /> : null}
            <span className="truncate">{selectedLabel || placeholder}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="vehicle-search-popover z-[160] w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-2xl border-0 p-0 text-slate-900 shadow-[0_28px_72px_-18px_rgba(15,23,42,0.22),0_12px_36px_-20px_rgba(15,23,42,0.1)] outline-none ring-0"
      >
        <Command className="max-h-none !bg-transparent !text-slate-900 rounded-2xl border-0 shadow-none [&_[cmdk-group-heading]]:!text-slate-500 [&_[cmdk-input-wrapper]]:!border-b [&_[cmdk-input-wrapper]]:!border-white/25 [&_[cmdk-input-wrapper]]:!bg-white/20 [&_[cmdk-list]]:!bg-transparent [&_[cmdk-root]]:!bg-transparent">
          <CommandInput
            placeholder={searchPlaceholder}
            onValueChange={onSearchChange}
            className="h-11 !border-0 !bg-transparent !text-slate-900 placeholder:!text-slate-400"
          />
          <CommandList className="max-h-[280px] !bg-transparent [scrollbar-color:rgba(148,163,184,0.35)_transparent] [scrollbar-width:thin]">
            <CommandEmpty className="py-6 text-center text-sm text-slate-500">{emptyText}</CommandEmpty>
            <CommandGroup className="!text-slate-900">
              {options.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={() => {
                    onSelect(option);
                    setOpen(false);
                  }}
                  className="cursor-pointer rounded-lg px-3 py-2 text-sm !text-slate-800 aria-selected:!bg-white/45 aria-selected:!text-slate-900 data-[selected=true]:!bg-white/45 data-[selected=true]:!text-slate-900 data-[selected='true']:!bg-white/45 data-[selected='true']:!text-slate-900"
                >
                  <Check className={cx('mr-2 h-4 w-4 shrink-0 text-slate-400', value === option || displayValue === option ? 'opacity-100' : 'opacity-0')} />
                  {optionLogos[option] ? <img src={optionLogos[option]} alt="" className="mr-2 h-5 w-5 rounded-full object-contain" /> : null}
                  <span className="truncate">{optionLabels[option] || option}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function VehicleGarageForm({
  values: v,
  onChange,
  errors,
  onClearError,
  showCustomColorInput,
  onShowCustomColorInput,
  variant,
  apiError,
  showPricingPreview,
  bookingPackages = [],
  footerHint,
  enableVehicleDatabase = false,
  experience = 'default',
}: Props) {
  const { generations } = useVehicleIntelligence(v, enableVehicleDatabase, onChange);
  const set = (patch: Partial<VehicleGarageFormValues>) => {
    onChange((prev) => enableVehicleDatabase ? patchVehicleForm(prev, patch) : { ...prev, ...patch });
    onClearError('type');
  };

  const rich = variant === 'customer-rich';
  const customerAddExperience = experience === 'customer-add';
  const automaticClassification = enableVehicleDatabase && (customerAddExperience || experience === 'customer-edit');
  const detectedType = enableVehicleDatabase && v.classificationStatus === 'classified' ? v.type : '';
  const hasVehicleIdentity = Boolean(v.brand.trim() && v.model.trim());
  const needsClassificationReview = hasVehicleIdentity && !detectedType && v.classificationStatus !== 'loading';
  const pricingCategory = enableVehicleDatabase
    ? (v.classificationStatus === 'classified' ? v.pricingCategory : null)
    : getVehiclePricingCategory(v.type) || v.pricingCategory;
  const pricingCategoryLabel = getVehiclePricingCategoryLabel(pricingCategory);
  const displayClassification = enableVehicleDatabase
    ? (detectedType ? (pricingCategory === 'HATCHBACK_SMALL_CAR' ? 'Hatchback' : pricingCategoryLabel || detectedType) : needsClassificationReview ? 'Classification unavailable' : '')
    : v.type;
  const priceKey = getVehiclePriceKeyForPricingCategory(pricingCategory);
  const [customBrandMode, setCustomBrandMode] = React.useState(false);
  const [customModelMode, setCustomModelMode] = React.useState(false);
  const knownBrandModels = enableVehicleDatabase && !customBrandMode ? getModelsForBrand(v.brand) : [];
  const showCustomBrandInput = enableVehicleDatabase && customBrandMode;
  const showCustomModelInput = enableVehicleDatabase && (customBrandMode || customModelMode);
  const availableBookingPackages = React.useMemo(() => {
    if (!v.type) return [];
    if (!priceKey) return [];
    return bookingPackages.filter((pkg) => pkg.prices[priceKey] != null);
  }, [bookingPackages, v.type, priceKey]);

  React.useEffect(() => {
    if (!enableVehicleDatabase || !v.brand) return;
    if (!vehicleBrands.includes(v.brand)) setCustomBrandMode(true);
  }, [enableVehicleDatabase, v.brand]);

  React.useEffect(() => {
    if (!enableVehicleDatabase || customBrandMode || !v.brand || !v.model) return;
    const models = getModelsForBrand(v.brand);
    if (models.length > 0 && !models.includes(v.model)) setCustomModelMode(true);
  }, [customBrandMode, enableVehicleDatabase, v.brand, v.model]);

  const handleDatabaseBrandSelect = (brand: string) => {
    onClearError('brand');
    onClearError('model');
    if (brand === 'Other') {
      setCustomBrandMode(true);
      setCustomModelMode(false);
      set({ brand: '', model: '', type: '' });
      return;
    }

    setCustomBrandMode(false);
    setCustomModelMode(false);
    set({ brand, model: '', type: '' });
  };

  const handleDatabaseModelSelect = (model: string) => {
    onClearError('model');
    if (model === 'Other') {
      setCustomModelMode(true);
      set({ model: '' });
      return;
    }

    setCustomModelMode(false);
    set({ model });
    onClearError('type');
  };

  const colorHex: Record<string, string> = {
    White: '#e2e8f0',
    Black: '#1e293b',
    Silver: '#94a3b8',
    Gray: '#64748b',
    Blue: '#3b82f6',
    Red: '#ef4444',
    Green: '#22c55e',
    Yellow: '#eab308',
    Orange: '#f97316',
    Brown: '#92400e',
    Gold: '#d4a017',
    Purple: '#7e22ce',
    Pink: '#ec4899',
    Beige: '#d6c6a8',
    Bronze: '#a97142',
    'Two-Tone': '#64748b',
  };

  const previewPlate = v.plate ? normalizePlateNumber(v.plate) : 'Plate';
  const previewName = [v.year, v.brand, v.model].filter(Boolean).join(' ') || 'Your Vehicle';
  const previewGradient =
    v.color && colorHex[v.color]
      ? `linear-gradient(135deg, ${colorHex[v.color]}, ${colorHex[v.color]}dd)`
      : 'linear-gradient(135deg, #1e3a5f 0%, #334155 48%, #475569 100%)';
  const previewTextLight = !v.color || ['White', 'Silver', 'Yellow', ''].includes(v.color);

  const RichSectionLabel = ({
    children,
    description,
    icon,
    className = '',
  }: {
    children: React.ReactNode;
    description?: string;
    icon?: string;
    className?: string;
  }) => customerAddExperience ? (
    <div className={`customer-vehicle-section-label customer-vehicle-section-label--concierge ${className}`}>
      <div className="customer-vehicle-section-icon" aria-hidden>
        <iconify-icon icon={icon || 'solar:widget-2-linear'} width="16"></iconify-icon>
      </div>
      <div>
        <span>{children}</span>
        {description ? <p>{description}</p> : null}
      </div>
    </div>
  ) : (
    <div className={`customer-vehicle-section-label ${className}`}>
      <span>{children}</span>
    </div>
  );

  return (
    <>
      {apiError && (
        <div
          className={
            rich
              ? 'flex items-start gap-3 rounded-2xl border border-red-100/90 bg-red-50/85 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]'
              : 'flex items-start gap-2.5 rounded-xl border border-red-100/90 bg-red-50/85 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]'
          }
        >
          <iconify-icon icon="solar:danger-triangle-bold" width="16" style={{ color: '#dc2626', marginTop: '1px', flexShrink: 0 }} />
          <p className={`font-medium leading-relaxed text-red-700 ${rich ? 'text-[12px]' : 'text-[12px]'}`}>{apiError}</p>
        </div>
      )}

      {/* Preview */}
      {rich && customerAddExperience ? (
        <div className="customer-vehicle-identity-preview">
          <div className="customer-vehicle-identity-main">
            <div
              className="customer-vehicle-identity-icon"
              style={{ '--vehicle-preview-color': colorHex[v.color] || '#2563eb' } as React.CSSProperties}
              aria-hidden
            >
              <iconify-icon icon="solar:car-bold" width="24"></iconify-icon>
            </div>
            <div className="min-w-0 flex-1">
              <p className="customer-vehicle-identity-eyebrow">Live vehicle profile</p>
              <p className="customer-vehicle-identity-name">{previewName}</p>
              <p className="customer-vehicle-identity-helper">Your garage card updates as details are added.</p>
            </div>
          </div>
          <div className="customer-vehicle-identity-chips">
            {[
              { label: 'Plate', value: previewPlate, icon: 'solar:hashtag-linear' },
              { label: 'Brand', value: v.brand || 'Not selected', icon: 'solar:shield-check-linear' },
              { label: 'Class', value: displayClassification || 'Not selected', icon: 'solar:wheel-angle-linear' },
              { label: 'Color', value: v.color || 'Not selected', icon: 'solar:palette-linear', color: v.color ? colorHex[v.color] : undefined },
            ].map((item) => (
              <div key={item.label} className="customer-vehicle-identity-chip">
                {item.color ? (
                  <span className="customer-vehicle-identity-color" style={{ background: item.color }} aria-hidden />
                ) : (
                  <iconify-icon icon={item.icon} width="14" aria-hidden></iconify-icon>
                )}
                <span className="customer-vehicle-identity-chip-label">{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : rich ? (
        <div className="customer-vehicle-preview customer-vehicle-preview--premium overflow-hidden rounded-[1.625rem] border border-slate-200/60 bg-gradient-to-b from-white to-slate-50/90">
          <div className="border-b border-slate-200/50 bg-slate-50/80 px-4 py-2 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Live garage preview</p>
          </div>
          <div
            className="customer-vehicle-preview-hero relative overflow-hidden px-5 py-5"
            style={{ background: previewGradient }}
          >
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/12 blur-[1px]" />
            <div className="absolute -bottom-12 left-8 h-28 w-28 rounded-full bg-white/8" />
            <div className="relative flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_20px_-8px_rgba(0,0,0,0.2)] backdrop-blur-[2px]">
                <iconify-icon
                  icon="solar:car-bold"
                  width="30"
                  style={{
                    color: previewTextLight ? '#1e293b' : '#f8fafc',
                    opacity: 0.92,
                  }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[15px] font-bold tracking-tight"
                  style={{ color: previewTextLight ? '#1e293b' : '#f8fafc' }}
                >
                  {previewName}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-xl bg-white/25 px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wide shadow-sm"
                    style={{ color: previewTextLight ? '#1e293b' : '#f8fafc' }}
                  >
                    {previewPlate}
                  </span>
                  <span
                    className="rounded-xl bg-white/16 px-2.5 py-1 text-xs font-semibold backdrop-blur-[1px]"
                    style={{ color: previewTextLight ? '#1e293b' : '#f8fafc', opacity: 0.9 }}
                  >
                    {displayClassification || 'Vehicle class'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="customer-vehicle-preview-stats grid grid-cols-3 gap-2.5 bg-slate-50/50 p-3">
            {[
              { label: 'Brand', value: v.brand || 'Not set' },
              { label: 'Model', value: v.model || 'Not set' },
              { label: 'Color', value: v.color || 'Not set' },
            ].map((item) => (
              <div key={item.label} className="customer-vehicle-stat-tile min-w-0 rounded-2xl px-3 py-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{item.label}</p>
                <p className="mt-1 truncate text-xs font-bold text-slate-800">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        (v.brand || v.model || v.plate) && (
          <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/90 shadow-[0_10px_28px_-14px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.95)]">
            <div
              className="relative flex items-center gap-3 px-4 py-4"
              style={{
                background: `linear-gradient(135deg, ${colorHex[v.color] || '#94a3b8'}, ${(colorHex[v.color] || '#94a3b8')}dd)`,
              }}
            >
              <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/12" />
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
                <iconify-icon icon="solar:car-bold" width="28" style={{ color: '#f8fafc', opacity: 0.9 }} />
              </div>
              <div className="relative min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{previewName}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {v.plate && (
                    <span className="rounded-lg bg-white/22 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-white">
                      {normalizePlateNumber(v.plate)}
                    </span>
                  )}
                  {displayClassification && (
                    <span className="rounded-lg bg-white/16 px-2 py-0.5 text-[10px] font-semibold text-white/90">
                      {displayClassification}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="border-t border-slate-200/60 bg-gradient-to-b from-slate-50/95 to-white px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Live Preview
            </div>
          </div>
        )
      )}

      <div className={rich ? 'customer-vehicle-identity-primary space-y-3' : ''}>
        {rich ? (
          <RichSectionLabel
            icon="solar:card-2-linear"
            description={customerAddExperience ? 'The essentials used to identify this vehicle in your garage.' : undefined}
          >
            {customerAddExperience ? 'Vehicle Identity' : 'Required'}
          </RichSectionLabel>
        ) : null}
        <div className={rich ? 'grid grid-cols-1' : 'grid grid-cols-2 gap-3'}>
          <div className={rich ? '' : 'col-span-2'}>
            <label
              className={
                rich
                  ? 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500'
                  : 'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500'
              }
            >
              Plate number <span className="font-bold text-red-500 normal-case">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. ABC-1234"
              value={v.plate}
              onChange={(e) => {
                set({ plate: e.target.value.toUpperCase() });
                onClearError('plate');
              }}
              className={
                rich
                  ? `w-full rounded-2xl border px-3.5 py-2.5 font-mono text-sm uppercase tracking-widest text-slate-900 outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-slate-400/75 bg-gradient-to-b from-white to-slate-50/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_1px_2px_rgba(15,23,42,0.04)] ${
                      errors.plate
                        ? 'border-red-100/95 bg-red-50/60 focus:border-red-200/90 focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_0_0_3px_rgba(248,113,113,0.14)]'
                        : 'border-slate-100 focus:border-slate-200/90 focus:shadow-[inset_0_1px_0_#fff,0_0_0_3px_rgba(148,163,184,0.14)]'
                    }`
                  : `w-full rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80 px-3.5 py-2.5 text-sm uppercase tracking-widest text-slate-900 placeholder:text-slate-400/75 outline-none transition-[border-color,box-shadow] duration-200 font-mono shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_1px_2px_rgba(15,23,42,0.04)] ${
                      errors.plate
                        ? 'border-red-200/90 bg-red-50/70 focus:border-red-300 focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_0_0_3px_rgba(248,113,113,0.12)]'
                        : 'focus:border-slate-300/90 focus:shadow-[inset_0_1px_0_#fff,0_0_0_3px_rgba(148,163,184,0.12)]'
                    }`
              }
            />
            {errors.plate ? (
              <p className={`mt-1 text-[11px] text-red-500`}>{errors.plate}</p>
            ) : v.plate.trim() ? (
              (() => {
                const pn = normalizePlateNumber(v.plate);
                return pn.length >= 4 && pn.length <= 9 ? (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-500">
                    <iconify-icon icon="solar:check-circle-bold" width="11" /> Valid plate format
                  </p>
                ) : (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-500">
                    <iconify-icon icon="solar:info-circle-bold" width="11" /> 4–9 letters/numbers (spaces ignored)
                  </p>
                );
              })()
            ) : null}
          </div>
        </div>
      </div>

      <div className={rich ? 'customer-vehicle-brand-model grid grid-cols-1 gap-3.5 sm:grid-cols-2' : 'grid grid-cols-2 gap-3'}>
        <div>
          <label
            className={
              rich
                ? 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500'
                : 'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500'
            }
          >
            Brand <span className="font-bold text-red-500 normal-case">*</span>
          </label>
          {enableVehicleDatabase ? (
            <div className="space-y-2">
              <VehicleSearchSelect
                value={customBrandMode ? 'Other' : v.brand}
                displayValue={customBrandMode ? v.brand || 'Other brand' : v.brand}
                placeholder="Select brand"
                searchPlaceholder="Search brand..."
                emptyText="No brand found. Clear your search and choose Other to enter it."
                options={vehicleBrands}
                onSelect={handleDatabaseBrandSelect}
                rich={rich}
                hasError={Boolean(errors.brand)}
              />
              {showCustomBrandInput && (
                <input
                  type="text"
                  placeholder="Enter brand name"
                  value={v.brand}
                  onChange={(e) => {
                    set({ brand: e.target.value, model: '', type: '' });
                    onClearError('brand');
                  }}
                  className={
                    rich
                      ? `w-full rounded-2xl border px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-slate-400/75 bg-gradient-to-b from-white to-slate-50/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_1px_2px_rgba(15,23,42,0.04)] ${
                          errors.brand
                            ? 'border-red-100/95 bg-red-50/60 focus:border-red-200/90'
                            : 'border-slate-100 focus:border-slate-200/90'
                        }`
                      : `w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 outline-none transition-colors ${
                          errors.brand ? 'border-red-300 bg-red-50 focus:border-red-400' : 'border-gray-200 focus:border-gray-400'
                        }`
                  }
                />
              )}
            </div>
          ) : (
            <select
              value={v.brand}
              onChange={(e) => {
                set({ brand: e.target.value });
                onClearError('brand');
              }}
              className={
                rich
                  ? `w-full appearance-none rounded-2xl border px-3.5 py-2.5 text-sm outline-none transition-[border-color,box-shadow,background-color] duration-200 bg-gradient-to-b from-white to-slate-50/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_1px_2px_rgba(15,23,42,0.04)] ${
                      errors.brand
                        ? 'border-red-100/95 bg-red-50/60 text-red-800 focus:border-red-200/90 focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_0_0_3px_rgba(248,113,113,0.14)]'
                        : v.brand
                          ? 'border-slate-100 text-slate-900 focus:border-slate-200/90 focus:shadow-[inset_0_1px_0_#fff,0_0_0_3px_rgba(148,163,184,0.14)]'
                          : 'border-slate-100 text-slate-400 focus:border-slate-200/90 focus:shadow-[inset_0_1px_0_#fff,0_0_0_3px_rgba(148,163,184,0.14)]'
                    }`
                  : `w-full appearance-none rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${
                      errors.brand ? 'border-red-300 bg-red-50 text-red-700' : v.brand ? 'border-gray-200 text-gray-900' : 'border-gray-200 text-gray-400'
                    }`
              }
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%239ca3af' d='M8.12 9.29L12 13.17l3.88-3.88a.996.996 0 1 1 1.41 1.41l-4.59 4.59a.996.996 0 0 1-1.41 0L6.7 10.7a.996.996 0 0 1 0-1.41c.39-.38 1.03-.39 1.42 0z'/%3E%3C/svg%3E")`,
                backgroundPosition: 'right 8px center',
                backgroundSize: '16px',
                backgroundRepeat: 'no-repeat',
                paddingRight: '28px',
              }}
            >
              <option value="">Select brand</option>
              {v.brand && !CAR_BRANDS.includes(v.brand) && <option value={v.brand}>{v.brand}</option>}
              {CAR_BRANDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}
          {errors.brand && <p className="mt-1 text-[11px] text-red-500">{errors.brand}</p>}
        </div>
        <div>
          <label
            className={
              rich
                ? 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500'
                : 'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500'
            }
          >
            Model <span className="font-bold text-red-500 normal-case">*</span>
          </label>
          {enableVehicleDatabase ? (
            <div className="space-y-2">
              {!customBrandMode && (
                <VehicleSearchSelect
                  value={customModelMode ? 'Other' : v.model}
                  displayValue={customModelMode ? v.model || 'Other model' : v.model}
                  placeholder={v.brand ? 'Select model' : 'Select brand first'}
                  searchPlaceholder="Search model..."
                  emptyText="No model found. Clear your search and choose Other to enter it."
                  options={knownBrandModels.includes('Other') ? knownBrandModels : [...knownBrandModels, 'Other']}
                  onSelect={handleDatabaseModelSelect}
                  rich={rich}
                  hasError={Boolean(errors.model)}
                  disabled={!v.brand}
                />
              )}
              {showCustomModelInput && (
                <input
                  type="text"
                  placeholder={customBrandMode ? 'e.g. Vios, Civic, Ranger' : 'Enter model name'}
                  value={v.model}
                  onChange={(e) => {
                    const model = e.target.value;
                    set({ model });
                    onClearError('model');
                    onClearError('type');
                  }}
                  className={
                    rich
                      ? `w-full rounded-2xl border px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-slate-400/75 bg-gradient-to-b from-white to-slate-50/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_1px_2px_rgba(15,23,42,0.04)] ${
                          errors.model
                            ? 'border-red-100/95 bg-red-50/60 focus:border-red-200/90'
                            : 'border-slate-100 focus:border-slate-200/90'
                        }`
                      : `w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 outline-none transition-colors ${
                          errors.model ? 'border-red-300 bg-red-50 focus:border-red-400' : 'border-gray-200 focus:border-gray-400'
                        }`
                  }
                />
              )}
            </div>
          ) : (
            <input
              type="text"
              placeholder="e.g. Vios, Civic, Ranger"
              value={v.model}
              onChange={(e) => {
                set({ model: e.target.value });
                onClearError('model');
              }}
              className={
                rich
                  ? `w-full rounded-2xl border px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-slate-400/75 bg-gradient-to-b from-white to-slate-50/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_1px_2px_rgba(15,23,42,0.04)] ${
                      errors.model
                        ? 'border-red-100/95 bg-red-50/60 focus:border-red-200/90 focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_0_0_3px_rgba(248,113,113,0.14)]'
                        : 'border-slate-100 focus:border-slate-200/90 focus:shadow-[inset_0_1px_0_#fff,0_0_0_3px_rgba(148,163,184,0.14)]'
                    }`
                  : `w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 outline-none transition-colors ${
                      errors.model ? 'border-red-300 bg-red-50 focus:border-red-400' : 'border-gray-200 focus:border-gray-400'
                    }`
              }
            />
          )}
          {errors.model && <p className="mt-1 text-[11px] text-red-500">{errors.model}</p>}
        </div>
      </div>

      {rich && customerAddExperience ? (
        <RichSectionLabel
          className="customer-vehicle-specifications-label"
          icon="solar:tuning-square-2-linear"
          description="Automatic classification and optional service specifications."
        >
          Specifications
        </RichSectionLabel>
      ) : null}

      <div className={rich ? 'customer-vehicle-year-type grid grid-cols-1 gap-3.5 sm:grid-cols-2' : 'grid grid-cols-2 gap-3'}>
        <div>
          <label
            className={
              rich
                ? 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500'
                : 'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500'
            }
          >
            Year <span className="font-normal normal-case text-slate-400">(optional)</span>
          </label>
          <select
            value={v.year}
            onChange={(e) => set({ year: e.target.value })}
            className={
              rich
                ? `w-full appearance-none rounded-2xl border px-3.5 py-2.5 text-sm outline-none transition-[border-color,box-shadow] duration-200 bg-gradient-to-b from-white to-slate-50/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_1px_2px_rgba(15,23,42,0.04)] ${
                    v.year
                      ? 'border-slate-100 text-slate-900 focus:border-slate-200/90 focus:shadow-[inset_0_1px_0_#fff,0_0_0_3px_rgba(148,163,184,0.14)]'
                      : 'border-slate-100 text-slate-400 focus:border-slate-200/90 focus:shadow-[inset_0_1px_0_#fff,0_0_0_3px_rgba(148,163,184,0.14)]'
                  }`
                : `w-full appearance-none rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${
                    v.year ? 'border-gray-200 text-gray-900' : 'border-gray-200 text-gray-400'
                  }`
            }
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%239ca3af' d='M8.12 9.29L12 13.17l3.88-3.88a.996.996 0 1 1 1.41 1.41l-4.59 4.59a.996.996 0 0 1-1.41 0L6.7 10.7a.996.996 0 0 1 0-1.41c.39-.38 1.03-.39 1.42 0z'/%3E%3C/svg%3E")`,
              backgroundPosition: 'right 8px center',
              backgroundSize: '16px',
              backgroundRepeat: 'no-repeat',
              paddingRight: '28px',
            }}
          >
            <option value="">Year</option>
            {BOOKING_YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {enableVehicleDatabase && generations.length > 0 && (
            <label className="mt-2 block text-xs text-slate-500">
              Generation
              <select value={v.generation || ''} onChange={(e) => set({ generation: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
                <option value="">Select generation if known</option>
                {generations.map((generation) => <option key={generation} value={generation}>{generation}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className={automaticClassification ? 'order-first' : undefined}>
          <label
            className={
              rich
                ? 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500'
                : 'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500'
            }
          >
            {automaticClassification ? 'Vehicle Classification' : 'Type'} <span className="font-bold text-red-500 normal-case">*</span>
          </label>
          {automaticClassification ? (
            <div className="space-y-1.5">
              {detectedType ? (
                <div role="status" aria-live="polite" aria-atomic="true"
                  className="rounded-[14px] border border-emerald-100/90 bg-emerald-50/45 px-3.5 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-600">
                        <Check className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                      </span>
                      <span className="truncate text-sm font-semibold text-slate-900">{displayClassification}</span>
                    </span>
                    <span className="shrink-0 text-[10px] font-semibold text-emerald-700">Automatically detected</span>
                  </div>
                  {(v.bodyType || v.vehicleClass || v.segment || v.recommendedServiceCategory) ? (
                    <dl className="mt-2 grid grid-cols-1 gap-1 border-t border-emerald-100/80 pt-2 text-[11px] sm:grid-cols-2">
                      {v.bodyType ? <div><dt className="inline text-slate-500">Body Type: </dt><dd className="inline font-medium text-slate-700">{v.bodyType}</dd></div> : null}
                      {v.vehicleClass ? <div><dt className="inline text-slate-500">Vehicle Class: </dt><dd className="inline font-medium text-slate-700">{v.vehicleClass}</dd></div> : null}
                      {v.segment ? <div><dt className="inline text-slate-500">Segment: </dt><dd className="inline font-medium text-slate-700">{v.segment}</dd></div> : null}
                      {v.recommendedServiceCategory ? <div><dt className="inline text-slate-500">Service Category: </dt><dd className="inline font-medium text-slate-700">{v.recommendedServiceCategory}</dd></div> : null}
                    </dl>
                  ) : null}
                </div>
              ) : needsClassificationReview ? (
                <div id="vehicle-classification-status" role="status" aria-live="polite"
                  className="rounded-[14px] border border-amber-100 bg-amber-50/45 px-3.5 py-2.5 text-[11px]">
                  <p className="flex items-center gap-1.5 font-medium text-amber-700">
                    <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                    <span>{v.vehicleClass || 'Classification unavailable'}</span>
                  </p>
                  {(v.bodyType || v.vehicleClass || v.segment) ? (
                    <dl className="mt-2 space-y-1 border-t border-amber-100 pt-2 text-slate-600">
                      {v.bodyType ? <div><dt className="inline text-slate-500">Body Type: </dt><dd className="inline font-medium">{v.bodyType}</dd></div> : null}
                      {v.vehicleClass ? <div><dt className="inline text-slate-500">Vehicle Class: </dt><dd className="inline font-medium">{v.vehicleClass}</dd></div> : null}
                      {v.segment ? <div><dt className="inline text-slate-500">Segment: </dt><dd className="inline font-medium">{v.segment}</dd></div> : null}
                    </dl>
                  ) : null}
                  <p className="mt-1 font-normal text-slate-500">{v.vehicleClass
                    ? 'Body classification detected. Service pricing requires review.'
                    : 'Vehicle classification requires review before pricing.'}</p>
                </div>
              ) : (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex min-h-[39px] items-center rounded-[14px] border border-slate-200/80 bg-slate-50/60 px-3.5 py-2 text-xs text-slate-500"
                >
                  {v.classificationStatus === 'loading' && hasVehicleIdentity ? 'Checking vehicle classification…' : 'Select a brand and model to auto-detect'}
                </div>
              )}

            </div>
          ) : (
            <select
              value={v.type}
              onChange={(e) => {
                set({ type: e.target.value });
                onClearError('type');
              }}
              className={
                rich
                  ? `w-full appearance-none rounded-2xl border px-3.5 py-2.5 text-sm outline-none transition-[border-color,box-shadow,background-color] duration-200 bg-gradient-to-b from-white to-slate-50/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_1px_2px_rgba(15,23,42,0.04)] ${
                      errors.type
                        ? 'border-red-100/95 bg-red-50/60 text-red-800 focus:border-red-200/90'
                        : v.type
                          ? 'border-slate-100 text-slate-900 focus:border-slate-200/90'
                          : 'border-slate-100 text-slate-400 focus:border-slate-200/90'
                    }`
                  : `w-full appearance-none rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${
                      errors.type
                        ? 'border-red-300 bg-red-50 text-red-700 focus:border-red-400'
                        : v.type
                          ? 'border-gray-200 text-gray-900 focus:border-gray-400'
                          : 'border-gray-200 text-gray-400 focus:border-gray-400'
                    }`
              }
            >
              <option value="" disabled>Select...</option>
              {v.type && !ADD_VEHICLE_TYPE_LABELS.some((type) => type === v.type) && <option value={v.type}>{v.type}</option>}
              {ADD_VEHICLE_TYPE_LABELS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {errors.type && <p className="mt-1 text-[11px] text-red-500">{errors.type}</p>}
        </div>
      </div>

      {showPricingPreview && v.type && availableBookingPackages.length > 0 && (
        <>
          {rich ? (
            <div className="customer-vehicle-pricing-panel overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-4">
              <div className="mb-2.5 flex items-center gap-2">
                <iconify-icon icon="solar:tag-price-bold" width="14" style={{ color: '#f97316' }} />
                <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400/95">
                  {customerAddExperience ? `Available packages · ${pricingCategoryLabel} pricing` : `${v.type} pricing (linked to this vehicle)`}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(customerAddExperience ? availableBookingPackages : bookingPackages).map((pkg) => {
                  const packagePriceKey = priceKey || getVehiclePriceKey(v.type);
                  const price = pkg.prices[String(packagePriceKey)] ?? null;
                  return (
                    <div key={pkg.id} className="customer-vehicle-price-tile rounded-xl border border-white/[0.07] bg-white/[0.05] px-2.5 py-2">
                      <p className="mb-0.5 text-[10px] font-semibold leading-snug text-slate-400">{pkg.name.split('—')[0].trim()}</p>
                      <p className="text-sm font-bold tracking-tight text-white">{price === null ? 'N/A' : `₱${price.toLocaleString()}`}</p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2.5 text-center text-[10px] font-medium text-slate-500">
                {customerAddExperience ? 'Package estimates are ready for this vehicle class' : 'Shown rates apply when you book for this vehicle'}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-3.5 shadow-[0_12px_32px_-12px_rgba(15,23,42,0.45),inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-white/10">
              <div className="mb-2.5 flex items-center gap-2">
                <iconify-icon icon="solar:lock-keyhole-bold" width="12" style={{ color: '#fbbf24' }} />
                <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-amber-400/95">
                  {v.type} Pricing — Locked to this vehicle
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {bookingPackages.map((pkg) => {
                  const packagePriceKey = priceKey || getVehiclePriceKey(v.type);
                  const price = pkg.prices[String(packagePriceKey)] ?? null;
                  return (
                    <div
                      key={pkg.id}
                      className="rounded-xl border border-white/8 bg-white/[0.06] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                    >
                      <p className="mb-0.5 line-clamp-2 text-[10px] font-semibold leading-snug text-slate-400">
                        {pkg.name.split('—')[0].trim()}
                      </p>
                      <p className="text-sm font-black tracking-tight text-white">
                        {price === null ? 'N/A' : `₱${price.toLocaleString()}`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {rich ? (
        <RichSectionLabel
          className="customer-vehicle-appearance-label"
          icon="solar:palette-linear"
          description={customerAddExperience ? 'Choose the finish that makes this vehicle easy to recognize.' : undefined}
        >
          {customerAddExperience ? 'Appearance' : 'Optional'}
        </RichSectionLabel>
      ) : null}

      <div className="customer-vehicle-color-field">
        <label
          className={
            rich
              ? 'mb-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-500'
              : 'mb-1.5 block text-xs font-medium text-gray-600'
          }
        >
          Color <span className="font-normal normal-case text-slate-400">(optional)</span>
        </label>
        <div className={rich ? 'flex flex-wrap gap-2' : 'flex flex-wrap gap-2'}>
          {[
            { name: 'White', hex: '#f1f5f9' },
            { name: 'Black', hex: '#1e293b' },
            { name: 'Silver', hex: '#94a3b8' },
            { name: 'Gray', hex: '#64748b' },
            { name: 'Blue', hex: '#3b82f6' },
            { name: 'Red', hex: '#ef4444' },
            { name: 'Green', hex: '#22c55e' },
            { name: 'Yellow', hex: '#eab308' },
            { name: 'Orange', hex: '#f97316' },
            { name: 'Brown', hex: '#92400e' },
            { name: 'Gold', hex: '#d4a017' },
            { name: 'Purple', hex: '#7e22ce' },
            { name: 'Pink', hex: '#ec4899' },
            { name: 'Beige', hex: '#d6c6a8' },
            { name: 'Bronze', hex: '#a97142' },
            { name: 'Two-Tone', hex: '#64748b' },
          ].map((c) => {
            const sel = v.color === c.name && !showCustomColorInput;
            return rich ? (
              <button
                key={c.name}
                type="button"
                title={c.name}
                aria-label={c.name}
                aria-pressed={sel}
                onClick={() => {
                  set({ color: c.name });
                  onShowCustomColorInput(false);
                }}
                className={`customer-vehicle-color-chip flex shrink-0 items-center justify-center rounded-full border-0 shadow-[0_1px_3px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.25)] transition-all duration-200 outline-none ring-2 ${
                  customerAddExperience ? 'h-7 w-7' : 'h-8 w-8'
                } ${
                  sel ? 'ring-slate-400/55 ring-offset-2 ring-offset-white scale-[1.06]' : 'ring-white/80 ring-slate-200/50 hover:ring-slate-300/65'
                }`}
                style={{ background: c.hex }}
              >
                {sel && customerAddExperience ? (
                  <Check className={`h-3.5 w-3.5 ${['White', 'Silver', 'Yellow'].includes(c.name) ? 'text-slate-800' : 'text-white'}`} strokeWidth={3} />
                ) : null}
              </button>
            ) : (
              <button
                key={c.name}
                type="button"
                title={c.name}
                aria-label={c.name}
                aria-pressed={sel}
                onClick={() => {
                  set({ color: c.name });
                  onShowCustomColorInput(false);
                }}
                className={`h-8 w-8 shrink-0 rounded-full border-0 shadow-[0_1px_3px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.25)] transition-all duration-200 outline-none ring-2 ${
                  sel
                    ? 'ring-slate-500/50 ring-offset-2 ring-offset-white scale-[1.06]'
                    : 'ring-white/90 ring-slate-200/60 hover:ring-slate-300/70'
                }`}
                style={{ background: c.hex }}
              />
            );
          })}
          {rich ? (
            <button
              type="button"
              onClick={() => {
                onShowCustomColorInput(true);
                set({ color: '' });
              }}
              className={`${customerAddExperience ? 'h-7 px-3' : 'h-8 px-3.5'} shrink-0 rounded-full border text-[11px] font-semibold transition-all duration-200 shadow-[0_1px_2px_rgba(15,23,42,0.05)] ${
                showCustomColorInput
                  ? 'border-slate-200/70 bg-gradient-to-b from-slate-50 to-slate-100/80 text-slate-800 ring-2 ring-slate-300/35 ring-offset-2 ring-offset-white'
                  : 'border border-slate-100/90 bg-gradient-to-b from-white to-slate-50/70 text-slate-500 hover:border-slate-200/90 hover:text-slate-700'
              }`}
            >
              Other
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                onShowCustomColorInput(true);
                set({ color: '' });
              }}
              className={`h-8 shrink-0 rounded-full border px-3 text-[11px] font-semibold transition-all duration-200 shadow-[0_1px_2px_rgba(15,23,42,0.05)] ${
                showCustomColorInput
                  ? 'border-slate-300/70 bg-gradient-to-b from-slate-50 to-slate-100/80 text-slate-800 ring-2 ring-slate-300/35 ring-offset-2 ring-offset-white'
                  : 'border-slate-200/80 bg-gradient-to-b from-white to-slate-50/70 text-slate-500 hover:border-slate-300/80 hover:text-slate-700'
              }`}
            >
              Other
            </button>
          )}
        </div>
        {showCustomColorInput && (
          <input
            type="text"
            placeholder="e.g. Champagne Gold"
            value={v.color}
            onChange={(e) => set({ color: e.target.value })}
            className={
              rich
                ? 'mt-2.5 w-full rounded-2xl border border-slate-100 bg-gradient-to-b from-white to-slate-50/80 px-3.5 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_1px_2px_rgba(15,23,42,0.04)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-slate-400/75 focus:border-slate-200/90 focus:shadow-[inset_0_1px_0_#fff,0_0_0_3px_rgba(148,163,184,0.14)]'
                : 'mt-2.5 w-full rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80 px-3.5 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_1px_2px_rgba(15,23,42,0.04)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-slate-400/75 focus:border-slate-300/90 focus:shadow-[inset_0_1px_0_#fff,0_0_0_3px_rgba(148,163,184,0.12)]'
            }
            autoFocus
          />
        )}
        {v.color && !showCustomColorInput && (
          <p className={`mt-1.5 pl-0.5 text-[11px] text-slate-400`}>
            Selected: <span className="font-semibold text-slate-600">{v.color}</span>
          </p>
        )}
      </div>

      <div className={rich ? 'customer-vehicle-powertrain grid grid-cols-1 gap-3.5 sm:grid-cols-2' : 'grid grid-cols-2 gap-3'}>
        <div>
          <label
            className={
              rich
                ? 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500'
                : 'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500'
            }
          >
            Transmission <span className="font-normal normal-case text-slate-400">(optional)</span>
          </label>
          <select
            value={v.transmission}
            onChange={(e) => set({ transmission: e.target.value })}
            className={
              rich
                ? `w-full appearance-none rounded-2xl border px-3.5 py-2.5 text-sm outline-none transition-[border-color,box-shadow] duration-200 bg-gradient-to-b from-white to-slate-50/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_1px_2px_rgba(15,23,42,0.04)] ${
                    v.transmission
                      ? 'border-slate-100 text-slate-900 focus:border-slate-200/90 focus:shadow-[inset_0_1px_0_#fff,0_0_0_3px_rgba(148,163,184,0.14)]'
                      : 'border-slate-100 text-slate-400 focus:border-slate-200/90 focus:shadow-[inset_0_1px_0_#fff,0_0_0_3px_rgba(148,163,184,0.14)]'
                  }`
                : `w-full appearance-none rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${
                    v.transmission ? 'border-gray-200 text-gray-900' : 'border-gray-200 text-gray-400'
                  }`
            }
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%239ca3af' d='M8.12 9.29L12 13.17l3.88-3.88a.996.996 0 1 1 1.41 1.41l-4.59 4.59a.996.996 0 0 1-1.41 0L6.7 10.7a.996.996 0 0 1 0-1.41c.39-.38 1.03-.39 1.42 0z'/%3E%3C/svg%3E")`,
              backgroundPosition: 'right 8px center',
              backgroundSize: '16px',
              backgroundRepeat: 'no-repeat',
              paddingRight: '28px',
            }}
          >
            <option value="">Select...</option>
            <option value="Automatic">Automatic</option>
            <option value="Manual">Manual</option>
            <option value="CVT">CVT</option>
          </select>
        </div>
        <div>
          <label
            className={
              rich
                ? 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500'
                : 'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500'
            }
          >
            Fuel type <span className="font-normal normal-case text-slate-400">(optional)</span>
          </label>
          <select
            value={v.fuelType}
            onChange={(e) => set({ fuelType: e.target.value })}
            className={
              rich
                ? `w-full appearance-none rounded-2xl border px-3.5 py-2.5 text-sm outline-none transition-[border-color,box-shadow] duration-200 bg-gradient-to-b from-white to-slate-50/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_1px_2px_rgba(15,23,42,0.04)] ${
                    v.fuelType
                      ? 'border-slate-100 text-slate-900 focus:border-slate-200/90 focus:shadow-[inset_0_1px_0_#fff,0_0_0_3px_rgba(148,163,184,0.14)]'
                      : 'border-slate-100 text-slate-400 focus:border-slate-200/90 focus:shadow-[inset_0_1px_0_#fff,0_0_0_3px_rgba(148,163,184,0.14)]'
                  }`
                : `w-full appearance-none rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${
                    v.fuelType ? 'border-gray-200 text-gray-900' : 'border-gray-200 text-gray-400'
                  }`
            }
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%239ca3af' d='M8.12 9.29L12 13.17l3.88-3.88a.996.996 0 1 1 1.41 1.41l-4.59 4.59a.996.996 0 0 1-1.41 0L6.7 10.7a.996.996 0 0 1 0-1.41c.39-.38 1.03-.39 1.42 0z'/%3E%3C/svg%3E")`,
              backgroundPosition: 'right 8px center',
              backgroundSize: '16px',
              backgroundRepeat: 'no-repeat',
              paddingRight: '28px',
            }}
          >
            <option value="">Select...</option>
            <option value="Gasoline">Gasoline</option>
            <option value="Diesel">Diesel</option>
            <option value="Electric">Electric</option>
            <option value="Hybrid">Hybrid</option>
            <option value="PHEV">Plug-in Hybrid (PHEV)</option>
            <option value="HEV">Hybrid (HEV)</option>
            <option value="MHEV">Mild Hybrid (MHEV)</option>
            <option value="BEV">Battery Electric (BEV)</option>
            <option value="FCEV">Fuel Cell Electric (FCEV)</option>
          </select>
        </div>
      </div>

      {rich && footerHint && (
        <div className="customer-vehicle-footer-hint flex gap-3.5 rounded-2xl px-4 py-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200/60" aria-hidden>
            <iconify-icon icon="solar:calendar-mark-bold" width="18" style={{ color: '#475569' }} />
          </div>
          <div className="text-[12px] font-medium leading-relaxed text-slate-600">{footerHint}</div>
        </div>
      )}
    </>
  );
}
