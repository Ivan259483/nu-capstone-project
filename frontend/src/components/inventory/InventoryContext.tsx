import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { InventoryService } from '@/lib/inventory-service-api';
import { SupplierService } from '@/lib/supplier-service';
import { ActivityService } from '@/lib/activity-service-api';

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

export type ItemStatus = 'in-stock' | 'low-stock' | 'critical' | 'out-of-stock' | 'on-order';
export type ItemCategory = 'Chemicals' | 'Microfiber' | 'Equipment' | 'Consumables' | 'Packaging';

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: ItemCategory;
  quantity: number;
  maxQuantity: number;
  minStock: number;
  unit: string;
  costPerUnit: number;
  supplierId: string;
  supplierName: string;
  status: ItemStatus;
  lastRestocked: string;
  notes: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  rating: number;
  leadTimeDays: number;
  categories: ItemCategory[];
  itemCount: number;
  totalOrders: number;
  lastOrderDate: string;
  paymentTerms: string;
  notes: string;
  status: 'active' | 'inactive' | 'on-hold';
}

export interface StockActivity {
  id: string;
  itemId: string;
  itemName: string;
  category: ItemCategory;
  type: 'deduct' | 'restock' | 'adjust' | 'voice-log';
  quantity: number;
  previousQty: number;
  newQty: number;
  performedBy: string;
  timestamp: string;
  note: string;
}

// ═══════════════════════════════════════════════════════════════════════
// Context shape
// ═══════════════════════════════════════════════════════════════════════

interface InventoryContextType {
  items: InventoryItem[];
  suppliers: Supplier[];
  activities: StockActivity[];
  loading: boolean;
  error: string | null;
  refreshAll: () => Promise<void>;
  refreshItems: () => Promise<InventoryItem[]>;
  refreshSuppliers: () => Promise<void>;
  addItem: (item: Partial<InventoryItem>) => Promise<InventoryItem>;
  editItem: (id: string, data: Partial<InventoryItem>) => Promise<InventoryItem>;
  removeItem: (id: string) => Promise<void>;
  addSupplier: (supplier: Partial<Supplier>) => Promise<Supplier>;
  removeSupplier: (id: string) => Promise<void>;
}

const InventoryContext = createContext<InventoryContextType | null>(null);

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used inside <InventoryProvider>');
  return ctx;
}

// ═══════════════════════════════════════════════════════════════════════
// Normalizers — backend shape → UI shape
// ═══════════════════════════════════════════════════════════════════════

function computeStatus(qty: number, minLevel: number): ItemStatus {
  if (qty === 0) return 'out-of-stock';
  if (qty <= minLevel * 0.5) return 'critical';
  if (qty <= minLevel) return 'low-stock';
  return 'in-stock';
}

function normalizeProduct(raw: any): InventoryItem {
  const id = raw._id || raw.id || '';
  const qty = raw.inventory ?? raw.quantity ?? 0;
  const minStock = raw.minLevel ?? raw.minStock ?? 5;
  const maxQuantity = raw.maxLevel ?? raw.maxQuantity ?? 100;
  const costPerUnit = raw.price ?? raw.costPerUnit ?? 0;

  let category: ItemCategory = 'Consumables';
  if (raw.category) {
    if (typeof raw.category === 'object' && raw.category.name) {
      category = raw.category.name as ItemCategory;
    } else if (typeof raw.category === 'string' && raw.category.length !== 24) {
      category = raw.category as ItemCategory;
    }
  }

  let supplierName = '';
  let supplierId = '';
  if (raw.supplier) {
    if (typeof raw.supplier === 'object') {
      supplierId = raw.supplier._id || raw.supplier.id || '';
      supplierName = raw.supplier.name || '';
    } else {
      supplierId = raw.supplier;
    }
  }

  return {
    id,
    sku: raw.sku || `SKU-${id.slice(-6).toUpperCase()}`,
    name: raw.name || 'Unnamed Item',
    category,
    quantity: qty,
    maxQuantity,
    minStock,
    unit: raw.unit || 'units',
    costPerUnit,
    supplierId,
    supplierName,
    status: computeStatus(qty, minStock),
    lastRestocked: raw.updatedAt || raw.createdAt || new Date().toISOString(),
    notes: raw.description || raw.notes || '',
  };
}

function normalizeSupplier(raw: any, allItems: InventoryItem[]): Supplier {
  const id = raw._id || raw.id || '';
  const linkedItems = allItems.filter((i) => i.supplierId === id);
  return {
    id,
    name: raw.name || '',
    contactName: raw.contactPerson || raw.contactName || '',
    email: raw.email || '',
    phone: raw.phone || '',
    website: raw.website || '',
    rating: raw.rating ?? 4,
    leadTimeDays: raw.leadTimeDays ?? 3,
    categories: [...new Set(linkedItems.map((i) => i.category))] as ItemCategory[],
    itemCount: linkedItems.length,
    totalOrders: raw.totalOrders ?? 0,
    lastOrderDate: raw.lastOrder || raw.lastOrderDate || '',
    paymentTerms: raw.paymentTerms || 'Net 30',
    notes: raw.notes || '',
    status: raw.status || 'active',
  };
}

