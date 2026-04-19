import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, Plus, Edit, Trash2, LayoutGrid, List, ToggleLeft, ToggleRight,
    Eye, EyeOff, AlertTriangle, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DetailService } from '@/lib/detail-service-api';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import type { Service } from '@/types';

interface ServicesPricingProps {
    services: Service[];
    onRefresh: () => void;
}

type ViewMode = 'table' | 'card';
type FilterCategory = 'all' | 'Exterior' | 'Interior' | 'Complete' | 'Engine' | 'Premium';

const CATEGORIES: { id: FilterCategory; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'Exterior', label: 'Exterior' },
    { id: 'Interior', label: 'Interior' },
    { id: 'Complete', label: 'Complete' },
    { id: 'Engine', label: 'Engine' },
    { id: 'Premium', label: 'Premium' },
];

const VEHICLE_TYPES = [
    { key: 'hatchback', label: 'Hatchback' },
    { key: 'sedan', label: 'Sedan' },
    { key: 'midsized', label: 'Midsized' },
    { key: 'suv', label: 'SUV' },
    { key: 'pickup', label: 'Pick Up' },
    { key: 'largesuv', label: 'Large SUV' },
    { key: 'highend', label: 'High-end' },
];

const getCategoryColor = (cat: string) => {
    switch (cat) {
        case 'Exterior': return { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/25' };
        case 'Interior': return { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/25' };
        case 'Complete': return { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/25' };
        case 'Engine': return { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/25' };
        case 'Premium': return { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/25' };
        default: return { bg: 'bg-zinc-500/15', text: 'text-zinc-400', border: 'border-zinc-500/25' };
    }
};

export function ServicesPricing({ services, onRefresh }: ServicesPricingProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');
    const [viewMode, setViewMode] = useState<ViewMode>('table');

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formName, setFormName] = useState('');
    const [formCategory, setFormCategory] = useState('Exterior');
    const [formDuration, setFormDuration] = useState('');
    const [formPrices, setFormPrices] = useState<Record<string, string>>({
        hatchback: '', sedan: '', midsized: '', suv: '', pickup: '', largesuv: '', highend: ''
    });
    const [formPublished, setFormPublished] = useState(true);
    const [saving, setSaving] = useState(false);

    // Delete confirmation modal
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
    const [deleting, setDeleting] = useState(false);

    // ─── Filtered services ─────────────────────────────────────────────────────
    const filteredServices = useMemo(() => {
        let list = [...services];
        if (activeFilter !== 'all') {
            list = list.filter(s => s.category === activeFilter);
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(s => s.name.toLowerCase().includes(q));
        }
        return list;
    }, [services, activeFilter, searchQuery]);

    // ─── Stats ─────────────────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const active = services.filter(s => s.status === 'Active');
        const inactive = services.filter(s => s.status === 'Inactive');
        const categories = new Set(services.map(s => s.category));
        
        let validPrices: number[] = [];
        services.forEach(s => {
            if (s.prices) {
                Object.values(s.prices).forEach(p => {
                    if (p && typeof p === 'number') validPrices.push(p);
                });
            } else if (s.basePrice) {
                 validPrices.push(s.basePrice);
            }
        });
        
        const avgPrice = validPrices.length > 0
            ? Math.round(validPrices.reduce((a, b) => a + b, 0) / validPrices.length)
            : 0;
            
        const mostBooked = [...services].sort((a, b) => (b.bookingCount || 0) - (a.bookingCount || 0))[0];

        return {
            total: services.length,
            categoriesCount: categories.size,
            active: active.length,
            inactive: inactive.length,
            avgPrice,
            mostBooked,
        };
    }, [services]);

    // ─── Handlers ──────────────────────────────────────────────────────────────
    const resetForm = () => {
        setFormName('');
        setFormCategory('Exterior');
        setFormDuration('');
        setFormPrices({
            hatchback: '', sedan: '', midsized: '', suv: '', pickup: '', largesuv: '', highend: ''
        });
        setFormPublished(true);
        setIsEditing(false);
        setEditingId(null);
    };

    const openAddModal = () => {
        resetForm();
        setShowModal(true);
    };

    const openEditModal = (s: Service) => {
        setFormName(s.name);
        setFormCategory(s.category);
        setFormDuration(s.duration || '');
        
        // Handle potentially missing prices object
        const prices: Record<string, number> = s.prices || {};
        setFormPrices({
            hatchback: prices.hatchback !== undefined && prices.hatchback !== null ? String(prices.hatchback) : '',
            sedan: prices.sedan !== undefined && prices.sedan !== null ? String(prices.sedan) : '',
            midsized: prices.midsized !== undefined && prices.midsized !== null ? String(prices.midsized) : '',
            suv: prices.suv !== undefined && prices.suv !== null ? String(prices.suv) : '',
            pickup: prices.pickup !== undefined && prices.pickup !== null ? String(prices.pickup) : '',
            largesuv: prices.largesuv !== undefined && prices.largesuv !== null ? String(prices.largesuv) : '',
            highend: prices.highend !== undefined && prices.highend !== null ? String(prices.highend) : ''
        });
        setFormPublished(s.isPublished !== false);
        setIsEditing(true);
        setEditingId(s.id);
        setShowModal(true);
    };

    const handlePriceChange = (key: string, value: string) => {
        setFormPrices(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        if (!formName || !formCategory) {
            toast.error('Please fill in required fields (Name and Category)');
            return;
        }
        setSaving(true);
        try {
            // Convert to numbers or null
            const pricesPayload: any = {};
            let minPrice = Infinity;
            
            VEHICLE_TYPES.forEach(vt => {
                const val = formPrices[vt.key];
                if (val && !isNaN(parseFloat(val))) {
                    const numVal = parseFloat(val);
                    pricesPayload[vt.key] = numVal;
                    if (numVal < minPrice) minPrice = numVal;
                } else {
                    pricesPayload[vt.key] = null;
                }
            });
            
            const payload = {
                name: formName,
                category: formCategory,
                duration: formDuration,
                prices: pricesPayload,
                basePrice: minPrice !== Infinity ? minPrice : 0, // Keep as fallback
                isPublished: formPublished,
                status: 'Active',
            };
            
            let res;
            if (isEditing && editingId) {
                res = await DetailService.updateService(editingId, payload);
            } else {
                res = await DetailService.createService(payload);
            }
            if (res.success) {
                toast.success(isEditing ? 'Service updated' : 'Service created');
                setShowModal(false);
                resetForm();
                onRefresh();
            } else {
                toast.error(res.message || 'Failed to save service');
            }
        } catch (err: any) {
            toast.error(err.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleStatus = async (s: Service) => {
        try {
            const newStatus = s.status === 'Active' ? 'Inactive' : 'Active';
            const res = await DetailService.updateService(s.id, { status: newStatus });
            if (res.success) {
                toast.success(`${s.name} ${newStatus === 'Active' ? 'activated' : 'deactivated'}`);
                onRefresh();
            }
        } catch (err: any) {
            toast.error('Failed to toggle status');
        }
    };

    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            const res = await DetailService.deleteService(deleteTarget.id);
            if (res.success) {
                toast.success(`"${deleteTarget.name}" deleted`);
                setDeleteTarget(null);
                onRefresh();
            } else {
                toast.error(res.message || 'Failed to delete');
            }
        } catch (err: any) {
            toast.error('Failed to delete service');
        } finally {
            setDeleting(false);
        }
    };

    const getPriceDisplay = (s: Service, key: string) => {
        const val = s.prices?.[key as keyof typeof s.prices];
        return (val !== undefined && val !== null) ? formatCurrency(val) : '—';
    };

    const getPriceRange = (s: Service) => {
        if (!s.prices) return formatCurrency(s.basePrice || 0);
        
        const validPrices = Object.values(s.prices).filter(p => p !== null && p !== undefined) as number[];
        if (validPrices.length === 0) return formatCurrency(s.basePrice || 0);
        
        const min = Math.min(...validPrices);
        const max = Math.max(...validPrices);
        return min === max ? formatCurrency(min) : `${formatCurrency(min)} - ${formatCurrency(max)}`;
    };

    return (
        <div className="space-y-5">
            {/* ───── Header ───── */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Services & Pricing</h1>
                    <p className="text-[12px] text-zinc-500 mt-0.5">Manage specific vehicle prices for the catalog</p>
                </div>
                <Button
                    onClick={openAddModal}
                    className="h-9 bg-[#E87C2F] hover:bg-[#d06e28] text-white gap-1.5 text-[12px] font-semibold"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Add Service
                </Button>
            </div>

            {/* ───── Stats Bar ───── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'TOTAL SERVICES', value: stats.total, sub: `across ${stats.categoriesCount} categories`, color: 'text-white' },
                    { label: 'ACTIVE SERVICES', value: stats.active, sub: stats.inactive > 0 ? `${stats.inactive} inactive` : 'All active', color: stats.inactive > 0 ? 'text-orange-400' : 'text-emerald-400' },
                    { label: 'AVG EST. PRICE', value: formatCurrency(stats.avgPrice), sub: 'across all tiers', color: 'text-white', isString: true },
                    { label: 'MOST BOOKED', value: stats.mostBooked?.name || '—', sub: stats.mostBooked ? `${stats.mostBooked.bookingCount || 0} bookings` : 'No data yet', color: 'text-orange-400', isString: true },
                ].map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                        className="rounded-xl bg-[#161619] border border-zinc-800/60 px-5 py-4"
                    >
                        <p className="text-[10px] font-semibold tracking-[1.5px] text-zinc-500 uppercase">{stat.label}</p>
                        <p className={`${stat.isString ? 'text-xl' : 'text-3xl'} font-bold mt-1 ${stat.color} truncate`}>{stat.value}</p>
                        <p className={`text-[11px] mt-0.5 ${stat.color === 'text-orange-400' ? 'text-orange-400/60' : 'text-zinc-500'}`}>{stat.sub}</p>
                    </motion.div>
                ))}
            </div>

            {/* ───── Search + Filters ───── */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="relative flex-1 w-full sm:w-auto">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <Input
                        placeholder="Search service name..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-10 h-10 bg-[#161619] border-zinc-800 text-white placeholder:text-zinc-600 text-sm focus:border-[#E87C2F]/50 focus:ring-1 focus:ring-[#E87C2F]/20"
                    />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveFilter(cat.id)}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${activeFilter === cat.id
                                ? 'bg-[#E87C2F] text-white shadow-lg shadow-orange-500/20'
                                : 'bg-[#161619] text-zinc-400 hover:text-zinc-200 border border-zinc-800/60 hover:border-zinc-700'
                                }`}
                        >
                            {cat.label}
                        </button>
                    ))}
                    <div className="h-6 w-px bg-zinc-800 mx-1" />
                    <button
                        onClick={() => setViewMode('table')}
                        className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        <List className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setViewMode('card')}
                        className={`p-2 rounded-lg transition-all ${viewMode === 'card' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        <LayoutGrid className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* ───── Table View ───── */}
            {viewMode === 'table' && (
                <div className="rounded-xl bg-[#161619] border border-zinc-800/60 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-zinc-800/60">
                                    <th className="text-left text-[10px] font-semibold uppercase tracking-[1.5px] text-zinc-500 py-3.5 pl-5">Service</th>
                                    {VEHICLE_TYPES.map(vt => (
                                        <th key={vt.key} className="text-center text-[10px] font-semibold uppercase tracking-[1.5px] text-zinc-500 py-3.5">{vt.label}</th>
                                    ))}
                                    <th className="text-center text-[10px] font-semibold uppercase tracking-[1.5px] text-zinc-500 py-3.5">Status</th>
                                    <th className="text-center text-[10px] font-semibold uppercase tracking-[1.5px] text-zinc-500 py-3.5 pr-5">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/40">
                                {filteredServices.map((s, idx) => {
                                    const catColor = getCategoryColor(s.category);
                                    return (
                                        <motion.tr
                                            key={s.id}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.025 }}
                                            className="group hover:bg-zinc-800/20 transition-colors"
                                        >
                                            {/* Service name + category */}
                                            <td className="py-3.5 pl-5">
                                                <div>
                                                    <span className="text-[13px] font-semibold text-white whitespace-nowrap">{s.name}</span>
                                                    <div className="mt-1">
                                                        <Badge className={`text-[9px] font-bold px-2 py-0.5 ${catColor.bg} ${catColor.text} border ${catColor.border} rounded-md`}>
                                                            {s.category}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </td>
                                            
                                            {/* Vehicle Prices */}
                                            {VEHICLE_TYPES.map(vt => (
                                                <td key={vt.key} className="py-3.5 text-center text-[11px] font-medium text-zinc-400">
                                                    {getPriceDisplay(s, vt.key)}
                                                </td>
                                            ))}

                                            {/* Status toggle */}
                                            <td className="py-3.5 text-center">
                                                <button
                                                    onClick={() => handleToggleStatus(s)}
                                                    className="inline-flex items-center"
                                                    title={s.status === 'Active' ? 'Click to deactivate' : 'Click to activate'}
                                                >
                                                    {s.status === 'Active' ? (
                                                        <ToggleRight className="w-6 h-6 text-emerald-400" />
                                                    ) : (
                                                        <ToggleLeft className="w-6 h-6 text-zinc-600" />
                                                    )}
                                                </button>
                                            </td>
                                            {/* Actions */}
                                            <td className="py-3.5 pr-5 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button
                                                        onClick={() => openEditModal(s)}
                                                        className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-700/50 transition-all"
                                                        title="Edit"
                                                    >
                                                        <Edit className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteTarget({ id: s.id, name: s.name })}
                                                        className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                                {filteredServices.length === 0 && (
                                    <tr>
                                        <td colSpan={10} className="py-12 text-center text-zinc-500 text-sm">
                                            No services found
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ───── Card View ───── */}
            {viewMode === 'card' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredServices.map((s, idx) => {
                        const catColor = getCategoryColor(s.category);
                        return (
                            <motion.div
                                key={s.id}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.04 }}
                                whileHover={{ y: -4 }}
                                className="rounded-xl bg-[#161619] border border-zinc-800/60 p-5 flex flex-col"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <Badge className={`text-[9px] font-bold px-2 py-0.5 ${catColor.bg} ${catColor.text} border ${catColor.border} rounded-md mb-2`}>
                                            {s.category}
                                        </Badge>
                                        <h3 className="text-[15px] font-bold text-white">{s.name}</h3>
                                        <p className="text-[11px] text-zinc-500 mt-0.5">{s.duration}</p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {s.isPublished !== false ? (
                                            <Eye className="w-3.5 h-3.5 text-emerald-400" />
                                        ) : (
                                            <EyeOff className="w-3.5 h-3.5 text-zinc-600" />
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-end gap-2 mb-4">
                                    <span className="text-xl font-bold text-white">{getPriceRange(s)}</span>
                                </div>

                                <div className="flex items-center gap-2 mt-auto pt-3 border-t border-zinc-800/40">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => openEditModal(s)}
                                        className="flex-1 h-8 text-[11px] border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800"
                                    >
                                        <Edit className="w-3 h-3 mr-1" /> Edit
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleToggleStatus(s)}
                                        className={`h-8 px-3 text-[11px] border-zinc-700 ${s.status === 'Active' ? 'text-emerald-400' : 'text-zinc-500'}`}
                                    >
                                        {s.status === 'Active' ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setDeleteTarget({ id: s.id, name: s.name })}
                                        className="h-8 px-3 text-[11px] border-zinc-700 text-red-400 hover:bg-red-500/10"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* ───── Add/Edit Service Modal ───── */}
            <AnimatePresence>
                {showModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
                        onClick={() => setShowModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            className="w-full max-w-2xl bg-[#121214] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden my-auto"
                        >
                            <div className="px-6 pt-6 pb-4 border-b border-zinc-800/60 flex items-center justify-between sticky top-0 bg-[#121214] z-10">
                                <h3 className="text-lg font-bold text-white">{isEditing ? 'Edit Service & Pricing' : 'Add New Service & Pricing'}</h3>
                                <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            
                            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                                {/* Basic Info Section */}
                                <div className="space-y-4">
                                    <div>
                                        <Label className="text-zinc-400 text-[11px] uppercase tracking-wider">Service Name</Label>
                                        <Input
                                            value={formName}
                                            onChange={e => setFormName(e.target.value)}
                                            className="mt-1.5 bg-zinc-900 border-zinc-800 text-white"
                                            placeholder="e.g., Full Detailing"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="text-zinc-400 text-[11px] uppercase tracking-wider">Category</Label>
                                            <Select value={formCategory} onValueChange={setFormCategory}>
                                                <SelectTrigger className="mt-1.5 bg-zinc-900 border-zinc-800 text-white">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#121214] border-zinc-800">
                                                    {['Exterior', 'Interior', 'Complete', 'Engine', 'Premium'].map(c => (
                                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label className="text-zinc-400 text-[11px] uppercase tracking-wider">Duration</Label>
                                            <Input
                                                value={formDuration}
                                                onChange={e => setFormDuration(e.target.value)}
                                                className="mt-1.5 bg-zinc-900 border-zinc-800 text-white"
                                                placeholder="e.g., 2-3 hrs"
                                            />
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="h-px bg-zinc-800/60" />
                                
                                {/* Pricing Grid Section */}
                                <div>
                                    <h4 className="text-[13px] font-semibold text-white mb-1">Per-Vehicle Pricing</h4>
                                    <p className="text-[11px] text-zinc-500 mb-4">Set prices for specific vehicle categories. Leave blank if not applicable.</p>
                                    
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                        {VEHICLE_TYPES.map(vt => (
                                            <div key={vt.key}>
                                                <Label className="text-zinc-400 text-[11px] truncate tracking-wider">{vt.label}</Label>
                                                <div className="relative mt-1.5">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-500">₱</span>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={formPrices[vt.key]}
                                                        onChange={e => handlePriceChange(vt.key, e.target.value)}
                                                        className="pl-7 bg-zinc-900 border-zinc-800 text-white font-mono text-xs"
                                                        placeholder="—"
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                
                                <div className="h-px bg-zinc-800/60" />

                                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/40">
                                    <div>
                                        <p className="text-[12px] font-medium text-white">Published to customers</p>
                                        <p className="text-[10px] text-zinc-500">Visible in booking page when enabled</p>
                                    </div>
                                    <button onClick={() => setFormPublished(!formPublished)}>
                                        {formPublished ? (
                                            <ToggleRight className="w-8 h-8 text-emerald-400" />
                                        ) : (
                                            <ToggleLeft className="w-8 h-8 text-zinc-600" />
                                        )}
                                    </button>
                                </div>
                            </div>
                            
                            <div className="px-6 py-4 border-t border-zinc-800/60 bg-[#121214] sticky bottom-0 z-10">
                                <Button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="w-full bg-[#E87C2F] hover:bg-[#d06e28] text-white font-semibold"
                                >
                                    {saving ? 'Saving...' : isEditing ? 'Update Service' : 'Create Service'}
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ───── Delete Confirmation Modal ───── */}
            <AnimatePresence>
                {deleteTarget && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                        onClick={() => setDeleteTarget(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            className="w-full max-w-sm bg-[#121214] border border-zinc-800 rounded-2xl shadow-2xl p-6 text-center"
                        >
                            <div className="w-12 h-12 mx-auto rounded-full bg-red-500/15 flex items-center justify-center mb-4">
                                <AlertTriangle className="w-6 h-6 text-red-400" />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">Delete Service</h3>
                            <p className="text-[13px] text-zinc-400 mb-6">
                                Are you sure you want to permanently delete <span className="text-white font-semibold">"{deleteTarget.name}"</span>? This action cannot be undone.
                            </p>
                            <div className="flex gap-3">
                                <Button
                                    variant="outline"
                                    onClick={() => setDeleteTarget(null)}
                                    className="flex-1 border-zinc-700 text-zinc-400 hover:text-white"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleDeleteConfirm}
                                    disabled={deleting}
                                    className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                                >
                                    {deleting ? 'Deleting...' : 'Delete'}
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
