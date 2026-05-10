import React, { useState } from 'react';
import {
  Search, Plus, Minus, Trash2, ShoppingCart, Tag, Loader2,
  Shield, Clock, Star, BadgeCheck, ChevronDown, ChevronUp,
} from 'lucide-react';
import { CartItem, formatPeso } from '@/lib/salesData';
import { BackendService, VehicleType, getEffectivePrice } from '@/hooks/useServices';
import { DEFAULT_SPF_ADDON_PRICES } from '@/lib/service-pricing';

// ── Vehicle type tab config ───────────────────────────────────────────────────
type VehicleTab = { key: VehicleType; label: string };

const VEHICLE_TABS: VehicleTab[] = [
  { key: 'hatchback', label: 'Hatchback' },
  { key: 'sedan',     label: 'Sedan' },
  { key: 'midsized',  label: 'Midsized' },
  { key: 'suv',       label: 'SUV' },
  { key: 'pickup',    label: 'Pick Up' },
  { key: 'largesuv',  label: 'Large SUV / Van' },
  { key: 'highend',   label: 'Highend Sedan' },
];

// ── SPF Package metadata (badge, tagline, warranty, tint prices) ──────────────
// Keyed by partial service name match
interface SPFMeta {
  badge: string;
  badgeColor: string;
  tagline: string;
  warranty: string;
  tintPrices: Partial<Record<VehicleType, number | null>>;
}

const SPF_META: { match: string; meta: SPFMeta }[] = [
  {
    match: 'SPF 80',
    meta: {
      badge: 'SPECIAL OFFER',
      badgeColor: 'bg-sky-100 text-sky-700 border-sky-200',
      tagline: 'Perfect entry-level protection',
      warranty: '3 Years',
      tintPrices: DEFAULT_SPF_ADDON_PRICES.spf80,
    },
  },
  {
    match: 'SPF 89',
    meta: {
      badge: 'RECOMMENDED',
      badgeColor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      tagline: 'Our most chosen package',
      warranty: '5 Years',
      tintPrices: DEFAULT_SPF_ADDON_PRICES.spf89,
    },
  },
  {
    match: 'SPF 99',
    meta: {
      badge: '50% OFF PROMO',
      badgeColor: 'bg-amber-100 text-amber-700 border-amber-200',
      tagline: 'Maximum protection, best price-to-value',
      warranty: '10 Years',
      tintPrices: DEFAULT_SPF_ADDON_PRICES.spf99,
    },
  },
  {
    match: 'SPF 101',
    meta: {
      badge: 'ALL-IN PACKAGE',
      badgeColor: 'bg-purple-100 text-purple-700 border-purple-200',
      tagline: 'The complete transformation experience',
      warranty: '10 Years',
      tintPrices: {},
    },
  },
];

function getSPFMeta(name: string): SPFMeta | null {
  const found = SPF_META.find((m) => name.includes(m.match));
  return found ? found.meta : null;
}

// ── Category badge colors ─────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  Exterior:           'bg-blue-100 text-blue-700',
  Interior:           'bg-pink-100 text-pink-700',
  Complete:           'bg-purple-100 text-purple-700',
  Engine:             'bg-amber-100 text-amber-700',
  Premium:            'bg-emerald-100 text-emerald-700',
  Detailing:          'bg-blue-100 text-blue-700',
  PPF:                'bg-purple-100 text-purple-700',
  Ceramic:            'bg-amber-100 text-amber-700',
  Tinting:            'bg-teal-100 text-teal-700',
  'Paint Correction': 'bg-red-100 text-red-700',
  Restoration:        'bg-orange-100 text-orange-700',
};

interface Props {
  services: BackendService[];
  servicesLoading: boolean;
  selectedVehicleType: VehicleType;
  onVehicleTypeChange: (vt: VehicleType) => void;
  isVehicleFromCustomer: boolean;    // true = type was auto-set from selected vehicle
  cartItems: CartItem[];
  onAddToCart: (id: string, withTint?: boolean) => void;
  onRemoveFromCart: (id: string) => void;
  onUpdateQty: (id: string, qty: number) => void;
}

