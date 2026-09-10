/**
 * Payment History — customer view aligned with web CustomerDashboard
 * (`activeSection === 'payments'`): per-booking cards, reservation fee + full payment, totals.
 *
 * Mirrors the web Payment History's information hierarchy (summary → search/filter →
 * transactions) as a native card list rather than a shrunk table. Every figure below is
 * read from the same `/payments/my` ledger the web app reads — nothing here is computed
 * from booking status/price, and unpaid future balances never enter these totals.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Platform,
  useWindowDimensions,
  Clipboard,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PageSkeleton, PremiumLoader } from '@/components/ui/loading';
import { MotionModal } from '@/components/ui/MotionOverlay';
import MotionPressable from '@/components/ui/MotionPressable';
import { Toast } from '@/components/ui/PremiumToast';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/hooks/useThemeContext';
import { Palette, BorderRadius } from '@/constants/theme';
import { getApiErrorMessage } from '@/services/api/client';
import type { BookingRecord } from '@/services/api/types';
import {
  matchesPaymentSearch,
  paymentDateFilterCutoff,
  paymentDisplayAmount,
  paymentEffectiveDate,
  paymentFilterGroup,
  paymentMethodLabel,
  paymentStatusLabel,
  paymentTypeLabel,
  receiptAvailabilityMessage,
  sortPaymentsNewestFirst,
  summarizePaymentHistory,
  type PaymentDateFilter,
  type PaymentFilterGroup,
} from '@/utils/customer-payment-history';
import { useCustomerBookings } from '@/hooks/useCustomerBookings';
import { paymentService, type PaymentReceipt, type PaymentRecord } from '@/services/api/paymentService';
import { OfficialPaymentReceipt } from '@/components/payments/OfficialPaymentReceipt';
import { buildMobileReceiptHtml, mobileReceiptFileName } from '@/lib/receipt-html';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

type ThemeColors = ReturnType<typeof useTheme>['colors'];

const GREEN = '#059669';
const GREEN_DARK = '#34D399';
const AMBER = '#D97706';
const AMBER_DARK = '#FBBF24';
const RED = '#DC2626';
const RED_DARK = '#F87171';
const PURPLE = '#6D6293';
const PURPLE_DARK = '#A99FD6';

const formatCurrency = (amount: number) =>
  `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (dateStr: string | undefined) => {
  if (!dateStr) return 'Not recorded';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'Not recorded';
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

/** Bank-app-style partial reveal for a long reference. Copy still uses the full value. */
const maskReference = (value: string) => {
  if (!value || value.length <= 14) return value;
  return `${value.slice(0, 8)}••••${value.slice(-6)}`;
};

const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const TYPE_FILTERS: { key: 'all' | PaymentFilterGroup; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'reservation', label: 'Reservation' },
  { key: 'service', label: 'Service' },
  { key: 'refund', label: 'Refunds' },
];

const DATE_FILTERS: { key: PaymentDateFilter; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: '30', label: 'Last 30 days' },
  { key: '365', label: 'Last 12 months' },
];

function FilterChip({
  label,
  active,
  onPress,
  colors,
  isDark,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ThemeColors;
  isDark: boolean;
}) {
  const activeBg = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.08)';
  return (
    <MotionPressable
      haptic="selection"
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: active ? colors.text : colors.border,
          backgroundColor: active ? activeBg : 'transparent',
        },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? colors.text : colors.textSecondary }]}>{label}</Text>
    </MotionPressable>
  );
}

function CopyIdButton({ value, colors }: { value: string; colors: ThemeColors }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const handlePress = () => {
    if (!value) return;
    Clipboard.setString(value);
    Toast.show('Transaction ID copied', 'success');
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <MotionPressable
      haptic="selection"
      onPress={handlePress}
      style={[styles.copyBtn, { borderColor: colors.border }]}
      accessibilityLabel="Copy transaction ID"
    >
      <Animated.View key={copied ? 'copied' : 'idle'} entering={FadeIn.duration(120)} style={styles.copyBtnInner}>
        <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={12} color={copied ? GREEN : colors.textMuted} />
        <Text style={[styles.copyBtnText, { color: copied ? GREEN : colors.textMuted }]}>
          {copied ? 'Copied' : 'Copy'}
        </Text>
      </Animated.View>
    </MotionPressable>
  );
}

