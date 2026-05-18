/**
 * Payment History — customer view aligned with web CustomerDashboard
 * (`activeSection === 'payments'`): per-booking cards, reservation fee + full payment, totals.
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
  Modal,
  Pressable,
  Image,
  useWindowDimensions,
  Share,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { WebView } from 'react-native-webview';
import { cacheDirectory, deleteAsync, getContentUriAsync } from 'expo-file-system/legacy';
import { useTheme } from '@/hooks/useThemeContext';
import { Palette, BorderRadius } from '@/constants/theme';
import { Toast } from '@/components/ui/PremiumToast';
import { bookingService } from '@/services/api/bookingService';
import { getApiErrorMessage, invalidateCache } from '@/services/api/client';
import type { BookingRecord } from '@/services/api/types';
import {
  CUSTOMER_PAYMENT_RESERVATION_FEE,
  countPaymentHistoryBookings,
  filterBookingsForPaymentHistory,
  normCustomerBookingStatus,
  sortBookingsNewestFirst,
  sumFullPaymentsDisplayed,
  sumReservationFeesDisplayed,
} from '@/utils/customer-payment-history';

const formatCurrency = (amount: number) =>
  `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const formatDate = (dateStr: string | undefined) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

function BookingPaymentCard({
  booking,
  colors,
  isDark,
  cardWidth,
  onViewProof,
  onViewReceipt,
  receiptLoading,
}: {
  booking: BookingRecord;
  colors: ReturnType<typeof useTheme>['colors'];
  isDark: boolean;
  cardWidth: number;
  onViewProof: (url: string) => void;
  onViewReceipt: (orderId: string) => void;
  receiptLoading: boolean;
}) {
  const orderId = booking.id || booking._id || '';
  const st = normCustomerBookingStatus(booking.status);
  const total = Number(booking.totalPrice || booking.totalAmount || 0);
  const remaining = Math.max(total - CUSTOMER_PAYMENT_RESERVATION_FEE, 0);
  const vehicle =
    [booking.vehicleYear, booking.vehicleMake, booking.vehicleModel].filter(Boolean).join(' ') ||
    (booking as { vehicleInfo?: string }).vehicleInfo ||
    '—';
  const dateStr = booking.date || booking.bookingDate || booking.createdAt;
  const raw = booking as Record<string, unknown>;
  const proofUrl =
    (typeof raw.paymentProofUrl === 'string' && raw.paymentProofUrl) ||
    (typeof raw.downpaymentProof === 'string' && raw.downpaymentProof) ||
    null;
  const orderLabel =
    (booking.orderNumber != null && String(booking.orderNumber)) ||
    (typeof raw.bookingReference === 'string' && raw.bookingReference) ||
    String(orderId).slice(-8);

  const reservationStatesPaid = [
    'approved',
    'confirmed',
    'assigned',
    'received',
    'in_progress',
    'ready_for_payment',
    'completed',
    'released',
    'paid',
  ];
  const reservationPaid = reservationStatesPaid.includes(st) || Boolean(proofUrl);
  const isFullyPaid =
    String(booking.paymentStatus || '').toLowerCase() === 'paid' ||
    ['completed', 'released', 'paid'].includes(st);

  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.12)';
  const headerBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(248,250,252,0.95)';
  const indigo = '#6366F1';
  const indigoBg = isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.12)';
  const emerald = '#059669';
  const emeraldBg = isDark ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.12)';

  return (
    <View
      style={[
        styles.bookingCard,
        {
          width: cardWidth,
          backgroundColor: colors.card,
          borderColor: border,
        },
      ]}
    >
      <View style={[styles.cardHeader, { backgroundColor: headerBg, borderBottomColor: border }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.orderId, { color: colors.textMuted }]} numberOfLines={1}>
            {orderLabel}
          </Text>
          <View style={styles.titleRow}>
            <Ionicons name="card-outline" size={14} color={indigo} style={{ marginRight: 6 }} />
            <Text style={[styles.serviceTitle, { color: colors.text }]} numberOfLines={2}>
              {booking.serviceName || booking.serviceType || 'Service'}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
          <Text style={[styles.metaDate, { color: colors.textMuted }]}>{formatDate(dateStr)}</Text>
          <Text style={[styles.metaVehicle, { color: colors.text }]} numberOfLines={1}>
            {vehicle}
          </Text>
        </View>
      </View>

      <View style={[styles.payRow, { borderBottomColor: border }]}>
        <View style={[styles.payIconWrap, { backgroundColor: indigoBg }]}>
          <Ionicons name="lock-closed-outline" size={16} color={indigo} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.payTitle, { color: colors.text }]}>Reservation Fee</Text>
          <Text style={[styles.paySub, { color: colors.textMuted }]}>Paid online via GCash</Text>
        </View>
        <View style={styles.payRight}>
          {proofUrl ? (
            <TouchableOpacity onPress={() => onViewProof(proofUrl)} style={styles.linkBtn}>
              <Ionicons name="images-outline" size={12} color={indigo} />
              <Text style={[styles.linkBtnTxt, { color: indigo }]}>View proof</Text>
            </TouchableOpacity>
          ) : null}
          <View
            style={[
              styles.badge,
              reservationPaid
                ? { backgroundColor: isDark ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.15)' }
                : { backgroundColor: isDark ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.15)' },
            ]}
          >
            <Text
              style={[
                styles.badgeTxt,
                { color: reservationPaid ? emerald : isDark ? '#FBBF24' : '#D97706' },
              ]}
            >
              {reservationPaid ? 'Paid' : st === 'rejected' ? 'Rejected' : 'Pending'}
            </Text>
          </View>
          <Text style={[styles.payAmount, { color: colors.text }]}>
            {formatCurrency(CUSTOMER_PAYMENT_RESERVATION_FEE)}
          </Text>
        </View>
      </View>

      <View style={[styles.payRow, { borderBottomWidth: 0 }]}>
        <View style={[styles.payIconWrap, { backgroundColor: emeraldBg }]}>
          <Ionicons name="wallet-outline" size={16} color={emerald} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.payTitle, { color: colors.text }]}>Full Payment</Text>
          <Text style={[styles.paySub, { color: colors.textMuted }]}>
            Paid onsite upon service completion
          </Text>
        </View>
        <View style={styles.payRight}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 }}>
            <View
              style={[
                styles.badge,
                isFullyPaid
                  ? { backgroundColor: isDark ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.15)' }
                  : { backgroundColor: isDark ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.15)' },
              ]}
            >
              <Text
                style={[
                  styles.badgeTxt,
                  { color: isFullyPaid ? emerald : isDark ? '#FBBF24' : '#D97706' },
                ]}
              >
                {isFullyPaid ? '✓ Paid' : 'Pending'}
              </Text>
            </View>
            {isFullyPaid ? (
              <TouchableOpacity
                onPress={() => onViewReceipt(String(orderId))}
                disabled={receiptLoading}
                style={[
                  styles.receiptBtn,
                  { borderColor: isDark ? 'rgba(16,185,129,0.35)' : 'rgba(5,150,105,0.35)' },
                ]}
              >
                {receiptLoading ? (
                  <ActivityIndicator size="small" color={emerald} />
                ) : (
                  <>
                    <Ionicons name="document-text-outline" size={12} color={emerald} />
                    <Text style={[styles.receiptBtnTxt, { color: emerald }]}>View receipt</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={[styles.payAmount, { color: colors.text }]}>
            {remaining > 0 ? formatCurrency(remaining) : '—'}
          </Text>
        </View>
      </View>

      <View style={[styles.totalRow, { backgroundColor: headerBg, borderTopColor: border }]}>
        <Text style={[styles.totalLabel, { color: colors.textMuted }]}>TOTAL</Text>
        <Text style={[styles.totalValue, { color: colors.text }]}>
          {total > 0 ? formatCurrency(total) : '—'}
        </Text>
      </View>
    </View>
  );
}

export default function PaymentsScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowW } = useWindowDimensions();
  const cardWidth = Math.min(windowW - 32, 560);

  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proofModalUrl, setProofModalUrl] = useState<string | null>(null);
  const [pdfFileUri, setPdfFileUri] = useState<string | null>(null);
  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null);

  const visible = sortBookingsNewestFirst(filterBookingsForPaymentHistory(bookings));
  const bookingCount = countPaymentHistoryBookings(bookings);
  const resvSum = sumReservationFeesDisplayed(bookings);
  const fullSum = sumFullPaymentsDisplayed(bookings);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
        invalidateCache('/bookings');
      } else {
        setLoading(true);
      }
      setError(null);
      const rows = await bookingService.getMyBookings();
      setBookings(rows);
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Failed to load payment history');
      setError(msg);
      if (isRefresh) Toast.show(msg, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const openReceipt = useCallback(async (orderId: string) => {
    setReceiptLoadingId(orderId);
    try {
      const fileUri = await bookingService.saveOrderReceiptPdfToCache(orderId);
      setPdfFileUri(fileUri);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not open receipt';
      Toast.show(msg, 'error');
    } finally {
      setReceiptLoadingId(null);
    }
  }, []);

  const closePdfModal = useCallback(async () => {
    const uri = pdfFileUri;
    if (uri) {
      try {
        await deleteAsync(uri, { idempotent: true });
      } catch {
        /* ignore */
      }
    }
    setPdfFileUri(null);
  }, [pdfFileUri]);

  const sharePdfReceipt = useCallback(async () => {
    if (!pdfFileUri) return;
    try {
      if (Platform.OS === 'android') {
        const contentUri = await getContentUriAsync(pdfFileUri);
        await Linking.openURL(contentUri);
        return;
      }
      await Share.share({
        url: pdfFileUri,
        title: 'Payment receipt',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not open receipt';
      Toast.show(msg, 'error');
    }
  }, [pdfFileUri]);

  const renderEmpty = () => (
    <Animated.View entering={FadeIn.delay(200)} style={styles.emptyContainer}>
      <View style={[styles.emptyIconWrap, { backgroundColor: colors.cardAlt }]}>
        <Ionicons name="card-outline" size={48} color={colors.textMuted} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No payment records yet</Text>
      <Text style={[styles.emptySub, { color: colors.textMuted }]}>
        Book a service to see your payment history here.
      </Text>
    </Animated.View>
  );

  const renderError = () => (
    <Animated.View entering={FadeIn.delay(200)} style={styles.emptyContainer}>
      <View style={[styles.emptyIconWrap, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
        <Ionicons name="cloud-offline-outline" size={48} color={Palette.danger} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>Unable to Load</Text>
      <Text style={[styles.emptySub, { color: colors.textMuted }]}>{error}</Text>
      <TouchableOpacity
        style={[styles.retryBtn, { borderColor: Palette.accent }]}
        onPress={() => void load(false)}
      >
        <Ionicons name="refresh" size={16} color={Palette.accent} />
        <Text style={[styles.retryText, { color: Palette.accent }]}>Retry</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
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
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading bookings…</Text>
        </View>
      ) : error && bookings.length === 0 ? (
        renderError()
      ) : (
        <FlatList
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 40, alignItems: 'center' },
          ]}
          data={visible}
          keyExtractor={(item, index) => item.id || String(item._id ?? '') || `booking-${index}`}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={Palette.accent}
              colors={[Palette.accent]}
            />
          }
          ListHeaderComponent={
            <View style={{ width: cardWidth, marginBottom: 16 }}>
              <View style={styles.headerRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.pageTitle, { color: colors.text }]}>Payment History</Text>
                  <Text style={[styles.pageSub, { color: colors.textMuted }]}>
                    All reservation fees and full payments per booking.
                  </Text>
                </View>
                <View style={[styles.countPill, { borderColor: colors.border, backgroundColor: colors.cardAlt }]}>
                  <Text style={[styles.countPillTxt, { color: colors.textSecondary }]}>
                    {bookingCount} booking{bookingCount !== 1 ? 's' : ''}
                  </Text>
                </View>
              </View>

              <View style={styles.summaryGrid}>
                <View style={[styles.summaryCell, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>TOTAL BOOKINGS</Text>
                  <Text style={[styles.summaryValue, { color: colors.text }]}>{bookingCount}</Text>
                </View>
                <View style={[styles.summaryCell, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>RESERVATION FEES</Text>
                  <Text style={[styles.summaryValue, { color: indigo }]}>{formatCurrency(resvSum)}</Text>
                </View>
                <View
                  style={[
                    styles.summaryCell,
                    styles.summaryWide,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>FULL PAYMENTS</Text>
                  <Text style={[styles.summaryValue, { color: emerald }]}>{formatCurrency(fullSum)}</Text>
                </View>
              </View>

              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>YOUR BOOKINGS</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <Animated.View
              entering={FadeInDown.delay(80 + index * 50).duration(200)}
              style={{ marginBottom: 14, width: cardWidth }}
            >
              <BookingPaymentCard
                booking={item}
                colors={colors}
                isDark={isDark}
                cardWidth={cardWidth}
                onViewProof={(url) => setProofModalUrl(url)}
                onViewReceipt={openReceipt}
                receiptLoading={receiptLoadingId === (item.id || item._id)}
              />
            </Animated.View>
          )}
          ListEmptyComponent={visible.length === 0 && !loading ? renderEmpty : null}
        />
      )}

      <Modal visible={Boolean(proofModalUrl)} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setProofModalUrl(null)}>
          <Pressable style={styles.modalInner} onPress={(e) => e.stopPropagation()}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setProofModalUrl(null)}>
              <Text style={styles.modalCloseTxt}>Close</Text>
            </TouchableOpacity>
            {proofModalUrl ? (
              <Image source={{ uri: proofModalUrl }} style={styles.proofImage} resizeMode="contain" />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={Boolean(pdfFileUri)}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => void closePdfModal()}
      >
        <View style={[styles.pdfSheet, { paddingTop: insets.top, backgroundColor: colors.background }]}>
          <View style={[styles.pdfToolbar, { borderBottomColor: colors.border }]}>
            <Text style={[styles.pdfTitle, { color: colors.text }]}>Payment receipt</Text>
            <View style={styles.pdfToolbarActions}>
              <TouchableOpacity onPress={() => void sharePdfReceipt()} style={styles.pdfToolbarBtn}>
                <Ionicons name="share-outline" size={18} color={Palette.accent} />
                <Text style={[styles.pdfToolbarBtnTxt, { color: Palette.accent }]}>Open / Share</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void closePdfModal()}>
                <Text style={[styles.pdfCloseTxt, { color: colors.text }]}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
          {pdfFileUri ? (
            Platform.OS === 'android' ? (
              <View style={[styles.pdfFallback, { paddingHorizontal: 24 }]}>
                <Ionicons name="document-text-outline" size={56} color={colors.textMuted} />
                <Text style={[styles.pdfFallbackTitle, { color: colors.text }]}>
                  Receipt ready
                </Text>
                  <Text style={[styles.pdfFallbackBody, { color: colors.textMuted }]}>
                  Tap{' '}
                  <Text style={{ fontWeight: '800', color: colors.text }}>Open / Share</Text> to open
                  this PDF in your viewer (no extra native modules required).
                </Text>
                <TouchableOpacity
                  onPress={() => void sharePdfReceipt()}
                  style={[styles.pdfFallbackCta, { backgroundColor: Palette.accent }]}
                >
                  <Ionicons name="share-outline" size={20} color="#fff" />
                  <Text style={styles.pdfFallbackCtaTxt}>Open / Share PDF</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <WebView
                source={{ uri: pdfFileUri }}
                style={styles.pdfWeb}
                originWhitelist={['file://', 'http://*', 'https://*', '*']}
                allowFileAccess
                allowingReadAccessToURL={
                  cacheDirectory ? cacheDirectory : undefined
                }
                javaScriptEnabled={false}
                domStorageEnabled={false}
                startInLoadingState
                nestedScrollEnabled
                onError={() => {
                  Toast.show('Preview failed — use Open / Share to view the PDF', 'error');
                }}
              />
            )
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const indigo = '#6366F1';
const emerald = '#059669';

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 0 },

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

  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  pageTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  pageSub: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  countPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  countPillTxt: { fontSize: 11, fontWeight: '700' },

  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
  },
  summaryCell: {
    flexGrow: 1,
    flexBasis: '47%',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: 14,
  },
  summaryWide: {
    flexBasis: '100%',
    width: '100%',
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  summaryValue: { fontSize: 22, fontWeight: '800' },

  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },

  bookingCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  orderId: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  serviceTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  metaDate: { fontSize: 10 },
  metaVehicle: { fontSize: 12, fontWeight: '700', marginTop: 4, maxWidth: 140 },

  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  payIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payTitle: { fontSize: 13, fontWeight: '700' },
  paySub: { fontSize: 11, marginTop: 2 },
  payRight: {
    alignItems: 'flex-end',
    gap: 6,
    maxWidth: '42%',
  },
  payAmount: { fontSize: 14, fontWeight: '800' },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeTxt: { fontSize: 10, fontWeight: '800' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkBtnTxt: { fontSize: 10, fontWeight: '700', textDecorationLine: 'underline' },
  receiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  receiptBtnTxt: { fontSize: 10, fontWeight: '800' },

  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  totalLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  totalValue: { fontSize: 17, fontWeight: '800' },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: { fontSize: 14, fontWeight: '500' },

  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    minHeight: 280,
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

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: 20,
  },
  modalInner: { borderRadius: 16, overflow: 'hidden', maxHeight: '88%' },
  modalClose: { alignSelf: 'flex-end', padding: 8, marginBottom: 8 },
  modalCloseTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },
  proofImage: { width: '100%', height: 420, backgroundColor: '#111' },

  pdfSheet: { flex: 1 },
  pdfToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  pdfToolbarActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pdfToolbarBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pdfToolbarBtnTxt: { fontSize: 14, fontWeight: '700' },
  pdfTitle: { fontSize: 16, fontWeight: '800', flex: 1 },
  pdfCloseTxt: { fontSize: 14, fontWeight: '700' },
  pdfWeb: { flex: 1, backgroundColor: '#1a1a1a' },
  pdfFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 48,
    gap: 12,
  },
  pdfFallbackTitle: { fontSize: 20, fontWeight: '800', marginTop: 8 },
  pdfFallbackBody: { fontSize: 14, lineHeight: 22, textAlign: 'center', maxWidth: 340 },
  pdfFallbackCta: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 14,
  },
  pdfFallbackCtaTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
