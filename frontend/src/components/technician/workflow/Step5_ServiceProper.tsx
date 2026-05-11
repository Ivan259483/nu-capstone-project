import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Wrench, Play, CheckCircle, Clock } from 'lucide-react';
import { getServiceChecklist } from './serviceConfig';
import type { Booking } from '@/types';

interface Step5Props {
  order: Booking;
  onComplete: (data: any) => Promise<void>;
  isCompleted: boolean;
}

type StepStatus = 'pending' | 'in-progress' | 'completed';

export default function Step5_ServiceProper({ order, onComplete, isCompleted }: Step5Props) {
  const serviceCategory = order.jobOrder?.serviceCategory || order.serviceType || 'ceramic_coating';
  const checklistNames = useMemo(() => getServiceChecklist(serviceCategory), [serviceCategory]);

  const [checklist, setChecklist] = useState<{ name: string; status: StepStatus; completedAt?: string }[]>(() => {
    if (order.serviceProper?.checklist && order.serviceProper.checklist.length > 0) {
      return order.serviceProper.checklist.map(item => ({
        name: item.name,
        status: (item.status as StepStatus) || 'pending',
        completedAt: item.completedAt,
      }));
    }
    return checklistNames.map(name => ({ name, status: 'pending' as StepStatus }));
  });

  const [technicianNotes, setTechnicianNotes] = useState(order.serviceProper?.technicianNotes || '');
  const [saving, setSaving] = useState(false);

  const completedCount = checklist.filter(c => c.status === 'completed').length;
  const inProgressCount = checklist.filter(c => c.status === 'in-progress').length;
  const totalCount = checklist.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const allCompleted = completedCount === totalCount;

  const cycleStatus = (idx: number) => {
    if (isCompleted) return;
    setChecklist(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const nextStatus: StepStatus =
        item.status === 'pending' ? 'in-progress' :
        item.status === 'in-progress' ? 'completed' : 'pending';
      return { ...item, status: nextStatus, completedAt: nextStatus === 'completed' ? new Date().toISOString() : undefined };
    }));
  };

  const getStatusIcon = (status: StepStatus) => {
    switch (status) {
      case 'completed': return <CheckCircle style={{ width: 16, height: 16, color: '#22c55e' }} />;
      case 'in-progress': return <Play style={{ width: 14, height: 14, color: '#f59e0b' }} />;
      default: return <Clock style={{ width: 14, height: 14, color: 'var(--text-dim)' }} />;
    }
  };

  const getStatusColor = (status: StepStatus) => {
    switch (status) {
      case 'completed': return { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)' };
      case 'in-progress': return { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' };
      default: return { bg: 'rgba(255,255,255,0.015)', border: 'rgba(255,255,255,0.04)' };
    }
  };

  const handleSubmit = async () => {
    if (!allCompleted) return;
    setSaving(true);
    try {
      await onComplete({
        checklist,
        technicianNotes,
        progressPercentage: 100,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div className="step-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <div className="step-header">
        <h3><Wrench style={{ width: 20, height: 20, color: 'var(--accent)', marginRight: 8, verticalAlign: 'middle' }} />Service Proper</h3>
        <p>Track each step of the {serviceCategory.replace(/_/g, ' ')} service — tap to cycle status</p>
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 20 }}>
        <div className="wf-progress-bar">
          <motion.div className="wf-progress-fill" animate={{ width: `${progress}%` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          <span>
            {completedCount} completed • {inProgressCount} in progress • {totalCount - completedCount - inProgressCount} pending
          </span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>

      {/* Service Checklist */}
      <div className="step-section">
        <div className="step-section-title">
          Service Steps — {serviceCategory.replace(/_/g, ' ').toUpperCase()}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {checklist.map((item, idx) => {
            const colors = getStatusColor(item.status);
            return (
              <motion.div
                key={idx}
                onClick={() => cycleStatus(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  borderRadius: 10,
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  cursor: isCompleted ? 'default' : 'pointer',
                  transition: 'all 0.15s',
                }}
                whileTap={!isCompleted ? { scale: 0.98 } : {}}
              >
                <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-dim)', width: 24 }}>
                  {String(idx + 1).padStart(2, '0')}
                </span>
                {getStatusIcon(item.status)}
                <span style={{
                  flex: 1,
                  fontSize: 13,
                  color: item.status === 'completed' ? '#22c55e' : item.status === 'in-progress' ? '#f59e0b' : 'var(--text-secondary)',
                  textDecoration: item.status === 'completed' ? 'line-through' : 'none',
                  fontWeight: item.status === 'in-progress' ? 600 : 400,
                }}>
                  {item.name}
                </span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: item.status === 'completed' ? 'rgba(34,197,94,0.15)' : item.status === 'in-progress' ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)',
                  color: item.status === 'completed' ? '#22c55e' : item.status === 'in-progress' ? '#f59e0b' : 'var(--text-dim)',
                }}>
                  {item.status}
                </span>
              </motion.div>
            );
          })}
        </div>
        <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text-dim)' }}>
          💡 Tap a step to cycle: Pending → In Progress → Completed → Pending
        </div>
      </div>

      {/* Technician Notes */}
      <div className="step-section">
        <div className="step-section-title">Technician Notes</div>
        <textarea
          className="wf-textarea"
          style={{ width: '100%' }}
          value={technicianNotes}
          onChange={e => setTechnicianNotes(e.target.value)}
          placeholder="Any notes about the service process, issues encountered, or deviations..."
          disabled={isCompleted}
        />
      </div>

      {!isCompleted && (
        <motion.button
          className="wf-btn primary"
          style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          onClick={handleSubmit}
          disabled={!allCompleted || saving}
          whileTap={{ scale: 0.98 }}
        >
          {saving ? 'Saving...' : allCompleted ? 'Complete Service ✓' : `Complete ${totalCount - completedCount} remaining steps`}
        </motion.button>
      )}

      {isCompleted && (
        <div style={{ textAlign: 'center', padding: 16, color: '#22c55e', fontSize: 13, fontWeight: 700 }}>
          ✓ Service completed
        </div>
      )}
    </motion.div>
  );
}
