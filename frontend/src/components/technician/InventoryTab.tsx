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
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={{ background: '#ffffff', borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(6,39,75,0.05)', overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(6,39,75,0.06)' }}>
                    <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 15, fontWeight: 700, color: '#191c1e', display: 'flex', alignItems: 'center', gap: 8 }}><Package style={{ width: 14, height: 14, color: '#06274b' }} /> Inventory Stock</h3>
                    <Dialog open={showUsageModal} onOpenChange={setShowUsageModal}>
                        <DialogTrigger asChild>
                            <motion.button whileHover={btnHover} whileTap={btnTap} disabled={!activeJob} style={{ 
                                height: 32, fontSize: 11, fontWeight: 700, fontFamily: "'Inter', sans-serif",
                                background: 'linear-gradient(135deg, #06274b, #213d62)', color: '#fff', border: 'none', borderRadius: 8,
                                padding: '0 14px', display: 'flex', alignItems: 'center', gap: 6, cursor: activeJob ? 'pointer' : 'not-allowed',
                                opacity: activeJob ? 1 : 0.5
                            }}>
                                <Plus style={{ width: 12, height: 12 }} /> Log Usage
                            </motion.button>
                        </DialogTrigger>
                        <DialogContent style={{ background: '#ffffff', border: 'none', borderRadius: 16, boxShadow: '0 20px 60px rgba(6,39,75,0.12)' }}>
                            <DialogHeader><DialogTitle style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 700, color: '#06274b' }}>Log Inventory Usage</DialogTitle></DialogHeader>
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={modalSpring} className="space-y-4 py-4">
                                <div>
                                    <Label style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#74777d' }}>Select Item</Label>
                                    <Select value={selectedItem} onValueChange={setSelectedItem}>
                                        <SelectTrigger style={{ marginTop: 4, background: '#f2f4f6', border: 'none', borderRadius: 8, color: '#191c1e' }}><SelectValue placeholder="Choose an item" /></SelectTrigger>
                                        <SelectContent style={{ background: '#ffffff', border: '1px solid rgba(6,39,75,0.08)', borderRadius: 10 }}>
                                            {inventory.map(item => (<SelectItem key={item.id} value={item.id}>{item.name} ({item.stock} {item.unit})</SelectItem>))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {activeJob && (
                                    <div className="space-y-2">
                                        <Label style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#74777d' }}>Suggested for {activeJob.serviceName}</Label>
                                        <div className="flex flex-wrap gap-2">
                                            {(SERVICE_USAGE_SUGGESTIONS[(activeJob.serviceName || '').toLowerCase()] || []).map((sugg) => {
                                                const match = findInventoryItemByNames([sugg.name]);
                                                return (
                                                    <Button key={sugg.name} size="sm" variant="outline" style={{ border: '1px solid rgba(6,39,75,0.2)', color: '#06274b', background: 'rgba(6,39,75,0.04)', borderRadius: 9999, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600 }} onClick={() => { if (match) setSelectedItem(match.id); setUsageQuantity(String(sugg.quantity)); }}>
                                                        {sugg.name} • {sugg.quantity}{sugg.unit ? ` ${sugg.unit}` : ''}
                                                    </Button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <Label style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#74777d' }}>Quantity Used</Label>
                                    <Input type="number" value={usageQuantity} onChange={(e) => setUsageQuantity(e.target.value)} style={{ marginTop: 4, background: '#f2f4f6', border: 'none', borderRadius: 8, color: '#191c1e' }} />
                                </div>
                                <Button onClick={handleLogUsage} disabled={!selectedItem || !usageQuantity} style={{ width: '100%', background: 'linear-gradient(135deg, #06274b, #213d62)', color: '#fff', borderRadius: 8, fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}>Confirm & Deduct Stock</Button>
                            </motion.div>
                        </DialogContent>
                    </Dialog>
                </div>
                <div style={{ padding: 0 }}>
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
                                                    <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: isLow ? 700 : 600, color: isLow ? '#ba1a1a' : '#191c1e' }}>{item.stock}</span>
                                                    <span style={{ fontFamily: "'Inter', sans-serif", color: '#74777d', fontSize: 11 }}>{item.unit}</span>
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
                <motion.div style={{ marginTop: 20, background: '#ffffff', borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(6,39,75,0.05)', overflow: 'hidden' }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                    <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(6,39,75,0.06)' }}>
                        <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 15, fontWeight: 700, color: '#191c1e', display: 'flex', alignItems: 'center', gap: 8 }}><Activity style={{ width: 14, height: 14, color: '#06274b' }} /> Usage Log — Current Job</h3>
                    </div>
                    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {inventoryUsage.filter(i => i.jobId === (activeJob?.id || (activeJob as any)?._id)).map((item) => (
                            <motion.div key={item.id} className="queue-card" whileHover={cardHover} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12 }}>
                                <div>
                                    <p style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 13, color: '#191c1e' }}>{item.itemName}</p>
                                    <time style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: '#9fa3a9' }}>{item.usedAt && !isNaN(new Date(item.usedAt).getTime()) ? new Date(item.usedAt).toLocaleTimeString() : '—'}</time>
                                </div>
                                <span className="status-badge active">{item.quantity} {item.unit || 'units'}</span>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            )}
        </motion.div>
    );
}
