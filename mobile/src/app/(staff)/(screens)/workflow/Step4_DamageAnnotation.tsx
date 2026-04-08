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
} from 'react-native';
import { useWorkflow } from './WorkflowContext';
import { useTheme } from '@/hooks/useThemeContext';
import { CheckCircle, Clock, X, Camera, Shield } from '@/components/ui/Icons';
import Svg, { Rect, Path, Circle, Defs, RadialGradient, LinearGradient, Stop, Line, G, Ellipse } from 'react-native-svg';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const ACCENT = '#f97316';
const ACCENT_DIM = 'rgba(249,115,22,0.10)';
const ACCENT_BORDER = 'rgba(249,115,22,0.25)';
const SUCCESS = '#22c55e';
const BG = '#050506';
const SURFACE = '#0C0C10';
const ELEVATED = '#14141A';
const BORDER = '#1E1E26';
const TEXT_PRIMARY = '#F5F5F7';
const TEXT_SEC = '#A1A1AA';
const TEXT_MUT = '#71717A';
const TEXT_DIM = '#52525B';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Vehicle Panel Definitions ────────────────────────────────────────────────
// Each panel has a unique ID, label, and SVG path data for the tap zone.
// The SVG viewBox is 300 x 540 to give a generous, well-proportioned car.
const SVG_W = 300;
const SVG_H = 540;

const PANELS = [
  { id: 'front_bumper',  label: 'Front Bumper',      short: 'F.BMP' },
  { id: 'hood',          label: 'Hood',               short: 'HOOD' },
  { id: 'windshield',    label: 'Windshield',         short: 'W/S' },
  { id: 'roof',          label: 'Roof / Cabin',       short: 'ROOF' },
  { id: 'rear_glass',    label: 'Rear Glass',         short: 'R/G' },
  { id: 'trunk',         label: 'Trunk / Boot',       short: 'TRUNK' },
  { id: 'rear_bumper',   label: 'Rear Bumper',        short: 'R.BMP' },
  { id: 'left_fender',   label: 'Left Front Fender',  short: 'L.FND' },
  { id: 'right_fender',  label: 'Right Front Fender', short: 'R.FND' },
  { id: 'left_front_door', label: 'Left Front Door',  short: 'LF.DR' },
  { id: 'right_front_door', label: 'Right Front Door', short: 'RF.DR' },
  { id: 'left_rear_door',  label: 'Left Rear Door',   short: 'LR.DR' },
  { id: 'right_rear_door', label: 'Right Rear Door',  short: 'RR.DR' },
  { id: 'left_quarter',  label: 'Left Rear Quarter',  short: 'L.QTR' },
  { id: 'right_quarter', label: 'Right Rear Quarter', short: 'R.QTR' },
] as const;

// ─── Damage Configuration ─────────────────────────────────────────────────────
const DAMAGE_TYPES = [
  { id: 'scratch',   label: 'Scratch',         color: '#f97316' },
  { id: 'swirl',     label: 'Swirl Mark',      color: '#f59e0b' },
  { id: 'dent',      label: 'Dent',            color: '#ef4444' },
  { id: 'chip',      label: 'Paint Chip',      color: '#eab308' },
  { id: 'crack',     label: 'Crack',           color: '#a855f7' },
  { id: 'curb_rash', label: 'Curb Rash',       color: '#ec4899' },
  { id: 'repaint',   label: 'Repaint History',  color: '#3b82f6' },
  { id: 'stain',     label: 'Stain / Etch',    color: '#06b6d4' },
];

const SEVERITY_LEVELS = [
  { id: 'low',    label: 'Minor',    color: '#22c55e' },
  { id: 'medium', label: 'Moderate', color: '#f59e0b' },
  { id: 'high',   label: 'Severe',   color: '#ef4444' },
];

const getTypeConfig = (id: string) => DAMAGE_TYPES.find(t => t.id === id) || DAMAGE_TYPES[0];
const getSevConfig = (id: string) => SEVERITY_LEVELS.find(s => s.id === id) || SEVERITY_LEVELS[1];
const getPanelConfig = (id: string) => PANELS.find(p => p.id === id);

