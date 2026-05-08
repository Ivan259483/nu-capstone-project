import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useWorkflow } from './WorkflowContext';
import { useTheme } from '@/hooks/useThemeContext';
import { CheckCircle, Clock, CheckSquare, Square } from '@/components/ui/Icons';

const CHECKLIST_TEMPLATES: Record<string, string[]> = {
  general: ['Vehicle Pre-Assessment Before Any Detailing Service', 'Verify Keys Received', 'Check Odometer Reading', 'Inspect Exterior (Walkaround)', 'Check Interior Valuables', 'Verify Gas Level'],
  ppf: ['Vehicle Pre-Assessment Before Any Detailing Service', 'Verify Keys Received', 'Check Odometer Reading', 'Inspect Exterior (Walkaround)', 'Check Interior Valuables', 'Measure Paint Thickness', 'Note Existing Paint Chips', 'Wash & Decontaminate Prep'],
  detailing: ['Vehicle Pre-Assessment Before Any Detailing Service', 'Verify Keys Received', 'Check Odometer Reading', 'Inspect Exterior (Walkaround)', 'Check Interior Valuables', 'Empty Trash/Loose Items', 'Assess Interior Stains'],
  tint: ['Vehicle Pre-Assessment Before Any Detailing Service', 'Fill/Explain Tint form', 'Dashcams, accessories removed', 'Ask client about RFID removal', 'Verify Keys Received', 'Inspect Exterior (Walkaround)', 'Check Interior Valuables']
};

export default function Step2_IngressChecklist() {
  const { colors, isDark } = useTheme();
  const { job, saveStep, saving } = useWorkflow();

  const [checklist, setChecklist] = useState<{name: string; checked: boolean}[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (job) {
      if (job.ingressChecklist?.items?.length > 0) {
        setChecklist(job.ingressChecklist.items);
        setNotes(job.ingressChecklist.beforeServiceNotes || '');
      } else {
        const serviceCategory = String(job.serviceName || job.serviceType || '').toLowerCase();
        let templateKey = 'general';
        if (serviceCategory.includes('ppf') || serviceCategory.includes('film')) templateKey = 'ppf';
        else if (serviceCategory.includes('detail')) templateKey = 'detailing';
        else if (serviceCategory.includes('tint') || serviceCategory.includes('window')) templateKey = 'tint';

        setChecklist(CHECKLIST_TEMPLATES[templateKey].map(name => ({ name, checked: false })));
      }
    }
  }, [job]);

  const toggleCheck = (index: number) => {
    const newArr = [...checklist];
    newArr[index].checked = !newArr[index].checked;
    setChecklist(newArr);
  };

  const handleComplete = () => {
    saveStep(2, {
      items: checklist,
      beforeServiceNotes: notes
    }, true);
  };

  const progress = checklist.length > 0 ? Math.round((checklist.filter(c => c.checked).length / checklist.length) * 100) : 0;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Pre-Assessment & Ingress Checklist</Text>
        <Text style={styles.subtitle}>Assess the vehicle before any detailing service.</Text>
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
        </View>
        <Text style={[styles.progressText, { color: colors.text }]}>{progress}% Completed</Text>
      </View>

      <View style={[styles.card, { backgroundColor: isDark ? '#111' : '#f4f4f5' }]}>
        {checklist.map((item, index) => (
          <TouchableOpacity 
            key={index} 
            style={[styles.checkRow, index !== checklist.length - 1 && styles.borderBottom, { borderBottomColor: isDark ? '#333' : '#ddd' }]}
            onPress={() => toggleCheck(index)}
          >
            {item.checked ? <CheckSquare color="#f97316" size={24} /> : <Square color="#a1a1aa" size={24} />}
            <Text style={[styles.checkText, { color: item.checked ? colors.text : '#a1a1aa' }]}>{item.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Pre-Assessment Notes & Belongings</Text>
      <TextInput 
        style={[styles.input, { color: colors.text, borderColor: isDark ? '#333' : '#ddd', backgroundColor: isDark ? '#111' : '#f4f4f5' }]} 
        value={notes} onChangeText={setNotes} multiline placeholder="Note valuables left inside or specific customer requests..." placeholderTextColor="#666" 
      />

      <TouchableOpacity 
        style={[styles.saveBtn, saving && { opacity: 0.7 }]} 
        onPress={handleComplete}
        disabled={saving || progress < 100}
      >
        {saving ? <Clock color="#fff" style={{marginRight: 8}}/> : <CheckCircle color="#fff" style={{marginRight: 8}}/>}
        <Text style={styles.saveBtnText}>
          {saving ? 'Saving...' : progress < 100 ? 'Complete All Items First' : 'Sign-off Pre-Assessment'}
        </Text>
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
  progressContainer: { marginBottom: 24 },
  progressBarBg: { height: 8, backgroundColor: '#333', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#f97316' },
  progressText: { fontSize: 12, fontWeight: '700', marginTop: 8, textAlign: 'right' },
  card: { borderRadius: 16, overflow: 'hidden', marginBottom: 24 },
  checkRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  borderBottom: { borderBottomWidth: 1 },
  checkText: { fontSize: 16, marginLeft: 12, fontWeight: '500' },
  label: { fontSize: 12, fontWeight: '600', color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 16, height: 100, textAlignVertical: 'top', marginBottom: 30 },
  saveBtn: { backgroundColor: '#f97316', padding: 18, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#f97316', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.4, shadowRadius: 10 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
