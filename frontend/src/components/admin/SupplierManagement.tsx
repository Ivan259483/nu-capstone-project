import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, Plus, MapPin, Phone, Mail, Box, Briefcase,
    ShoppingCart, Edit, Factory, ArrowUpRight, CheckCircle2, ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface Supplier {
    id: string;
    name: string;
    contactPerson: string;
    email: string;
    phone: string;
    products?: string[];
    // Include any other possible fields safely
    [key: string]: any;
}

interface SupplierManagementProps {
    suppliers: Supplier[];
    onAddSupplier: () => void;
    onEditSupplier: (s: Supplier) => void;
    onOrder: (s: Supplier) => void;
}

const avatarGradient = (name: string) => {
    const hue = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
    return `hsl(${hue}, 60%, 45%)`;
};

const initials = (name: string) =>
    name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();

export function SupplierManagement({
    suppliers,
    onAddSupplier,
    onEditSupplier,
    onOrder
}: SupplierManagementProps) {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredSuppliers = useMemo(() => {
        const q = searchTerm.toLowerCase();
        return suppliers.filter(s =>
            s.name.toLowerCase().includes(q) ||
            s.contactPerson?.toLowerCase().includes(q) ||
            s.email.toLowerCase().includes(q) ||
            (s.products && s.products.join(' ').toLowerCase().includes(q))
        );
    }, [suppliers, searchTerm]);

    // Derived stats
    const totalSuppliers = suppliers.length;
    const totalProducts = useMemo(() => {
        const unique = new Set<string>();
        suppliers.forEach(s => s.products?.forEach(p => unique.add(p.trim().toLowerCase())));
        return unique.size;
    }, [suppliers]);

    return (
        <div className="space-y-6">
            
            {/* ══ TOP RIBBON ══════════════════════════════════════════════════ */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                        Supplier Network
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-[10px] uppercase font-bold">Global</Badge>
                    </h2>
                    <p className="text-xs text-zinc-500 mt-0.5">Manage vendors, restock inventory, and maintain supply chain contacts.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <Input 
                            placeholder="Find vendor or product..." 
                            className="bg-zinc-900/80 border-zinc-800 text-sm pl-9 w-[240px] h-9 focus-visible:ring-blue-500/50"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button onClick={onAddSupplier} className="h-9 bg-[#E87C2F] hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20 gap-1.5 px-4 text-xs font-semibold">
                        <Plus className="w-4 h-4" /> New Supplier
                    </Button>
                </div>
            </div>

            {/* ══ STAT CARDS ══════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}
                    className="relative overflow-hidden rounded-2xl bg-zinc-900/60 border border-zinc-800/60 p-5 group">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center">
                                <Factory className="w-4 h-4 text-blue-400" />
                            </div>
                            <span className="text-[10px] font-bold tracking-[1.5px] text-zinc-500 uppercase">Active Partners</span>
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-white tracking-tight">{totalSuppliers}</p>
                    <p className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" /> All vendors operational
                    </p>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                    className="relative overflow-hidden rounded-2xl bg-zinc-900/60 border border-zinc-800/60 p-5 group">
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                                <Box className="w-4 h-4 text-emerald-400" />
                            </div>
                            <span className="text-[10px] font-bold tracking-[1.5px] text-zinc-500 uppercase">Products Sourced</span>
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-white tracking-tight">{totalProducts}</p>
                    <p className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1">
                        Across multiple categories
                    </p>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#E87C2F]/10 to-transparent border border-orange-500/20 p-5 group">
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-orange-500/20 flex items-center justify-center">
                                <ShoppingCart className="w-4 h-4 text-orange-400" />
                            </div>
                            <span className="text-[10px] font-bold tracking-[1.5px] text-orange-400/80 uppercase">Pending Orders</span>
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-white tracking-tight">0</p>
                    <p className="text-[11px] text-orange-500/60 mt-1 flex items-center gap-1">
                        Place an order to restock
                    </p>
                </motion.div>
            </div>

            {/* ══ SUPPLIERS GRID ══════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <AnimatePresence>
                    {filteredSuppliers.map((supplier, i) => (
                        <motion.div
                            key={supplier.id}
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ delay: i * 0.04 }}
                            className="group rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-5 hover:bg-zinc-800/40 hover:border-zinc-700/60 transition-all shadow-sm flex flex-col justify-between"
                        >
                            {/* Card Header & Avatar */}
                            <div className="flex items-start justify-between mb-5">
                                <div className="flex items-center gap-4">
                                    <div 
                                        className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold text-white shadow-inner"
                                        style={{ backgroundColor: avatarGradient(supplier.name) }}
                                    >
                                        {initials(supplier.name)}
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-white group-hover:text-[#E87C2F] transition-colors line-clamp-1">
                                            {supplier.name}
                                        </h3>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <Briefcase className="w-3.5 h-3.5 text-zinc-500" />
                                            <p className="text-xs text-zinc-400 font-medium">{supplier.contactPerson || 'No contact specified'}</p>
                                        </div>
                                    </div>
                                </div>
                                <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-8 w-8 text-zinc-500 hover:text-white hover:bg-zinc-800"
                                    onClick={() => onEditSupplier(supplier)}
                                >
                                    <Edit className="w-4 h-4" />
                                </Button>
                            </div>

                            {/* Contact Sub-grid */}
                            <div className="grid grid-cols-2 gap-3 mb-5 p-3 rounded-xl bg-zinc-900 border border-zinc-800/50">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <Mail className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                    <span className="text-[11px] text-zinc-300 truncate" title={supplier.email}>{supplier.email}</span>
                                </div>
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <Phone className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                    <span className="text-[11px] text-zinc-300 truncate" title={supplier.phone}>{supplier.phone}</span>
                                </div>
                            </div>

                            {/* Card Footer: Tags & Order Action */}
                            <div className="flex items-center justify-between pt-4 border-t border-zinc-800/60 mt-auto">
                                <div className="flex flex-wrap items-center gap-1.5 flex-1 pr-4">
                                    {supplier.products && supplier.products.length > 0 ? (
                                        supplier.products.slice(0, 3).map((prod, idx) => (
                                            <Badge key={idx} variant="outline" className="bg-zinc-800/60 text-zinc-400 border-zinc-700/50 text-[9px] font-semibold">
                                                {prod.trim()}
                                            </Badge>
                                        ))
                                    ) : (
                                        <span className="text-[10px] text-zinc-600 italic">No products listed</span>
                                    )}
                                    {supplier.products && supplier.products.length > 3 && (
                                        <span className="text-[10px] font-bold text-zinc-500">+{supplier.products.length - 3}</span>
                                    )}
                                </div>

                                <Button 
                                    className="h-8 bg-zinc-800 hover:bg-orange-500 hover:border-orange-500 text-white transition-all shadow-none outline-none group/btn gap-1.5 pl-3 pr-2.5 text-xs border border-zinc-700"
                                    onClick={() => onOrder(supplier)}
                                >
                                    Create PO <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover/btn:text-white group-hover/btn:translate-x-0.5 transition-transform" />
                                </Button>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {filteredSuppliers.length === 0 && (
                    <div className="lg:col-span-2 py-16 text-center border border-zinc-800/40 rounded-2xl bg-zinc-900/20 border-dashed">
                        <div className="w-16 h-16 mx-auto mb-4 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center">
                            <Factory className="w-6 h-6 text-zinc-600" />
                        </div>
                        <h3 className="text-sm font-semibold text-white">No suppliers found</h3>
                        <p className="text-xs text-zinc-500 mt-1 mb-4">You haven't added any suppliers matching your search.</p>
                        <Button onClick={onAddSupplier} className="h-8 bg-[#E87C2F] hover:bg-orange-600 text-white shadow-lg text-xs">
                            <Plus className="w-3.5 h-3.5 mr-1" /> Add Supplier
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
