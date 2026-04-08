import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useWorkflow } from './WorkflowContext';
import { useTheme } from '@/hooks/useThemeContext';
import { CheckCircle, Clock, CheckSquare, Square, Lock } from '@/components/ui/Icons';
import SignatureScreen from 'react-native-signature-canvas';

const SERVICE_TERMS = [
  'I understand that AUTOSPF+ is not liable for pre-existing damage not documented during the ingress inspection.',
  'I acknowledge that PPF/tint materials may take up to 30 days to fully cure.',
  'I agree that any change in service scope after approval may result in additional charges.',
  'I authorize the technicians to operate my vehicle within the facility premises.',
  'I confirm the vehicle has no undisclosed mechanical issues that may affect service.',
  'I understand that minor imperfections in PPF film may be visible under extreme lighting conditions.',
];

export default function Step3_DigitalTerms() {
  const { colors, isDark } = useTheme();
  const { job, saveStep, saving } = useWorkflow();
  const sigRef = useRef<any>(null);

  const [terms, setTerms] = useState<{ label: string; accepted: boolean }[]>([]);
  const [customerFullName, setCustomerFullName] = useState('');
  const [signature, setSignature] = useState('');
  const [sigMode, setSigMode] = useState(false);

  useEffect(() => {
    if (job) {
      if (job.customerWaiver?.termsAccepted?.length) {
        setTerms(job.customerWaiver.termsAccepted);
      } else {
        setTerms(SERVICE_TERMS.map(label => ({ label, accepted: false })));
      }
      setCustomerFullName(job.customerWaiver?.customerFullName || job.customerName || '');
      setSignature(job.customerWaiver?.digitalSignature || '');
    }
  }, [job]);

  const toggleTerm = (i: number) => {
    const u = [...terms];
    u[i].accepted = !u[i].accepted;
    setTerms(u);
  };

  const allAccepted = terms.length > 0 && terms.every(t => t.accepted);
  const canAdvance = allAccepted && !!signature && customerFullName.trim().length > 0;

  const handleSigOK = (sig: string) => {
    setSignature(sig);
    setSigMode(false);
  };

  const handleAdvance = () => {
    if (!canAdvance) return;
    saveStep(3, {
      termsAccepted: terms,
      customerFullName,
      digitalSignature: signature,
      dateSigned: new Date().toISOString(),
    }, true);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Service Terms & Waiver</Text>
        <Text style={styles.subtitle}>The customer must accept all terms and provide a digital signature before work begins.</Text>
      </View>

      {/* Terms List */}
      <View style={[styles.card, { backgroundColor: isDark ? '#111' : '#f4f4f5' }]}>
        <Text style={styles.sectionTitle}>Terms & Conditions</Text>
        {terms.map((term, i) => (
          <TouchableOpacity key={i} style={[styles.termRow, i < terms.length - 1 && { borderBottomWidth: 1, borderBottomColor: isDark ? '#222' : '#e4e4e7' }]} onPress={() => toggleTerm(i)}>
            {term.accepted ? <CheckSquare color="#f97316" size={22} /> : <Square color="#a1a1aa" size={22} />}
            <Text style={[styles.termText, { color: term.accepted ? colors.text : '#a1a1aa' }]}>{term.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Customer Name */}
      <Text style={styles.label}>Customer Full Name (Printed)</Text>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: isDark ? '#333' : '#ddd', backgroundColor: isDark ? '#111' : '#f4f4f5' }]}
        value={customerFullName}
        onChangeText={setCustomerFullName}
        placeholder="Enter customer's full legal name"
        placeholderTextColor="#666"
      />

      {/* Signature */}
      <Text style={styles.label}>Digital Signature</Text>
      {sigMode ? (
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
          style={[styles.sigTapArea, { borderColor: isDark ? '#333' : '#ddd', backgroundColor: signature ? '#22c55e10' : 'transparent' }]}
          onPress={() => setSigMode(true)}
        >
          {signature
            ? <><CheckCircle size={20} color="#22c55e" /><Text style={{ color: '#22c55e', fontWeight: '600', marginLeft: 8 }}>Signature Captured — Tap to Re-sign</Text></>
            : <Text style={{ color: '#a1a1aa', fontWeight: '600' }}>Tap to Sign</Text>
          }
        </TouchableOpacity>
      )}

      {/* Advance */}
      <TouchableOpacity
        style={[styles.saveBtn, !canAdvance && styles.saveBtnDisabled, saving && { opacity: 0.7 }]}
        onPress={handleAdvance}
        disabled={!canAdvance || saving}
      >
        {!canAdvance
          ? <><Lock color="#fff" size={20} style={{ marginRight: 8 }} /><Text style={styles.saveBtnText}>Accept All Terms & Sign</Text></>
          : saving
            ? <><Clock color="#fff" size={20} style={{ marginRight: 8 }} /><Text style={styles.saveBtnText}>Saving…</Text></>
            : <><CheckCircle color="#fff" size={20} style={{ marginRight: 8 }} /><Text style={styles.saveBtnText}>Submit Waiver</Text></>
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
  card: { borderRadius: 16, padding: 20, marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 },
  termRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 14, gap: 12 },
  termText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  label: { fontSize: 12, fontWeight: '600', color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 24 },
  sigCanvas: { height: 200, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#333', marginBottom: 30 },
  sigActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#0a0a0a' },
  sigClearBtn: { padding: 8 },
  sigDoneBtn: { backgroundColor: '#f97316', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
  sigTapArea: { height: 70, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginBottom: 30 },
  saveBtn: { backgroundColor: '#f97316', padding: 18, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#f97316', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10 },
  saveBtnDisabled: { backgroundColor: '#555' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
