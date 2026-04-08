import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useWorkflow } from './WorkflowContext';
import { useTheme } from '@/hooks/useThemeContext';
import { CheckCircle, Clock, FileText, Shield } from '@/components/ui/Icons';
import * as Print from 'expo-print';

export default function Step8_WarrantyReceipt() {
  const { colors, isDark } = useTheme();
  const { job, saveStep, saving, completedSteps } = useWorkflow();

  const [warrantyMonths, setWarrantyMonths] = useState('12');
  const [warrantyNotes, setWarrantyNotes] = useState('');
  const [pdfGenerated, setPdfGenerated] = useState(false);

  useEffect(() => {
    if (job?.egressData?.warrantyMonths) setWarrantyMonths(String(job.egressData.warrantyMonths));
    if (job?.egressData?.warrantyNotes) setWarrantyNotes(job.egressData.warrantyNotes);
  }, [job]);

  const generatePDF = async () => {
    try {
      const qcItems = job?.qcChecklist || [];
      const qcRows = qcItems.map((item: any) =>
        `<tr><td style="padding:8px;border-bottom:1px solid #333">${item.item}</td><td style="padding:8px;border-bottom:1px solid #333;text-align:center;color:${item.passed ? '#22c55e' : '#ef4444'}">${item.passed ? '✓ PASS' : '✗ FAIL'}</td></tr>`
      ).join('');

      const html = `
        <html>
        <head><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
        <body style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#000;color:#fff;padding:40px;margin:0">
          <div style="text-align:center;margin-bottom:40px">
            <h1 style="color:#f97316;font-size:28px;margin:0">AUTOSPF+</h1>
            <p style="color:#888;font-size:12px;letter-spacing:2px;margin-top:4px">PREMIUM AUTOMOTIVE DETAILING</p>
          </div>
          <div style="border:1px solid #333;border-radius:12px;padding:24px;margin-bottom:24px">
            <h2 style="color:#f97316;font-size:16px;letter-spacing:1px;margin:0 0 16px 0">SERVICE RECEIPT & WARRANTY</h2>
            <table style="width:100%;font-size:14px;color:#ccc">
              <tr><td style="padding:6px 0;color:#888">Customer</td><td style="padding:6px 0;text-align:right">${job?.customerName || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#888">Vehicle</td><td style="padding:6px 0;text-align:right">${(job as any)?.vehicleInfo || job?.vehiclePlate || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#888">Service</td><td style="padding:6px 0;text-align:right">${job?.serviceName || job?.serviceType || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#888">Order #</td><td style="padding:6px 0;text-align:right">${(job as any)?.orderNumber || 'N/A'}</td></tr>
              <tr><td style="padding:6px 0;color:#888">Date</td><td style="padding:6px 0;text-align:right">${new Date().toLocaleDateString()}</td></tr>
              <tr><td style="padding:6px 0;color:#888">Warranty</td><td style="padding:6px 0;text-align:right;color:#f97316;font-weight:bold">${warrantyMonths} Months</td></tr>
            </table>
          </div>
          ${qcRows.length > 0 ? `
          <div style="border:1px solid #333;border-radius:12px;padding:24px;margin-bottom:24px">
            <h2 style="color:#f97316;font-size:14px;letter-spacing:1px;margin:0 0 16px 0">QUALITY CONTROL RESULTS</h2>
            <table style="width:100%;font-size:13px;color:#ccc">${qcRows}</table>
          </div>` : ''}
          ${warrantyNotes ? `
          <div style="border:1px solid #333;border-radius:12px;padding:24px;margin-bottom:24px">
            <h2 style="color:#f97316;font-size:14px;letter-spacing:1px;margin:0 0 12px 0">WARRANTY NOTES</h2>
            <p style="color:#aaa;font-size:13px;line-height:1.6">${warrantyNotes}</p>
          </div>` : ''}
          <div style="text-align:center;margin-top:40px;padding:20px;border-top:1px solid #333">
            <p style="color:#555;font-size:11px;margin:0">This is a digitally generated document by AUTOSPF+.</p>
            <p style="color:#555;font-size:11px;margin:4px 0 0 0">For warranty claims, present this receipt along with your order number.</p>
          </div>
        </body>
        </html>
      `;

      await Print.printAsync({ html });
      setPdfGenerated(true);
    } catch (err) {
      console.error('[Step8] PDF generation failed:', err);
      Alert.alert('Error', 'Could not generate PDF. Please try again.');
    }
  };

  const handleAdvance = () => {
    saveStep(8, {
      warrantyMonths: parseInt(warrantyMonths, 10),
      warrantyNotes,
      receiptGeneratedAt: new Date().toISOString(),
    }, true);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Warranty & Receipt</Text>
        <Text style={styles.subtitle}>Configure warranty terms and generate the official digital receipt.</Text>
      </View>

      {/* Warranty Config */}
      <View style={[styles.card, { backgroundColor: isDark ? '#111' : '#f4f4f5' }]}>
        <Text style={styles.sectionTitle}>Warranty Configuration</Text>

        <Text style={styles.label}>Warranty Duration (Months)</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: isDark ? '#333' : '#ddd' }]}
          value={warrantyMonths}
          onChangeText={setWarrantyMonths}
          keyboardType="numeric"
          placeholderTextColor="#666"
        />

        <Text style={styles.label}>Warranty Notes / Conditions</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: isDark ? '#333' : '#ddd', height: 100, textAlignVertical: 'top' }]}
          value={warrantyNotes}
          onChangeText={setWarrantyNotes}
          multiline
          placeholder="e.g., PPF warranty covers yellowing, cracking, and peeling under normal conditions…"
          placeholderTextColor="#666"
        />
      </View>

      {/* QC Summary */}
      {completedSteps.includes(7) && (
        <View style={[styles.card, { backgroundColor: isDark ? '#111' : '#f4f4f5' }]}>
          <Text style={styles.sectionTitle}>QC Summary (From Step 7)</Text>
          {(job?.qcChecklist || []).map((item: any, i: number) => (
            <View key={i} style={styles.qcRow}>
              {item.passed ? <CheckCircle size={16} color="#22c55e" /> : <Clock size={16} color="#ef4444" />}
              <Text style={[styles.qcText, { color: item.passed ? colors.text : '#a1a1aa' }]}>{item.item}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Generate PDF */}
      <TouchableOpacity style={[styles.pdfBtn, { backgroundColor: isDark ? '#222' : '#f4f4f5' }]} onPress={generatePDF}>
        <FileText size={20} color="#f97316" />
        <Text style={styles.pdfBtnText}>{pdfGenerated ? 'Re-Generate PDF Receipt' : 'Generate PDF Receipt'}</Text>
      </TouchableOpacity>

      {pdfGenerated && (
        <View style={styles.generatedBadge}>
          <Shield size={16} color="#22c55e" />
          <Text style={styles.generatedText}>PDF Receipt Generated Successfully</Text>
        </View>
      )}

      {/* Advance */}
      <TouchableOpacity
        style={[styles.saveBtn, saving && { opacity: 0.7 }]}
        onPress={handleAdvance}
        disabled={saving}
      >
        {saving
          ? <><Clock size={20} color="#fff" style={{ marginRight: 8 }} /><Text style={styles.saveBtnText}>Saving…</Text></>
          : <><CheckCircle size={20} color="#fff" style={{ marginRight: 8 }} /><Text style={styles.saveBtnText}>Finalize & Proceed to Release</Text></>
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
  label: { fontSize: 12, fontWeight: '600', color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 16, backgroundColor: 'transparent' },

  qcRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  qcText: { fontSize: 14, fontWeight: '500' },

  pdfBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18, borderRadius: 12, borderWidth: 1, borderColor: '#f97316', marginBottom: 16 },
  pdfBtnText: { color: '#f97316', fontSize: 16, fontWeight: 'bold' },

  generatedBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 },
  generatedText: { color: '#22c55e', fontSize: 14, fontWeight: '600' },

  saveBtn: { backgroundColor: '#f97316', padding: 18, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#f97316', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
