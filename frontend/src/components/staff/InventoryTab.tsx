import { motion } from 'framer-motion';
import { Package, Activity, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { btnHover, btnTap, pageVariants, cardHover, modalSpring } from './SharedAnimations';
import type { Booking, InventoryItem, InventoryUsage } from '@/types';

interface InventoryTabProps {
    inventory: InventoryItem[];
    inventoryThreshold?: number;
    inventoryUsage: InventoryUsage[];
    activeJob?: Booking;
    showUsageModal: boolean;
    setShowUsageModal: (open: boolean) => void;
    selectedItem: string;
    setSelectedItem: (val: string) => void;
    usageQuantity: string;
    setUsageQuantity: (val: string) => void;
    handleLogUsage: () => void;
    SERVICE_USAGE_SUGGESTIONS: Record<string, { name: string; quantity: number; unit?: string }[]>;
    findInventoryItemByNames: (names: string[]) => InventoryItem | undefined;
}

export function InventoryTab({
    inventory,
    inventoryThreshold,
    inventoryUsage,
    activeJob,
    showUsageModal,
    setShowUsageModal,
    selectedItem,
    setSelectedItem,
    usageQuantity,
    setUsageQuantity,
    handleLogUsage,
    SERVICE_USAGE_SUGGESTIONS,
    findInventoryItemByNames
}: InventoryTabProps) {
    return (
        <motion.div key="inventory" variants={pageVariants} initial="initial" animate="animate" exit="exit">
            <motion.div className="glass-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                <div className="glass-panel-header">
                    <h3><Package style={{ width: 14, height: 14, color: 'var(--accent)' }} /> Inventory Stock</h3>
                    <Dialog open={showUsageModal} onOpenChange={setShowUsageModal}>
                        <DialogTrigger asChild>
                            <motion.button whileHover={btnHover} whileTap={btnTap} disabled={!activeJob} className="btn-premium primary" style={{ height: 32, fontSize: 11, opacity: activeJob ? 1 : 0.5 }}>
                                <Plus style={{ width: 12, height: 12 }} /> Log Usage
                            </motion.button>
                        </DialogTrigger>
                        <DialogContent className="bg-[#121214] border-zinc-800">
                            <DialogHeader><DialogTitle className="text-white">Log Inventory Usage</DialogTitle></DialogHeader>
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={modalSpring} className="space-y-4 py-4">
                                <div>
                                    <Label className="text-zinc-400">Select Item</Label>
                                    <Select value={selectedItem} onValueChange={setSelectedItem}>
                                        <SelectTrigger className="mt-1 bg-zinc-950 border-zinc-800 text-white"><SelectValue placeholder="Choose an item" /></SelectTrigger>
                                        <SelectContent className="bg-[#121214] border-zinc-800">
                                            {inventory.map(item => (<SelectItem key={item.id} value={item.id}>{item.name} ({item.stock} {item.unit})</SelectItem>))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {activeJob && (
                                    <div className="space-y-2">
                                        <Label className="text-zinc-400">Suggested for {activeJob.serviceName}</Label>
                                        <div className="flex flex-wrap gap-2">
                                            {(SERVICE_USAGE_SUGGESTIONS[(activeJob.serviceName || '').toLowerCase()] || []).map((sugg) => {
                                                const match = findInventoryItemByNames([sugg.name]);
                                                return (
                                                    <Button key={sugg.name} size="sm" variant="outline" className="border-orange-500/40 text-orange-300 hover:bg-orange-500/10" onClick={() => { if (match) setSelectedItem(match.id); setUsageQuantity(String(sugg.quantity)); }}>
                                                        {sugg.name} • {sugg.quantity}{sugg.unit ? ` ${sugg.unit}` : ''}
                                                    </Button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <Label className="text-zinc-400">Quantity Used</Label>
                                    <Input type="number" value={usageQuantity} onChange={(e) => setUsageQuantity(e.target.value)} className="mt-1 bg-zinc-950 border-zinc-800 text-white" />
                                </div>
                                <Button onClick={handleLogUsage} disabled={!selectedItem || !usageQuantity} className="w-full bg-[#F57C00] hover:bg-[#E65100]">Confirm & Deduct Stock</Button>
                            </motion.div>
                        </DialogContent>
                    </Dialog>
                </div>
                <div className="glass-panel-body" style={{ padding: 0 }}>
                    <div className="overflow-x-auto w-full">
                        <table className="data-table">
                            <thead><tr><th>Product</th><th>Category</th><th>Stock</th><th>Threshold</th><th>Status</th></tr></thead>
                            <tbody>
                                {inventory.map((item, idx) => {
                                    const threshold = inventoryThreshold ?? item.minLevel;
                                    const isLow = item.stock <= threshold;
                                    return (
                                        <motion.tr key={item.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.04 }}>
                                            <td style={{ fontWeight: 600 }}>{item.name}</td>
                                            <td className="muted">{item.category}</td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <span style={{ fontWeight: 600, color: isLow ? 'var(--red)' : 'var(--text)' }}>{item.stock}</span>
                                                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{item.unit}</span>
                                                </div>
                                            </td>
                                            <td className="muted">{threshold}</td>
                                            <td><span className={`status-badge ${isLow ? 'low-stock' : 'ok'}`}>{isLow ? 'Low' : 'OK'}</span></td>
                                        </motion.tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </motion.div>

            {/* Usage Log */}
            {activeJob && inventoryUsage.filter(i => i.jobId === (activeJob?.id || (activeJob as any)?._id)).length > 0 && (
                <motion.div className="glass-panel" style={{ marginTop: 20 }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                    <div className="glass-panel-header"><h3><Activity style={{ width: 14, height: 14, color: 'var(--accent)' }} /> Usage Log — Current Job</h3></div>
                    <div className="glass-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {inventoryUsage.filter(i => i.jobId === (activeJob?.id || (activeJob as any)?._id)).map((item) => (
                            <motion.div key={item.id} className="queue-card" whileHover={cardHover} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12 }}>
                                <div><p style={{ fontWeight: 500, fontSize: 13 }}>{item.itemName}</p><time style={{ fontSize: 10, color: 'var(--text-dim)' }}>{new Date(item.usedAt).toLocaleTimeString()}</time></div>
                                <span className="status-badge active">{item.quantity} {item.unit || 'units'}</span>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            )}
        </motion.div>
    );
}
