import React from 'react';
import { PackageMinus, PackagePlus, Trash2, X } from 'lucide-react';

interface BulkActionBarProps { selectedCount: number; onDeduct: () => void; onRestock: () => void; onDelete: () => void; onClear: () => void; }

export default function BulkActionBar({ selectedCount, onDeduct, onRestock, onDelete, onClear }: BulkActionBarProps) {
  if (selectedCount === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 slide-up">
      <div className="glass-card rounded-2xl px-5 py-3.5 shadow-glass flex items-center gap-4 border border-blue-100/60">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg gradient-primary text-white text-xs font-bold flex items-center justify-center font-tabular">{selectedCount}</span>
          <span className="text-sm font-semibold text-gray-700">{selectedCount === 1 ? 'item' : 'items'} selected</span>
        </div>
        <div className="w-px h-6 bg-gray-200" />
        <div className="flex items-center gap-2">
          <button onClick={onDeduct} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-all duration-150 active:scale-95"><PackageMinus size={14} />Deduct 1</button>
          <button onClick={onRestock} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-all duration-150 active:scale-95"><PackagePlus size={14} />Restock All</button>
          <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-all duration-150 active:scale-95"><Trash2 size={14} />Delete</button>
        </div>
        <button onClick={onClear} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-150" aria-label="Clear selection"><X size={16} /></button>
      </div>
    </div>
  );
}
