import React, { useState } from 'react';
import { Search, User, Car, Phone, Mail, History } from 'lucide-react';
import { Customer, Vehicle } from '@/lib/salesData';

interface Props {
  customers: Customer[];
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

export default function CustomerVehiclePanel({
  customers, selectedCustomer, selectedVehicle, onSelectCustomer, onSelectVehicle,
}: Props) {
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = query.length >= 1
    ? customers.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.phone.includes(query) ||
        c.vehicles.some((v) => v.plate.toLowerCase().includes(query.toLowerCase()))
      )
    : customers;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden">
      <div className="px-4 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <User size={15} className="text-blue-700" />
          Customer & Vehicle
        </h3>

        {/* Customer Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, phone, plate…"
            value={query}
            onFocus={() => setShowDropdown(true)}
            onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
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
                    onMouseDown={() => { onSelectCustomer(c); setQuery(c.name); setShowDropdown(false); }}
                    className="w-full flex items-start gap-3 px-4 py-3 hover:bg-blue-50 transition-colors duration-100 text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                      {c.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-900">{c.name}</p>
                      <p className="text-[11px] text-slate-500">{c.phone}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{c.vehicles.map((v) => v.plate).join(', ')}</p>
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

      {/* Selected Customer Info */}
      {selectedCustomer ? (
        <div className="flex-1 overflow-y-auto">
          {/* Customer Card */}
          <div className="px-4 py-4 border-b border-slate-100">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center text-white text-sm font-bold shrink-0">
                {selectedCustomer.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-slate-900 truncate">{selectedCustomer.name}</p>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border capitalize ${TIER_COLORS[selectedCustomer.tier]}`}>
                    {selectedCustomer.tier}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <Phone size={10} className="text-slate-400" />
                  <p className="text-[11px] text-slate-500">{selectedCustomer.phone}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Mail size={10} className="text-slate-400" />
                  <p className="text-[11px] text-slate-500 truncate">{selectedCustomer.email}</p>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="bg-slate-50 rounded-lg p-2 text-center">
                <p className="text-sm font-bold text-slate-900">{selectedCustomer.visitCount}</p>
                <p className="text-[10px] text-slate-500">Visits</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-2 text-center">
                <p className="text-xs font-bold text-blue-700">
                  ₱{(selectedCustomer.totalSpent / 1000).toFixed(0)}k
                </p>
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
                  <span className="font-semibold">Note: </span>{selectedCustomer.notes}
                </p>
              </div>
            )}
          </div>

          {/* Vehicle Selector */}
          <div className="px-4 py-4 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-700 mb-2.5 flex items-center gap-1.5">
              <Car size={13} className="text-blue-700" />
              Select Vehicle
            </p>
            <div className="space-y-2">
              {selectedCustomer.vehicles.map((v) => (
                <button
                  key={`veh-sel-${v.id}`}
                  onClick={() => onSelectVehicle(v)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all duration-150 ${
                    selectedVehicle?.id === v.id
                      ? 'border-blue-400 bg-blue-50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selectedVehicle?.id === v.id ? 'bg-blue-100' : 'bg-slate-100'}`}>
                    <Car size={14} className={selectedVehicle?.id === v.id ? 'text-blue-700' : 'text-slate-500'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900">{v.plate}</p>
                    <p className="text-[11px] text-slate-500 truncate">{v.year} {v.make} {v.model}</p>
                    <p className="text-[10px] text-slate-400">{v.color} · {v.type}</p>
                  </div>
                  {selectedVehicle?.id === v.id && (
                    <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Recent Services */}
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
          <p className="text-xs text-slate-500">Search for a customer by name, phone number, or vehicle plate to begin a transaction.</p>
        </div>
      )}
    </div>
  );
}
