import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useWorkflow } from './WorkflowContext';
import { useTheme } from '@/hooks/useThemeContext';
import SignatureScreen from 'react-native-signature-canvas';
import { CheckCircle, Clock } from '@/components/ui/Icons';
import { bookingService } from '@/services/api/bookingService';

export default function Step5_JobOrder() {
  const { colors, isDark } = useTheme();
  const { job, saveStep, saving } = useWorkflow();
  const signatureRef = useRef<any>(null);

  // Auto-fill states
  const [customerName, setCustomerName] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [service, setService] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [notes, setNotes] = useState('');
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    if (job) {
      setCustomerName(String(job.customerName || (job.customer as any)?.name || ''));
      setVehicle(String(job.vehicleInfo || job.vehiclePlate || ''));
      setService(job.serviceName || job.serviceType || '');
      const defaultRelease = new Date();
      defaultRelease.setDate(defaultRelease.getDate() + 3);
      setReleaseDate(job.jobOrder?.targetReleaseDate || defaultRelease.toISOString().split('T')[0]);
      setNotes(job.jobOrder?.additionalDetails || job.notes || '');
      if (job.jobOrder?.customerSignature) setHasSignature(true);
    }
  }, [job]);

  const handleSignatureOK = async (signature: string) => {
    const stepData = {
      customerName,
      vehicleModel: vehicle,
      serviceCategory: service,
      targetReleaseDate: releaseDate,
      additionalDetails: notes,
      customerSignature: signature,
      ingressDateTime: new Date().toISOString()
    };
    try {
      await saveStep(5, stepData, false);
      if (job?.id && job.status === 'received') {
        await bookingService.operateStartService(job.id);
      }
      saveStep(5, {}, true); // Advance
    } catch (err) {
      console.error('[StartService] error:', err);
    }
  };

  const handleComplete = () => {
    if (!hasSignature) {
      signatureRef.current?.readSignature();
    } else {
      handleSignatureOK(''); // Keep existing
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Official Job Order</Text>
        <Text style={styles.subtitle}>Review and confirm details before starting work.</Text>
      </View>

      <View style={[styles.card, { backgroundColor: isDark ? '#111' : '#f4f4f5' }]}>
        <Text style={styles.label}>Customer Name</Text>
        <TextInput 
          style={[styles.input, { color: colors.text, borderColor: isDark ? '#333' : '#ddd' }]} 
          value={customerName} onChangeText={setCustomerName} placeholderTextColor="#666" 
        />

        <Text style={styles.label}>Vehicle</Text>
        <TextInput 
          style={[styles.input, { color: colors.text, borderColor: isDark ? '#333' : '#ddd' }]} 
          value={vehicle} onChangeText={setVehicle} placeholderTextColor="#666" 
        />

        <Text style={styles.label}>Service Package</Text>
        <TextInput 
          style={[styles.input, { color: colors.text, borderColor: isDark ? '#333' : '#ddd' }]} 
          value={service} onChangeText={setService} placeholderTextColor="#666" 
        />

        <Text style={styles.label}>Target Release Date (YYYY-MM-DD)</Text>
        <TextInput 
          style={[styles.input, { color: colors.text, borderColor: isDark ? '#333' : '#ddd' }]} 
          value={releaseDate} onChangeText={setReleaseDate} placeholderTextColor="#666" 
        />

        <Text style={styles.label}>Additional Notes</Text>
        <TextInput 
          style={[styles.input, { color: colors.text, borderColor: isDark ? '#333' : '#ddd', height: 80, textAlignVertical: 'top' }]} 
          value={notes} onChangeText={setNotes} multiline placeholderTextColor="#666" 
        />
      </View>

      <View style={styles.signatureBox}>
        <Text style={styles.label}>Customer Signature</Text>
        {hasSignature ? (
           <View style={[styles.signedCard, { backgroundColor: '#22c55e20', borderColor: '#22c55e' }]}>
              <CheckCircle size={24} color="#22c55e" />
              <Text style={styles.signedText}>Signature on File</Text>
              <TouchableOpacity onPress={() => setHasSignature(false)}><Text style={{color: '#f97316', marginTop: 10}}>Clear & Sign Again</Text></TouchableOpacity>
           </View>
        ) : (
          <View style={styles.canvasContainer}>
            <SignatureScreen
                ref={signatureRef}
                onOK={handleSignatureOK}
                webStyle={`.m-signature-pad {box-shadow: none; border: none; } .m-signature-pad--body {border: none;}`}
                backgroundColor={isDark ? '#1a1a1a' : '#fff'}
                penColor={isDark ? '#f97316' : '#000'}
            />
          </View>
        )}
      </View>

      <TouchableOpacity 
        style={[styles.saveBtn, saving && { opacity: 0.7 }]} 
        onPress={handleComplete}
        disabled={saving}
      >
        {saving ? <Clock color="#fff" style={{marginRight: 8}}/> : <CheckCircle color="#fff" style={{marginRight: 8}}/>}
        <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Sign & Advance to Progress'}</Text>
      </TouchableOpacity>
      
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingBottom: 64 },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#a1a1aa' },
  card: { padding: 20, borderRadius: 16, marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '600', color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 10, padding: 16, fontSize: 16, backgroundColor: 'transparent' },
  signatureBox: { marginBottom: 30 },
  canvasContainer: { height: 200, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#333' },
  signedCard: { height: 120, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  signedText: { color: '#22c55e', fontSize: 16, fontWeight: 'bold', marginTop: 8 },
  saveBtn: { backgroundColor: '#f97316', padding: 18, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#f97316', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.4, shadowRadius: 10 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
