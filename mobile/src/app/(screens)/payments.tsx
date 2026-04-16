/**
 * Payments Screen — Live transaction history from backend
 * Premium AutoGloss aesthetic with real-time data
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useTheme } from '@/hooks/useThemeContext';
import { Palette, BorderRadius } from '@/constants/theme';
import { paymentService, type PaymentRecord } from '@/services/api/paymentService';
import { Toast } from '@/components/ui/PremiumToast';

const STATUS_MAP: Record<string, { label: string; color: string; icon: string }> = {
  succeeded: { label: 'Paid', color: Palette.success, icon: 'checkmark-circle' },
  pending: { label: 'Pending', color: Palette.warning, icon: 'time' },
  failed: { label: 'Failed', color: Palette.danger, icon: 'close-circle' },
  refunded: { label: 'Refunded', color: Palette.info, icon: 'arrow-undo' },
};

const METHOD_ICONS: Record<string, string> = {
  card: 'card',
  gcash: 'phone-portrait',
  maya: 'phone-portrait',
  cash: 'cash',
  other: 'wallet',
};

const formatCurrency = (amount: number) => {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function PaymentsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPayments = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const result = await paymentService.getMyPayments();
      setPayments(result.payments);
      setTotalSpent(result.totalSpent);
      setTotalCount(result.totalCount);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err.message || 'Failed to load payments';
      setError(msg);
      if (isRefresh) Toast.show(msg, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const renderEmptyState = () => (
    <Animated.View entering={FadeIn.delay(200)} style={styles.emptyContainer}>
      <View style={[styles.emptyIconWrap, { backgroundColor: colors.cardAlt }]}>
        <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No Payments Yet</Text>
      <Text style={[styles.emptySub, { color: colors.textMuted }]}>
        Your transaction history will appear here after your first service booking.
      </Text>
    </Animated.View>
  );

  const renderErrorState = () => (
    <Animated.View entering={FadeIn.delay(200)} style={styles.emptyContainer}>
      <View style={[styles.emptyIconWrap, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
        <Ionicons name="cloud-offline-outline" size={48} color={Palette.danger} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>Unable to Load</Text>
      <Text style={[styles.emptySub, { color: colors.textMuted }]}>{error}</Text>
      <TouchableOpacity
        style={[styles.retryBtn, { borderColor: Palette.accent }]}
        onPress={() => fetchPayments()}
      >
        <Ionicons name="refresh" size={16} color={Palette.accent} />
        <Text style={[styles.retryText, { color: Palette.accent }]}>Retry</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  const renderItem = ({ item: t, index: i }: { item: PaymentRecord; index: number }) => {
    const status = STATUS_MAP[t.status] || STATUS_MAP.pending;
    const methodIcon = METHOD_ICONS[t.method] || 'wallet';
    const serviceName = t.order?.serviceType || t.order?.orderNumber || t.invoiceId;

    return (
      <Animated.View entering={FadeInDown.delay(100 + i * 60).duration(200)}>
        <View
          style={[
            styles.txRow,
            {
              backgroundColor: colors.card,
              borderBottomWidth: 1,
              borderBottomColor: colors.borderLight,
            },
          ]}
        >
          <View style={[styles.txIcon, { backgroundColor: colors.accentLight }]}>
            <Ionicons name={methodIcon as any} size={17} color={Palette.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.txName, { color: colors.text }]} numberOfLines={1}>
              {serviceName}
            </Text>
            <Text style={[styles.txDate, { color: colors.textMuted }]}>
              {formatDate(t.createdAt)} · {t.method.toUpperCase()}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.txAmount, { color: colors.text }]}>
              {formatCurrency(t.amount)}
            </Text>
            <View style={styles.statusRow}>
              <Ionicons name={status.icon as any} size={11} color={status.color} />
              <Text style={[styles.txStatus, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Back Header */}
      <View
        style={[
          styles.backHeader,
          {
            paddingTop: insets.top + 8,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
        >
          <Ionicons name="arrow-back" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.backTitle, { color: colors.text }]}>Payment History</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Palette.accent} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>
            Loading transactions...
          </Text>
        </View>
      ) : error && payments.length === 0 ? (
        renderErrorState()
      ) : (
        <FlatList
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          data={payments}
          keyExtractor={(item) => item._id}
          initialNumToRender={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchPayments(true)}
              tintColor={Palette.accent}
              colors={[Palette.accent]}
            />
          }
          ListHeaderComponent={
            <>
              {/* Total Spent Card */}
              <Animated.View
                entering={FadeInDown.delay(100).duration(200)}
              >
                <LinearGradient
                  colors={[Palette.accent, Palette.accentDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.totalCard}
                >
                  <View style={styles.totalCardHeader}>
                    <View style={styles.totalCardIcon}>
                      <Ionicons name="wallet" size={20} color="rgba(255,255,255,0.9)" />
                    </View>
                    <Text style={styles.totalLabel}>Total Spent</Text>
                  </View>
                  <Text style={styles.totalAmount}>{formatCurrency(totalSpent)}</Text>
                  <View style={styles.totalFooter}>
                    <View style={styles.totalBadge}>
                      <Ionicons name="receipt" size={11} color="rgba(255,255,255,0.8)" />
                      <Text style={styles.totalBadgeText}>
                        {totalCount} transaction{totalCount !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <Text style={styles.totalSub}>
                      {new Date().getFullYear()}
                    </Text>
                  </View>
                </LinearGradient>
              </Animated.View>

              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                TRANSACTION LOG
              </Text>
            </>
          }
          renderItem={renderItem}
          ListEmptyComponent={renderEmptyState}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 16, paddingTop: 16, paddingBottom: 40 },
  backHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backTitle: { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },

  // Total card
  totalCard: { borderRadius: BorderRadius.xxl, padding: 22 },
  totalCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  totalCardIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalLabel: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600', letterSpacing: 0.5 },
  totalAmount: { fontSize: 36, fontWeight: '800', color: '#fff', marginVertical: 4, letterSpacing: -0.5 },
  totalFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  totalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  totalBadgeText: { fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  totalSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },

  sectionLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8 },

  // Transaction row
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txName: { fontWeight: '600', fontSize: 14 },
  txDate: { fontSize: 12, marginTop: 2 },
  txAmount: { fontWeight: '700', fontSize: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  txStatus: { fontSize: 11, fontWeight: '600' },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: { fontSize: 14, fontWeight: '500' },

  // Empty / Error
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: { fontSize: 14, fontWeight: '600' },
});
