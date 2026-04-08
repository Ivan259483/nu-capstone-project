import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  Dimensions,
  Animated,
} from 'react-native';
import { useWorkflow } from './WorkflowContext';
import { useTheme } from '@/hooks/useThemeContext';
import { CheckCircle, Clock, X, Camera, Shield } from '@/components/ui/Icons';
import Svg, { Rect, Path, Circle, Defs, RadialGradient, Stop, Line, G, Ellipse } from 'react-native-svg';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const ACCENT = '#f97316';
const ACCENT_DIM = 'rgba(249,115,22,0.10)';
const ACCENT_BORDER = 'rgba(249,115,22,0.25)';
const SUCCESS = '#22c55e';
const BG = '#050506';
const SURFACE = '#0E0E12';
const ELEVATED = '#16161C';
const BORDER = '#1E1E26';
const TEXT_PRIMARY = '#F5F5F7';
const TEXT_SEC = '#A1A1AA';
const TEXT_MUT = '#71717A';
const TEXT_DIM = '#52525B';

// ─── Damage Configuration ─────────────────────────────────────────────────────
const DAMAGE_TYPES = [
  { id: 'scratch',   label: 'Scratch',        color: '#f97316', icon: '─' },
  { id: 'swirl',     label: 'Swirl Mark',     color: '#f59e0b', icon: '◎' },
  { id: 'dent',      label: 'Dent',           color: '#ef4444', icon: '◉' },
  { id: 'chip',      label: 'Paint Chip',     color: '#eab308', icon: '▪' },
  { id: 'crack',     label: 'Crack',          color: '#a855f7', icon: '⚡' },
  { id: 'curb_rash', label: 'Curb Rash',      color: '#ec4899', icon: '◐' },
  { id: 'repaint',   label: 'Repaint History', color: '#3b82f6', icon: '▣' },
  { id: 'stain',     label: 'Stain / Etch',   color: '#06b6d4', icon: '◌' },
] as const;

const SEVERITY_LEVELS = [
  { id: 'low',    label: 'Minor',    color: '#22c55e', glow: 'rgba(34,197,94,0.3)' },
  { id: 'medium', label: 'Moderate', color: '#f59e0b', glow: 'rgba(245,158,11,0.3)' },
  { id: 'high',   label: 'Severe',   color: '#ef4444', glow: 'rgba(239,68,68,0.3)' },
];

const getTypeConfig = (id: string) => DAMAGE_TYPES.find(t => t.id === id) || DAMAGE_TYPES[0];
const getSeverityConfig = (id: string) => SEVERITY_LEVELS.find(s => s.id === id) || SEVERITY_LEVELS[1];

const { width: SCREEN_W } = Dimensions.get('window');
const CANVAS_W = Math.min(SCREEN_W - 32, 400);
const CANVAS_H = CANVAS_W * 1.6;
const SVG_VB_W = 240;
const SVG_VB_H = 440;

