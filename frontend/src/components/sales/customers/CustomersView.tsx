import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, Users, Phone, Mail, Car, Calendar, ChevronDown,
  ChevronRight, X, ShoppingBag, TrendingUp, Clock, Star,
  Filter, SortAsc, SortDesc, Eye, Hash,
} from 'lucide-react';
import api from '@/lib/api';
import { sanitizeVehiclePlate, vehicleHeadline } from '@/lib/vehicle-display';

// ── Types ─────────────────────────────────────────────────────────────────────
interface CustomerRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  vehiclePlate: string;
  vehicleInfo: string;
  totalSpent: number;
  totalOrders: number;
  lastVisit: string;
  status: 'active' | 'inactive';
  /** plate = sanitized real plate (may be empty); displayLabel = plate or year make model */
  vehicles: { plate: string; info: string; displayLabel: string }[];
  orders: OrderSummary[];
}

interface OrderSummary {
  id: string;
  orderNumber: string;
  date: string;
  services: string;
  total: number;
  status: string;
  paymentMethod: string;
}

type SortField = 'name' | 'totalSpent' | 'totalOrders' | 'lastVisit';

// ── CustomerDetail Drawer ─────────────────────────────────────────────────────
function CustomerDetail({ customer, onClose }: { customer: CustomerRecord; onClose: () => void }) {
  return createPortal(
    <>
      <style>{`
        @keyframes cvSlideIn {
          from { transform: translateX(calc(100% + 40px)); }
          to   { transform: translateX(0); }
        }
        @keyframes cvBackdropIn {
          from { opacity: 0; backdrop-filter: blur(0px); }
          to   { opacity: 1; backdrop-filter: blur(12px); }
        }
        .cv-drawer {
          animation: cvSlideIn 0.42s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .cv-backdrop {
          animation: cvBackdropIn 0.35s ease forwards;
        }
      `}</style>

      {/* Backdrop */}
      <div
        className="cv-backdrop fixed inset-0 z-[9998] bg-slate-900/25"
        onClick={onClose}
      />

      {/* Drawer — depth only; inner surfaces use shadow, no hairline borders */}
      <div
        className="cv-drawer fixed right-0 top-0 z-[9999] h-[100dvh] w-full max-w-md flex flex-col overflow-hidden bg-gradient-to-b from-white via-white to-slate-50/90 shadow-[-16px_0_48px_-8px_rgba(15,23,42,0.12)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 bg-white/95 backdrop-blur-md shrink-0 z-10 shadow-[0_12px_32px_-16px_rgba(15,23,42,0.08)]">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-semibold shadow-lg shadow-blue-600/20 shrink-0">
            {customer.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-slate-800 truncate">{customer.name}</h2>
            <p className="text-xs text-slate-500/90 truncate">{customer.email || 'No email'}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:bg-slate-100/80 transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-6 space-y-5">
          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: 'Total Spent', value: `₱${customer.totalSpent.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, icon: TrendingUp, color: 'text-blue-600 bg-blue-50/90' },
              { label: 'Orders', value: customer.totalOrders.toString(), icon: ShoppingBag, color: 'text-emerald-600 bg-emerald-50/90' },
              { label: 'Last Visit', value: customer.lastVisit ? new Date(customer.lastVisit).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—', icon: Calendar, color: 'text-amber-600 bg-amber-50/90' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl bg-white/70 p-3 text-center shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)] backdrop-blur-sm"
              >
                <div className={`w-9 h-9 rounded-xl ${stat.color} flex items-center justify-center mx-auto mb-2`}>
                  <stat.icon size={16} />
                </div>
                <p className="text-sm font-semibold text-slate-800 tracking-tight">{stat.value}</p>
                <p className="text-[10px] font-medium text-slate-500 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Contact Info */}
          <div className="rounded-2xl bg-white/50 px-4 py-3.5 shadow-[0_2px_16px_-6px_rgba(15,23,42,0.05)]">
            <h3 className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-2.5">Contact</h3>
            <div className="space-y-2">
              {customer.phone && (
                <div className="flex items-center gap-3 text-sm text-slate-700">
                  <Phone size={14} className="text-slate-400 shrink-0" />
                  <span>{customer.phone}</span>
                </div>
              )}
              {customer.email && (
                <div className="flex items-center gap-3 text-sm text-slate-700">
                  <Mail size={14} className="text-slate-400 shrink-0" />
                  <span className="truncate">{customer.email}</span>
                </div>
              )}
              {!customer.phone && !customer.email && (
                <p className="text-sm text-slate-400 italic">No contact information</p>
              )}
            </div>
          </div>

          {/* Vehicles */}
          <div>
            <h3 className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-2.5 px-0.5">
              Vehicles ({customer.vehicles.length})
            </h3>
            {customer.vehicles.length === 0 ? (
              <p className="text-sm text-slate-400 italic px-0.5">No vehicles registered</p>
            ) : (
              <div className="space-y-2">
                {customer.vehicles.map((v, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3.5 px-3.5 py-3 rounded-2xl bg-white/55 shadow-[0_2px_14px_-6px_rgba(15,23,42,0.06)] hover:bg-white/85 transition-colors cursor-default"
                  >
                    <div className="w-9 h-9 rounded-xl bg-blue-50/90 flex items-center justify-center shrink-0">
                      <Car size={16} className="text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 tracking-tight truncate">{v.displayLabel}</p>
                      {v.info && v.info !== v.displayLabel && (
                        <p className="text-[11px] font-medium text-slate-500 mt-0.5 truncate">{v.info}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Transaction History */}
          <div>
            <h3 className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-2.5 px-0.5">
              Transactions ({customer.orders.length})
            </h3>
            {customer.orders.length === 0 ? (
              <p className="text-sm text-slate-400 italic px-0.5">No transactions found</p>
            ) : (
              <div className="space-y-2.5">
                {customer.orders.map((order) => (
                  <div
                    key={order.id}
                    className="px-3.5 py-3.5 rounded-2xl bg-white/55 shadow-[0_2px_14px_-6px_rgba(15,23,42,0.06)] hover:bg-white/90 transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-slate-500 tracking-wide truncate">
                        {order.orderNumber || `#${order.id.slice(-6).toUpperCase()}`}
                      </span>
                      <span
                        className={`shrink-0 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                          ['completed', 'paid', 'released'].includes(order.status)
                            ? 'bg-emerald-100/80 text-emerald-700'
                            : order.status === 'cancelled'
                              ? 'bg-red-100/80 text-red-700'
                              : ['in_progress', 'assigned'].includes(order.status)
                                ? 'bg-blue-100/80 text-blue-700'
                                : 'bg-amber-100/80 text-amber-800'
                        }`}
                      >
                        {order.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-800 truncate group-hover:text-blue-700/90 transition-colors">
                      {order.services || 'Service'}
                    </p>
                    <div className="flex items-center justify-between mt-3 gap-2">
                      <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                        <Calendar size={11} className="text-slate-400" />
                        {new Date(order.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span className="text-sm font-semibold text-slate-800 tracking-tight tabular-nums">
                        ₱{order.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

// ── Main Customers View ───────────────────────────────────────────────────────
export default function CustomersView() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('lastVisit');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Fetch orders and derive customer registry
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const { data } = await api.get('/orders', {
          params: {
            limit: 100,
            sortBy: 'createdAt',
            sortOrder: 'desc',
          },
        });
        if (data.success && Array.isArray(data.data)) {
          const customerMap = new Map<string, CustomerRecord>();

          data.data.forEach((order: any) => {
            const custId = order.customer?._id || order.customer || 'unknown';
            const custName = order.customerName || order.customer?.name || 'Walk-in Customer';

            if (!customerMap.has(custId)) {
              customerMap.set(custId, {
                id: custId,
                name: custName,
                email: order.customer?.email || '',
                phone: order.customerPhone || order.customer?.phone || '',
                vehiclePlate: sanitizeVehiclePlate(order.vehiclePlate || ''),
                vehicleInfo: [order.vehicleYear, order.vehicleMake, order.vehicleModel].filter(Boolean).join(' ') || '',
                totalSpent: 0,
                totalOrders: 0,
                lastVisit: order.createdAt || '',
                status: 'active',
                vehicles: [],
                orders: [],
              });
            }

            const cust = customerMap.get(custId)!;
            const orderTotal = order.totalPrice || order.totalAmount || 0;
            cust.totalSpent += orderTotal;
            cust.totalOrders += 1;

            // Track latest visit
            if (order.createdAt && (!cust.lastVisit || new Date(order.createdAt) > new Date(cust.lastVisit))) {
              cust.lastVisit = order.createdAt;
            }

            // Track vehicles (API sometimes stores internal ids in vehiclePlate)
            const rawPlate = order.vehiclePlate || '';
            const cleanPlate = sanitizeVehiclePlate(rawPlate);
            const vInfo = [order.vehicleYear, order.vehicleMake, order.vehicleModel].filter(Boolean).join(' ');
            const displayLabel = vehicleHeadline({
              plate: rawPlate,
              year: order.vehicleYear ?? '',
              make: order.vehicleMake ?? '',
              model: order.vehicleModel ?? '',
            });
            const already = cust.vehicles.some(
              (v) => v.displayLabel === displayLabel && v.info === vInfo
            );
            if (!already && (displayLabel !== 'Vehicle' || vInfo || cleanPlate)) {
              cust.vehicles.push({ plate: cleanPlate, info: vInfo, displayLabel });
            }

            // Track orders
            cust.orders.push({
              id: order._id || order.id,
              orderNumber: order.orderNumber || '',
              date: order.createdAt || '',
              services: order.serviceType || order.items?.map((i: any) => i.product?.name || 'Service').join(', ') || '',
              total: orderTotal,
              status: order.status || 'pending',
              paymentMethod: order.paymentMethod || 'cash',
            });
          });

          // Sort orders within each customer by date desc
          customerMap.forEach((cust) => {
            cust.orders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            // Mark inactive if last visit > 60 days ago
            const daysSinceLastVisit = cust.lastVisit
              ? (Date.now() - new Date(cust.lastVisit).getTime()) / (1000 * 60 * 60 * 24)
              : Infinity;
            cust.status = daysSinceLastVisit > 60 ? 'inactive' : 'active';
          });

          setCustomers(Array.from(customerMap.values()));
        }
      } catch (err) {
        console.error('Failed to fetch customer data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCustomers();
  }, []);

  // Filter & sort
  const filtered = useMemo(() => {
    let result = customers;

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(c => c.status === statusFilter);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.vehicles.some(
          (v) =>
            v.displayLabel.toLowerCase().includes(q) ||
            v.info.toLowerCase().includes(q) ||
            v.plate.toLowerCase().includes(q)
        )
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'totalSpent': cmp = a.totalSpent - b.totalSpent; break;
        case 'totalOrders': cmp = a.totalOrders - b.totalOrders; break;
        case 'lastVisit': cmp = new Date(a.lastVisit || 0).getTime() - new Date(b.lastVisit || 0).getTime(); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [customers, search, sortField, sortDir, statusFilter]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // KPI cards
  const totalCustomers = customers.length;
  const activeCustomers = customers.filter(c => c.status === 'active').length;
  const totalRevenue = customers.reduce((sum, c) => sum + c.totalSpent, 0);
  const avgSpend = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

  return (
    <div className="h-full flex flex-col space-y-6 page-enter pb-6 text-slate-800">
      {/* Header */}
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold text-slate-800 tracking-tight">Customers</h1>
        <p className="text-sm text-slate-500/90 mt-1">Customer registry built from transaction history</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        {[
          { label: 'Total Customers', value: totalCustomers, icon: Users, color: 'bg-blue-50/90 text-blue-600', accent: 'bg-blue-50' },
          { label: 'Active Customers', value: activeCustomers, icon: Star, color: 'bg-emerald-50/90 text-emerald-600', accent: 'bg-emerald-50', sub: `${totalCustomers > 0 ? Math.round((activeCustomers / totalCustomers) * 100) : 0}% of total` },
          { label: 'Total Revenue', value: `₱${totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, icon: TrendingUp, color: 'bg-indigo-50/90 text-indigo-600', accent: 'bg-indigo-50' },
          { label: 'Avg. Spend', value: `₱${avgSpend.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, icon: ShoppingBag, color: 'bg-amber-50/90 text-amber-600', accent: 'bg-amber-50', sub: 'per customer' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-3xl bg-white/90 p-5 shadow-[0_4px_28px_-8px_rgba(15,23,42,0.07),0_1px_2px_rgba(15,23,42,0.03)] hover:shadow-[0_12px_40px_-12px_rgba(15,23,42,0.1)] hover:-translate-y-0.5 transition-all duration-300 ease-out relative overflow-hidden group"
          >
            <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-[0.12] transition-transform duration-300 group-hover:scale-110 ${kpi.accent}`} />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.08em]">{kpi.label}</span>
                <div className={`w-9 h-9 rounded-2xl ${kpi.color} flex items-center justify-center shadow-[0_2px_8px_-2px_rgba(15,23,42,0.08)]`}>
                  <kpi.icon size={17} strokeWidth={2} />
                </div>
              </div>
              <p className="text-[1.4rem] font-semibold text-slate-800 tracking-tight leading-none">{isLoading ? '—' : kpi.value}</p>
              {kpi.sub && <p className="text-[11px] font-medium text-slate-500 mt-1.5">{kpi.sub}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
        <div className="relative flex-1 max-w-md w-full group">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400/90 group-focus-within:text-blue-500/90 transition-colors" />
          <input
            type="text"
            placeholder="Search by name, email, phone, plate…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white/95 text-sm text-slate-700 placeholder:text-slate-400/80 focus:outline-none focus:ring-[3px] focus:ring-blue-500/15 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200"
          />
        </div>

        <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-100/40 shadow-[inset_0_1px_3px_rgba(15,23,42,0.05)]">
          {(['all', 'active', 'inactive'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all duration-200 ${
                statusFilter === s
                  ? 'bg-white text-slate-700 shadow-[0_2px_10px_-4px_rgba(15,23,42,0.12)]'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 min-h-0 rounded-3xl bg-white/90 overflow-hidden shadow-[0_4px_32px_-10px_rgba(15,23,42,0.08),0_1px_2px_rgba(15,23,42,0.03)] flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12">
            <div className="w-8 h-8 border-2 border-blue-100 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-medium text-slate-400">Loading customers…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12">
            <div className="w-16 h-16 rounded-3xl bg-slate-100/50 flex items-center justify-center mb-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)]">
              <Users size={28} className="text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-600">No customers found</p>
            <p className="text-xs text-slate-400 mt-1">
              {search ? 'Try adjusting your search criteria' : 'Customers will appear here once transactions are processed'}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10 bg-slate-50/70 backdrop-blur-md supports-[backdrop-filter]:bg-slate-50/55 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.06)]">
                <tr>
                  {[
                    { key: 'name' as SortField, label: 'Customer' },
                    { key: null, label: 'Contact' },
                    { key: null, label: 'Vehicles' },
                    { key: 'totalOrders' as SortField, label: 'Orders' },
                    { key: 'totalSpent' as SortField, label: 'Total Spent' },
                    { key: 'lastVisit' as SortField, label: 'Last Visit' },
                    { key: null, label: '' },
                  ].map((col, i) => (
                    <th
                      key={i}
                      className={`px-5 py-3 text-[11px] font-semibold text-slate-500/85 uppercase tracking-wider ${col.key ? 'cursor-pointer hover:text-slate-700 select-none transition-colors' : ''}`}
                      onClick={() => col.key && toggleSort(col.key)}
                    >
                      <div className="flex items-center gap-1.5">
                        {col.label}
                        {col.key && sortField === col.key && (
                          sortDir === 'asc' ? <SortAsc size={13} className="text-blue-500" /> : <SortDesc size={13} className="text-blue-500" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, rowIdx) => (
                  <tr
                    key={c.id}
                    className={`transition-colors duration-150 cursor-pointer group ${
                      rowIdx % 2 === 1 ? 'bg-slate-50/40' : 'bg-transparent'
                    } hover:bg-slate-100/55`}
                    onClick={() => setSelectedCustomer(c)}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0">
                          {c.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800 group-hover:text-blue-700/90 transition-colors">{c.name}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${c.status === 'active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            <span className="text-[10px] font-medium text-slate-500 capitalize">{c.status}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="space-y-1">
                        {c.phone && <p className="text-xs font-medium text-slate-700 flex items-center gap-1.5"><Phone size={10} className="text-slate-400"/> {c.phone}</p>}
                        {c.email && <p className="text-xs text-slate-500 truncate max-w-[160px] flex items-center gap-1.5"><Mail size={10} className="text-slate-400"/> {c.email}</p>}
                        {!c.phone && !c.email && <p className="text-xs text-slate-400 italic">No contact details</p>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1.5">
                        {c.vehicles.slice(0, 2).map((v, i) => (
                          <span
                            key={i}
                            title={v.info && v.info !== v.displayLabel ? v.info : undefined}
                            className="inline-flex items-center gap-1.5 max-w-[200px] px-2.5 py-1 rounded-full bg-slate-100/70 text-[11px] font-medium text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                          >
                            <Car size={11} className="text-blue-500 shrink-0" />
                            <span className="truncate">{v.displayLabel}</span>
                          </span>
                        ))}
                        {c.vehicles.length > 2 && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-slate-100/60 text-[10px] font-medium text-slate-500">
                            +{c.vehicles.length - 2}
                          </span>
                        )}
                        {c.vehicles.length === 0 && (
                          <span className="text-[11px] text-slate-400 italic">None</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="inline-flex items-center justify-center min-w-[2rem] h-8 px-1.5 rounded-full bg-slate-100/70 text-sm font-medium text-slate-600 group-hover:bg-blue-100/60 group-hover:text-blue-700 transition-all duration-150">
                        {c.totalOrders}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-semibold text-slate-800 tracking-tight">
                        ₱{c.totalSpent.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-medium text-slate-500">
                        {c.lastVisit
                          ? new Date(c.lastVisit).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-600/95 text-white shadow-[0_2px_8px_-2px_rgba(37,99,235,0.45)] hover:bg-blue-600 active:scale-95 transition-all duration-150">
                        <ChevronRight size={16} strokeWidth={2.5} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {filtered.length > 0 && (
          <div className="px-5 py-3.5 bg-slate-50/45 flex items-center justify-between shrink-0 shadow-[0_-10px_28px_-14px_rgba(15,23,42,0.05)]">
            <span className="text-xs font-medium text-slate-500/90">
              Showing <span className="font-semibold text-slate-700">{filtered.length}</span> of <span className="font-semibold text-slate-700">{customers.length}</span> customers
            </span>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      {selectedCustomer && (
        <CustomerDetail customer={selectedCustomer} onClose={() => setSelectedCustomer(null)} />
      )}
    </div>
  );
}
