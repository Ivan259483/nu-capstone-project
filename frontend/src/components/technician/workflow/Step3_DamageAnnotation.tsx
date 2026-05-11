import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, Trash2 } from 'lucide-react';
import type { Booking } from '@/types';

const DAMAGE_TYPES = [
  { value: 'scratch',       label: 'Scratch',       color: '#ef4444' },
  { value: 'dent',          label: 'Dent',          color: '#f97316' },
  { value: 'chip',          label: 'Chip',          color: '#eab308' },
  { value: 'repaint',       label: 'Repaint',       color: '#3b82f6' },
  { value: 'cracked_light', label: 'Cracked Light', color: '#a855f7' },
  { value: 'swirl_mark',    label: 'Swirl Mark',    color: '#ec4899' },
  { value: 'curb_rash',     label: 'Curb Rash',     color: '#14b8a6' },
] as const;

type DamageType = typeof DAMAGE_TYPES[number]['value'];
type ViewType = 'top' | 'left' | 'right';

interface Annotation {
  x: number;
  y: number;
  view: ViewType;
  type: DamageType;
  note: string;
}

interface Step3Props {
  order: Booking;
  onComplete: (data: any) => Promise<void>;
  isCompleted: boolean;
}

// ═══════ CAR SVG DIAGRAMS ═══════

function CarTopView() {
  return (
    <svg viewBox="0 0 400 700" style={{ width: '100%', height: '100%', maxHeight: 420 }}>
      {/* Body Outline */}
      <path d="M120,80 Q100,80 90,120 L70,200 Q60,240 60,280 L60,500 Q60,580 80,620 L100,660 Q120,690 160,690 L240,690 Q280,690 300,660 L320,620 Q340,580 340,500 L340,280 Q340,240 330,200 L310,120 Q300,80 280,80 Z"
        fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
      {/* Windshield */}
      <path d="M130,120 Q120,120 115,140 L105,200 Q100,220 110,230 L130,235 L270,235 L290,230 Q300,220 295,200 L285,140 Q280,120 270,120 Z"
        fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      {/* Rear Window */}
      <path d="M130,580 Q120,580 115,560 L110,520 Q108,505 115,498 L130,495 L270,495 L285,498 Q292,505 290,520 L285,560 Q280,580 270,580 Z"
        fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      {/* Hood Center Line */}
      <line x1="200" y1="80" x2="200" y2="235" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4,6" />
      {/* Roof Center Line */}
      <line x1="200" y1="235" x2="200" y2="495" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4,6" />
      {/* Trunk Center Line */}
      <line x1="200" y1="495" x2="200" y2="690" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4,6" />
      {/* Side Mirrors */}
      <ellipse cx="52" cy="225" rx="12" ry="18" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
      <ellipse cx="348" cy="225" rx="12" ry="18" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
      {/* Headlights */}
      <ellipse cx="130" cy="88" rx="20" ry="8" fill="rgba(245,158,11,0.1)" stroke="rgba(245,158,11,0.3)" strokeWidth="1" />
      <ellipse cx="270" cy="88" rx="20" ry="8" fill="rgba(245,158,11,0.1)" stroke="rgba(245,158,11,0.3)" strokeWidth="1" />
      {/* Taillights */}
      <ellipse cx="130" cy="682" rx="20" ry="8" fill="rgba(239,68,68,0.1)" stroke="rgba(239,68,68,0.3)" strokeWidth="1" />
      <ellipse cx="270" cy="682" rx="20" ry="8" fill="rgba(239,68,68,0.1)" stroke="rgba(239,68,68,0.3)" strokeWidth="1" />
      {/* Wheels */}
      <rect x="48" y="140" width="22" height="50" rx="8" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      <rect x="330" y="140" width="22" height="50" rx="8" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      <rect x="48" y="540" width="22" height="50" rx="8" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      <rect x="330" y="540" width="22" height="50" rx="8" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      {/* Labels */}
      <text x="200" y="50" textAnchor="middle" fill="rgba(255,255,255,0.15)" fontSize="12" fontWeight="600">FRONT</text>
      <text x="200" y="700" textAnchor="middle" fill="rgba(255,255,255,0.15)" fontSize="12" fontWeight="600" dy="16">REAR</text>
    </svg>
  );
}