// ─── Canvas dimensions — fill the screen ──────────────────────────────────────
const CANVAS_W = SCREEN_W - 16; // 8px margin each side
const CANVAS_H = Math.min(SCREEN_H * 0.58, 520);

// ──────────────────────────────────────────────────────────────────────────────
export default function Step4_DamageAnnotation() {
  const { colors } = useTheme();
  const { job, saveStep, saving } = useWorkflow();

  const [markers, setMarkers] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeCoord, setActiveCoord] = useState<{ x: number; y: number } | null>(null);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState('scratch');
  const [selectedSeverity, setSelectedSeverity] = useState('medium');
  const [notes, setNotes] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (job?.damageAnnotations) setMarkers(job.damageAnnotations as any[]);
  }, [job]);

  // ── Stats ──
  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    const bySev: Record<string, number> = {};
    markers.forEach(m => {
      byType[m.type] = (byType[m.type] || 0) + 1;
      bySev[m.severity || 'medium'] = (bySev[m.severity || 'medium'] || 0) + 1;
    });
    return { total: markers.length, byType, bySev };
  }, [markers]);

  const panelDamageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    markers.forEach(m => {
      if (m.panel) counts[m.panel] = (counts[m.panel] || 0) + 1;
    });
    return counts;
  }, [markers]);

  // ── Handlers ──
  const handlePanelTap = (panelId: string, cx: number, cy: number) => {
    setActivePanel(panelId);
    setActiveCoord({ x: cx, y: cy });
    setEditingIndex(null);
    resetForm();
    setModalVisible(true);
  };

  const handleMarkerTap = (index: number) => {
    const m = markers[index];
    setActiveCoord({ x: m.x, y: m.y });
    setActivePanel(m.panel);
    setSelectedType(m.type);
    setSelectedSeverity(m.severity || 'medium');
    setNotes(m.note || '');
    setEditingIndex(index);
    setModalVisible(true);
  };

  const resetForm = () => { setSelectedType('scratch'); setSelectedSeverity('medium'); setNotes(''); };

  const saveAnnotation = () => {
    if (!activeCoord) return;
    const marker = { x: activeCoord.x, y: activeCoord.y, panel: activePanel || 'exterior', type: selectedType, severity: selectedSeverity, note: notes, images: [] };
    let updated = [...markers];
    if (editingIndex !== null) updated[editingIndex] = marker; else updated.push(marker);
    setMarkers(updated);
    setModalVisible(false);
    saveStep(4, { annotations: updated }, false);
  };

  const removeMarker = () => {
    if (editingIndex === null) return;
    const updated = [...markers]; updated.splice(editingIndex, 1); setMarkers(updated); setModalVisible(false);
    saveStep(4, { annotations: updated }, false);
  };

  const handleAdvance = () => saveStep(4, { annotations: markers }, true);

  // ── Panel fill helper ──
  const pFill = (id: string) => {
    const count = panelDamageCounts[id] || 0;
    if (count >= 3) return 'rgba(239,68,68,0.12)';
    if (count >= 1) return 'rgba(249,115,22,0.08)';
    return 'rgba(255,255,255,0.018)';
  };
  const pStroke = (id: string) => {
    const count = panelDamageCounts[id] || 0;
    if (count >= 3) return 'rgba(239,68,68,0.35)';
    if (count >= 1) return 'rgba(249,115,22,0.25)';
    return 'rgba(255,255,255,0.10)';
  };

  // Blueprint grid
  const gridLines: React.ReactNode[] = [];
  for (let x = 0; x <= SVG_W; x += 30) gridLines.push(<Line key={`v${x}`} x1={x} y1={0} x2={x} y2={SVG_H} stroke="rgba(249,115,22,0.025)" strokeWidth={0.5} />);
  for (let y = 0; y <= SVG_H; y += 30) gridLines.push(<Line key={`h${y}`} x1={0} y1={y} x2={SVG_W} y2={y} stroke="rgba(249,115,22,0.025)" strokeWidth={0.5} />);

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── HEADER ── */}
        <View style={s.header}>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <View style={s.badge}><Shield size={12} color={ACCENT} /><Text style={s.badgeText}>STEP 4 OF 9</Text></View>
              <Text style={s.title}>Damage Inspection</Text>
            </View>
            {markers.length > 0 && (
              <View style={s.counterBox}>
                <Text style={s.counterNum}>{stats.total}</Text>
                <Text style={s.counterLabel}>pins</Text>
              </View>
            )}
          </View>
          <Text style={s.subtitle}>Tap a vehicle panel to record pre-existing damage. Each section is individually inspectable.</Text>
        </View>

        {/* ── VEHICLE CANVAS ── */}
        <View style={s.canvasWrap}>
          <View style={s.canvasFrame}>
            <Svg width={CANVAS_W - 4} height={CANVAS_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} preserveAspectRatio="xMidYMid meet">
              {/* Background */}
              <Rect x={0} y={0} width={SVG_W} height={SVG_H} fill="#07070A" rx={8} />
              {gridLines}
              {/* Center axis */}
              <Line x1={SVG_W / 2} y1={0} x2={SVG_W / 2} y2={SVG_H} stroke="rgba(249,115,22,0.05)" strokeWidth={0.8} strokeDasharray="6,10" />

              <Defs>
                <RadialGradient id="bg_glow" cx="50%" cy="40%" r="60%">
                  <Stop offset="0%" stopColor="rgba(249,115,22,0.03)" />
                  <Stop offset="100%" stopColor="rgba(0,0,0,0)" />
                </RadialGradient>
              </Defs>
              <Rect x={0} y={0} width={SVG_W} height={SVG_H} fill="url(#bg_glow)" />

              {/* ═══ VEHICLE BODY ═══ */}
              {/* Main chassis outline */}
              <Path
                d="M100 38 Q150 18 200 38 L210 50 L215 90 L218 140 L220 200 L220 340 L218 400 L215 450 L210 490 L200 502 Q150 522 100 502 L90 490 L85 450 L82 400 L80 340 L80 200 L82 140 L85 90 L90 50 Z"
                fill="rgba(20,20,28,0.9)"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={2}
              />

              {/* ── FRONT BUMPER ── */}
              <Path
                d="M95 38 Q150 16 205 38 L210 55 Q150 44 90 55 Z"
                fill={pFill('front_bumper')} stroke={pStroke('front_bumper')} strokeWidth={1.5}
                onPress={() => handlePanelTap('front_bumper', 150, 40)}
              />
              {/* Headlights */}
              <Ellipse cx={102} cy={52} rx={8} ry={5} fill="rgba(249,115,22,0.08)" stroke="rgba(249,115,22,0.3)" strokeWidth={1} />
              <Ellipse cx={198} cy={52} rx={8} ry={5} fill="rgba(249,115,22,0.08)" stroke="rgba(249,115,22,0.3)" strokeWidth={1} />
              {/* Grille */}
              <Rect x={130} y={42} width={40} height={8} rx={3} fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" strokeWidth={0.8} />

              {/* ── HOOD ── */}
              <Path
                d="M90 58 Q150 46 210 58 L214 100 L216 145 Q150 155 84 145 L86 100 Z"
                fill={pFill('hood')} stroke={pStroke('hood')} strokeWidth={1.5}
                onPress={() => handlePanelTap('hood', 150, 100)}
              />
              {/* Hood line */}
              <Line x1={150} y1={58} x2={150} y2={148} stroke="rgba(255,255,255,0.04)" strokeWidth={0.8} />
              {/* Hood scoop accent */}
              <Path d="M135 85 Q150 78 165 85" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={0.8} />

              {/* ── LEFT FRONT FENDER ── */}
              <Path
                d="M80 58 L90 58 L86 145 L80 145 L75 115 L72 90 Z"
                fill={pFill('left_fender')} stroke={pStroke('left_fender')} strokeWidth={1.2}
                onPress={() => handlePanelTap('left_fender', 78, 100)}
              />
              {/* ── RIGHT FRONT FENDER ── */}
              <Path
                d="M210 58 L220 58 L228 90 L225 115 L220 145 L214 145 Z"
                fill={pFill('right_fender')} stroke={pStroke('right_fender')} strokeWidth={1.2}
                onPress={() => handlePanelTap('right_fender', 222, 100)}
              />

              {/* ── WINDSHIELD ── */}
              <Path
                d="M86 148 Q150 158 214 148 L208 185 Q150 192 92 185 Z"
                fill="rgba(30,58,138,0.06)" stroke="rgba(59,130,246,0.15)" strokeWidth={1.2}
                onPress={() => handlePanelTap('windshield', 150, 168)}
              />

              {/* ── LEFT FRONT DOOR ── */}
              <Path
                d="M80 148 L84 148 L90 190 L90 270 L84 270 L80 270 L78 210 Z"
                fill={pFill('left_front_door')} stroke={pStroke('left_front_door')} strokeWidth={1.2}
                onPress={() => handlePanelTap('left_front_door', 82, 210)}
              />
              {/* Door handle */}
              <Rect x={82} y={218} width={6} height={2.5} rx={1} fill="rgba(255,255,255,0.12)" />

              {/* ── RIGHT FRONT DOOR ── */}
              <Path
                d="M216 148 L220 148 L222 210 L220 270 L216 270 L210 270 L210 190 Z"
                fill={pFill('right_front_door')} stroke={pStroke('right_front_door')} strokeWidth={1.2}
                onPress={() => handlePanelTap('right_front_door', 218, 210)}
              />
              <Rect x={212} y={218} width={6} height={2.5} rx={1} fill="rgba(255,255,255,0.12)" />

              {/* ── ROOF / CABIN ── */}
              <Path
                d="M92 190 Q150 196 208 190 L206 310 Q150 316 94 310 Z"
                fill={pFill('roof')} stroke={pStroke('roof')} strokeWidth={1.5}
                onPress={() => handlePanelTap('roof', 150, 250)}
              />
              {/* Roof rail lines */}
              <Line x1={98} y1={195} x2={98} y2={308} stroke="rgba(249,115,22,0.06)" strokeWidth={0.6} />
              <Line x1={202} y1={195} x2={202} y2={308} stroke="rgba(249,115,22,0.06)" strokeWidth={0.6} />
              {/* Sunroof outline */}
              <Rect x={125} y={220} width={50} height={55} rx={8} fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.05)" strokeWidth={0.8} />

              {/* ── LEFT REAR DOOR ── */}
              <Path
                d="M80 274 L84 274 L90 274 L90 360 L84 360 L80 360 L78 320 Z"
                fill={pFill('left_rear_door')} stroke={pStroke('left_rear_door')} strokeWidth={1.2}
                onPress={() => handlePanelTap('left_rear_door', 82, 318)}
              />
              <Rect x={82} y={310} width={6} height={2.5} rx={1} fill="rgba(255,255,255,0.12)" />

              {/* ── RIGHT REAR DOOR ── */}
              <Path
                d="M216 274 L220 274 L222 320 L220 360 L216 360 L210 360 L210 274 Z"
                fill={pFill('right_rear_door')} stroke={pStroke('right_rear_door')} strokeWidth={1.2}
                onPress={() => handlePanelTap('right_rear_door', 218, 318)}
              />
              <Rect x={212} y={310} width={6} height={2.5} rx={1} fill="rgba(255,255,255,0.12)" />

              {/* ── REAR GLASS ── */}
              <Path
                d="M94 314 Q150 320 206 314 L210 355 Q150 365 90 355 Z"
                fill="rgba(30,58,138,0.05)" stroke="rgba(59,130,246,0.12)" strokeWidth={1}
                onPress={() => handlePanelTap('rear_glass', 150, 336)}
              />

              {/* ── LEFT REAR QUARTER ── */}
              <Path
                d="M80 364 L84 364 L86 400 L85 445 L80 445 L76 420 Z"
                fill={pFill('left_quarter')} stroke={pStroke('left_quarter')} strokeWidth={1.2}
                onPress={() => handlePanelTap('left_quarter', 80, 405)}
              />
              {/* ── RIGHT REAR QUARTER ── */}
              <Path
                d="M216 364 L220 364 L224 420 L220 445 L215 445 L214 400 Z"
                fill={pFill('right_quarter')} stroke={pStroke('right_quarter')} strokeWidth={1.2}
                onPress={() => handlePanelTap('right_quarter', 220, 405)}
              />

              {/* ── TRUNK ── */}
              <Path
                d="M86 358 Q150 368 214 358 L216 448 L210 488 Q150 502 90 488 L84 448 Z"
                fill={pFill('trunk')} stroke={pStroke('trunk')} strokeWidth={1.5}
                onPress={() => handlePanelTap('trunk', 150, 430)}
              />
              <Line x1={150} y1={368} x2={150} y2={490} stroke="rgba(255,255,255,0.035)" strokeWidth={0.8} />

              {/* ── REAR BUMPER ── */}
              <Path
                d="M90 492 Q150 510 210 492 L205 506 Q150 524 95 506 Z"
                fill={pFill('rear_bumper')} stroke={pStroke('rear_bumper')} strokeWidth={1.5}
                onPress={() => handlePanelTap('rear_bumper', 150, 502)}
              />
              {/* Tail lights */}
              <Rect x={95} y={492} width={14} height={6} rx={2} fill="rgba(239,68,68,0.12)" stroke="rgba(239,68,68,0.35)" strokeWidth={0.8} />
              <Rect x={191} y={492} width={14} height={6} rx={2} fill="rgba(239,68,68,0.12)" stroke="rgba(239,68,68,0.35)" strokeWidth={0.8} />

              {/* ── SIDE MIRRORS ── */}
              <Ellipse cx={72} cy={168} rx={10} ry={6} fill="rgba(20,20,28,0.9)" stroke="rgba(255,255,255,0.1)" strokeWidth={1.2} />
              <Ellipse cx={228} cy={168} rx={10} ry={6} fill="rgba(20,20,28,0.9)" stroke="rgba(255,255,255,0.1)" strokeWidth={1.2} />

              {/* ── WHEELS ── */}
              {[[56, 82], [222, 82], [56, 360], [222, 360]].map(([wx, wy], i) => (
                <G key={`wh${i}`}>
                  <Rect x={wx} y={wy} width={22} height={55} rx={8} fill="#0A0A0F" stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} />
                  <Ellipse cx={wx + 11} cy={wy + 27.5} rx={6} ry={6} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={0.8} />
                  <Circle cx={wx + 11} cy={wy + 27.5} r={2} fill="rgba(255,255,255,0.08)" />
                </G>
              ))}

              {/* Corner ticks */}
              <G opacity={0.2}>
                <Line x1={15} y1={10} x2={35} y2={10} stroke={ACCENT} strokeWidth={1} />
                <Line x1={15} y1={10} x2={15} y2={30} stroke={ACCENT} strokeWidth={1} />
                <Line x1={265} y1={10} x2={285} y2={10} stroke={ACCENT} strokeWidth={1} />
                <Line x1={285} y1={10} x2={285} y2={30} stroke={ACCENT} strokeWidth={1} />
                <Line x1={15} y1={530} x2={35} y2={530} stroke={ACCENT} strokeWidth={1} />
                <Line x1={15} y1={510} x2={15} y2={530} stroke={ACCENT} strokeWidth={1} />
                <Line x1={265} y1={530} x2={285} y2={530} stroke={ACCENT} strokeWidth={1} />
                <Line x1={285} y1={510} x2={285} y2={530} stroke={ACCENT} strokeWidth={1} />
              </G>

              {/* ═══ DAMAGE MARKERS ═══ */}
              {markers.map((m, i) => {
                const tc = getTypeConfig(m.type);
                return (
                  <G key={`pin${i}`} onPress={() => handleMarkerTap(i)}>
                    <Circle cx={m.x} cy={m.y} r={18} fill={`${tc.color}08`} />
                    <Circle cx={m.x} cy={m.y} r={12} fill={`${tc.color}15`} />
                    <Circle cx={m.x} cy={m.y} r={7.5} fill={tc.color} stroke="#fff" strokeWidth={2.2} />
                  </G>
                );
              })}
            </Svg>

            {/* Canvas bar */}
            <View style={s.canvasBar}>
              <Text style={s.canvasBarText}>TOP VIEW</Text>
              <View style={s.canvasBarDot} />
              <Text style={s.canvasBarText}>TAP PANEL TO INSPECT</Text>
              <View style={s.canvasBarDot} />
              <Text style={s.canvasBarText}>{markers.length} PIN{markers.length !== 1 ? 'S' : ''}</Text>
            </View>
          </View>
        </View>

        {/* ── PANEL QUICK-ACCESS ── */}
        <View style={s.panelStrip}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 4 }}>
            {PANELS.map(p => {
              const count = panelDamageCounts[p.id] || 0;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[s.panelBtn, count > 0 && s.panelBtnActive]}
                  onPress={() => handlePanelTap(p.id, 150, 250)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.panelBtnText, count > 0 && s.panelBtnTextActive]}>{p.short}</Text>
                  {count > 0 && <View style={s.panelBtnBadge}><Text style={s.panelBtnBadgeText}>{count}</Text></View>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── DAMAGE SUMMARY ── */}
        {markers.length > 0 && (
          <View style={s.summaryCard}>
            <View style={s.summaryHeader}>
              <Text style={s.summaryTitle}>DAMAGE REPORT</Text>
              <View style={s.summaryBadge}>
                <Text style={s.summaryBadgeText}>{stats.total} TOTAL</Text>
              </View>
            </View>

            {/* Type breakdown */}
            <View style={s.typeGrid}>
              {Object.entries(stats.byType).map(([type, count]) => {
                const tc = getTypeConfig(type);
                return (
                  <View key={type} style={s.typeItem}>
                    <View style={[s.typeDot, { backgroundColor: tc.color }]} />
                    <Text style={s.typeLabel}>{tc.label}</Text>
                    <Text style={[s.typeCount, { color: tc.color }]}>{count as number}</Text>
                  </View>
                );
              })}
            </View>

            {/* Severity bars */}
            <View style={s.sevRow}>
              {SEVERITY_LEVELS.map(sv => {
                const count = stats.bySev[sv.id] || 0;
                return (
                  <View key={sv.id} style={s.sevItem}>
                    <View style={[s.sevBar, count > 0 && { backgroundColor: sv.color }]} />
                    <Text style={[s.sevLabel, count > 0 && { color: TEXT_PRIMARY }]}>{sv.label} ({count})</Text>
                  </View>
                );
              })}
            </View>

            {/* Pin list */}
            {markers.map((m, i) => {
              const tc = getTypeConfig(m.type);
              const sc = getSevConfig(m.severity);
              const pc = getPanelConfig(m.panel);
              return (
                <TouchableOpacity key={i} style={s.pinRow} onPress={() => handleMarkerTap(i)} activeOpacity={0.7}>
                  <View style={[s.pinDot, { backgroundColor: tc.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.pinTitle}>{tc.label}{pc ? ` — ${pc.label}` : ''}</Text>
                    {m.note ? <Text style={s.pinNote} numberOfLines={1}>{m.note}</Text> : null}
                  </View>
                  <View style={[s.pinSev, { borderColor: sc.color }]}>
                    <Text style={[s.pinSevText, { color: sc.color }]}>{sc.label.toUpperCase()}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── CTA ── */}
        <TouchableOpacity style={[s.cta, saving && { opacity: 0.7 }]} onPress={handleAdvance} disabled={saving} activeOpacity={0.85}>
          {saving
            ? <><Clock color="#fff" size={20} style={{ marginRight: 10 }} /><Text style={s.ctaText}>Saving Report…</Text></>
            : <><CheckCircle color="#fff" size={20} style={{ marginRight: 10 }} /><Text style={s.ctaText}>Save Damage Report & Continue</Text></>
          }
        </TouchableOpacity>
        {markers.length === 0 && <Text style={s.hint}>No damage found? Proceed with a clean inspection report.</Text>}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ═══ EDITOR MODAL ═══ */}
      <Modal transparent visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <View>
                <Text style={s.sheetTitle}>{editingIndex !== null ? 'Edit Damage Pin' : 'New Damage Pin'}</Text>
                {activePanel && <Text style={s.sheetPanel}>{getPanelConfig(activePanel)?.label || activePanel}</Text>}
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={s.sheetClose}><X color={TEXT_SEC} size={18} /></TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={s.fLabel}>DAMAGE TYPE</Text>
              <View style={s.chips}>
                {DAMAGE_TYPES.map(t => {
                  const on = selectedType === t.id;
                  return (
                    <TouchableOpacity key={t.id} style={[s.chip, on && { borderColor: t.color, backgroundColor: `${t.color}12` }]} onPress={() => setSelectedType(t.id)} activeOpacity={0.7}>
                      <View style={[s.chipDot, { backgroundColor: on ? t.color : TEXT_DIM }]} />
                      <Text style={[s.chipLabel, on && { color: t.color }]}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.fLabel}>SEVERITY</Text>
              <View style={s.sevChips}>
                {SEVERITY_LEVELS.map(sv => {
                  const on = selectedSeverity === sv.id;
                  return (
                    <TouchableOpacity key={sv.id} style={[s.sevChip, on && { borderColor: sv.color, backgroundColor: `${sv.color}12` }]} onPress={() => setSelectedSeverity(sv.id)} activeOpacity={0.7}>
                      <View style={[s.sevChipDot, { backgroundColor: on ? sv.color : TEXT_DIM }]} />
                      <Text style={[s.sevChipLabel, on && { color: sv.color }]}>{sv.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.fLabel}>NOTES <Text style={{ color: TEXT_DIM, fontWeight: '400', textTransform: 'none' }}>(Optional)</Text></Text>
              <TextInput style={s.noteInput} value={notes} onChangeText={setNotes} multiline placeholder="Describe damage details…" placeholderTextColor={TEXT_DIM} />

              <TouchableOpacity style={s.photoBtn} activeOpacity={0.7}>
                <Camera size={16} color={TEXT_MUT} /><Text style={s.photoBtnText}>Attach Photo (Optional)</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={s.sheetActions}>
              {editingIndex !== null && (
                <TouchableOpacity style={s.delBtn} onPress={removeMarker}><Text style={s.delBtnText}>Remove</Text></TouchableOpacity>
              )}
              <TouchableOpacity style={s.pinBtn} onPress={saveAnnotation} activeOpacity={0.85}>
                <CheckCircle size={16} color="#fff" /><Text style={s.pinBtnText}>{editingIndex !== null ? 'Update Pin' : 'Place Pin'}</Text>
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
  screen: { flex: 1, backgroundColor: BG },
  scrollContent: { paddingBottom: 60 },

  // Header
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 10, alignSelf: 'flex-start' },
  badgeText: { fontSize: 9, fontWeight: '800', color: ACCENT, letterSpacing: 1.4 },
  title: { fontSize: 22, fontWeight: '900', color: TEXT_PRIMARY, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: TEXT_SEC, lineHeight: 18, marginTop: 6 },
  counterBox: { backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6, alignItems: 'center' },
  counterNum: { fontSize: 22, fontWeight: '900', color: ACCENT },
  counterLabel: { fontSize: 9, fontWeight: '700', color: ACCENT, letterSpacing: 1, textTransform: 'uppercase' },

  // Canvas
  canvasWrap: { alignItems: 'center', marginBottom: 10 },
  canvasFrame: {
    width: CANVAS_W,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(249,115,22,0.12)',
    backgroundColor: '#07070A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 12,
  },
  canvasBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8, backgroundColor: 'rgba(0,0,0,0.4)' },
  canvasBarText: { fontSize: 8, fontWeight: '700', color: TEXT_DIM, letterSpacing: 2 },
  canvasBarDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: ACCENT, opacity: 0.5 },

  // Panel strip
  panelStrip: { marginBottom: 14, paddingHorizontal: 8 },
  panelBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE },
  panelBtnActive: { borderColor: ACCENT_BORDER, backgroundColor: ACCENT_DIM },
  panelBtnText: { fontSize: 10, fontWeight: '700', color: TEXT_DIM, letterSpacing: 0.8 },
  panelBtnTextActive: { color: ACCENT },
  panelBtnBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: ACCENT, borderRadius: 7, width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  panelBtnBadgeText: { fontSize: 8, fontWeight: '900', color: '#fff' },

  // Summary
  summaryCard: { marginHorizontal: 8, backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 16, marginBottom: 16 },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  summaryTitle: { fontSize: 10, fontWeight: '800', color: ACCENT, letterSpacing: 1.5 },
  summaryBadge: { backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 2 },
  summaryBadgeText: { fontSize: 9, fontWeight: '800', color: ACCENT, letterSpacing: 0.8 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  typeItem: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: ELEVATED, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 },
  typeDot: { width: 7, height: 7, borderRadius: 3.5 },
  typeLabel: { fontSize: 10, fontWeight: '600', color: TEXT_SEC },
  typeCount: { fontSize: 11, fontWeight: '800' },
  sevRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  sevItem: { flex: 1, alignItems: 'center', gap: 5 },
  sevBar: { width: '100%', height: 3, borderRadius: 1.5, backgroundColor: '#1A1A22' },
  sevLabel: { fontSize: 9, fontWeight: '600', color: TEXT_DIM },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10, backgroundColor: ELEVATED, borderRadius: 9, marginTop: 5 },
  pinDot: { width: 9, height: 9, borderRadius: 4.5 },
  pinTitle: { fontSize: 12, fontWeight: '600', color: TEXT_PRIMARY },
  pinNote: { fontSize: 10, color: TEXT_DIM, marginTop: 1 },
  pinSev: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  pinSevText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },

  // CTA
  cta: { marginHorizontal: 8, backgroundColor: ACCENT, paddingVertical: 18, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: ACCENT, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8 },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  hint: { textAlign: 'center', fontSize: 11, color: TEXT_DIM, marginTop: 10, marginHorizontal: 20 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#0A0A0E', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 36, maxHeight: SCREEN_H * 0.78, borderTopWidth: 1, borderColor: BORDER },
  sheetHandle: { width: 34, height: 4, borderRadius: 2, backgroundColor: '#333', alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: TEXT_PRIMARY },
  sheetPanel: { fontSize: 12, fontWeight: '600', color: ACCENT, marginTop: 3 },
  sheetClose: { padding: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)' },
  fLabel: { fontSize: 9, fontWeight: '700', color: TEXT_MUT, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, marginTop: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: '#222228' },
  chipDot: { width: 7, height: 7, borderRadius: 3.5 },
  chipLabel: { fontSize: 11, fontWeight: '600', color: TEXT_DIM },
  sevChips: { flexDirection: 'row', gap: 8 },
  sevChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: '#222228' },
  sevChipDot: { width: 10, height: 4, borderRadius: 2 },
  sevChipLabel: { fontSize: 11, fontWeight: '700', color: TEXT_DIM },
  noteInput: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, backgroundColor: ELEVATED, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, color: TEXT_PRIMARY, minHeight: 70, textAlignVertical: 'top' },
  photoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: BORDER, borderStyle: 'dashed', marginTop: 12 },
  photoBtnText: { fontSize: 12, fontWeight: '600', color: TEXT_MUT },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  delBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.06)', alignItems: 'center' },
  delBtnText: { color: '#ef4444', fontSize: 13, fontWeight: '700' },
  pinBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: ACCENT, paddingVertical: 14, borderRadius: 10 },
  pinBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
