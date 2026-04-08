import { useState, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { FileSignature, Check } from 'lucide-react';
import { getWaiverTerms } from './serviceConfig';
import type { Booking } from '@/types';

interface Step4Props {
  order: Booking;
  onComplete: (data: any) => Promise<void>;
  isCompleted: boolean;
}

export default function Step4_Waiver({ order, onComplete, isCompleted }: Step4Props) {
  const serviceCategory = order.jobOrder?.serviceCategory || order.serviceType || 'ceramic_coating';
  const waiverTerms = useMemo(() => getWaiverTerms(serviceCategory), [serviceCategory]);

  const [termsAccepted, setTermsAccepted] = useState<{ label: string; accepted: boolean }[]>(() => {
    if (order.customerWaiver?.termsAccepted && order.customerWaiver.termsAccepted.length > 0) {
      return order.customerWaiver.termsAccepted;
    }
    return waiverTerms.map(t => ({ label: t, accepted: false }));
  });

  const [customerFullName, setCustomerFullName] = useState(order.customerWaiver?.customerFullName || order.customerName || '');
  const [saving, setSaving] = useState(false);

  // Simple canvas-based signature
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(!!order.customerWaiver?.digitalSignature);

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

  const endDraw = () => { setIsDrawing(false); };

  const clearSignature = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setHasSigned(false);
  };

  const toggleTerm = (idx: number) => {
    if (isCompleted) return;
    setTermsAccepted(prev => prev.map((t, i) => i === idx ? { ...t, accepted: !t.accepted } : t));
  };

  const allTermsAccepted = termsAccepted.every(t => t.accepted);
  const isValid = allTermsAccepted && customerFullName.trim() && hasSigned;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      const signature = canvasRef.current?.toDataURL('image/png') || order.customerWaiver?.digitalSignature || '';
      await onComplete({
        termsAccepted,
        customerFullName,
        digitalSignature: signature,
        dateSigned: new Date().toISOString(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div className="step-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <div className="step-header">
        <h3><FileSignature style={{ width: 20, height: 20, color: 'var(--accent)', marginRight: 8, verticalAlign: 'middle' }} />Customer Waiver</h3>
        <p>Customer must read and accept all waiver terms, then provide their digital signature</p>
      </div>

      {/* Terms */}
      <div className="step-section">
        <div className="step-section-title">Terms & Conditions — {serviceCategory.replace(/_/g, ' ').toUpperCase()}</div>
        <div style={{ marginBottom: 8, fontSize: 11, color: 'var(--text-dim)' }}>
          {termsAccepted.filter(t => t.accepted).length} of {termsAccepted.length} terms accepted
        </div>
        {termsAccepted.map((term, idx) => (
          <div
            key={idx}
            className={`waiver-term ${term.accepted ? 'accepted' : ''}`}
            onClick={() => toggleTerm(idx)}
          >
            <div className="waiver-checkbox">
              {term.accepted && <Check style={{ width: 12, height: 12, color: '#fff' }} />}
            </div>
            <span className="waiver-text">{term.label}</span>
          </div>
        ))}
      </div>

      {/* Customer Name */}
      <div className="step-section">
        <div className="step-section-title">Customer Full Legal Name</div>
        <input
          className="wf-input"
          style={{ width: '100%' }}
          value={customerFullName}
          onChange={e => setCustomerFullName(e.target.value)}
          placeholder="Enter customer's full name as printed on ID"
          disabled={isCompleted}
        />
      </div>

      {/* Signature */}
      <div className="step-section">
        <div className="step-section-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Digital Signature</span>
          {!isCompleted && (
            <button onClick={clearSignature} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
              Clear
            </button>
          )}
        </div>
        {isCompleted && order.customerWaiver?.digitalSignature ? (
          <div className="wf-signature-area" style={{ padding: 16, textAlign: 'center' }}>
            <img src={order.customerWaiver.digitalSignature} alt="Customer Signature" style={{ maxWidth: '100%', maxHeight: 120 }} />
            <div style={{ fontSize: 11, color: '#666', marginTop: 8 }}>
              Signed by {order.customerWaiver.customerFullName} on {order.customerWaiver.dateSigned ? new Date(order.customerWaiver.dateSigned).toLocaleDateString() : '-'}
            </div>
          </div>
        ) : (
          <div className="wf-signature-area">
            <canvas
              ref={canvasRef}
              width={800}
              height={200}
              style={{ width: '100%', height: 150, cursor: isCompleted ? 'default' : 'crosshair', touchAction: 'none' }}
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
                ✍️ Draw signature above
              </div>
            )}
          </div>
        )}
      </div>

      {!isCompleted && (
        <motion.button
          className="wf-btn primary"
          style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          onClick={handleSubmit}
          disabled={!isValid || saving}
          whileTap={{ scale: 0.98 }}
        >
          {saving ? 'Saving...' : !allTermsAccepted ? `Accept all ${termsAccepted.length - termsAccepted.filter(t => t.accepted).length} remaining terms` : !hasSigned ? 'Signature required' : 'Submit Waiver ✓'}
        </motion.button>
      )}

      {isCompleted && (
        <div style={{ textAlign: 'center', padding: 16, color: '#22c55e', fontSize: 13, fontWeight: 700 }}>
          ✓ Waiver signed and accepted
        </div>
      )}
    </motion.div>
  );
}
