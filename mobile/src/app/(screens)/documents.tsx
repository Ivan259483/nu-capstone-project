/**
 * Documents Screen — Service waivers, receipts, reports
 */

import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/hooks/useThemeContext';
import { Palette } from '@/constants/theme';
import GlassCard from '@/components/ui/GlassCard';
import Badge from '@/components/ui/Badge';
import PremiumButton from '@/components/ui/PremiumButton';

const DOCS = [
  { label: 'Service Waiver', sub: 'AutoSPF+ Premium Detail Waiver', date: 'Feb 15, 2026', status: 'Signed', statusColor: Palette.success },
  { label: 'Payment Receipt', sub: 'ORD-9923 – ₱4,999', date: 'Feb 10, 2026', status: 'Available', statusColor: Palette.accent },
  { label: 'Inspection Report', sub: 'Pre-Service Damage Report', date: 'Jan 28, 2026', status: 'Available', statusColor: Palette.accent },
];

export default function DocumentsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.backHeader, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.backTitle, { color: colors.text }]}>Documents & Waivers</Text>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        data={DOCS}
        keyExtractor={(_, i) => i.toString()}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        initialNumToRender={5}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={({ item: d, index: i }) => (
          <Animated.View entering={FadeInDown.delay(100 + i * 100).springify().damping(16).stiffness(120)}>
            <GlassCard>
              <View style={styles.docHeader}>
                <Text style={[styles.docLabel, { color: colors.text }]}>{d.label}</Text>
                <Badge label={d.status} color={d.statusColor} />
              </View>
              <Text style={[styles.docSub, { color: colors.textSecondary }]}>{d.sub}</Text>
              <View style={styles.docDateRow}>
                <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                <Text style={[styles.docDate, { color: colors.textMuted }]}>{d.date}</Text>
              </View>
              <PremiumButton title="Download PDF" icon="download" variant="outline" onPress={() => {}} style={{ marginTop: 14 }} />
            </GlassCard>
          </Animated.View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 16, paddingTop: 16, paddingBottom: 40 },
  backHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  backTitle: { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
  docHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  docLabel: { fontWeight: '700', fontSize: 15 },
  docSub: { fontSize: 13, marginBottom: 4 },
  docDateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  docDate: { fontSize: 12 },
});
