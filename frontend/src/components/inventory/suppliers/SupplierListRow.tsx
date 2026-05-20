import React from 'react';
import { Edit2, Trash2, Star } from 'lucide-react';
import type { Supplier } from '@/components/inventory/InventoryContext';

interface SupplierListRowProps { supplier: Supplier; linkedItemCount: number; isEven: boolean; onEdit: () => void; onDelete: () => void; }

const statusConfig = { active: { label: 'Active', className: 'status-in-stock' }, inactive: { label: 'Inactive', className: 'status-out-of-stock' }, 'on-hold': { label: 'On Hold', className: 'status-low-stock' } };
const categoryColors: Record<string, string> = { Chemicals: 'bg-blue-50 text-blue-700', Microfiber: 'bg-emerald-50 text-emerald-700', Equipment: 'bg-orange-50 text-orange-700', Consumables: 'bg-amber-50 text-amber-700', Packaging: 'bg-slate-50 text-slate-700' };

export default function SupplierListRow({ supplier, linkedItemCount, isEven, onEdit, onDelete }: SupplierListRowProps) {
  const status = statusConfig[supplier.status];
  return (
    <tr className={`border-b border-gray-50 last:border-0 group transition-all duration-150 hover:bg-blue-50/30 ${isEven ? 'bg-white' : 'bg-gray-50/20'}`}>
      <td className="px-4 py-3.5"><div><p className="text-sm font-bold text-gray-800">{supplier.name}</p><p className="text-xs text-gray-400 font-medium mt-0.5">{supplier.lastOrderDate}</p></div></td>
      <td className="px-4 py-3.5"><div><p className="text-sm font-medium text-gray-700">{supplier.contactName}</p><p className="text-xs text-gray-400 truncate max-w-[160px]">{supplier.email}</p></div></td>
      <td className="px-4 py-3.5"><div className="flex flex-wrap gap-1">{supplier.categories.map(cat => <span key={`list-chip-${supplier.id}-${cat}`} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${categoryColors[cat] ?? 'bg-gray-100 text-gray-600'}`}>{cat}</span>)}</div></td>
      <td className="px-4 py-3.5"><div className="flex items-center gap-0.5">{[1,2,3,4,5].map(s => <Star key={`list-star-${supplier.id}-${s}`} size={12} className={s <= supplier.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'} />)}</div></td>
      <td className="px-4 py-3.5"><span className="text-sm font-semibold text-gray-700 font-tabular">{supplier.leadTimeDays}d</span></td>
      <td className="px-4 py-3.5"><span className="text-sm font-semibold text-gray-700 font-tabular">{linkedItemCount}</span></td>
      <td className="px-4 py-3.5"><span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.className}`}>{status.label}</span></td>
      <td className="px-4 py-3.5"><div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150"><button onClick={onEdit} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all duration-150" title="Edit"><Edit2 size={14} /></button><button onClick={onDelete} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all duration-150" title="Remove"><Trash2 size={14} /></button></div></td>
    </tr>
  );
}
