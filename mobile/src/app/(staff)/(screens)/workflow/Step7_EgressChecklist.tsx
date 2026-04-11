import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useWorkflow } from './WorkflowContext';
import { useTheme } from '@/hooks/useThemeContext';
import { CheckCircle, Clock, XCircle, ShieldCheck, Lock } from '@/components/ui/Icons';
import SignatureScreen from 'react-native-signature-canvas';
import { bookingService } from '@/services/api/bookingService';

const QC_ITEMS = [
  'Windows cleaned after installation',
  'No large bubbles',
  'No peeling or film lifting',
  'Film edges properly trimmed',
  'Tint shade matches client request',
  'Dashcam returned',
  'Vehicle interior inspected',
  'Remind NO roll down for 7 days',
];

type SigKey = 'installer' | 'qcChecker' | 'client';

export default function Step7_EgressChecklist() {
  const { colors, isDark } = useTheme();
  const { job, saveStep, saving } = useWorkflow();

  const [items, setItems] = useState<{ item: string; passed: boolean; note: string }[]>([]);
  const [signatures, setSignatures] = useState<Record<SigKey, string>>({ installer: '', qcChecker: '', client: '' });
  const [activeSig, setActiveSig] = useState<SigKey | null>(null);
  const sigRef = useRef<any>(null);

  useEffect(() => {
    if (job) {
      if (job.qcChecklist && Array.isArray(job.qcChecklist) && job.qcChecklist.length > 0) {
        setItems(job.qcChecklist.map((c: any) => ({ item: c.item, passed: !!c.passed, note: c.note || '' })));
      } else {
        setItems(QC_ITEMS.map(item => ({ item, passed: false, note: '' })));
      }
      if (job.egressData) {
        setSignatures({
          installer: job.egressData.installerSignature || '',
          qcChecker: job.egressData.qcCheckerSignature || '',
          client: job.egressData.customerSignature || '',
        });
      }
    }
  }, [job]);

  const toggleItem = (index: number) => {
    const updated = [...items];
    updated[index].passed = !updated[index].passed;
    setItems(updated);
  };

  const allPassed = items.length > 0 && items.every(i => i.passed);
  const allSigned = !!signatures.installer && !!signatures.qcChecker && !!signatures.client;
  const canAdvance = allPassed && allSigned;

  const handleSigOK = (sig: string) => {
    if (!activeSig) return;
    setSignatures(prev => ({ ...prev, [activeSig]: sig }));
    setActiveSig(null);
  };

  const handleAdvance = async () => {
    if (!canAdvance) return;
    try {
      await saveStep(7, {
        items: items.map(i => ({ item: i.item, passed: i.passed, note: i.note })),
        installerSignature: signatures.installer,
        qcCheckerSignature: signatures.qcChecker,
        customerSignature: signatures.client,
      }, false);
      if (job?.id && job.status === 'in_progress') {
        await bookingService.operateQCComplete(job.id);
      }
      saveStep(7, {}, true); // Advance securely
    } catch (err) {
      console.error('[QC Complete] error:', err);
    }
  };

  const SIG_LABELS: Record<SigKey, string> = { installer: 'Installer', qcChecker: 'QC Checker', client: 'Client' };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>QC & Egress Checklist</Text>
        <Text style={styles.subtitle}>All items must pass and all signatures must be captured before release.</Text>
      </View>

      {/* ── Progress Indicator ── */}
      <View style={styles.progressRow}>
        <View style={[styles.badge, allPassed ? styles.badgeGreen : styles.badgeRed]}>
          <Text style={styles.badgeText}>{items.filter(i => i.passed).length}/{items.length} Pass</Text>
        </View>
        <View style={[styles.badge, allSigned ? styles.badgeGreen : styles.badgeRed]}>
          <Text style={styles.badgeText}>{Object.values(signatures).filter(Boolean).length}/3 Signatures</Text>
        </View>
      </View>

      {/* ── Checklist ── */}
      <View style={[styles.card, { backgroundColor: isDark ? '#111' : '#f4f4f5' }]}>
        <Text style={styles.sectionTitle}>Quality Control Items</Text>
        {items.map((item, i) => (
          <TouchableOpacity key={i} style={[styles.qcRow, i < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: isDark ? '#222' : '#e4e4e7' }]} onPress={() => toggleItem(i)}>
            {item.passed
              ? <CheckCircle size={22} color="#22c55e" />
              : <XCircle size={22} color="#ef4444" />
            }
            <Text style={[styles.qcLabel, { color: item.passed ? colors.text : '#a1a1aa' }]}>{item.item}</Text>
            <View style={[styles.statusPill, item.passed ? styles.pillPass : styles.pillFail]}>
              <Text style={[styles.pillText, { color: item.passed ? '#22c55e' : '#ef4444' }]}>{item.passed ? 'PASS' : 'FAIL'}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Signature Section ── */}
      <View style={[styles.card, { backgroundColor: isDark ? '#111' : '#f4f4f5' }]}>
        <Text style={styles.sectionTitle}>Required Signatures</Text>
        {(['installer', 'qcChecker', 'client'] as SigKey[]).map(key => (
          <View key={key} style={[styles.sigBlock, { borderBottomColor: isDark ? '#222' : '#e4e4e7' }]}>
            <View style={styles.sigHeader}>
              <Text style={[styles.sigLabel, { color: colors.text }]}>{SIG_LABELS[key]}</Text>
              {signatures[key]
                ? <View style={styles.signedBadge}><ShieldCheck size={14} color="#22c55e" /><Text style={styles.signedText}>Signed</Text></View>
                : <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '600' }}>Required</Text>
              }
            </View>
            {activeSig === key ? (
              <View style={styles.sigCanvas}>
                <SignatureScreen
                  ref={sigRef}
                  onOK={handleSigOK}
                  webStyle={`.m-signature-pad {box-shadow: none; border: none;} .m-signature-pad--body {border: none;}`}
                  backgroundColor={isDark ? '#1a1a1a' : '#fff'}
                  penColor={isDark ? '#f97316' : '#000'}
                />
                <View style={styles.sigActions}>
                  <TouchableOpacity onPress={() => sigRef.current?.clearSignature()} style={styles.sigClearBtn}>
                    <Text style={{ color: '#a1a1aa', fontWeight: '600' }}>Clear</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => sigRef.current?.readSignature()} style={styles.sigDoneBtn}>
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.sigTapArea, { borderColor: isDark ? '#333' : '#ddd', backgroundColor: signatures[key] ? '#22c55e10' : 'transparent' }]}
                onPress={() => { setActiveSig(key); }}
              >
                <Text style={{ color: signatures[key] ? '#22c55e' : '#a1a1aa', fontWeight: '600' }}>
                  {signatures[key] ? 'Tap to Re-sign' : 'Tap to Sign'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>

      {/* ── Advance Button ── */}
      <TouchableOpacity
        style={[styles.saveBtn, !canAdvance && styles.saveBtnDisabled, saving && { opacity: 0.7 }]}
        onPress={handleAdvance}
        disabled={!canAdvance || saving}
      >
        {!canAdvance
          ? <><Lock color="#fff" size={20} style={{ marginRight: 8 }} /><Text style={styles.saveBtnText}>Complete All Items & Signatures</Text></>
          : saving
            ? <><Clock color="#fff" size={20} style={{ marginRight: 8 }} /><Text style={styles.saveBtnText}>Saving…</Text></>
            : <><CheckCircle color="#fff" size={20} style={{ marginRight: 8 }} /><Text style={styles.saveBtnText}>Approve & Advance to Warranty</Text></>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingBottom: 64 },
  header: { marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#a1a1aa' },

  progressRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  badge: { flex: 1, padding: 12, borderRadius: 12, alignItems: 'center' },
  badgeGreen: { backgroundColor: '#22c55e18' },
  badgeRed: { backgroundColor: '#ef444418' },
  badgeText: { fontWeight: '700', color: '#a1a1aa', fontSize: 13 },

  card: { borderRadius: 16, padding: 20, marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 },

  qcRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  qcLabel: { flex: 1, fontSize: 15, fontWeight: '500', marginLeft: 12 },
  statusPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 },
  pillPass: { backgroundColor: '#22c55e18' },
  pillFail: { backgroundColor: '#ef444418' },
  pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  sigBlock: { paddingBottom: 16, marginBottom: 16, borderBottomWidth: 1 },
  sigHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sigLabel: { fontSize: 16, fontWeight: '700' },
  signedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  signedText: { color: '#22c55e', fontSize: 12, fontWeight: '700' },
  sigCanvas: { height: 180, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#333' },
  sigActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#0a0a0a' },
  sigClearBtn: { padding: 8 },
  sigDoneBtn: { backgroundColor: '#f97316', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
  sigTapArea: { height: 60, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },

  saveBtn: { backgroundColor: '#f97316', padding: 18, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#f97316', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10 },
  saveBtnDisabled: { backgroundColor: '#555' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
