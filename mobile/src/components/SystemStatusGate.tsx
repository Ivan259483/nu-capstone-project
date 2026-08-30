import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSystemStatus } from '@/context/SystemStatusContext';
import { PremiumLoader } from '@/components/ui/loading';

export default function SystemStatusGate({ children }: { children: React.ReactNode }) {
  const { status, refreshing, error, refresh } = useSystemStatus();
  const insets = useSafeAreaInsets();

  if (status.mode !== 'archived') return <>{children}</>;

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, 28), paddingBottom: Math.max(insets.bottom, 24) }]}>
      <View style={styles.iconWrap}>
        <Ionicons name="archive-outline" size={28} color="#F97316" />
      </View>
      <Text style={styles.eyebrow}>AUTOSPF+ SYSTEM STATUS</Text>
      <Text style={styles.title}>System Archived</Text>
      <Text style={styles.body}>
        AutoSPF+ is currently in archive mode. New bookings, account registration, payments, and service updates are unavailable.
      </Text>
      <Text style={styles.helper}>
        Contact the AutoSPF+ administrator if you need access to archived records.
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={refreshing}
        onPress={() => void refresh()}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, refreshing && styles.buttonDisabled]}
      >
        {refreshing ? <PremiumLoader size="small" tone="light" accessibilityLabel="Checking system status" /> : <Ionicons name="refresh" size={17} color="#FFFFFF" />}
        <Text style={styles.buttonText}>{refreshing ? 'Checking…' : 'Check status'}</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  iconWrap: {
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    marginBottom: 22,
  },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: '#F97316', marginBottom: 9 },
  title: { fontSize: 29, lineHeight: 35, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  body: { marginTop: 14, maxWidth: 380, fontSize: 15, lineHeight: 23, color: '#475569', textAlign: 'center' },
  helper: { marginTop: 10, maxWidth: 340, fontSize: 13, lineHeight: 19, color: '#64748B', textAlign: 'center' },
  button: {
    marginTop: 28,
    minWidth: 158,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    flexDirection: 'row',
    gap: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  buttonPressed: { opacity: 0.86 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  error: { marginTop: 14, color: '#B91C1C', fontSize: 12, textAlign: 'center' },
});
