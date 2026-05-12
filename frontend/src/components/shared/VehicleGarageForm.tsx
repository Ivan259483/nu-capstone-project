import React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getModelsForBrand, getVehicleTypeForModel, vehicleBrands } from '@/data/vehicleData';
import { normalizePlateNumber } from '@/lib/plate';
import {
  ADD_VEHICLE_TYPE_LABELS,
  BOOKING_YEAR_OPTIONS,
  CAR_BRANDS,
  getVehiclePriceKey,
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
        'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm outline-none transition-colors',
        hasError ? 'border-red-300 bg-red-50 text-red-700' : selectedLabel ? 'border-gray-200 text-gray-900' : 'border-gray-200 text-gray-400',
        disabled && 'cursor-not-allowed opacity-60'
      );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={triggerClass} disabled={disabled} aria-expanded={open}>
          <span className="min-w-0 truncate">{selectedLabel || placeholder}</span>
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
                  <span className="truncate">{option}</span>
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
}: Props) {
  const set = (patch: Partial<VehicleGarageFormValues>) => {
    onChange((prev) => ({ ...prev, ...patch }));
  };

  const rich = variant === 'customer-rich';
  const [customBrandMode, setCustomBrandMode] = React.useState(false);
  const [customModelMode, setCustomModelMode] = React.useState(false);
  const knownBrandModels = enableVehicleDatabase && !customBrandMode ? getModelsForBrand(v.brand) : [];
  const showCustomBrandInput = enableVehicleDatabase && customBrandMode;
  const showCustomModelInput = enableVehicleDatabase && (customBrandMode || customModelMode);

  React.useEffect(() => {
    if (!enableVehicleDatabase || !v.brand) return;
    if (!vehicleBrands.includes(v.brand)) setCustomBrandMode(true);
  }, [enableVehicleDatabase, v.brand]);

  React.useEffect(() => {
    if (!enableVehicleDatabase || customBrandMode || !v.brand || !v.model) return;
    const models = getModelsForBrand(v.brand);
    if (models.length > 0 && !models.includes(v.model)) setCustomModelMode(true);
  }, [customBrandMode, enableVehicleDatabase, v.brand, v.model]);

  React.useEffect(() => {
    if (!enableVehicleDatabase || customModelMode || !v.model || v.type) return;
    const inferredType = getVehicleTypeForModel(v.model);
    if (inferredType) {
      set({ type: inferredType });
      onClearError('type');
    }
  }, [customModelMode, enableVehicleDatabase, onClearError, v.model, v.type]);

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

    const inferredType = getVehicleTypeForModel(model);
    setCustomModelMode(false);
    set({ model, ...(inferredType ? { type: inferredType } : {}) });
    if (inferredType) onClearError('type');
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
  };

  const previewPlate = v.plate ? normalizePlateNumber(v.plate) : 'Plate';
  const previewName = [v.year, v.brand, v.model].filter(Boolean).join(' ') || 'Your Vehicle';

  return (
    <>
      {apiError && (
        <div
          className={
            rich
              ? 'flex items-start gap-3 rounded-2xl border border-red-100/90 bg-red-50/85 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]'
              : 'flex items-start gap-2.5 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5'
          }
        >
          <iconify-icon icon="solar:danger-triangle-bold" width="16" style={{ color: '#dc2626', marginTop: '1px', flexShrink: 0 }} />
          <p className={`font-medium leading-relaxed text-red-700 ${rich ? 'text-[12px]' : 'text-[12px]'}`}>{apiError}</p>
        </div>
      )}

      {/* Preview */}
      {rich ? (
        <div className="customer-vehicle-preview overflow-hidden rounded-[26px] border border-white/70 bg-white/80">
          <div
            className="relative overflow-hidden px-5 py-5"
            style={{
              background: `linear-gradient(135deg, ${colorHex[v.color] || '#94a3b8'}, ${(colorHex[v.color] || '#94a3b8')}dd)`,
            }}
          >
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/15" />
            <div className="absolute -bottom-12 left-8 h-28 w-28 rounded-full bg-white/10" />
            <div className="relative flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]">
                <iconify-icon
                  icon="solar:car-bold"
                  width="30"
                  style={{
                    color: ['White', 'Silver', 'Yellow', ''].includes(v.color) ? '#1e293b' : '#f8fafc',
                    opacity: 0.9,
                  }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-bold"
                  style={{ color: ['White', 'Silver', 'Yellow', ''].includes(v.color) ? '#1e293b' : '#f8fafc' }}
                >
                  {previewName}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-lg bg-white/22 px-2.5 py-1 font-mono text-xs font-bold uppercase"
                    style={{ color: ['White', 'Silver', 'Yellow', ''].includes(v.color) ? '#1e293b' : '#f8fafc' }}
                  >
                    {previewPlate}
                  </span>
                  <span
                    className="rounded-lg bg-white/18 px-2.5 py-1 text-xs font-semibold"
                    style={{ color: ['White', 'Silver', 'Yellow', ''].includes(v.color) ? '#1e293b' : '#f8fafc', opacity: 0.86 }}
                  >
                    {v.type || 'Vehicle class'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="customer-vehicle-preview-stats grid grid-cols-3 gap-2 bg-white/72 p-2">
            {[
              { label: 'Brand', value: v.brand || 'Not set' },
              { label: 'Model', value: v.model || 'Not set' },
              { label: 'Color', value: v.color || 'Not set' },
            ].map((item) => (
              <div key={item.label} className="min-w-0 rounded-2xl bg-white/64 px-3 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                <p className="text-[11px] font-semibold text-slate-400">{item.label}</p>
                <p className="mt-0.5 truncate text-xs font-bold text-slate-700">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        (v.brand || v.model || v.plate) && (
          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
            <div
              style={{
                background: `linear-gradient(135deg, ${colorHex[v.color] || '#94a3b8'}, ${(colorHex[v.color] || '#94a3b8')}dd)`,
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <iconify-icon icon="solar:car-bold" width="36" style={{ color: '#f8fafc', opacity: 0.8, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#f8fafc',
                    lineHeight: 1.3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {previewName}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                  {v.plate && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#f8fafc',
                        opacity: 0.8,
                        letterSpacing: '0.05em',
                        background: 'rgba(255,255,255,0.2)',
                        padding: '1px 6px',
                        borderRadius: 4,
                      }}
                    >
                      {normalizePlateNumber(v.plate)}
                    </span>
                  )}
                  {v.type && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#f8fafc', opacity: 0.7 }}>{v.type}</span>
                  )}
                </div>
              </div>
            </div>
            <div
              style={{
                background: '#f8fafc',
                padding: '6px 16px',
                fontSize: 10,
                color: '#94a3b8',
                fontWeight: 500,
                textAlign: 'center',
              }}
            >
              Live Preview
            </div>
          </div>
        )
      )}

      <div className={rich ? 'grid grid-cols-1 gap-3.5 sm:grid-cols-2' : 'grid grid-cols-2 gap-3'}>
        <div>
          <label
            className={
              rich
                ? 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500'
                : 'mb-1 block text-xs font-medium text-gray-600'
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
                : `w-full rounded-lg border px-3 py-2 text-sm uppercase tracking-widest text-gray-900 placeholder:text-gray-300 outline-none transition-colors font-mono ${
                    errors.plate ? 'border-red-300 bg-red-50 focus:border-red-400' : 'border-gray-200 focus:border-gray-400'
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
        <div>
          <label
            className={
              rich
                ? 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500'
                : 'mb-1 block text-xs font-medium text-gray-600'
            }
          >
            Type <span className="font-bold text-red-500 normal-case">*</span>
          </label>
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
                      ? 'border-red-100/95 bg-red-50/60 text-red-800 focus:border-red-200/90 focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_0_0_3px_rgba(248,113,113,0.14)]'
                      : v.type
                        ? 'border-slate-100 text-slate-900 focus:border-slate-200/90 focus:shadow-[inset_0_1px_0_#fff,0_0_0_3px_rgba(148,163,184,0.14)]'
                        : 'border-slate-100 text-slate-400 focus:border-slate-200/90 focus:shadow-[inset_0_1px_0_#fff,0_0_0_3px_rgba(148,163,184,0.14)]'
                  }`
                : `w-full appearance-none rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${
                    errors.type
                      ? 'border-red-300 bg-red-50 text-red-700 focus:border-red-400'
                      : v.type
                        ? 'border-gray-200 text-gray-900 focus:border-gray-400'
                        : 'border-gray-200 text-gray-400 focus:border-gray-400'
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
            <option value="" disabled>
              Select...
            </option>
            {ADD_VEHICLE_TYPE_LABELS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {errors.type && <p className="mt-1 text-[11px] text-red-500">{errors.type}</p>}
        </div>
      </div>

      {showPricingPreview && v.type && bookingPackages.length > 0 && (
        <>
          {rich ? (
            <div className="customer-vehicle-pricing-panel overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-4">
              <div className="mb-2.5 flex items-center gap-2">
                <iconify-icon icon="solar:tag-price-bold" width="14" style={{ color: '#f97316' }} />
                <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400/95">
                  {v.type} pricing (linked to this vehicle)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {bookingPackages.map((pkg) => {
                  const priceKey = getVehiclePriceKey(v.type) as keyof typeof pkg.prices;
                  const price = pkg.prices[String(priceKey)] ?? null;
                  return (
                    <div key={pkg.id} className="customer-vehicle-price-tile rounded-xl border border-white/[0.07] bg-white/[0.05] px-2.5 py-2">
                      <p className="mb-0.5 text-[10px] font-semibold leading-snug text-slate-400">{pkg.name.split('—')[0].trim()}</p>
                      <p className="text-sm font-bold tracking-tight text-white">{price === null ? 'N/A' : `₱${price.toLocaleString()}`}</p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2.5 text-center text-[10px] font-medium text-slate-500">Shown rates apply when you book for this vehicle</p>
            </div>
          ) : (
            <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e293b)', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <iconify-icon icon="solar:lock-keyhole-bold" width="12" style={{ color: '#f59e0b' }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: '#f59e0b', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {v.type} Pricing — Locked to this vehicle
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {bookingPackages.map((pkg) => {
                  const priceKey = getVehiclePriceKey(v.type) as keyof typeof pkg.prices;
                  const price = pkg.prices[String(priceKey)] ?? null;
                  return (
                    <div key={pkg.id} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 10px' }}>
                      <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 2, lineHeight: 1.3 }}>
                        {pkg.name.split('—')[0].trim()}
                      </p>
                      <p style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: '-0.01em' }}>
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

      <div className={rich ? 'grid grid-cols-1 gap-3.5 sm:grid-cols-2' : 'grid grid-cols-2 gap-3'}>
        <div>
          <label
            className={
              rich
                ? 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500'
                : 'mb-1 block text-xs font-medium text-gray-600'
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
                emptyText="No brand found."
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
                    set({ brand: e.target.value, model: '' });
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
                : 'mb-1 block text-xs font-medium text-gray-600'
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
        </div>
      </div>

      <div>
        <label
          className={
            rich
              ? 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500'
              : 'mb-1 block text-xs font-medium text-gray-600'
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
                emptyText="No model found."
                options={knownBrandModels}
                onSelect={handleDatabaseModelSelect}
                rich={rich}
                hasError={Boolean(errors.model)}
                disabled={!v.brand || knownBrandModels.length === 0}
              />
            )}
            {showCustomModelInput && (
              <input
                type="text"
                placeholder={customBrandMode ? 'e.g. Vios, Civic, Ranger' : 'Enter model name'}
                value={v.model}
                onChange={(e) => {
                  set({ model: e.target.value });
                  onClearError('model');
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

      {/* Color */}
      <div>
        <label
          className={
            rich
              ? 'mb-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-500'
              : 'mb-1.5 block text-xs font-medium text-gray-600'
          }
        >
          Color <span className="font-normal normal-case text-slate-400">(optional)</span>
        </label>
        <div className={rich ? 'flex flex-wrap gap-2' : ''} style={rich ? undefined : { display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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
          ].map((c) => {
            const sel = v.color === c.name && !showCustomColorInput;
            return rich ? (
              <button
                key={c.name}
                type="button"
                title={c.name}
                onClick={() => {
                  set({ color: c.name });
                  onShowCustomColorInput(false);
                }}
                className={`h-8 w-8 shrink-0 rounded-full border-0 shadow-[0_1px_3px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.25)] transition-all duration-200 outline-none ring-2 ${
                  sel ? 'ring-slate-400/55 ring-offset-2 ring-offset-white scale-[1.06]' : 'ring-white/80 ring-slate-200/50 hover:ring-slate-300/65'
                }`}
                style={{ background: c.hex }}
              />
            ) : (
              <button
                key={c.name}
                type="button"
                title={c.name}
                onClick={() => {
                  set({ color: c.name });
                  onShowCustomColorInput(false);
                }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: sel ? '2.5px solid #0f172a' : '2px solid #e2e8f0',
                  background: c.hex,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  boxShadow: sel ? '0 0 0 2px #fff, 0 0 0 4px #0f172a' : 'none',
                  outline: 'none',
                  flexShrink: 0,
                }}
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
              className={`h-8 shrink-0 rounded-full border px-3.5 text-[11px] font-semibold transition-all duration-200 shadow-[0_1px_2px_rgba(15,23,42,0.05)] ${
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
              style={{
                height: 28,
                padding: '0 10px',
                borderRadius: 14,
                fontSize: 11,
                fontWeight: 600,
                border: showCustomColorInput ? '2px solid #0f172a' : '2px solid #e2e8f0',
                background: showCustomColorInput ? '#f8fafc' : '#fff',
                color: '#64748b',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
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
                : 'mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 outline-none focus:border-gray-400 transition-colors'
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

      <div className={rich ? 'grid grid-cols-1 gap-3.5 sm:grid-cols-2' : 'grid grid-cols-2 gap-3'}>
        <div>
          <label
            className={
              rich
                ? 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500'
                : 'mb-1 block text-xs font-medium text-gray-600'
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
                : 'mb-1 block text-xs font-medium text-gray-600'
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
          </select>
        </div>
      </div>

      {rich && footerHint && (
        <div className="flex gap-3.5 rounded-2xl border-0 bg-slate-50/90 px-4 py-3.5 ring-1 ring-slate-200/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
          <div className="shrink-0 pt-0.5" aria-hidden>
            <iconify-icon icon="solar:calendar-mark-bold" width="18" style={{ color: '#64748b' }} />
          </div>
          <div className="text-[12px] font-medium leading-relaxed text-slate-600">{footerHint}</div>
        </div>
      )}
    </>
  );
}
