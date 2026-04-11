import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useWorkflow } from './WorkflowContext';
import { useTheme } from '@/hooks/useThemeContext';
import { CheckCircle, Clock, Play, User, MapPin } from '@/components/ui/Icons';

const STATUS_OPTIONS = [
  { id: 'in_bay', label: 'In Bay / Parked' },
  { id: 'washing', label: 'Washing & Prep' },
  { id: 'detailing', label: 'Detailing Proper' },
  { id: 'polishing', label: 'Polishing/Correction' },
  { id: 'installation', label: 'PPF/Tint Installation' },
  { id: 'curing', label: 'Curing' }
];

export default function Step6_LiveProgress() {
  const { colors, isDark } = useTheme();
  const { job, saveStep, saving } = useWorkflow();

  const [currentStatus, setCurrentStatus] = useState('in_bay');
  const [assignedStaff, setAssignedStaff] = useState('Unassigned');
  const [bayNumber, setBayNumber] = useState('Awaiting Bay');

  useEffect(() => {
    if (job) {
      setAssignedStaff(String((job.assignedDetailer as any)?.name || job.assignedDetailer || 'Pending Assignment'));
      setBayNumber(job.serviceProper?.bayNumber || 'Bay 1');
      setCurrentStatus(String(job.customerStatus || 'in_bay'));
    }
  }, [job]);

  const handleUpdateStatus = (statusId: string) => {
    setCurrentStatus(statusId);
    // Optimistic auto-save without advancing workflow
    saveStep(6, { customerStatus: statusId, bayNumber }, false);
  };

  const handleAdvanceToQC = () => {
    saveStep(6, { status: 'completed', completedAt: new Date() }, true);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Live Service Progress</Text>
        <Text style={styles.subtitle}>Update the bay status to automatically notify the customer.</Text>
      </View>

      {/* Bay & Staff Meta */}
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
        <View style={[styles.metaCard, { backgroundColor: isDark ? '#111' : '#f4f4f5' }]}>
          <User size={16} color="#a1a1aa" />
          <View>
            <Text style={styles.metaLabel}>Assigned Staff</Text>
            <Text style={[styles.metaValue, { color: colors.text }]}>{assignedStaff}</Text>
          </View>
        </View>
        <View style={[styles.metaCard, { backgroundColor: isDark ? '#111' : '#f4f4f5' }]}>
          <MapPin size={16} color="#a1a1aa" />
          <View>
            <Text style={styles.metaLabel}>Current Bay</Text>
            <Text style={[styles.metaValue, { color: colors.text }]}>{bayNumber}</Text>
          </View>
        </View>
      </View>

      {/* Timeline List */}
      <View style={[styles.card, { backgroundColor: isDark ? '#111' : '#f4f4f5' }]}>
        <Text style={styles.sectionTitle}>Operations Timeline</Text>
        
        {STATUS_OPTIONS.map((status, index) => {
          const isActive = currentStatus === status.id;
          const isPast = STATUS_OPTIONS.findIndex(s => s.id === currentStatus) > index;

          return (
            <TouchableOpacity 
              key={status.id} 
              style={[styles.timelineRow, isActive && { backgroundColor: '#f9731615', borderColor: '#f97316', borderWidth: 1 }]}
              onPress={() => handleUpdateStatus(status.id)}
            >
              <View style={[styles.iconBox, isActive && { backgroundColor: '#f97316' }, isPast && { backgroundColor: '#22c55e' }]}>
                {isPast ? <CheckCircle size={16} color="#fff" /> : isActive ? <Play size={16} color="#fff" /> : <Clock size={16} color="#a1a1aa" />}
              </View>
              <Text style={[styles.timelineLabel, { color: isActive || isPast ? colors.text : '#a1a1aa', fontWeight: isActive ? 'bold' : '500' }]}>
                {status.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Action Button */}
      <TouchableOpacity 
        style={[styles.saveBtn, saving && { opacity: 0.7 }]} 
        onPress={handleAdvanceToQC}
        disabled={saving}
      >
        {saving ? <Clock color="#fff" style={{marginRight: 8}}/> : <CheckCircle color="#fff" style={{marginRight: 8}}/>}
        <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Service Finished (Send to QC)'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingBottom: 64 },
  header: { marginBottom: 24 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#a1a1aa' },
  metaCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16 },
  metaLabel: { fontSize: 11, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  card: { padding: 20, borderRadius: 16, marginBottom: 30 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#a1a1aa', textTransform: 'uppercase', marginBottom: 16, letterSpacing: 1 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 8, backgroundColor: 'transparent' },
  iconBox: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#333', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  timelineLabel: { fontSize: 16 },
  saveBtn: { backgroundColor: '#f97316', padding: 18, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#f97316', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.4, shadowRadius: 10 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
