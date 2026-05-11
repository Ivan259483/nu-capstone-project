import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, CheckCircle, XCircle } from 'lucide-react';
import { getQCChecklist } from './serviceConfig';
import type { Booking } from '@/types';

interface Step6Props {
  order: Booking;
  onComplete: (data: any) => Promise<void>;
  isCompleted: boolean;
}

export default function Step6_QCChecklist({ order, onComplete, isCompleted }: Step6Props) {
  const serviceCategory = order.jobOrder?.serviceCategory || order.serviceType || 'ceramic_coating';
  const qcItems = useMemo(() => getQCChecklist(serviceCategory), [serviceCategory]);

  const [items, setItems] = useState<{ item: string; passed: boolean; note: string }[]>(() => {
    if (order.qcChecklist && order.qcChecklist.length > 0) {
      return order.qcChecklist.map(q => ({
        item: q.item,
        passed: q.passed,
        note: q.note || '',
      }));
    }
    return qcItems.map(name => ({ item: name, passed: false, note: '' }));
  });
  const [saving, setSaving] = useState(false);

  const passedCount = items.filter(i => i.passed).length;
  const totalCount = items.length;
  const allPassed = passedCount === totalCount;

  const togglePass = (idx: number) => {
    if (isCompleted) return;
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, passed: !item.passed } : item));
  };

  const updateNote = (idx: number, note: string) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, note } : item));
  };

  const handleSubmit = async () => {
    if (!allPassed) return;
    setSaving(true);
    try {
      await onComplete({ items });
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div className="step-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <div className="step-header">
        <h3><ShieldCheck style={{ width: 20, height: 20, color: 'var(--accent)', marginRight: 8, verticalAlign: 'middle' }} />Quality Control</h3>
        <p>Verify all QC items pass inspection — {passedCount}/{totalCount} passed</p>
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 20 }}>
        <div className="wf-progress-bar">
          <motion.div className="wf-progress-fill" animate={{ width: `${totalCount > 0 ? (passedCount / totalCount) * 100 : 0}%` }} />
        </div>
      </div>

      <div className="step-section">
        <div className="step-section-title">QC Inspection — {serviceCategory.replace(/_/g, ' ').toUpperCase()}</div>
        {items.map((item, idx) => (
          <div key={idx} className="qc-item">
            <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-dim)', width: 24 }}>
              {String(idx + 1).padStart(2, '0')}
            </span>
            <span className="qc-label">{item.item}</span>
            <div className="qc-toggle">
              <button
                className={`qc-toggle-btn ${item.passed ? 'pass' : ''}`}
                onClick={() => { if (!item.passed) togglePass(idx); }}
                disabled={isCompleted}
              >
                <CheckCircle style={{ width: 12, height: 12, display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
                Pass
              </button>
              <button
                className={`qc-toggle-btn ${!item.passed && items.some(i => i.passed) ? '' : ''}`}
                onClick={() => { if (item.passed) togglePass(idx); }}
                disabled={isCompleted}
                style={!item.passed ? { background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.15)', color: '#ef4444' } : {}}
              >
                <XCircle style={{ width: 12, height: 12, display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
                Fail
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Notes for failed items */}
      {items.some(i => !i.passed) && (
        <div className="step-section">
          <div className="step-section-title" style={{ color: '#ef4444' }}>Failed Items — Notes Required</div>
          {items.filter(i => !i.passed).map((item, _) => {
            const idx = items.indexOf(item);
            return (
              <div key={idx} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, marginBottom: 6 }}>{item.item}</div>
                <input
                  className="wf-input"
                  style={{ width: '100%' }}
                  value={item.note}
                  onChange={e => updateNote(idx, e.target.value)}
                  placeholder="Describe the issue and resolution..."
                  disabled={isCompleted}
                />
              </div>
            );
          })}
        </div>
      )}

      {!isCompleted && (
        <motion.button
          className="wf-btn primary"
          style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          onClick={handleSubmit}
          disabled={!allPassed || saving}
          whileTap={{ scale: 0.98 }}
        >
          {saving ? 'Saving...' : allPassed ? 'Complete QC ✓' : `${totalCount - passedCount} items need attention`}
        </motion.button>
      )}

      {isCompleted && (
        <div style={{ textAlign: 'center', padding: 16, color: '#22c55e', fontSize: 13, fontWeight: 700 }}>
          ✓ QC Checklist completed — all items passed
        </div>
      )}
    </motion.div>
  );
}
