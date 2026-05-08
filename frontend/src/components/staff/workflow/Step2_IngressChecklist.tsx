import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ListChecks, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { getIngressChecklist } from './serviceConfig';
import type { Booking } from '@/types';

interface Step2Props {
  order: Booking;
  onComplete: (data: any) => Promise<void>;
  isCompleted: boolean;
}

export default function Step2_IngressChecklist({ order, onComplete, isCompleted }: Step2Props) {
  const serviceCategory = order.jobOrder?.serviceCategory || order.serviceType || 'ceramic_coating';
  const defaultItems = useMemo(() => getIngressChecklist(serviceCategory), [serviceCategory]);

  const [items, setItems] = useState(() => {
    if (order.ingressChecklist?.items && order.ingressChecklist.items.length > 0) {
      return order.ingressChecklist.items;
    }
    return defaultItems.map(item => ({ category: item.category, name: item.name, checked: false, note: '' }));
  });
  const [beforeServiceNotes, setBeforeServiceNotes] = useState(order.ingressChecklist?.beforeServiceNotes || '');
  const [preExistingConditions, setPreExistingConditions] = useState(order.ingressChecklist?.preExistingConditions || '');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(
    [...new Set(defaultItems.map(i => i.category))]
  ));
  const [saving, setSaving] = useState(false);

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const toggleItem = (idx: number) => {
    if (isCompleted) return;
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, checked: !item.checked } : item));
  };

  const categories = useMemo(() => {
    const cats: string[] = [];
    items.forEach(item => {
      if (!cats.includes(item.category)) cats.push(item.category);
    });
    return cats;
  }, [items]);

  const checkedCount = items.filter(i => i.checked).length;
  const totalCount = items.length;
  const allChecked = checkedCount === totalCount;
  const progress = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;

  const handleSubmit = async () => {
    if (!allChecked) return;
    setSaving(true);
    try {
      await onComplete({ items, beforeServiceNotes, preExistingConditions });
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div className="step-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <div className="step-header">
        <h3><ListChecks style={{ width: 20, height: 20, color: 'var(--accent)', marginRight: 8, verticalAlign: 'middle' }} />Pre-Assessment & Ingress Checklist</h3>
        <p>Assess the vehicle before any detailing service — {checkedCount}/{totalCount} items verified</p>
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 20 }}>
        <div className="wf-progress-bar">
          <motion.div
            className="wf-progress-fill"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          <span>{checkedCount} of {totalCount} completed</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>

      {/* Checklist by Category */}
      {categories.map(category => {
        const catItems = items.map((item, idx) => ({ ...item, idx })).filter(i => i.category === category);
        const catChecked = catItems.filter(i => i.checked).length;
        const expanded = expandedCategories.has(category);

        return (
          <div key={category} className="step-section" style={{ padding: 0, marginBottom: 12 }}>
            <button
              onClick={() => toggleCategory(category)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px',
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)',
                fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
              }}
            >
              {expanded ? <ChevronDown style={{ width: 14, height: 14 }} /> : <ChevronRight style={{ width: 14, height: 14 }} />}
              {category}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: catChecked === catItems.length ? '#22c55e' : 'var(--text-dim)' }}>
                {catChecked}/{catItems.length}
              </span>
            </button>
            {expanded && (
              <div style={{ padding: '0 12px 12px' }}>
                <div className="wf-checklist">
                  {catItems.map(item => (
                    <div
                      key={item.idx}
                      className={`wf-checklist-item ${item.checked ? 'checked' : ''}`}
                      onClick={() => toggleItem(item.idx)}
                    >
                      <div className="wf-checkbox">
                        {item.checked && <Check style={{ width: 12, height: 12 }} />}
                      </div>
                      <span className="wf-checklist-label">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Notes */}
      <div className="step-section">
        <div className="step-section-title">Additional Notes</div>
        <div className="wf-form-grid cols-1">
          <div className="wf-field">
            <label className="wf-label">Pre-Assessment Notes</label>
            <textarea className="wf-textarea" value={beforeServiceNotes} onChange={e => setBeforeServiceNotes(e.target.value)} placeholder="General notes from the vehicle pre-assessment..." disabled={isCompleted} />
          </div>
          <div className="wf-field">
            <label className="wf-label">Pre-existing Conditions</label>
            <textarea className="wf-textarea" value={preExistingConditions} onChange={e => setPreExistingConditions(e.target.value)} placeholder="Document any existing damage or conditions..." disabled={isCompleted} />
          </div>
        </div>
      </div>

      {!isCompleted && (
        <motion.button
          className="wf-btn primary"
          style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          onClick={handleSubmit}
          disabled={!allChecked || saving}
          whileTap={{ scale: 0.98 }}
        >
          {saving ? 'Saving...' : allChecked ? 'Complete Pre-Assessment ✓' : `Complete all ${totalCount - checkedCount} remaining items`}
        </motion.button>
      )}

      {isCompleted && (
        <div style={{ textAlign: 'center', padding: 16, color: '#22c55e', fontSize: 13, fontWeight: 700 }}>
          ✓ Pre-assessment checklist completed
        </div>
      )}
    </motion.div>
  );
}