function TransactionCard({
  payment,
  booking,
  colors,
  isDark,
  onViewReceipt,
  receiptLoading,
}: {
  payment: PaymentRecord;
  booking?: BookingRecord;
  colors: ThemeColors;
  isDark: boolean;
  onViewReceipt: (paymentId: string) => void;
  receiptLoading: boolean;
}) {
  const vehicle =
    payment.vehicleInfo ||
    [booking?.vehicleYear, booking?.vehicleMake, booking?.vehicleModel].filter(Boolean).join(' ') ||
    'Vehicle not recorded';
  const dateStr = paymentEffectiveDate(payment);
  const serviceLabel =
    payment.services.map((service) => service.name).filter(Boolean).join(', ') ||
    booking?.serviceName ||
    booking?.serviceType ||
    'Service payment';
  const refunded = payment.transactionType === 'refund';
  const paid = payment.paymentStatus === 'succeeded' && !refunded;
  const statusColor = refunded
    ? isDark ? PURPLE_DARK : PURPLE
    : paid
    ? isDark ? GREEN_DARK : GREEN
    : payment.paymentStatus === 'pending'
    ? isDark ? AMBER_DARK : AMBER
    : ['failed', 'rejected'].includes(payment.paymentStatus)
    ? isDark ? RED_DARK : RED
    : colors.textMuted;
  const receiptLabel = payment.transactionType === 'reservation_fee' ? 'View Reservation Receipt' : 'View Receipt';
  const referenceId = payment.receiptNumber || payment.transactionId || '';
  const receiptLinkColor = isDark ? '#7AA9F0' : '#2563EB';
  const border = colors.border;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: border }]}>
      <Text style={[styles.serviceTitle, { color: colors.text }]} numberOfLines={2}>
        {serviceLabel}
      </Text>
      <Text style={[styles.vehicleText, { color: colors.textSecondary }]}>{vehicle}</Text>
      <Text style={[styles.dateText, { color: colors.textMuted }]}>{formatDate(dateStr)}</Text>

      <View style={styles.line}>
        <Text style={[styles.typeLabel, { color: colors.text }]}>{paymentTypeLabel(payment.transactionType)}</Text>
        <Text style={[styles.amountText, { color: colors.text }]}>
          {formatCurrency(paymentDisplayAmount(payment))}
        </Text>
      </View>
      <View style={styles.line}>
        <Text style={[styles.methodText, { color: colors.textSecondary }]} numberOfLines={1}>
          {payment.method ? `Paid via ${paymentMethodLabel(payment.method)}` : 'Payment method not recorded'}
        </Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{paymentStatusLabel(payment)}</Text>
        </View>
      </View>

      {payment.receiptAvailable ? (
        <MotionPressable
          haptic="light"
          onPress={() => onViewReceipt(payment.paymentId)}
          disabled={receiptLoading}
          style={styles.receiptCta}
        >
          {receiptLoading ? (
            <PremiumLoader size="small" tone="accent" accessibilityLabel="Preparing receipt" />
          ) : (
            <>
              <Text style={[styles.receiptCtaText, { color: receiptLinkColor }]}>{receiptLabel}</Text>
              <Ionicons name="arrow-forward" size={13} color={receiptLinkColor} />
            </>
          )}
        </MotionPressable>
      ) : (
        <View style={styles.unavailableWrap}>
          <Text style={[styles.unavailableTitle, { color: colors.textSecondary }]}>
            {receiptAvailabilityMessage(payment).title}
          </Text>
          <Text style={[styles.unavailableDetail, { color: colors.textMuted }]}>
            {receiptAvailabilityMessage(payment).detail}
          </Text>
        </View>
      )}

      {referenceId ? (
        <>
          <View style={[styles.txnDivider, { backgroundColor: border }]} />
          <View style={styles.txnRow}>
            <View style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
              <Text style={[styles.txnLabel, { color: colors.textMuted }]}>Transaction ID</Text>
              <Text style={[styles.txnValue, { color: colors.textSecondary }]} numberOfLines={1}>
                {maskReference(referenceId)}
              </Text>
            </View>
            <CopyIdButton value={referenceId} colors={colors} />
          </View>
        </>
      ) : null}
    </View>
  );
}

