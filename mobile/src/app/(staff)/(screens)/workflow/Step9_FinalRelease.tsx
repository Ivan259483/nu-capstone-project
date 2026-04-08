import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useWorkflow } from './WorkflowContext';
import { useTheme } from '@/hooks/useThemeContext';
import { CheckCircle, Clock, Lock, Car, Shield, FileText } from '@/components/ui/Icons';
import { useRouter } from 'expo-router';

export default function Step9_FinalRelease() {
  const { colors, isDark } = useTheme();
  const { job, saveStep, saving, completedSteps } = useWorkflow();
  const router = useRouter();

  const qcDone = completedSteps.includes(7);
  const warrantyDone = completedSteps.includes(8);

  const handleRelease = () => {
    Alert.alert(
      'Release Vehicle',
      'Confirm the vehicle is being released to the client. This action is final.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Release Now',
          style: 'default',
          onPress: () => {
            saveStep(9, {
              releaseTimestamp: new Date().toISOString(),
              releasedBy: 'staff',
            }, false);
            // Navigate back to the staff dashboard
            setTimeout(() => router.replace('/(staff)'), 500);
          },
        },
      ]
    );
  };

  const canRelease = qcDone;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Vehicle Release</Text>
        <Text style={styles.subtitle}>Final step — confirm the vehicle handover back to the client.</Text>
      </View>

      {/* Status Gates */}
      <View style={[styles.card, { backgroundColor: isDark ? '#111' : '#f4f4f5' }]}>
        <Text style={styles.sectionTitle}>Pre-Release Checklist</Text>

        <View style={styles.gateRow}>
          {qcDone ? <CheckCircle size={20} color="#22c55e" /> : <Lock size={20} color="#ef4444" />}
          <Text style={[styles.gateLabel, { color: qcDone ? colors.text : '#a1a1aa' }]}>QC & Egress Approved</Text>
          <View style={[styles.gatePill, qcDone ? styles.pillGreen : styles.pillRed]}>
            <Text style={[styles.gatePillText, { color: qcDone ? '#22c55e' : '#ef4444' }]}>{qcDone ? 'DONE' : 'PENDING'}</Text>
          </View>
        </View>

        <View style={[styles.gateRow, { borderTopWidth: 1, borderTopColor: isDark ? '#222' : '#e4e4e7' }]}>
          {warrantyDone ? <CheckCircle size={20} color="#22c55e" /> : <Clock size={20} color="#a1a1aa" />}
          <Text style={[styles.gateLabel, { color: warrantyDone ? colors.text : '#a1a1aa' }]}>Warranty & Receipt Generated</Text>
          <View style={[styles.gatePill, warrantyDone ? styles.pillGreen : styles.pillYellow]}>
            <Text style={[styles.gatePillText, { color: warrantyDone ? '#22c55e' : '#eab308' }]}>{warrantyDone ? 'DONE' : 'OPTIONAL'}</Text>
          </View>
        </View>
      </View>

      {/* Vehicle Summary */}
      <View style={[styles.card, { backgroundColor: isDark ? '#111' : '#f4f4f5' }]}>
        <Text style={styles.sectionTitle}>Vehicle Summary</Text>
        <View style={styles.summaryRow}>
          <Car size={18} color="#f97316" />
          <Text style={[styles.summaryText, { color: colors.text }]}>{String((job as any)?.vehicleInfo || job?.vehiclePlate || 'Vehicle')}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Shield size={18} color="#3b82f6" />
          <Text style={[styles.summaryText, { color: colors.text }]}>{job?.serviceName || job?.serviceType || 'Service'}</Text>
        </View>
        <View style={styles.summaryRow}>
          <FileText size={18} color="#22c55e" />
          <Text style={[styles.summaryText, { color: colors.text }]}>Order #{(job as any)?.orderNumber || 'N/A'}</Text>
        </View>
      </View>

      {/* Aftercare Tips */}
      <View style={[styles.card, { backgroundColor: isDark ? '#111' : '#f4f4f5' }]}>
        <Text style={styles.sectionTitle}>Aftercare Reminders</Text>
        {[
          'Avoid washing the vehicle for 48 hours.',
          'Do not roll windows down for 3 days (if tinted).',
          'Avoid pressure washing near PPF edges for 30 days.',
          'Park in shade whenever possible for the first week.',
        ].map((tip, i) => (
          <View key={i} style={styles.tipRow}>
            <Text style={styles.tipBullet}>•</Text>
            <Text style={[styles.tipText, { color: '#a1a1aa' }]}>{tip}</Text>
          </View>
        ))}
      </View>

      {/* Release Button */}
      <TouchableOpacity
        style={[styles.releaseBtn, !canRelease && styles.releaseBtnDisabled, saving && { opacity: 0.7 }]}
        onPress={handleRelease}
        disabled={!canRelease || saving}
      >
        {!canRelease
          ? <><Lock color="#fff" size={20} style={{ marginRight: 8 }} /><Text style={styles.releaseBtnText}>QC Must Be Completed First</Text></>
          : saving
            ? <><Clock color="#fff" size={20} style={{ marginRight: 8 }} /><Text style={styles.releaseBtnText}>Processing…</Text></>
            : <><Car color="#fff" size={20} style={{ marginRight: 8 }} /><Text style={styles.releaseBtnText}>Release Vehicle to Client</Text></>
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

  gateRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  gateLabel: { flex: 1, fontSize: 15, fontWeight: '500', marginLeft: 12 },
  gatePill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 },
  gatePillText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  pillGreen: { backgroundColor: '#22c55e18' },
  pillRed: { backgroundColor: '#ef444418' },
  pillYellow: { backgroundColor: '#eab30818' },

  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  summaryText: { fontSize: 16, fontWeight: '600' },

  tipRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  tipBullet: { color: '#f97316', fontSize: 18, marginRight: 10, lineHeight: 20 },
  tipText: { flex: 1, fontSize: 14, lineHeight: 20 },

  releaseBtn: { backgroundColor: '#22c55e', padding: 20, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#22c55e', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10 },
  releaseBtnDisabled: { backgroundColor: '#555' },
  releaseBtnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});
