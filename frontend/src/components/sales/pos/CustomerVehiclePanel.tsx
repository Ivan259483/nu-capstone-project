import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, User, Car, Phone, Mail, History, Plus, Pencil } from 'lucide-react';
import { Customer, Vehicle } from '@/lib/salesData';
import { vehicleHeadline } from '@/lib/vehicle-display';
import api from '@/lib/api';
import VehicleGarageForm from '@/components/shared/VehicleGarageForm';
import {
  emptyVehicleGarageForm,
  validateVehicleGarageForm,
  VEHICLE_COLOR_PRESETS,
  type VehicleGarageFormValues,
} from '@/components/shared/vehicle-garage-constants';
import {
  VehicleService,
  mapApiVehicleToPosVehicle,
  mapApiVehicleToGarageForm,
  garageFormToApiPayload,
} from '@/lib/vehicle-service';
import { normalizePlateNumber } from '@/lib/plate';
import { contactDirectorySubtitle, sanitizePhoneForDisplay } from '@/lib/pii-display';
import { resolveReceiptPhone } from '@/lib/receipt-phone';
import { toast } from 'sonner';

interface Props {
  selectedCustomer: Customer | null;
  selectedVehicle: Vehicle | null;
  onSelectCustomer: (c: Customer) => void;
  onSelectVehicle: (v: Vehicle) => void;
}

const TIER_COLORS: Record<string, string> = {
  bronze: 'text-amber-700 bg-amber-50 border-amber-200',
  silver: 'text-slate-600 bg-slate-100 border-slate-300',
  gold: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  platinum: 'text-blue-700 bg-blue-50 border-blue-200',
};

