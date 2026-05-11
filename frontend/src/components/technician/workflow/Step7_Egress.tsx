import { useState, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Truck, Check, PartyPopper } from 'lucide-react';
import { getAftercareChecklist } from './serviceConfig';
import type { Booking } from '@/types';

interface Step7Props {
  order: Booking;
  onComplete: (data: any) => Promise<void>;
  isCompleted: boolean;
}

export default function Step7_Egress({ order, onComplete, isCompleted }: Step7Props) {
  const serviceCategory = order.jobOrder?.serviceCategory || order.serviceType || 'ceramic_coating';
  const aftercareItems = useMemo(() => getAftercareChecklist(serviceCategory), [serviceCategory]);

  const [aftercareChecklist, setAftercareChecklist] = useState<{ item: string; checked: boolean }[]>(() => {
    if (order.egressData?.aftercareChecklist && order.egressData.aftercareChecklist.length > 0) {
      return order.egressData.aftercareChecklist;
    }
    return aftercareItems.map(item => ({ item, checked: false }));
  });

  const [paymentConfirmed, setPaymentConfirmed] = useState(order.egressData?.paymentConfirmed || false);
  const [detailerName, setDetailerName] = useState(order.egressData?.detailerName || '');
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Customer signature
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(!!order.egressData?.customerSignature);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (isCompleted) return;
    setIsDrawing(true);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || isCompleted) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
    setHasSigned(true);
  };

  const endDraw = () => setIsDrawing(false);

  const clearSignature = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setHasSigned(false);
  };

  const toggleAftercare = (idx: number) => {
    if (isCompleted) return;
    setAftercareChecklist(prev => prev.map((item, i) => i === idx ? { ...item, checked: !item.checked } : item));
  };

  const allAftercareChecked = aftercareChecklist.every(i => i.checked);
  const isValid = allAftercareChecked && paymentConfirmed && detailerName.trim() && hasSigned;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      const signature = canvasRef.current?.toDataURL('image/png') || order.egressData?.customerSignature || '';
      await onComplete({
        aftercareChecklist,
        paymentConfirmed,
        customerSignature: signature,
        detailerName,
        releaseTimestamp: new Date().toISOString(),
      });
      setShowSuccess(true);
    } finally {
      setSaving(false);
    }
  };

  if (showSuccess || isCompleted) {
    return (
      <motion.div className="step-panel" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', paddingTop: 60 }}>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
        >
          <PartyPopper style={{ width: 64, height: 64, color: '#22c55e', margin: '0 auto 20px' }} />
        </motion.div>
        <h3 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 26, color: '#22c55e', margin: '0 0 12px' }}>
          JOB COMPLETE
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 400, margin: '0 auto 24px' }}>
          Vehicle has been released to {order.customerName}. All 7 workflow steps have been completed and recorded.
        </p>
        <div style={{
          display: 'inline-flex', flexDirection: 'column', gap: 8,
          background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)',
          borderRadius: 16, padding: '20px 32px', textAlign: 'left',
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Summary</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Vehicle: <strong style={{ color: '#fff' }}>{order.vehicleModel || order.vehicleInfo}</strong></div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Service: <strong style={{ color: '#fff' }}>{serviceCategory.replace(/_/g, ' ')}</strong></div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Released by: <strong style={{ color: '#fff' }}>{detailerName || order.egressData?.detailerName}</strong></div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Released at: <strong style={{ color: '#fff' }}>{new Date(order.egressData?.releaseTimestamp || Date.now()).toLocaleString()}</strong></div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div className="step-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <div className="step-header">
        <h3><Truck style={{ width: 20, height: 20, color: 'var(--accent)', marginRight: 8, verticalAlign: 'middle' }} />Egress & Release</h3>
        <p>Final checklist before handing the vehicle back to the customer</p>
      </div>

      {/* Aftercare Checklist */}
      <div className="step-section">
        <div className="step-section-title">Aftercare Checklist — {serviceCategory.replace(/_/g, ' ').toUpperCase()}</div>
        <div className="wf-checklist">
          {aftercareChecklist.map((item, idx) => (
            <div
              key={idx}
              className={`wf-checklist-item ${item.checked ? 'checked' : ''}`}
              onClick={() => toggleAftercare(idx)}
            >
              <div className="wf-checkbox">
                {item.checked && <Check style={{ width: 12, height: 12 }} />}
              </div>
              <span className="wf-checklist-label">{item.item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Payment Confirmation */}
      <div className="step-section">
        <div className="step-section-title">Payment Confirmation</div>
        <div
          className={`wf-checklist-item ${paymentConfirmed ? 'checked' : ''}`}
          onClick={() => !isCompleted && setPaymentConfirmed(!paymentConfirmed)}
          style={{ marginBottom: 0 }}
        >
          <div className="wf-checkbox">
            {paymentConfirmed && <Check style={{ width: 12, height: 12 }} />}
          </div>
          <span className="wf-checklist-label" style={{ fontWeight: 600 }}>
            Payment has been received and confirmed
          </span>
        </div>
      </div>

      {/* Detailer Name */}
      <div className="step-section">
        <div className="step-section-title">Releasing Detailer</div>
        <input
          className="wf-input"
          style={{ width: '100%' }}
          value={detailerName}
          onChange={e => setDetailerName(e.target.value)}
          placeholder="Enter your full name (detailer releasing vehicle)"
          disabled={isCompleted}
        />
      </div>

      {/* Customer Release Signature */}
      <div className="step-section">
        <div className="step-section-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Customer Release Signature</span>
          <button onClick={clearSignature} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
            Clear
          </button>
        </div>
        <div className="wf-signature-area">
          <canvas
            ref={canvasRef}
            width={800}
            height={200}
            style={{ width: '100%', height: 150, cursor: 'crosshair', touchAction: 'none' }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
          {!hasSigned && (
            <div style={{ textAlign: 'center', padding: '12px 0', color: '#999', fontSize: 12 }}>
              ✍️ Customer signs here to confirm vehicle release
            </div>
          )}
        </div>
      </div>

      <motion.button
        className="wf-btn complete"
        style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
        onClick={handleSubmit}
        disabled={!isValid || saving}
        whileTap={{ scale: 0.98 }}
      >
        {saving ? 'Finalizing...' : '🎉 Release Vehicle & Complete Job'}
      </motion.button>
    </motion.div>
  );
}
