/**
 * Payments Screen — Transaction history with total spent card
 */

import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/hooks/useThemeContext';
import { Palette, BorderRadius } from '@/constants/theme';
import GlassCard from '@/components/ui/GlassCard';

const TRANSACTIONS = [
  { name: 'SPF+ Premium Detail', date: 'Feb 10, 2026', amount: '₱4,999', status: 'Paid' },
  { name: 'Full Detail Package', date: 'Jan 15, 2026', amount: '₱1,299', status: 'Paid' },
  { name: 'Basic Wash × 3', date: 'Dec 20, 2025', amount: '₱897', status: 'Paid' },
];

export default function PaymentsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Back Header */}
      <View style={[styles.backHeader, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.backTitle, { color: colors.text }]}>Payment History</Text>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        data={TRANSACTIONS}
        keyExtractor={(_, i) => i.toString()}
        initialNumToRender={5}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        ListHeaderComponent={
          <>
            {/* Total Card */}
            <Animated.View entering={FadeInDown.delay(100).springify().damping(16).stiffness(120)}>
              <LinearGradient colors={[Palette.accent, Palette.accentDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.totalCard}>
                <Text style={styles.totalLabel}>Total Spent</Text>
                <Text style={styles.totalAmount}>₱14,297</Text>
                <Text style={styles.totalSub}>Across 3 services · 2026</Text>
              </LinearGradient>
            </Animated.View>

            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>TRANSACTION LOG</Text>
          </>
        }
        renderItem={({ item: t, index: i }) => {
          // Wrapped inside GlassCard but split per-item allows FlatList virtualization,
          // though typically GlassCard should encapsulate everything. 
          // For now, we emulate row aesthetics.
          return (
            <Animated.View entering={FadeInDown.delay(200).springify().damping(16).stiffness(120)}>
              <View style={[styles.txRow, { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}>
                <View style={[styles.txIcon, { backgroundColor: colors.accentLight }]}>
                  <Ionicons name="card" size={17} color={Palette.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.txName, { color: colors.text }]}>{t.name}</Text>
                  <Text style={[styles.txDate, { color: colors.textMuted }]}>{t.date}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.txAmount, { color: colors.text }]}>{t.amount}</Text>
                  <Text style={styles.txStatus}>{t.status}</Text>
                </View>
              </View>
            </Animated.View>
          );
        }}
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
  totalCard: { borderRadius: BorderRadius.xxl, padding: 18 },
  totalLabel: { fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  totalAmount: { fontSize: 32, fontWeight: '800', color: '#fff', marginTop: 4 },
  totalSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  sectionLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8 },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  txIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  txName: { fontWeight: '600', fontSize: 14 },
  txDate: { fontSize: 12 },
  txAmount: { fontWeight: '700', fontSize: 14 },
  txStatus: { fontSize: 11, color: Palette.success, fontWeight: '600' },
});
