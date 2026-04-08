import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useWorkflow } from './WorkflowContext';
import { useTheme } from '@/hooks/useThemeContext';
import { CheckCircle, Clock, Calendar, Car, Wrench, XCircle } from '@/components/ui/Icons';

export default function Step1_BookingInbox() {
  const { colors, isDark } = useTheme();
  const { job, saveStep, saving, navigateToStep } = useWorkflow();

  const handleApprove = () => {
    // Status advances to 'confirmed', but workflow step triggers moving to step 2 visually
    saveStep(1, { status: 'confirmed' }, true);
  };

  const handleReject = () => {
    Alert.alert('Reject Booking', 'Are you sure you want to cancel this booking?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => {
        saveStep(1, { status: 'cancelled' }, false);
        // Maybe route back home
      }}
    ]);
  };

  if (!job) return <View style={[styles.container, {backgroundColor: colors.background}]}><Text style={{color: colors.text, padding: 20}}>Loading booking data...</Text></View>;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Booking Request</Text>
        <Text style={styles.subtitle}>Review client details before accepting into the shop queue.</Text>
      </View>

      <View style={[styles.card, { backgroundColor: isDark ? '#111' : '#f4f4f5' }]}>
        <Text style={styles.sectionTitle}>Client Details</Text>
        <Text style={[styles.dataBlock, { color: colors.text }]}>{job.customerName || 'Walk-in / Unknown'}</Text>
        <Text style={[styles.dataSub, { color: '#a1a1aa' }]}>{job.customerPhone || 'No contact provided'}</Text>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Requested Schedule</Text>
        <View style={styles.row}>
          <Calendar size={16} color="#f97316" />
          <Text style={[styles.dataBlock, { color: colors.text, marginLeft: 8 }]}>{job.bookingDate || job.date || 'TBD'}</Text>
        </View>
        <View style={[styles.row, { marginTop: 8 }]}>
          <Clock size={16} color="#f97316" />
          <Text style={[styles.dataBlock, { color: colors.text, marginLeft: 8 }]}>{job.bookingTime || job.time || 'TBD'}</Text>
        </View>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Vehicle & Service</Text>
        <View style={styles.row}>
          <Car size={16} color="#3b82f6" />
          <Text style={[styles.dataBlock, { color: colors.text, marginLeft: 8 }]}>{job.vehicleInfo || job.vehiclePlate || 'Vehicle details pending'}</Text>
        </View>
        <View style={[styles.row, { marginTop: 8 }]}>
          <Wrench size={16} color="#3b82f6" />
          <Text style={[styles.dataBlock, { color: colors.text, marginLeft: 8 }]}>{job.serviceName || job.serviceType}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 16, marginTop: 20 }}>
        <TouchableOpacity 
          style={[styles.rejectBtn, { borderColor: isDark ? '#333' : '#ddd' }]} 
          onPress={handleReject}
          disabled={saving}
        >
          <XCircle color="#ef4444" size={20} />
          <Text style={styles.rejectBtnText}>Reject</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.approveBtn, saving && { opacity: 0.7 }]} 
          onPress={handleApprove}
          disabled={saving}
        >
          {saving ? <Clock color="#fff" size={20} /> : <CheckCircle color="#fff" size={20} />}
          <Text style={styles.approveBtnText}>{saving ? 'Processing...' : 'Approve & Convert'}</Text>
        </TouchableOpacity>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingBottom: 64 },
  header: { marginBottom: 24 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#a1a1aa' },
  card: { padding: 20, borderRadius: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#a1a1aa', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 1 },
  dataBlock: { fontSize: 16, fontWeight: '600' },
  dataSub: { fontSize: 14, marginTop: 2 },
  divider: { height: 1, backgroundColor: 'rgba(150,150,150,0.2)', marginVertical: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rejectBtn: { flex: 1, padding: 18, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  rejectBtnText: { color: '#ef4444', fontSize: 16, fontWeight: 'bold' },
  approveBtn: { flex: 2, backgroundColor: '#f97316', padding: 18, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: '#f97316', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.4, shadowRadius: 10 },
  approveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