// ─── Main Component ──────────────────────────────────────────────────────────
export default function Step4_DamageAnnotation() {
  const { colors } = useTheme();
  const { job, saveStep, saving } = useWorkflow();

  const [markers, setMarkers] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeCoord, setActiveCoord] = useState<{ x: number; y: number } | null>(null);
  const [selectedType, setSelectedType] = useState('scratch');
  const [selectedSeverity, setSelectedSeverity] = useState('medium');
  const [notes, setNotes] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (job?.damageAnnotations) {
      setMarkers(job.damageAnnotations as any[]);
    }
  }, [job]);

  // ── Computed stats ──
  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    markers.forEach(m => {
      byType[m.type] = (byType[m.type] || 0) + 1;
      bySeverity[m.severity || 'medium'] = (bySeverity[m.severity || 'medium'] || 0) + 1;
    });
    return { total: markers.length, byType, bySeverity };
  }, [markers]);

  const handleSvgPress = (e: any) => {
    const { locationX, locationY } = e.nativeEvent;
    const scaleX = SVG_VB_W / CANVAS_W;
    const scaleY = SVG_VB_H / CANVAS_H;
    setActiveCoord({ x: locationX * scaleX, y: locationY * scaleY });
    setEditingIndex(null);
    resetForm();
    setModalVisible(true);
  };

  const handleMarkerPress = (index: number) => {
    const m = markers[index];
    setActiveCoord({ x: m.x, y: m.y });
    setSelectedType(m.type);
    setSelectedSeverity(m.severity || 'medium');
    setNotes(m.note || '');
    setEditingIndex(index);
    setModalVisible(true);
  };

  const resetForm = () => {
    setSelectedType('scratch');
    setSelectedSeverity('medium');
    setNotes('');
  };

  const saveAnnotation = () => {
    if (!activeCoord) return;
    const newMarker = {
      x: activeCoord.x,
      y: activeCoord.y,
      panel: 'exterior',
      type: selectedType,
      severity: selectedSeverity,
      note: notes,
      images: [],
    };
    let updated = [...markers];
    if (editingIndex !== null) {
      updated[editingIndex] = newMarker;
    } else {
      updated.push(newMarker);
    }
    setMarkers(updated);
    setModalVisible(false);
    saveStep(4, { annotations: updated }, false);
  };

  const removeMarker = () => {
    if (editingIndex === null) return;
    const updated = [...markers];
    updated.splice(editingIndex, 1);
    setMarkers(updated);
    setModalVisible(false);
    saveStep(4, { annotations: updated }, false);
  };

  const handleAdvance = () => {
    saveStep(4, { annotations: markers }, true);
  };

  // ── Grid lines for blueprint effect ──
  const gridLines = [];
  for (let x = 0; x <= SVG_VB_W; x += 20) {
    gridLines.push(
      <Line key={`gv${x}`} x1={x} y1={0} x2={x} y2={SVG_VB_H} stroke="rgba(249,115,22,0.04)" strokeWidth={0.5} />
    );
  }
  for (let y = 0; y <= SVG_VB_H; y += 20) {
    gridLines.push(
      <Line key={`gh${y}`} x1={0} y1={y} x2={SVG_VB_W} y2={y} stroke="rgba(249,115,22,0.04)" strokeWidth={0.5} />
    );
  }

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* ══════ HEADER ══════ */}
        <View style={s.header}>
          <View style={s.headerBadge}>
            <Shield size={14} color={ACCENT} />
            <Text style={s.headerBadgeText}>STEP 4 OF 9</Text>
          </View>
          <Text style={s.title}>Vehicle Damage Inspection</Text>
          <Text style={s.subtitle}>
            Tap directly on the vehicle diagram to pin pre-existing damage. {markers.length > 0 ? `${markers.length} point${markers.length > 1 ? 's' : ''} recorded.` : 'No damage recorded yet.'}
          </Text>
        </View>

        {/* ══════ VEHICLE CANVAS ══════ */}
        <View style={s.canvasOuter}>
          {/* Blueprint glow border */}
          <View style={s.canvasGlow} />
          <View style={s.canvasInner}>
            <TouchableOpacity activeOpacity={0.95} onPress={handleSvgPress}>
              <Svg width={CANVAS_W} height={CANVAS_H} viewBox={`0 0 ${SVG_VB_W} ${SVG_VB_H}`}>
                {/* Background */}
                <Rect x={0} y={0} width={SVG_VB_W} height={SVG_VB_H} fill="#08080C" rx={12} />

                {/* Blueprint Grid */}
                {gridLines}

                {/* Center crosshair lines */}
                <Line x1={SVG_VB_W / 2} y1={0} x2={SVG_VB_W / 2} y2={SVG_VB_H} stroke="rgba(249,115,22,0.06)" strokeWidth={1} strokeDasharray="4,8" />
                <Line x1={0} y1={SVG_VB_H / 2} x2={SVG_VB_W} y2={SVG_VB_H / 2} stroke="rgba(249,115,22,0.06)" strokeWidth={1} strokeDasharray="4,8" />

                <Defs>
                  <RadialGradient id="bodyFill" cx="50%" cy="45%" r="55%">
                    <Stop offset="0%" stopColor="#1C1C24" />
                    <Stop offset="100%" stopColor="#0F0F14" />
                  </RadialGradient>
                  <RadialGradient id="cabinFill" cx="50%" cy="50%" r="50%">
                    <Stop offset="0%" stopColor="#0A0A0F" />
                    <Stop offset="100%" stopColor="#060608" />
                  </RadialGradient>
                </Defs>

                {/* Vehicle Shadow */}
                <Ellipse cx={SVG_VB_W / 2} cy={SVG_VB_H - 20} rx={70} ry={8} fill="rgba(0,0,0,0.4)" />

                {/* ── Body Chassis ── */}
                <Rect x={60} y={44} width={120} height={352} rx={28} fill="url(#bodyFill)" stroke="rgba(255,255,255,0.06)" strokeWidth={1.5} />

                {/* ── Hood ── */}
                <Path
                  d="M75 56 Q120 38 165 56 L165 136 Q120 148 75 136 Z"
                  fill="#1A1A22" stroke="rgba(255,255,255,0.08)" strokeWidth={1}
                />
                {/* Hood line detail */}
                <Line x1={120} y1={50} x2={120} y2={135} stroke="rgba(255,255,255,0.04)" strokeWidth={0.8} />

                {/* ── Windshield ── */}
                <Path
                  d="M78 140 Q120 130 162 140 L158 172 Q120 168 82 172 Z"
                  fill="rgba(59,130,246,0.06)" stroke="rgba(59,130,246,0.12)" strokeWidth={1}
                />

                {/* ── Cabin / Roof ── */}
                <Rect x={72} y={172} width={96} height={90} rx={18} fill="url(#cabinFill)" stroke={ACCENT_BORDER} strokeWidth={1.2} />
                {/* Roof line */}
                <Line x1={120} y1={178} x2={120} y2={256} stroke="rgba(249,115,22,0.08)" strokeWidth={0.6} />

                {/* ── Rear Windshield ── */}
                <Path
                  d="M82 266 Q120 270 158 266 L162 294 Q120 304 78 294 Z"
                  fill="rgba(59,130,246,0.05)" stroke="rgba(59,130,246,0.10)" strokeWidth={1}
                />

                {/* ── Trunk ── */}
                <Path
                  d="M75 298 Q120 310 165 298 L165 370 Q120 382 75 370 Z"
                  fill="#1A1A22" stroke="rgba(255,255,255,0.08)" strokeWidth={1}
                />
                {/* Trunk line */}
                <Line x1={120} y1={305} x2={120} y2={368} stroke="rgba(255,255,255,0.04)" strokeWidth={0.8} />

                {/* ── Front Bumper ── */}
                <Path d="M58 52 Q120 22 182 52" fill="none" stroke={ACCENT} strokeWidth={2.5} opacity={0.6} />
                {/* Front light accents */}
                <Circle cx={78} cy={56} r={5} fill="rgba(249,115,22,0.15)" stroke={ACCENT} strokeWidth={1} />
                <Circle cx={162} cy={56} r={5} fill="rgba(249,115,22,0.15)" stroke={ACCENT} strokeWidth={1} />

                {/* ── Rear Bumper ── */}
                <Path d="M58 388 Q120 418 182 388" fill="none" stroke="#ef4444" strokeWidth={2} opacity={0.4} />
                {/* Tail light accents */}
                <Rect x={72} y={376} width={12} height={6} rx={2} fill="rgba(239,68,68,0.2)" stroke="rgba(239,68,68,0.4)" strokeWidth={0.8} />
                <Rect x={156} y={376} width={12} height={6} rx={2} fill="rgba(239,68,68,0.2)" stroke="rgba(239,68,68,0.4)" strokeWidth={0.8} />

                {/* ── Side Mirrors ── */}
                <Ellipse cx={56} cy={160} rx={8} ry={5} fill="#1A1A22" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                <Ellipse cx={184} cy={160} rx={8} ry={5} fill="#1A1A22" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />

                {/* ── Wheels ── */}
                {/* Front Left */}
                <Rect x={40} y={72} width={18} height={48} rx={6} fill="#111116" stroke="rgba(255,255,255,0.1)" strokeWidth={1.2} />
                <Line x1={49} y1={76} x2={49} y2={116} stroke="rgba(255,255,255,0.06)" strokeWidth={0.6} />
                {/* Front Right */}
                <Rect x={182} y={72} width={18} height={48} rx={6} fill="#111116" stroke="rgba(255,255,255,0.1)" strokeWidth={1.2} />
                <Line x1={191} y1={76} x2={191} y2={116} stroke="rgba(255,255,255,0.06)" strokeWidth={0.6} />
                {/* Rear Left */}
                <Rect x={40} y={300} width={18} height={48} rx={6} fill="#111116" stroke="rgba(255,255,255,0.1)" strokeWidth={1.2} />
                <Line x1={49} y1={304} x2={49} y2={344} stroke="rgba(255,255,255,0.06)" strokeWidth={0.6} />
                {/* Rear Right */}
                <Rect x={182} y={300} width={18} height={48} rx={6} fill="#111116" stroke="rgba(255,255,255,0.1)" strokeWidth={1.2} />
                <Line x1={191} y1={304} x2={191} y2={344} stroke="rgba(255,255,255,0.06)" strokeWidth={0.6} />

                {/* ── Door Lines ── */}
                <Line x1={62} y1={150} x2={62} y2={290} stroke="rgba(255,255,255,0.05)" strokeWidth={0.8} />
                <Line x1={178} y1={150} x2={178} y2={290} stroke="rgba(255,255,255,0.05)" strokeWidth={0.8} />
                {/* Door handles */}
                <Rect x={63} y={200} width={5} height={2} rx={1} fill="rgba(255,255,255,0.1)" />
                <Rect x={172} y={200} width={5} height={2} rx={1} fill="rgba(255,255,255,0.1)" />

                {/* ── Label ── */}
                <G opacity={0.15}>
                  <Line x1={20} y1={30} x2={40} y2={30} stroke={ACCENT} strokeWidth={0.8} />
                  <Line x1={200} y1={30} x2={220} y2={30} stroke={ACCENT} strokeWidth={0.8} />
                  <Line x1={20} y1={410} x2={40} y2={410} stroke={ACCENT} strokeWidth={0.8} />
                  <Line x1={200} y1={410} x2={220} y2={410} stroke={ACCENT} strokeWidth={0.8} />
                </G>

                {/* ══════ DAMAGE MARKERS ══════ */}
                {markers.map((m, i) => {
                  const tc = getTypeConfig(m.type);
                  const sc = getSeverityConfig(m.severity);
                  const pinColor = tc.color;
                  return (
                    <G key={i} onPress={() => handleMarkerPress(i)}>
                      {/* Outer glow ring */}
                      <Circle cx={m.x} cy={m.y} r={16} fill={`${pinColor}10`} />
                      <Circle cx={m.x} cy={m.y} r={12} fill={`${pinColor}20`} />
                      {/* Core pin */}
                      <Circle cx={m.x} cy={m.y} r={7} fill={pinColor} stroke="#fff" strokeWidth={2} opacity={0.95} />
                      {/* Index label */}
                      <Circle cx={m.x + 8} cy={m.y - 8} r={6} fill="#000" stroke={pinColor} strokeWidth={1} />
                    </G>
                  );
                })}
              </Svg>
            </TouchableOpacity>

            {/* Canvas label */}
            <View style={s.canvasLabel}>
              <Text style={s.canvasLabelText}>TOP-DOWN VIEW</Text>
              <View style={s.canvasLabelDot} />
              <Text style={s.canvasLabelText}>TAP TO PIN</Text>
            </View>
          </View>
        </View>

        {/* ══════ DAMAGE SUMMARY ══════ */}
        {markers.length > 0 && (
          <View style={s.summaryCard}>
            <View style={s.summaryHeader}>
              <Text style={s.summaryTitle}>DAMAGE REPORT SUMMARY</Text>
              <View style={s.summaryBadge}>
                <Text style={s.summaryBadgeText}>{stats.total} POINT{stats.total !== 1 ? 'S' : ''}</Text>
              </View>
            </View>

            {/* By Type */}
            <View style={s.summaryGrid}>
              {Object.entries(stats.byType).map(([type, count]) => {
                const tc = getTypeConfig(type);
                return (
                  <View key={type} style={s.summaryChip}>
                    <View style={[s.summaryDot, { backgroundColor: tc.color }]} />
                    <Text style={s.summaryChipLabel}>{tc.label}</Text>
                    <Text style={[s.summaryChipCount, { color: tc.color }]}>{count as number}</Text>
                  </View>
                );
              })}
            </View>

            {/* By Severity */}
            <View style={s.severityRow}>
              {SEVERITY_LEVELS.map(sev => {
                const count = stats.bySeverity[sev.id] || 0;
                return (
                  <View key={sev.id} style={s.severityItem}>
                    <View style={[s.severityBar, { backgroundColor: count > 0 ? sev.color : '#1A1A22' }]} />
                    <Text style={[s.severityLabel, count > 0 && { color: TEXT_PRIMARY }]}>
                      {sev.label}: {count}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Marker List */}
            <View style={s.markerList}>
              {markers.map((m, i) => {
                const tc = getTypeConfig(m.type);
                const sc = getSeverityConfig(m.severity);
                return (
                  <TouchableOpacity key={i} style={s.markerItem} onPress={() => handleMarkerPress(i)} activeOpacity={0.7}>
                    <View style={[s.markerDot, { backgroundColor: tc.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.markerItemTitle}>{tc.label}</Text>
                      {m.note ? <Text style={s.markerItemNote} numberOfLines={1}>{m.note}</Text> : null}
                    </View>
                    <View style={[s.severityPill, { borderColor: sc.color }]}>
                      <Text style={[s.severityPillText, { color: sc.color }]}>{sc.label.toUpperCase()}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ══════ CTA BUTTON ══════ */}
        <TouchableOpacity
          style={[s.ctaBtn, saving && { opacity: 0.7 }]}
          onPress={handleAdvance}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <>
              <Clock color="#fff" size={20} style={{ marginRight: 10 }} />
              <Text style={s.ctaBtnText}>Saving Report…</Text>
            </>
          ) : (
            <>
              <CheckCircle color="#fff" size={20} style={{ marginRight: 10 }} />
              <Text style={s.ctaBtnText}>Save Damage Report & Continue</Text>
            </>
          )}
        </TouchableOpacity>

        {markers.length === 0 && (
          <Text style={s.skipHint}>No damage? You can proceed with a clean report.</Text>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ══════ EDITOR MODAL ══════ */}
      <Modal transparent visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            {/* Handle bar */}
            <View style={s.modalHandle} />

            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editingIndex !== null ? 'Edit Damage Pin' : 'New Damage Pin'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={s.modalClose}>
                <X color={TEXT_SEC} size={20} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Damage Type */}
              <Text style={s.fieldLabel}>DAMAGE TYPE</Text>
              <View style={s.chipsWrap}>
                {DAMAGE_TYPES.map(type => {
                  const isActive = selectedType === type.id;
                  return (
                    <TouchableOpacity
                      key={type.id}
                      style={[s.typeChip, isActive && { backgroundColor: `${type.color}18`, borderColor: type.color }]}
                      onPress={() => setSelectedType(type.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[s.typeChipDot, { backgroundColor: isActive ? type.color : TEXT_DIM }]} />
                      <Text style={[s.typeChipText, isActive && { color: type.color }]}>{type.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Severity */}
              <Text style={s.fieldLabel}>SEVERITY LEVEL</Text>
              <View style={s.severityChips}>
                {SEVERITY_LEVELS.map(sev => {
                  const isActive = selectedSeverity === sev.id;
                  return (
                    <TouchableOpacity
                      key={sev.id}
                      style={[s.sevChip, isActive && { backgroundColor: `${sev.color}18`, borderColor: sev.color }]}
                      onPress={() => setSelectedSeverity(sev.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[s.sevChipBar, { backgroundColor: isActive ? sev.color : TEXT_DIM }]} />
                      <Text style={[s.sevChipText, isActive && { color: sev.color }]}>{sev.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Notes */}
              <Text style={s.fieldLabel}>NOTES <Text style={{ color: TEXT_DIM, fontWeight: '400', textTransform: 'none' }}>(Optional)</Text></Text>
              <TextInput
                style={s.notesInput}
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder="e.g. Deep scratch to primer, 15cm length on door panel…"
                placeholderTextColor={TEXT_DIM}
              />

              {/* Photo placeholder */}
              <TouchableOpacity style={s.photoBtn} activeOpacity={0.7}>
                <Camera size={18} color={TEXT_MUT} />
                <Text style={s.photoBtnText}>Attach Photo (Optional)</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Actions */}
            <View style={s.modalActions}>
              {editingIndex !== null && (
                <TouchableOpacity style={s.deleteBtn} onPress={removeMarker} activeOpacity={0.7}>
                  <Text style={s.deleteBtnText}>Remove</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.saveMarkerBtn} onPress={saveAnnotation} activeOpacity={0.85}>
                <CheckCircle size={16} color="#fff" />
                <Text style={s.saveMarkerText}>{editingIndex !== null ? 'Update Pin' : 'Place Pin'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    padding: 16,
    paddingBottom: 80,
  },

  // Header
  header: { marginBottom: 16, paddingHorizontal: 8 },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: ACCENT_DIM,
    borderWidth: 1,
    borderColor: ACCENT_BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 14,
  },
  headerBadgeText: { fontSize: 10, fontWeight: '800', color: ACCENT, letterSpacing: 1.5 },
  title: { fontSize: 24, fontWeight: '900', color: TEXT_PRIMARY, letterSpacing: -0.3, marginBottom: 6 },
  subtitle: { fontSize: 13, color: TEXT_SEC, lineHeight: 19 },

  // Canvas
  canvasOuter: {
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  canvasGlow: {
    position: 'absolute',
    top: -2,
    left: '5%' as any,
    right: '5%' as any,
    bottom: -2,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.12)',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 5,
  },
  canvasInner: {
    width: CANVAS_W + 8,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(249,115,22,0.15)',
    backgroundColor: '#08080C',
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 10,
  },
  canvasLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  canvasLabelText: {
    fontSize: 9,
    fontWeight: '700',
    color: TEXT_DIM,
    letterSpacing: 2,
  },
  canvasLabelDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: ACCENT,
  },

  // Summary Card
  summaryCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    marginBottom: 20,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: ACCENT,
    letterSpacing: 1.5,
  },
  summaryBadge: {
    backgroundColor: ACCENT_DIM,
    borderWidth: 1,
    borderColor: ACCENT_BORDER,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  summaryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: ACCENT,
    letterSpacing: 1,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ELEVATED,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  summaryChipLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: TEXT_SEC,
  },
  summaryChipCount: {
    fontSize: 12,
    fontWeight: '800',
  },
  severityRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  severityItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  severityBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
  },
  severityLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: TEXT_DIM,
  },
  markerList: {
    gap: 6,
  },
  markerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: ELEVATED,
    borderRadius: 10,
  },
  markerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  markerItemTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  markerItemNote: {
    fontSize: 11,
    color: TEXT_DIM,
    marginTop: 2,
  },
  severityPill: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  severityPillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  // CTA Button
  ctaBtn: {
    backgroundColor: ACCENT,
    paddingVertical: 18,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  ctaBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  skipHint: {
    textAlign: 'center',
    fontSize: 12,
    color: TEXT_DIM,
    marginTop: 12,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#0C0C10',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    maxHeight: Dimensions.get('window').height * 0.82,
    borderTopWidth: 1,
    borderColor: BORDER,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    alignSelf: 'center',
    marginBottom: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: TEXT_PRIMARY,
  },
  modalClose: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  // Fields
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: TEXT_MUT,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 18,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#222228',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  typeChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_DIM,
  },
  severityChips: {
    flexDirection: 'row',
    gap: 10,
  },
  sevChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222228',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  sevChipBar: {
    width: 14,
    height: 4,
    borderRadius: 2,
  },
  sevChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: TEXT_DIM,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: ELEVATED,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    color: TEXT_PRIMARY,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderStyle: 'dashed',
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.015)',
  },
  photoBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_MUT,
  },

  // Modal Actions
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  deleteBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    backgroundColor: 'rgba(239,68,68,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '700',
  },
  saveMarkerBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  saveMarkerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