function normalizeActivity(raw: any): StockActivity {
  const typeMap: Record<string, StockActivity['type']> = {
    stock_out: 'deduct',
    stock_in: 'restock',
    inventory_edit: 'adjust',
    low_stock: 'adjust',
  };
  return {
    id: raw._id || raw.id || '',
    itemId: raw.metadata?.productId || '',
    itemName: raw.metadata?.productName || raw.description?.match(/product: (.+?)[\.\,]/)?.[1] || 'Item',
    category: 'Consumables' as ItemCategory,
    type: typeMap[raw.type] || 'adjust',
    quantity: raw.metadata?.quantity ?? 1,
    previousQty: raw.metadata?.previousStock ?? 0,
    newQty: raw.metadata?.newStock ?? 0,
    performedBy: raw.userName || raw.performedBy || 'System',
    timestamp: raw.createdAt || raw.timestamp || new Date().toISOString(),
    note: raw.description || raw.notes || '',
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Provider
// ═══════════════════════════════════════════════════════════════════════

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [activities, setActivities] = useState<StockActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshItems = useCallback(async () => {
    try {
      const res = await InventoryService.getAllProducts();
      if (res?.success && Array.isArray(res.data)) {
        const normalized = res.data.map(normalizeProduct);
        setItems(normalized);
        return normalized;
      }
    } catch (e: any) {
      console.error('[Inventory] Failed to fetch products:', e);
      setError(e.message);
    }
    return [];
  }, []);

  const refreshSuppliers = useCallback(async () => {
    try {
      const res = await SupplierService.getAllSuppliers();
      if (res?.success && Array.isArray(res.data)) {
        setSuppliers(res.data.map((s: any) => normalizeSupplier(s, items)));
      }
    } catch (e: any) {
      console.error('[Inventory] Failed to fetch suppliers:', e);
    }
  }, [items]);

  const refreshActivities = useCallback(async () => {
    try {
      const res = await ActivityService.getActivityLogs({ limit: 20 });
      if (res?.success && Array.isArray(res.data)) {
        setActivities(res.data.map(normalizeActivity));
      }
    } catch { /* non-fatal */ }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const productRes = await InventoryService.getAllProducts();
      let normalizedItems: InventoryItem[] = [];
      if (productRes?.success && Array.isArray(productRes.data)) {
        normalizedItems = productRes.data.map(normalizeProduct);
        setItems(normalizedItems);
      }
      try {
        const supRes = await SupplierService.getAllSuppliers();
        if (supRes?.success && Array.isArray(supRes.data)) {
          setSuppliers(supRes.data.map((s: any) => normalizeSupplier(s, normalizedItems)));
        }
      } catch { /* optional */ }
      try {
        const actRes = await ActivityService.getActivityLogs({ limit: 20 });
        if (actRes?.success && Array.isArray(actRes.data)) {
          setActivities(actRes.data.map(normalizeActivity));
        }
      } catch { /* optional */ }
    } catch (e: any) {
      console.error('[Inventory] Failed to load data:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  // ── Mutations ──────────────────────────────────────────────────

  const addItem = useCallback(async (data: Partial<InventoryItem>): Promise<InventoryItem> => {
    const payload = {
      name: data.name,
      description: data.notes,
      price: data.costPerUnit,
      category: data.category,
      supplier: data.supplierId || undefined,
      inventory: data.quantity,
      minLevel: data.minStock,
      maxLevel: data.maxQuantity,
      unit: data.unit,
      sku: data.sku,
    };
    const res = await InventoryService.createProduct(payload);
    const normalized = normalizeProduct(res?.data || res);
    setItems((prev) => [...prev, normalized]);
    return normalized;
  }, []);

  const editItem = useCallback(async (id: string, data: Partial<InventoryItem>): Promise<InventoryItem> => {
    const payload: Record<string, any> = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.notes !== undefined) payload.description = data.notes;
    if (data.costPerUnit !== undefined) payload.price = data.costPerUnit;
    if (data.category !== undefined) payload.category = data.category;
    if (data.quantity !== undefined) payload.inventory = data.quantity;
    if (data.minStock !== undefined) payload.minLevel = data.minStock;
    if (data.maxQuantity !== undefined) payload.maxLevel = data.maxQuantity;
    if (data.unit !== undefined) payload.unit = data.unit;
    if (data.sku !== undefined) payload.sku = data.sku;
    if (data.supplierId !== undefined) payload.supplier = data.supplierId;

    const res = await InventoryService.updateProduct(id, payload);
    const normalized = normalizeProduct(res?.data || res);
    setItems((prev) => prev.map((i) => (i.id === id ? normalized : i)));
    return normalized;
  }, []);

  const removeItem = useCallback(async (id: string) => {
    await InventoryService.deleteProduct(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const addSupplier = useCallback(async (data: Partial<Supplier>): Promise<Supplier> => {
    const payload = { name: data.name, contactPerson: data.contactName, email: data.email, phone: data.phone };
    const res = await SupplierService.createSupplier(payload);
    const normalized = normalizeSupplier(res?.data || res, items);
    setSuppliers((prev) => [...prev, normalized]);
    return normalized;
  }, [items]);

  const removeSupplier = useCallback(async (id: string) => {
    await SupplierService.deleteSupplier(id);
    setSuppliers((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return (
    <InventoryContext.Provider value={{
      items, suppliers, activities, loading, error,
      refreshAll, refreshItems, refreshSuppliers,
      addItem, editItem, removeItem, addSupplier, removeSupplier,
    }}>
      {children}
    </InventoryContext.Provider>
  );
}