export default function PaymentsScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowW } = useWindowDimensions();
  const cardWidth = Math.min(windowW - 32, 560);

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | PaymentFilterGroup>('all');
  const [dateFilter, setDateFilter] = useState<PaymentDateFilter>('all');

  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null);
  const [receiptModalPaymentId, setReceiptModalPaymentId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [isExportingReceiptPdf, setIsExportingReceiptPdf] = useState(false);
  const [isPrintingReceipt, setIsPrintingReceipt] = useState(false);
  const receiptRequestRef = useRef(0);

  const {
    data: bookings = [],
    refreshBookings,
  } = useCustomerBookings(true);
  const {
    data: paymentHistory,
    isLoading: loading,
    isRefetching,
    isError,
    error: paymentError,
    refetch: refreshPayments,
  } = useQuery({
    queryKey: ['payments', 'customer-history'],
    queryFn: () => paymentService.getMyPayments(100),
    refetchInterval: 60_000,
  });
  const payments = useMemo(() => paymentHistory?.payments || [], [paymentHistory?.payments]);
  const error = isError
    ? getApiErrorMessage(paymentError, 'Failed to load payment history')
    : null;

  const sorted = useMemo(() => sortPaymentsNewestFirst(payments), [payments]);
  const filtered = useMemo(() => {
    const cutoff = paymentDateFilterCutoff(dateFilter);
    return sorted.filter((payment) => {
      const matchesType = typeFilter === 'all' || paymentFilterGroup(payment) === typeFilter;
      const matchesDate = !cutoff || new Date(paymentEffectiveDate(payment)).getTime() >= cutoff;
      return matchesType && matchesDate && matchesPaymentSearch(payment, query);
    });
  }, [sorted, typeFilter, dateFilter, query]);

  const summary = useMemo(
    () => summarizePaymentHistory(payments, paymentHistory?.totalSpent || 0),
    [payments, paymentHistory?.totalSpent],
  );
  const grossPayments = summary.reservationTotal + summary.servicePaymentTotal;
  const receiptCount = useMemo(() => payments.filter((payment) => payment.receiptAvailable).length, [payments]);
  const filtersActive = Boolean(query || typeFilter !== 'all' || dateFilter !== 'all');

  const clearFilters = useCallback(() => {
    setQuery('');
    setTypeFilter('all');
    setDateFilter('all');
  }, []);

  const bookingForPayment = useCallback((payment: PaymentRecord) =>
    bookings.find((booking) => String(booking.id || booking._id) === payment.orderId),
  [bookings]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshPayments(), refreshBookings()]);
  }, [refreshBookings, refreshPayments]);

  useFocusEffect(useCallback(() => {
    void refreshAll();
    return undefined;
  }, [refreshAll]));

  const openReceipt = useCallback(async (paymentId: string) => {
    const request = ++receiptRequestRef.current;
    setReceiptModalPaymentId(paymentId);
    setReceiptLoadingId(paymentId);
    setReceiptError(null);
    setReceipt(null);
    try {
      const data = await paymentService.getMyPaymentReceipt(paymentId);
      if (receiptRequestRef.current !== request) {
        return;
      }
      setReceipt(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not open receipt';
      if (receiptRequestRef.current === request) setReceiptError(msg);
    } finally {
      if (receiptRequestRef.current === request) setReceiptLoadingId(null);
    }
  }, []);

  const closeReceiptModal = useCallback(() => {
    receiptRequestRef.current += 1;
    setReceiptModalPaymentId(null);
    setReceiptLoadingId(null);
    setReceiptError(null);
    setReceipt(null);
  }, []);

  const downloadReceiptPdf = useCallback(async () => {
    if (!receipt || isExportingReceiptPdf) return;
    setIsExportingReceiptPdf(true);
    try {
      const html = buildMobileReceiptHtml(receipt);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: mobileReceiptFileName(receipt.receiptNumber),
          UTI: 'com.adobe.pdf',
        });
      } else {
        Toast.show('Saving files is not supported on this device.', 'error');
      }
    } catch {
      Toast.show('The PDF could not be prepared. Please try again.', 'error');
    } finally {
      setIsExportingReceiptPdf(false);
    }
  }, [receipt, isExportingReceiptPdf]);

  const printReceipt = useCallback(async () => {
    if (!receipt || isPrintingReceipt) return;
    setIsPrintingReceipt(true);
    try {
      await Print.printAsync({ html: buildMobileReceiptHtml(receipt) });
    } catch {
      Toast.show('The receipt could not be opened for printing.', 'error');
    } finally {
      setIsPrintingReceipt(false);
    }
  }, [receipt, isPrintingReceipt]);

  const renderEmptyNoPayments = () => (
    <Animated.View entering={FadeIn.delay(150)} style={styles.emptyContainer}>
      <View style={[styles.emptyIconWrap, { backgroundColor: colors.cardAlt }]}>
        <Ionicons name="card-outline" size={34} color={colors.textMuted} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No payments yet</Text>
      <Text style={[styles.emptySub, { color: colors.textMuted }]}>
        Completed payments and official receipts will appear here.
      </Text>
    </Animated.View>
  );

  const renderEmptyNoResults = () => (
    <Animated.View entering={FadeIn.delay(100)} style={styles.emptyContainer}>
      <View style={[styles.emptyIconWrap, { backgroundColor: colors.cardAlt }]}>
        <Ionicons name="search-outline" size={30} color={colors.textMuted} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No matching transactions</Text>
      <Text style={[styles.emptySub, { color: colors.textMuted }]}>
        Try a different search or clear your filters.
      </Text>
      <TouchableOpacity style={[styles.clearBtn, { borderColor: colors.border }]} onPress={clearFilters}>
        <Text style={[styles.clearBtnText, { color: colors.text }]}>Clear filters</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  const renderError = () => (
    <Animated.View entering={FadeIn.delay(150)} style={styles.emptyContainer}>
      <View style={[styles.emptyIconWrap, { backgroundColor: colors.cardAlt }]}>
        <Ionicons name="cloud-offline-outline" size={34} color={colors.textMuted} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>Unable to load</Text>
      <Text style={[styles.emptySub, { color: colors.textMuted }]}>{error}</Text>
      <TouchableOpacity
        style={[styles.retryBtn, { borderColor: colors.border }]}
        onPress={() => void refreshAll()}
      >
        <Ionicons name="refresh" size={14} color={colors.text} />
        <Text style={[styles.retryText, { color: colors.text }]}>Retry</Text>
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
            backgroundColor: colors.background,
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
        <PageSkeleton preset="list" rows={4} />
      ) : error && payments.length === 0 ? (
        renderError()
      ) : (
        <FlatList
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 40, alignItems: 'center' },
          ]}
          data={filtered}
          keyExtractor={(item) => item.paymentId}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isRefetching && !loading}
              onRefresh={() => void refreshAll()}
              tintColor={Palette.accent}
              colors={[Palette.accent]}
            />
          }
          ListHeaderComponent={
            <View style={{ width: cardWidth, marginBottom: 8 }}>
              <Text style={[styles.pageSub, { color: colors.textMuted }]}>
                Review your payments and official receipts.
              </Text>

              <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.summaryTotalLabel, { color: colors.textSecondary }]}>Total Paid</Text>
                <Text style={[styles.summaryTotalValue, { color: colors.text }]}>
                  {formatCurrency(summary.totalPaid)}
                </Text>
                <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
                <View style={styles.summaryRow}>
                  <View style={styles.summaryCol}>
                    <Text style={[styles.summaryColLabel, { color: colors.textMuted }]}>Payments</Text>
                    <Text style={[styles.summaryColValue, { color: colors.text }]}>
                      {formatCurrency(grossPayments)}
                    </Text>
                  </View>
                  <View style={[styles.summaryColDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.summaryCol}>
                    <Text style={[styles.summaryColLabel, { color: colors.textMuted }]}>Refunds</Text>
                    <Text
                      style={[
                        styles.summaryColValue,
                        { color: summary.refunds > 0 ? (isDark ? PURPLE_DARK : PURPLE) : colors.textMuted },
                      ]}
                    >
                      {formatCurrency(summary.refunds)}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="search" size={16} color={colors.textMuted} />
                <TextInput
                  style={[styles.searchInput, { color: colors.text }]}
                  placeholder="Search payments or receipts"
                  placeholderTextColor={colors.textMuted}
                  value={query}
                  onChangeText={setQuery}
                  returnKeyType="search"
                  autoCorrect={false}
                />
                {query ? (
                  <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {TYPE_FILTERS.map((filter) => (
                  <FilterChip
                    key={filter.key}
                    label={filter.label}
                    active={typeFilter === filter.key}
                    onPress={() => setTypeFilter(filter.key)}
                    colors={colors}
                    isDark={isDark}
                  />
                ))}
                <View style={[styles.chipSeparator, { backgroundColor: colors.border }]} />
                {DATE_FILTERS.map((filter) => (
                  <FilterChip
                    key={filter.key}
                    label={filter.label}
                    active={dateFilter === filter.key}
                    onPress={() => setDateFilter(filter.key)}
                    colors={colors}
                    isDark={isDark}
                  />
                ))}
              </ScrollView>

              {filtersActive ? (
                <View style={styles.filterSummaryRow}>
                  <Text style={[styles.filterSummaryText, { color: colors.textMuted }]}>
                    {filtered.length} matching {filtered.length === 1 ? 'transaction' : 'transactions'}
                  </Text>
                  <TouchableOpacity onPress={clearFilters}>
                    <Text style={[styles.filterClearText, { color: colors.text }]}>Clear filters</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Transactions</Text>
                <View style={[styles.countBadge, { backgroundColor: colors.cardAlt }]}>
                  <Text style={[styles.countBadgeText, { color: colors.textSecondary }]}>{payments.length}</Text>
                </View>
              </View>
              {payments.length > 0 ? (
                <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                  {receiptCount} {receiptCount === 1 ? 'receipt' : 'receipts'} available
                </Text>
              ) : null}
            </View>
          }
          renderItem={({ item, index }) => (
            <Animated.View
              entering={FadeInDown.delay(60 + index * 40).duration(200)}
              style={{ marginBottom: 12, width: cardWidth }}
            >
              <TransactionCard
                payment={item}
                booking={bookingForPayment(item)}
                colors={colors}
                isDark={isDark}
                onViewReceipt={openReceipt}
                receiptLoading={receiptLoadingId === item.paymentId}
              />
            </Animated.View>
          )}
          ListEmptyComponent={
            payments.length === 0 ? renderEmptyNoPayments : filtered.length === 0 ? renderEmptyNoResults : null
          }
        />
      )}

      <MotionModal
        visible={Boolean(receiptModalPaymentId)}
        onClose={closeReceiptModal}
        dismissOnBackdrop={false}
        fullScreen
        contentStyle={[styles.pdfSheet, { paddingTop: insets.top, backgroundColor: colors.background }]}
        accessibilityLabel="Official payment receipt"
      >
          <View style={[styles.receiptHeaderArea, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
            <View style={styles.receiptHeaderTopRow}>
              <Text style={[styles.receiptEyebrow, { color: Palette.accent }]}>BILLING &amp; RECEIPTS</Text>
              <TouchableOpacity
                onPress={closeReceiptModal}
                style={[styles.receiptCloseBtn, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
              >
                <Ionicons name="close" size={16} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.receiptHeaderTitle, { color: colors.text }]}>Receipt Details</Text>
            <Text style={[styles.receiptHeaderSub, { color: colors.textMuted }]}>
              {receipt?.receiptKind === 'reservation_payment'
                ? "Your AutoSPF+ reservation payment acknowledgement."
                : 'Your official AutoSPF+ service receipt.'}
            </Text>
            {receipt ? (
              <View style={styles.receiptActionsRow}>
                <TouchableOpacity
                  style={[styles.receiptActionBtn, styles.receiptActionPrimary, isExportingReceiptPdf && styles.receiptActionDisabled]}
                  onPress={downloadReceiptPdf}
                  disabled={isExportingReceiptPdf}
                >
                  {isExportingReceiptPdf ? (
                    <PremiumLoader size="small" tone="light" accessibilityLabel="Preparing PDF" />
                  ) : (
                    <Ionicons name="download-outline" size={15} color="#fff" />
                  )}
                  <Text style={styles.receiptActionPrimaryTxt}>{isExportingReceiptPdf ? 'Preparing…' : 'Download PDF'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.receiptActionBtn,
                    styles.receiptActionOutline,
                    { borderColor: colors.border, backgroundColor: colors.card },
                    isPrintingReceipt && styles.receiptActionDisabled,
                  ]}
                  onPress={printReceipt}
                  disabled={isPrintingReceipt}
                >
                  {isPrintingReceipt ? (
                    <PremiumLoader size="small" accessibilityLabel="Preparing print" />
                  ) : (
                    <Ionicons name="print-outline" size={15} color={colors.text} />
                  )}
                  <Text style={[styles.receiptActionOutlineTxt, { color: colors.text }]}>
                    {isPrintingReceipt ? 'Preparing…' : 'Print Receipt'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
          {receiptLoadingId ? (
            <View style={styles.receiptPreparing}>
              <PremiumLoader accessibilityLabel="Preparing payment receipt" />
              <Text style={[styles.pdfFallbackTitle, { color: colors.text }]}>Preparing receipt</Text>
              <Text style={[styles.pdfFallbackBody, { color: colors.textMuted }]}>Loading the official receipt from your verified payment record.</Text>
            </View>
          ) : receiptError ? (
            <View style={styles.receiptPreparing}>
              <Ionicons name="cloud-offline-outline" size={48} color={Palette.accent} />
              <Text style={[styles.pdfFallbackTitle, { color: colors.text }]}>Receipt unavailable</Text>
              <Text style={[styles.pdfFallbackBody, { color: colors.textMuted }]}>{receiptError}</Text>
              {receiptModalPaymentId ? (
                <TouchableOpacity onPress={() => void openReceipt(receiptModalPaymentId)} style={[styles.pdfFallbackCta, { backgroundColor: Palette.accent }]}>
                  <Ionicons name="refresh" size={20} color="#fff" />
                  <Text style={styles.pdfFallbackCtaTxt}>Try Again</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : receipt ? (
            <OfficialPaymentReceipt receipt={receipt} />
          ) : null}
      </MotionModal>
    </View>
  );
}

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

  pageSub: { fontSize: 13, lineHeight: 18, marginBottom: 16 },

  summaryCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
  },
  summaryTotalLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  summaryTotalValue: { fontSize: 32, fontWeight: '800', letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  summaryDivider: { height: 1, marginVertical: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'stretch' },
  summaryCol: { flex: 1 },
  summaryColDivider: { width: 1, marginHorizontal: 16 },
  summaryColLabel: { fontSize: 11, fontWeight: '600', marginBottom: 5 },
  summaryColValue: { fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    height: 42,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 13, padding: 0 },

  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2, paddingBottom: 4 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: { fontSize: 12, fontWeight: '600' },
  chipSeparator: { width: 1, height: 18, marginHorizontal: 2 },

  filterSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  filterSummaryText: { fontSize: 11.5 },
  filterClearText: { fontSize: 11.5, fontWeight: '700', textDecorationLine: 'underline' },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  countBadge: { minWidth: 22, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countBadgeText: { fontSize: 11, fontWeight: '700' },
  sectionSubtitle: { fontSize: 12, marginBottom: 12 },

  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: 18,
  },
  serviceTitle: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  vehicleText: { fontSize: 13, marginTop: 3 },
  dateText: { fontSize: 11.5, marginTop: 3, marginBottom: 14 },

  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    gap: 10,
  },
  typeLabel: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  amountText: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  methodText: { fontSize: 12, flexShrink: 1, marginRight: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 11.5, fontWeight: '700' },

  receiptCta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 14, alignSelf: 'flex-start' },
  receiptCtaText: { fontSize: 12.5, fontWeight: '700' },

  unavailableWrap: { marginTop: 14 },
  unavailableTitle: { fontSize: 11.5, fontWeight: '600' },
  unavailableDetail: { fontSize: 10.5, marginTop: 2, lineHeight: 14 },

  txnDivider: { height: StyleSheet.hairlineWidth, marginTop: 16, marginBottom: 12 },
  txnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  txnLabel: { fontSize: 10.5, marginBottom: 3 },
  txnValue: { fontSize: 11.5, fontFamily: monoFont },
  copyBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  copyBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  copyBtnText: { fontSize: 10.5, fontWeight: '700' },

  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    minHeight: 280,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 19, maxWidth: 300 },
  clearBtn: {
    marginTop: 20,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  clearBtnText: { fontSize: 13, fontWeight: '600' },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { fontSize: 13, fontWeight: '600' },

  pdfSheet: { flex: 1 },
  receiptPreparing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 48,
    gap: 12,
  },
  receiptHeaderArea: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  receiptHeaderTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  receiptEyebrow: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1.4 },
  receiptCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptHeaderTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginTop: 4 },
  receiptHeaderSub: { fontSize: 13, lineHeight: 18, marginTop: 4, marginBottom: 14 },
  receiptActionsRow: { flexDirection: 'row', gap: 8 },
  receiptActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  receiptActionPrimary: { backgroundColor: Palette.accent },
  receiptActionPrimaryTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  receiptActionOutline: { borderWidth: 1 },
  receiptActionOutlineTxt: { fontSize: 13, fontWeight: '700' },
  receiptActionDisabled: { opacity: 0.6 },
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