function CarSideView({ side }: { side: 'left' | 'right' }) {
  const isRight = side === 'right';
  return (
    <svg viewBox="0 0 700 320" style={{ width: '100%', height: '100%', maxHeight: 320, transform: isRight ? 'scaleX(-1)' : 'none' }}>
      {/* Body */}
      <path d="M80,220 L80,180 Q80,140 120,120 L200,100 Q220,95 240,80 L360,80 Q400,80 420,100 L500,120 Q540,130 560,150 L600,180 Q630,190 630,220 Z"
        fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
      {/* Roofline */}
      <path d="M200,100 Q220,95 240,80 L360,80 Q380,80 400,96"
        fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
      {/* Windows */}
      <path d="M210,102 L250,82 L350,82 L390,100 L320,100 Q310,100 310,106 L310,115 Q310,118 300,118 L230,118 Q220,118 220,110 L220,106 Q220,102 210,102 Z"
        fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      {/* Door line */}
      <line x1="310" y1="82" x2="310" y2="220" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4,4" />
      {/* Floor line */}
      <line x1="120" y1="222" x2="590" y2="222" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      {/* Wheels */}
      <circle cx="170" cy="224" r="38" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
      <circle cx="170" cy="224" r="18" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      <circle cx="520" cy="224" r="38" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
      <circle cx="520" cy="224" r="18" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      {/* Headlight */}
      <ellipse cx="90" cy="185" rx="10" ry="20" fill="rgba(245,158,11,0.1)" stroke="rgba(245,158,11,0.3)" strokeWidth="1" />
      {/* Taillight */}
      <ellipse cx="622" cy="190" rx="8" ry="16" fill="rgba(239,68,68,0.1)" stroke="rgba(239,68,68,0.3)" strokeWidth="1" />
      {/* Side Mirror */}
      <ellipse cx="190" cy="100" rx="10" ry="8" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      {/* Door Handle */}
      <rect x="260" y="140" width="30" height="6" rx="3" fill="rgba(255,255,255,0.08)" />
      <rect x="380" y="140" width="30" height="6" rx="3" fill="rgba(255,255,255,0.08)" />
      {/* Label */}
      <text x="350" y="30" textAnchor="middle" fill="rgba(255,255,255,0.15)" fontSize="12" fontWeight="600" style={{ pointerEvents: 'none' }}>
        {side === 'left' ? 'DRIVER SIDE' : 'PASSENGER SIDE'}
      </text>
    </svg>
  );
}

