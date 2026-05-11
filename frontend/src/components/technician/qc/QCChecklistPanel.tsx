import React, { useState, useEffect } from 'react';
import { CheckCircle2, Circle, AlertCircle, ShieldCheck } from 'lucide-react';

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  status: 'pass' | 'fail' | 'unchecked';
  required: boolean;
}

const initialChecklist: ChecklistItem[] = [
  {
    id: 'chk-photos',
    label: 'Before & After Photos Complete',
    description: 'Both before and after photos uploaded and clearly show the service area',
    status: 'pass',
    required: true,
  },
  {
    id: 'chk-service-match',
    label: 'Service Matches Job Order',
    description: 'Work performed matches the service ordered by the customer',
    status: 'pass',
    required: true,
  },
  {
    id: 'chk-no-damage',
    label: 'No Visible Damage Remaining',
    description: 'All pre-existing damage noted; no new damage visible on vehicle',
    status: 'unchecked',
    required: true,
  },
  {
    id: 'chk-clean-finish',
    label: 'Clean Finish — No Defects',
    description: 'Surface shows no buffing marks, streaks, high spots, or missed areas',
    status: 'unchecked',
    required: true,
  },
  {
    id: 'chk-customer-concerns',
    label: 'Customer Concerns Addressed',
    description: 'All items flagged in customer notes have been inspected and documented',
    status: 'fail',
    required: false,
  },
];

const statusCycle: Record<ChecklistItem['status'], ChecklistItem['status']> = {
  unchecked: 'pass',
  pass: 'fail',
  fail: 'unchecked',
};

function XCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="8.5" fill="#fef2f2" stroke="#fca5a5" />
      <path d="M6 6l6 6M12 6l-6 6" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

interface Props {
  orderId?: string;
  initialItems?: { item: string; passed: boolean; note?: string }[];
  onSave?: (items: { item: string; passed: boolean; note?: string }[]) => Promise<boolean>;
}

export default function QCChecklistPanel({ orderId, initialItems, onSave }: Props) {
  // Build initial state: if backend items provided, use those; otherwise default checklist
  const [items, setItems] = useState<ChecklistItem[]>(() => {
    if (initialItems && initialItems.length > 0) {
      return initialItems.map((it, i) => ({
        id: `chk-${i}`,
        label: it.item,
        description: '',
        status: (it.passed ? 'pass' : 'unchecked') as ChecklistItem['status'],
        required: true,
      }));
    }
    return initialChecklist;
  });
  const [saving, setSaving] = useState(false);

  // Sync with initialItems when job changes
  useEffect(() => {
    if (initialItems && initialItems.length > 0) {
      setItems(initialItems.map((it, i) => ({
        id: `chk-${i}`,
        label: it.item,
        description: '',
        status: (it.passed ? 'pass' : 'unchecked') as ChecklistItem['status'],
        required: true,
      })));
    } else {
      setItems(initialChecklist);
    }
  }, [orderId]);

  const toggle = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: statusCycle[item.status] } : item
      )
    );
  };

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    await onSave(items.map((it) => ({ item: it.label, passed: it.status === 'pass', note: '' })));
    setSaving(false);
  };

  const passCount = items.filter((i) => i.status === 'pass').length;
  const total = items.length;
  const allRequiredPass = items.filter((i) => i.required).every((i) => i.status === 'pass');

  return (
    <div className="bg-white rounded-xl shadow-sm shadow-slate-200/50 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <ShieldCheck size={15} className="text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800">Validation Checklist</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums ${allRequiredPass ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {passCount}/{total} passed
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-5 pt-3 pb-1">
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${(passCount / total) * 100}%` }}
          />
        </div>
      </div>

      <div className="divide-y divide-slate-100 px-2 py-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => toggle(item.id)}
            className={`
              w-full flex items-start gap-3 px-3 py-3.5 rounded-lg text-left transition-all duration-150
              ${item.status === 'pass' ? 'hover:bg-emerald-50/50' : item.status === 'fail' ? 'hover:bg-rose-50/50' : 'hover:bg-slate-50'}
            `}
          >
            <div className="mt-0.5 flex-shrink-0">
              {item.status === 'pass' && <CheckCircle2 size={18} className="text-emerald-500" />}
              {item.status === 'fail' && <XCircleIcon />}
              {item.status === 'unchecked' && <Circle size={18} className="text-slate-300" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`text-sm font-medium leading-snug ${
                  item.status === 'pass' ? 'text-emerald-700' :
                  item.status === 'fail' ? 'text-rose-700' : 'text-slate-700'
                }`}>
                  {item.label}
                </p>
                {item.required && (
                  <span className="text-[10px] text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded font-medium">Required</span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5 leading-snug">{item.description}</p>
            </div>
            <div className="flex-shrink-0 mt-0.5">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                item.status === 'pass' ? 'bg-emerald-100 text-emerald-700' :
                item.status === 'fail' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {item.status === 'pass' ? 'Pass' : item.status === 'fail' ? 'Fail' : 'Pending'}
              </span>
            </div>
          </button>
        ))}
      </div>

      {!allRequiredPass && (
        <div className="mx-4 mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
          <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 leading-snug">All required items must pass before approving. Click each item to toggle Pass / Fail / Pending.</p>
        </div>
      )}

      {onSave && (
        <div className="px-4 pb-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold transition-all duration-150 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {saving ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</>
            ) : (
              <><ShieldCheck size={14} />Save Checklist</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