function dedupeCustomersByEmail(rows: Customer[]): Customer[] {
  const seen = new Set<string>();
  const out: Customer[] = [];
  for (const c of rows) {
    const email = (c.email || '').trim().toLowerCase();
    if (email) {
      if (seen.has(email)) continue;
      seen.add(email);
    }
    out.push(c);
  }
  return out;
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

/** Name, email, phone (with digit normalization), plate hints, loaded vehicles */
function matchesDirectoryQuery(c: Customer, rawQuery: string): boolean {
  const qt = rawQuery.trim();
  if (!qt) return true;
  const lower = qt.toLowerCase();
  if (c.name.toLowerCase().includes(lower)) return true;
  if ((c.email || '').toLowerCase().includes(lower)) return true;
  if ((c.phone || '').toLowerCase().includes(lower)) return true;
  const qDigits = digitsOnly(qt);
  if (qDigits.length > 0 && digitsOnly(c.phone || '').includes(qDigits)) return true;
  const npl = normalizePlateNumber(qt);
  if (npl.length >= 2) {
    if ((c.garagePlateHints || []).some((p) => normalizePlateNumber(p).includes(npl))) return true;
  }
  return c.vehicles.some(
    (v) =>
      vehicleHeadline(v).toLowerCase().includes(lower) ||
      (v.plate || '').toLowerCase().includes(lower) ||
      (npl.length >= 2 && normalizePlateNumber(v.plate || '').includes(npl))
  );
}

function mapUserRecordToCustomer(u: any): Customer {
  return {
    id: String(u._id || u.id),
    name: u.name || 'Customer',
    phone: sanitizePhoneForDisplay(resolveReceiptPhone(u) || ''),
    email: u.email || '',
    vehicles: [],
    totalSpent: 0,
    visitCount: 0,
    lastVisit: new Date().toISOString(),
    memberSince: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
    notes: '',
    tier: 'bronze',
    isSynthetic: false,
    garagePlateHints: Array.isArray(u.vehiclePlates) ? u.vehiclePlates.map(String) : [],
  };
}

export default function CustomerVehiclePanel({
  selectedCustomer,
  selectedVehicle,
  onSelectCustomer,
  onSelectVehicle,
}: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const [garageOpen, setGarageOpen] = useState(false);
  const [garageMode, setGarageMode] = useState<'add' | 'edit'>('add');
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [garageForm, setGarageForm] = useState<VehicleGarageFormValues>(emptyVehicleGarageForm);
  const [garageErrors, setGarageErrors] = useState<Record<string, string>>({});
  const [garageColorOther, setGarageColorOther] = useState(false);
  const [garageApiError, setGarageApiError] = useState('');
  const [garageSaving, setGarageSaving] = useState(false);

  const lastDirectoryFetchAt = useRef(0);

  const loadDirectory = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastDirectoryFetchAt.current < 30_000) return;
    lastDirectoryFetchAt.current = now;
    setLoadingUsers(true);
    try {
      const { data } = await api.get('/users');
      if (data.success && Array.isArray(data.data)) {
        const rows = data.data
          .filter((u: any) => (u.role || '').toLowerCase() === 'customer')
          .map(mapUserRecordToCustomer);
        setCustomers(dedupeCustomersByEmail(rows));
      } else {
        setCustomers([]);
      }
    } catch {
      setCustomers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    void loadDirectory(true);
  }, [loadDirectory]);

  const reloadCustomerVehicles = useCallback(
    async (cust: Customer): Promise<Vehicle[]> => {
      if (cust.isSynthetic) return cust.vehicles || [];
      setVehiclesLoading(true);
      try {
        const res = await VehicleService.getVehiclesForUser(cust.id);
        if (res.success && Array.isArray(res.data)) {
          return res.data.map(mapApiVehicleToPosVehicle);
        }
      } catch {
        /* silent */
      } finally {
        setVehiclesLoading(false);
      }
      return [];
    },
    []
  );

  const filtered =
    query.length >= 1 ? customers.filter((c) => matchesDirectoryQuery(c, query)) : customers;

  const handlePickCustomer = async (c: Customer) => {
    setQuery(c.name);
    setShowDropdown(false);
    if (c.isSynthetic) {
      onSelectCustomer(c);
      return;
    }
    const veh = await reloadCustomerVehicles(c);
    const hints = new Set(c.garagePlateHints || []);
    for (const v of veh) hints.add(normalizePlateNumber(v.plate || ''));
    onSelectCustomer({
      ...c,
      vehicles: veh,
      garagePlateHints: [...hints].filter(Boolean),
    });
  };

  const resetGarageFormState = () => {
    setGarageForm(emptyVehicleGarageForm());
    setGarageErrors({});
    setGarageApiError('');
    setGarageColorOther(false);
    setEditingVehicleId(null);
  };

  const closeGarageModal = (opts?: { force?: boolean }) => {
    if (!opts?.force && garageSaving) return;
    setGarageOpen(false);
    resetGarageFormState();
  };

  const openAddGarage = () => {
    if (!selectedCustomer || selectedCustomer.isSynthetic) return;
    setGarageMode('add');
    setEditingVehicleId(null);
    setGarageForm(emptyVehicleGarageForm());
    setGarageErrors({});
    setGarageApiError('');
    setGarageColorOther(false);
    setGarageOpen(true);
  };

  const applyGarageFormWithColorPreset = (form: VehicleGarageFormValues) => {
    const rawColor = (form.color || '').trim();
    const presetMatch = VEHICLE_COLOR_PRESETS.find((c) => c.toLowerCase() === rawColor.toLowerCase());
    setGarageColorOther(Boolean(rawColor && !presetMatch));
    setGarageForm({
      ...form,
      color: presetMatch || rawColor,
    });
  };

  const openEditGarage = async (v: Vehicle) => {
    if (!selectedCustomer || selectedCustomer.isSynthetic) return;
    setGarageMode('edit');
    setEditingVehicleId(v.id);
    setGarageErrors({});
    setGarageApiError('');
    try {
      const res = await VehicleService.getVehiclesForUser(selectedCustomer.id);
      const raw =
        res.success && Array.isArray(res.data)
          ? res.data.find((x: any) => String(x._id || x.id) === v.id)
          : null;
      if (raw) {
        applyGarageFormWithColorPreset(mapApiVehicleToGarageForm(raw));
      } else {
        applyGarageFormWithColorPreset({
          plate: v.plate,
          year: v.year ? String(v.year) : '',
          brand: v.make,
          model: v.model,
          color: v.color,
          type: v.type,
          transmission: '',
          fuelType: '',
        });
      }
      setGarageOpen(true);
    } catch {
      toast.error('Could not load vehicle details');
    }
  };

  const submitGarage = async () => {
    if (!selectedCustomer || selectedCustomer.isSynthetic) return;
    const errs = validateVehicleGarageForm(garageForm);
    if (Object.keys(errs).length > 0) {
      setGarageErrors(errs);
      return;
    }
    const plateNorm = normalizePlateNumber(garageForm.plate.trim());
    const payload = garageFormToApiPayload(garageForm, plateNorm);
    setGarageSaving(true);
    setGarageApiError('');
    try {
      if (garageMode === 'add') {
        const res = await VehicleService.addVehicleForUser(selectedCustomer.id, payload);
        if (!res.success) {
          setGarageApiError(res.message || 'Could not add vehicle.');
          return;
        }
        toast.success('Vehicle added to customer garage');
      } else if (editingVehicleId) {
        const res = await VehicleService.updateVehicle(editingVehicleId, payload);
        if (!res.success) {
          setGarageApiError(res.message || 'Could not update vehicle.');
          return;
        }
        toast.success('Vehicle updated');
      }
      const veh = await reloadCustomerVehicles(selectedCustomer);
      const hints = new Set(selectedCustomer.garagePlateHints || []);
      for (const v of veh) hints.add(normalizePlateNumber(v.plate || ''));
      const updated = {
        ...selectedCustomer,
        vehicles: veh,
        garagePlateHints: [...hints].filter(Boolean),
      };
      onSelectCustomer(updated);
      void loadDirectory(true);
      if (veh.length === 1) onSelectVehicle(veh[0]);
      if (garageMode === 'edit' && editingVehicleId) {
        const still = veh.find((x) => x.id === editingVehicleId);
        if (still) onSelectVehicle(still);
      }
      closeGarageModal({ force: true });
    } catch (e: any) {
      setGarageApiError(e?.response?.data?.message || 'Request failed');
    } finally {
      setGarageSaving(false);
    }
  };

  const canManageGarage = Boolean(selectedCustomer && !selectedCustomer.isSynthetic);

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden">
        <div className="px-4 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <User size={15} className="text-blue-700" />
            Customer & Vehicle
            {loadingUsers && <span className="text-[10px] font-normal text-slate-400">Loading directory…</span>}
          </h3>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search name, phone, plate…"
              value={query}
              onFocus={() => {
                setShowDropdown(true);
                void loadDirectory();
              }}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowDropdown(true);
              }}
              onBlur={() => setTimeout(() => setShowDropdown(false), 180)}
              className="w-full pl-8 py-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
            />

            {showDropdown && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-xs text-slate-500">No customer found for &quot;{query}&quot;</p>
                  </div>
                ) : (
                  filtered.map((c) => (
                    <button
                      key={`cust-opt-${c.id}`}
                      type="button"
                      onMouseDown={() => void handlePickCustomer(c)}
                      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-blue-50 transition-colors duration-100 text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                        {c.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-900">{c.name}</p>
                        <p className="text-[11px] text-slate-500 truncate">{contactDirectorySubtitle(c.phone, c.email)}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {c.vehicles.length ? c.vehicles.map((v) => vehicleHeadline(v)).join(', ') : '—'}
                        </p>
                      </div>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border capitalize ${TIER_COLORS[c.tier]}`}>
                        {c.tier}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {selectedCustomer ? (
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 py-4 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {selectedCustomer.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-900 truncate">{selectedCustomer.name}</p>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border capitalize ${TIER_COLORS[selectedCustomer.tier]}`}>
                      {selectedCustomer.tier}
                    </span>
                    {selectedCustomer.isSynthetic && (
                      <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        From booking
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Phone size={10} className="text-slate-400" />
                    <p className="text-[11px] text-slate-500">{sanitizePhoneForDisplay(selectedCustomer.phone) || '—'}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Mail size={10} className="text-slate-400" />
                    <p className="text-[11px] text-slate-500 truncate">{selectedCustomer.email || '—'}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="bg-slate-50 rounded-lg p-2 text-center">
                  <p className="text-sm font-bold text-slate-900">{selectedCustomer.visitCount}</p>
                  <p className="text-[10px] text-slate-500">Visits</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 text-center">
                  <p className="text-xs font-bold text-blue-700">₱{(selectedCustomer.totalSpent / 1000).toFixed(0)}k</p>
                  <p className="text-[10px] text-slate-500">Spent</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 text-center">
                  <p className="text-[10px] font-bold text-slate-900">
                    {new Date(selectedCustomer.lastVisit).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                  </p>
                  <p className="text-[10px] text-slate-500">Last visit</p>
                </div>
              </div>

              {selectedCustomer.notes && (
                <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    <span className="font-semibold">Note: </span>
                    {selectedCustomer.notes}
                  </p>
                </div>
              )}
            </div>

            <div className="px-4 py-4 border-b border-slate-100">
              <div className="flex items-center justify-between mb-2.5 gap-2">
                <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Car size={13} className="text-blue-700" />
                  Vehicles
                  {vehiclesLoading && <span className="text-[10px] font-normal text-slate-400">Syncing…</span>}
                </p>
                {canManageGarage && (
                  <button
                    type="button"
                    onClick={openAddGarage}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2 py-1 text-[10px] font-bold text-white shadow-sm hover:bg-blue-700"
                  >
                    <Plus size={12} />
                    Add
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {selectedCustomer.vehicles.length === 0 && !vehiclesLoading && (
                  <p className="text-[11px] text-slate-500 py-2">No vehicles on file. Add one to match customer garage.</p>
                )}
                {selectedCustomer.vehicles.map((v) => (
                  <div key={`veh-sel-${v.id}`} className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => onSelectVehicle(v)}
                      className={`flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all duration-150 ${
                        selectedVehicle?.id === v.id
                          ? 'border-blue-400 bg-blue-50 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          selectedVehicle?.id === v.id ? 'bg-blue-100' : 'bg-slate-100'
                        }`}
                      >
                        <Car size={14} className={selectedVehicle?.id === v.id ? 'text-blue-700' : 'text-slate-500'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{vehicleHeadline(v)}</p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {v.year ? `${v.year} ` : ''}
                          {v.make} {v.model}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {v.color} · {v.type}
                        </p>
                      </div>
                      {selectedVehicle?.id === v.id && (
                        <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        </div>
                      )}
                    </button>
                    {canManageGarage && (
                      <button
                        type="button"
                        title="Edit vehicle"
                        onClick={() => void openEditGarage(v)}
                        className="shrink-0 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="px-4 py-4">
              <p className="text-xs font-semibold text-slate-700 mb-2.5 flex items-center gap-1.5">
                <History size={13} className="text-slate-500" />
                Recent Services
              </p>
              <div className="space-y-2">
                {[
                  { key: 'hist-a', date: 'Apr 18', service: 'Full Detail + Ceramic 9H', amount: '₱18,000' },
                  { key: 'hist-b', date: 'Mar 12', service: 'PPF Partial + Window Tint', amount: '₱16,700' },
                  { key: 'hist-c', date: 'Feb 5', service: 'Exterior Wash & Wax', amount: '₱850' },
                ].map((h) => (
                  <div key={h.key} className="flex items-center justify-between py-1.5">
                    <div>
                      <p className="text-[11px] font-medium text-slate-700 truncate max-w-[140px]">{h.service}</p>
                      <p className="text-[10px] text-slate-400">{h.date}</p>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-700">{h.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <User size={22} className="text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-700 mb-1">No customer selected</p>
            <p className="text-xs text-slate-500">
              Search for a customer by name, phone, or plate. Garage edits use the same fields as the customer app.
            </p>
          </div>
        )}
      </div>

      {garageOpen &&
        createPortal(
          <div
            className="customer-modal-layer fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-xl sm:p-5"
            onClick={() => closeGarageModal()}
          >
            <div
              className="customer-modal-panel customer-vehicle-modal customer-vehicle-modal--premium flex w-full max-w-3xl flex-col overflow-hidden rounded-[1.75rem] border-0 bg-white"
              onClick={(e) => e.stopPropagation()}
              style={{
                animation: 'customerModalPanelIn .18s cubic-bezier(0.22,1,0.36,1) both',
                maxHeight: '94vh',
              }}
            >
              <div className="customer-vehicle-header flex shrink-0 items-center justify-between gap-4 border-0 px-5 py-4 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="customer-vehicle-header-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white">
                    <iconify-icon icon="solar:garage-bold" width="22" />
                  </div>
                  <div className="min-w-0">
                    <p className="customer-vehicle-eyebrow">Customer garage</p>
                    <h3 className="text-lg font-bold tracking-tight text-slate-950">
                      {garageMode === 'add' ? 'Add Vehicle' : 'Edit Vehicle'}
                    </h3>
                    <p className="mt-0.5 text-xs font-medium text-slate-500">
                      {selectedCustomer
                        ? `Same fields as the customer app — updates ${selectedCustomer.name.split(' ')[0] || 'customer'}'s garage.`
                        : 'Match the customer garage profile for POS.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={garageSaving}
                  onClick={closeGarageModal}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border-0 bg-white text-slate-500 shadow-md shadow-slate-900/10 transition-all duration-200 hover:bg-slate-50 hover:text-slate-900 hover:shadow-lg"
                  aria-label="Close"
                >
                  <iconify-icon icon="solar:close-circle-linear" width="18" />
                </button>
              </div>

              <form
                className="customer-modal-scroll customer-vehicle-form min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitGarage();
                }}
              >
                <VehicleGarageForm
                  variant="customer-rich"
                  values={garageForm}
                  onChange={setGarageForm}
                  errors={garageErrors}
                  onClearError={(field) => setGarageErrors((er) => ({ ...er, [field]: '' }))}
                  showCustomColorInput={garageColorOther}
                  onShowCustomColorInput={setGarageColorOther}
                  apiError={garageApiError}
                  enableVehicleDatabase
                  footerHint={
                    <>
                      Saved vehicles sync to the customer account and appear here in{' '}
                      <span className="font-semibold text-slate-800">Customer &amp; Vehicle</span> for POS.
                    </>
                  }
                />

                <div className="customer-modal-sticky customer-vehicle-actions sticky bottom-0 -mx-5 flex flex-col gap-3 border-0 bg-white/95 px-5 pt-4 shadow-[0_-12px_32px_-16px_rgba(15,23,42,0.08)] backdrop-blur sm:-mx-6 sm:flex-row sm:px-6">
                  <button
                    type="button"
                    disabled={garageSaving}
                    onClick={closeGarageModal}
                    className="flex-1 rounded-2xl border border-slate-200/75 bg-gradient-to-b from-white to-slate-50/90 py-3 text-sm font-medium text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.9)] transition-all hover:border-slate-300/85 hover:shadow-[0_4px_14px_-6px_rgba(15,23,42,0.1)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={garageSaving}
                    className="customer-vehicle-btn-primary flex-1 rounded-2xl py-3.5 text-sm font-semibold text-white transition-all duration-200 disabled:opacity-60"
                  >
                    {garageSaving ? 'Saving…' : garageMode === 'add' ? 'Add Vehicle' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