export default function Step3_DamageAnnotation({ order, onComplete, isCompleted }: Step3Props) {
  const [activeView, setActiveView] = useState<ViewType>('top');
  const [activeDamageType, setActiveDamageType] = useState<DamageType>('scratch');
  const [annotations, setAnnotations] = useState<Annotation[]>(() => {
    return (order.damageAnnotations || []) as Annotation[];
  });
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDiagramClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isCompleted) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setAnnotations(prev => [...prev, {
      x, y,
      view: activeView,
      type: activeDamageType,
      note: '',
    }]);
    setSelectedIdx(annotations.length);
  }, [activeView, activeDamageType, isCompleted, annotations.length]);

  const updateNote = (idx: number, note: string) => {
    setAnnotations(prev => prev.map((a, i) => i === idx ? { ...a, note } : a));
  };

  const removeAnnotation = (idx: number) => {
    setAnnotations(prev => prev.filter((_, i) => i !== idx));
    setSelectedIdx(null);
  };

  const getTypeConfig = (type: string) => DAMAGE_TYPES.find(d => d.value === type) || DAMAGE_TYPES[0];

  const viewAnnotations = annotations.filter(a => a.view === activeView);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onComplete({ annotations });
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div className="step-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <div className="step-header">
        <h3><Camera style={{ width: 20, height: 20, color: 'var(--accent)', marginRight: 8, verticalAlign: 'middle' }} />Damage Annotation</h3>
        <p>Click on the vehicle diagram to mark pre-existing damage — {annotations.length} annotations placed</p>
      </div>

      {/* View Selector */}
      <div className="damage-views">
        {(['top', 'left', 'right'] as ViewType[]).map(view => (
          <button
            key={view}
            className={`damage-view-btn ${activeView === view ? 'active' : ''}`}
            onClick={() => setActiveView(view)}
          >
            {view === 'top' ? '🔝 Top View' : view === 'left' ? '◀️ Left Side' : '▶️ Right Side'}
            <span style={{ marginLeft: 6, color: 'var(--text-dim)', fontSize: 10 }}>
              ({annotations.filter(a => a.view === view).length})
            </span>
          </button>
        ))}
      </div>

      {/* Damage Type Selector */}
      <div className="damage-type-selector">
        {DAMAGE_TYPES.map(dt => (
          <button
            key={dt.value}
            className={`damage-type-btn ${activeDamageType === dt.value ? 'active' : ''}`}
            onClick={() => setActiveDamageType(dt.value)}
            disabled={isCompleted}
          >
            <span className="damage-type-dot" style={{ background: dt.color }} />
            {dt.label}
          </button>
        ))}
      </div>

      {/* Car Diagram */}
      <div className="step-section" style={{ padding: 0, position: 'relative' }}>
        <div
          className="car-diagram-container"
          ref={containerRef}
          onClick={handleDiagramClick}
        >
          {activeView === 'top' && <CarTopView />}
          {activeView === 'left' && <CarSideView side="left" />}
          {activeView === 'right' && <CarSideView side="right" />}

          {/* Rendered Markers */}
          <AnimatePresence>
            {viewAnnotations.map((ann, i) => {
              const globalIdx = annotations.indexOf(ann);
              const cfg = getTypeConfig(ann.type);
              return (
                <motion.div
                  key={`${ann.view}-${i}`}
                  className={`damage-marker ${selectedIdx === globalIdx ? 'selected' : ''}`}
                  style={{
                    left: `${ann.x}%`,
                    top: `${ann.y}%`,
                    background: cfg.color,
                  }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  onClick={(e) => { e.stopPropagation(); setSelectedIdx(globalIdx === selectedIdx ? null : globalIdx); }}
                  title={`${cfg.label}${ann.note ? ': ' + ann.note : ''}`}
                >
                  {i + 1}
                  {selectedIdx === globalIdx && (
                    <div className="damage-marker-tooltip">{cfg.label}: {ann.note || 'No note'}</div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Annotations List */}
      {annotations.length > 0 && (
        <div className="step-section">
          <div className="step-section-title">Marked Damage ({annotations.length})</div>
          <div className="damage-list">
            {annotations.map((ann, idx) => {
              const cfg = getTypeConfig(ann.type);
              return (
                <div
                  key={idx}
                  className={`damage-list-item ${selectedIdx === idx ? 'selected' : ''}`}
                  style={selectedIdx === idx ? { borderColor: 'rgba(245,158,11,0.3)' } : {}}
                  onClick={() => { setActiveView(ann.view); setSelectedIdx(idx); }}
                >
                  <span className="damage-type-dot" style={{ background: cfg.color, width: 10, height: 10, borderRadius: '50%', flexShrink: 0 }} />
                  <span className="dm-type" style={{ color: cfg.color }}>{cfg.label}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>{ann.view}</span>
                  <input
                    className="dm-note-input"
                    value={ann.note}
                    onChange={e => updateNote(idx, e.target.value)}
                    placeholder="Add note..."
                    disabled={isCompleted}
                    onClick={e => e.stopPropagation()}
                  />
                  {!isCompleted && (
                    <button className="dm-remove" onClick={(e) => { e.stopPropagation(); removeAnnotation(idx); }}>
                      <Trash2 style={{ width: 12, height: 12 }} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!isCompleted && (
        <motion.button
          className="wf-btn primary"
          style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          onClick={handleSubmit}
          disabled={saving}
          whileTap={{ scale: 0.98 }}
        >
          {saving ? 'Saving...' : annotations.length === 0 ? 'No Damage Found — Continue ✓' : `Save ${annotations.length} Annotations ✓`}
        </motion.button>
      )}

      {isCompleted && (
        <div style={{ textAlign: 'center', padding: 16, color: '#22c55e', fontSize: 13, fontWeight: 700 }}>
          ✓ Damage Annotation completed — {annotations.length} marks recorded
        </div>
      )}
    </motion.div>
  );
}