export default function ServiceCartPanel({
  services,
  servicesLoading,
  selectedVehicleType,
  onVehicleTypeChange,
  isVehicleFromCustomer,
  cartItems,
  onAddToCart,
  onRemoveFromCart,
  onUpdateQty,
}: Props) {
  const [svcQuery, setSvcQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Search filter only
  const filteredServices = services.filter((s) =>
    s.name.toLowerCase().includes(svcQuery.toLowerCase()) ||
    s.category.toLowerCase().includes(svcQuery.toLowerCase())
  );

  const inCart = (id: string) => cartItems.some((c) => c.id === id);
  const activeVehicleLabel = VEHICLE_TABS.find((t) => t.key === selectedVehicleType)?.label ?? '';

  return (
    <div className="pos-service-cart-panel flex flex-1 flex-col overflow-hidden rounded-[22px] border bg-white ring-1 ring-white/80">

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <div className="pos-service-cart-header border-b px-4 pb-3 pt-4">

        {/* Title row */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <ShoppingCart size={15} />
            </span>
            Service Cart
          </h3>
          {cartItems.length > 0 && (
            <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 shadow-sm shadow-blue-100/50">
              {cartItems.length} item{cartItems.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search services…"
            value={svcQuery}
            onChange={(e) => setSvcQuery(e.target.value)}
            className="h-10 w-full rounded-xl border border-slate-200/70 bg-white pl-8 pr-3 text-xs text-slate-900 shadow-sm shadow-slate-200/35 transition-all duration-150 placeholder-slate-400 focus:border-blue-300 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
          />
        </div>

        {/* ── Vehicle Type Selector ─────────────────────────────────── */}
        {/* Auto-set indicator */}
        {isVehicleFromCustomer && (
          <div className="flex items-center gap-1.5 mb-2">
            <BadgeCheck size={11} className="text-emerald-500 shrink-0" />
            <p className="text-[10px] text-emerald-600 font-semibold">
              Auto-set from customer's vehicle
            </p>
          </div>
        )}
        <div className="flex items-center justify-start gap-1.5 overflow-x-auto rounded-2xl bg-slate-50/80 p-1.5 ring-1 ring-slate-100" style={{ scrollbarWidth: 'none' }}>
          {VEHICLE_TABS.map((tab) => {
            const active = selectedVehicleType === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => onVehicleTypeChange(tab.key)}
                className={`flex shrink-0 items-center justify-center rounded-xl border px-3.5 py-2 text-[11px] font-bold transition-all duration-200 ${
                  active
                    ? 'border-transparent bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-[0_8px_18px_rgba(245,158,11,0.24)]'
                    : 'border-transparent bg-transparent text-slate-500 hover:bg-white hover:text-slate-700 hover:shadow-sm'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ══ BODY ═══════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Cart Items (in-transaction) ──────────────────────────────────── */}
        {cartItems.length > 0 && (
          <div className="pos-service-cart-added border-b bg-slate-50/70">
            <div className="px-4 pt-2.5 pb-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                Added to Transaction
              </p>
            </div>
            <div className="max-h-44 space-y-2 overflow-y-auto px-3 pb-3">
              {cartItems.map((item) => (
                <div
                  key={`cart-item-${item.id}`}
                  className="grid items-center gap-2 rounded-2xl border border-slate-200/60 bg-white px-3 py-2.5 shadow-sm shadow-slate-200/35"
                  style={{ gridTemplateColumns: '1fr auto auto auto' }}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">{item.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[item.category] || 'bg-slate-100 text-slate-600'}`}>
                        {item.category}
                      </span>
                      <span className="text-[11px] text-slate-400">{formatPeso(item.price)}</span>
                      {/* Locked vehicle type badge */}
                      {(item as any).vehicleType && (
                        <span className="text-[9px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full">
                          {VEHICLE_TABS.find(t => t.key === (item as any).vehicleType)?.label ?? (item as any).vehicleType}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Qty controls */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onUpdateQty(item.id, item.quantity - 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors duration-100 hover:bg-slate-200"
                      >
                        <Minus size={11} />
                      </button>
                      <span className="w-5 text-center text-xs font-bold text-slate-900">{item.quantity}</span>
                      <button
                        onClick={() => onUpdateQty(item.id, item.quantity + 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors duration-100 hover:bg-slate-200"
                      >
                        <Plus size={11} />
                      </button>
                  </div>
                  {/* Line total */}
                  <p className="text-xs font-bold text-slate-900 text-right w-20">
                    {formatPeso(item.price * item.quantity)}
                  </p>
                  {/* Remove */}
                    <button
                      onClick={() => onRemoveFromCart(item.id)}
                      className="rounded-lg p-1.5 text-slate-300 transition-all duration-150 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 size={13} />
                    </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Service Catalog List ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {/* Catalog meta row */}
          <div className="pos-service-catalog-meta sticky top-0 z-10 flex items-center justify-between border-b bg-white/90 px-4 py-2.5 backdrop-blur-sm">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
              {servicesLoading ? 'Loading…' : `${filteredServices.length} service${filteredServices.length !== 1 ? 's' : ''}`}
            </p>
            {/* Active context badge */}
            <div className="flex items-center gap-1.5">
              {svcQuery && (
                <span className="max-w-[100px] truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  "{svcQuery}"
                </span>
              )}
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-sm"
                style={{ backgroundColor: '#fff3ed', color: '#e07040', border: '1px solid #fdd5b8' }}
              >
                {activeVehicleLabel}
              </span>
            </div>
          </div>

          {/* Loading */}
          {servicesLoading ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <Loader2 size={20} className="text-blue-400 animate-spin" />
              <p className="text-xs text-slate-400">Loading services…</p>
            </div>

          ) : filteredServices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
              <Tag size={22} className="text-slate-300 mb-2.5" />
              <p className="text-sm font-semibold text-slate-600">No services found</p>
              <p className="text-xs text-slate-400 mt-1">Try adjusting the search or vehicle type</p>
            </div>

          ) : (
            <div className="pos-service-list space-y-2 bg-slate-50/55 p-3">
              {filteredServices.map((svc) => {
                const added = inCart(svc._id);
                const price = getEffectivePrice(svc, selectedVehicleType);
                const hasVehiclePrice =
                  svc.prices?.[selectedVehicleType] != null && svc.prices[selectedVehicleType]! > 0;
                const spfMeta = getSPFMeta(svc.name);
                const tintPrice = spfMeta?.tintPrices[selectedVehicleType];
                const isExpanded = expandedId === svc._id;

                return (
                    <div
                      key={`catalog-${svc._id}`}
                      className={`pos-service-row rounded-2xl border px-4 py-3.5 transition-all duration-150 ${
                        added ? 'border-blue-200/70 bg-blue-50/80 shadow-[0_10px_24px_rgba(37,99,235,0.08)]' : 'border-slate-200/60 bg-white shadow-sm shadow-slate-200/35 hover:border-blue-100 hover:bg-white hover:shadow-[0_12px_26px_rgba(15,23,42,0.06)]'
                      }`}
                    >
                    {/* Main row */}
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Name + "In cart" badge */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className="truncate text-[13px] font-bold text-slate-900">{svc.name}</p>
                            {added && (
                              <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9.5px] font-bold text-blue-600">
                                In cart
                              </span>
                          )}
                        </div>

                        {/* Package badge + warranty */}
                        {spfMeta && (
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-black uppercase ${spfMeta.badgeColor}`}>
                                {spfMeta.badge}
                              </span>
                            <span className="flex items-center gap-0.5 text-[9px] font-semibold text-slate-500">
                              <Shield size={8} className="text-slate-400" />
                              {spfMeta.warranty}
                            </span>
                          </div>
                        )}

                        {/* Category + duration + base price notice */}
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${CATEGORY_COLORS[svc.category] || 'bg-slate-100 text-slate-600'}`}>
                              {svc.category}
                            </span>
                          {svc.duration && (
                            <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                              <Clock size={9} />
                              {svc.duration}
                            </span>
                          )}
                          {!hasVehiclePrice && price > 0 && (
                              <span className="rounded-md border border-amber-100 bg-amber-50 px-1 py-0.5 text-[9px] font-semibold text-amber-500">
                                base price
                              </span>
                          )}
                        </div>

                        {/* Tagline */}
                        {spfMeta && (
                          <p className="text-[10px] text-slate-400 italic mt-0.5">{spfMeta.tagline}</p>
                        )}
                      </div>

                      {/* Price + Add button */}
                        <div className="flex w-[104px] shrink-0 flex-col items-end">
                          <p className={`text-[13px] font-extrabold tabular-nums ${hasVehiclePrice ? 'text-slate-900' : 'text-slate-400'}`}>
                            {price > 0 ? formatPeso(price) : <span className="text-slate-300">—</span>}
                          </p>
                          <button
                            onClick={() => onAddToCart(svc._id)}
                            disabled={price === 0}
                            className={`mt-1.5 flex w-full items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-bold transition-all duration-150 ${
                              price === 0
                                ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                                : added
                                ? 'bg-blue-100 text-blue-700 shadow-sm shadow-blue-100/60 hover:bg-blue-200'
                                : 'bg-gradient-to-r from-blue-700 to-blue-600 text-white shadow-[0_8px_18px_rgba(37,99,235,0.22)] hover:from-blue-800 hover:to-blue-700 active:scale-95'
                            }`}
                          >
                          <Plus size={10} />
                          {price === 0 ? 'No price' : added ? 'Add again' : 'Add'}
                        </button>

                        {/* Tint add-on toggle */}
                            {spfMeta && tintPrice && (
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : svc._id)}
                              className="mt-1 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold text-teal-600 transition-colors hover:bg-teal-50 hover:text-teal-700"
                            >
                            + Tint
                            {isExpanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Tint add-on expanded panel */}
                    {isExpanded && spfMeta && tintPrice && (
                        <div className="mt-3 flex items-center justify-between rounded-2xl border border-teal-100 bg-teal-50/90 p-3 shadow-sm shadow-teal-100/50">
                        <div>
                          <p className="text-[10px] font-bold text-teal-800">+ Nano Ceramic Window Tint</p>
                          <p className="text-[9px] text-teal-600 mt-0.5">Bundle with {svc.name} · {activeVehicleLabel}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-[12px] font-bold text-teal-700">{formatPeso(tintPrice)}</p>
                          <button
                            onClick={() => { onAddToCart(svc._id, true); setExpandedId(null); }}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors active:scale-95"
                          >
                            Add Bundle
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
