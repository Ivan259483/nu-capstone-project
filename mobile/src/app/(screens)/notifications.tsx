/** Customer notification inbox backed by the authenticated notifications API. */
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useThemeContext';
import { BorderRadius, Palette, Spacing, Typography } from '@/constants/theme';
import PremiumButton from '@/components/ui/PremiumButton';
import { Toast } from '@/components/ui/PremiumToast';
import { useNotifications } from '@/context/NotificationsContext';
import type { NotificationRecord } from '@/services/api/types';
import { bookingService } from '@/services/api/bookingService';
import { getApiErrorMessage } from '@/services/api/client';
import {
  getNotificationEntityId,
  getNotificationRoute,
  hasNotificationAction,
} from '@/utils/notificationNavigation';

type InboxFilter = 'all' | 'important' | 'promotion';
type IoniconName = keyof typeof Ionicons.glyphMap;
type FilterCategory = Exclude<InboxFilter, 'all'>;

const categoryCopy: Record<
  FilterCategory,
  {
    title: string;
    fallbackPreview: string;
    icon: IoniconName;
    color: string;
    background: string;
    border: string;
  }
> = {
  important: {
    title: 'Important',
    fallbackPreview: 'Booking and service updates appear here',
    icon: 'alert-circle',
    color: '#FF8A3D',
    background: 'rgba(255, 124, 30, 0.14)',
    border: 'rgba(255, 124, 30, 0.28)',
  },
  promotion: {
    title: 'Promotions',
    fallbackPreview: 'Offers and rewards appear here',
    icon: 'pricetag',
    color: '#F5B820',
    background: 'rgba(245, 184, 32, 0.12)',
    border: 'rgba(245, 184, 32, 0.25)',
  },
};

const iconMeta: Record<
  string,
  { icon: IoniconName; color: string; background: string; border: string }
> = {
  booking_confirmed: {
    icon: 'calendar-clear-outline', color: '#FF8A3D',
    background: 'rgba(255, 124, 30, 0.12)', border: 'rgba(255, 124, 30, 0.28)',
  },
  booking_cancelled: {
    icon: 'calendar-outline', color: '#EF6464',
    background: 'rgba(239, 100, 100, 0.12)', border: 'rgba(239, 100, 100, 0.26)',
  },
  booking_rejected: {
    icon: 'close-circle-outline', color: '#EF6464',
    background: 'rgba(239, 100, 100, 0.12)', border: 'rgba(239, 100, 100, 0.26)',
  },
  booking_rescheduled: {
    icon: 'calendar-number-outline', color: '#FF8A3D',
    background: 'rgba(255, 124, 30, 0.12)', border: 'rgba(255, 124, 30, 0.28)',
  },
  appointment_reminder: {
    icon: 'alarm-outline', color: '#F5B820',
    background: 'rgba(245, 184, 32, 0.12)', border: 'rgba(245, 184, 32, 0.25)',
  },
  vehicle_received: {
    icon: 'car-sport-outline', color: '#4F91FF',
    background: 'rgba(79, 145, 255, 0.12)', border: 'rgba(79, 145, 255, 0.25)',
  },
  service_started: {
    icon: 'construct-outline', color: '#22D3EE',
    background: 'rgba(34, 211, 238, 0.10)', border: 'rgba(34, 211, 238, 0.22)',
  },
  service_progress: {
    icon: 'speedometer-outline', color: '#22D3EE',
    background: 'rgba(34, 211, 238, 0.10)', border: 'rgba(34, 211, 238, 0.22)',
  },
  service_completed: {
    icon: 'shield-checkmark-outline', color: '#2DDBA6',
    background: 'rgba(45, 219, 166, 0.10)', border: 'rgba(45, 219, 166, 0.22)',
  },
  payment_required: {
    icon: 'card-outline', color: '#FF8A3D',
    background: 'rgba(255, 124, 30, 0.12)', border: 'rgba(255, 124, 30, 0.28)',
  },
  payment_confirmed: {
    icon: 'receipt-outline', color: '#2DDBA6',
    background: 'rgba(45, 219, 166, 0.10)', border: 'rgba(45, 219, 166, 0.22)',
  },
  receipt_available: {
    icon: 'receipt-outline', color: '#FF8A3D',
    background: 'rgba(255, 124, 30, 0.12)', border: 'rgba(255, 124, 30, 0.28)',
  },
  damage_report_ready: {
    icon: 'warning-outline', color: '#F5B820',
    background: 'rgba(245, 184, 32, 0.12)', border: 'rgba(245, 184, 32, 0.25)',
  },
  promotion: {
    icon: 'pricetag-outline', color: '#F5B820',
    background: 'rgba(245, 184, 32, 0.12)', border: 'rgba(245, 184, 32, 0.25)',
  },
};

const defaultIconMeta = {
  icon: 'notifications-outline' as IoniconName,
  color: '#9874FF',
  background: 'rgba(152, 116, 255, 0.12)',
  border: 'rgba(152, 116, 255, 0.25)',
};

function categoryMatches(notification: NotificationRecord, filter: InboxFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'promotion') return notification.category === 'promotion';
  return notification.category !== 'promotion';
}

function truncatePreview(message: string): string {
  const normalized = message.replace(/\s+/g, ' ').trim();
  return normalized.length > 70 ? `${normalized.slice(0, 67)}…` : normalized;
}

function formatNotificationTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const elapsed = Math.max(0, now.getTime() - date.getTime());
  if (elapsed < 60_000) return 'Just now';
  if (elapsed < 60 * 60_000) return `${Math.floor(elapsed / 60_000)}m ago`;

  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const notificationDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round((today.getTime() - notificationDay.getTime()) / 86_400_000);
  if (dayDifference === 0) return `Today, ${time}`;
  if (dayDifference === 1) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}

function actionLabel(notification: NotificationRecord): string | null {
  const metadata = notification.metadata || notification.data || {};
  const explicit = notification.action?.label || metadata.ctaLabel;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  if (!hasNotificationAction(notification)) return null;
  const event = String(notification.event || notification.type || '').toLowerCase();
  if (event.includes('payment')) return event === 'payment_confirmed' ? 'View receipt' : 'View payment';
  if (event === 'damage_report_ready') return 'View damage report';
  if (event.startsWith('service_') || event === 'vehicle_received') return 'Track service';
  if (notification.category === 'promotion') return 'Book a service';
  return 'View booking';
}

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [openingId, setOpeningId] = useState<string | null>(null);
  const {
    notifications,
    unreadCount,
    importantUnread,
    promotionUnread,
    loading,
    refreshing,
    loadingMore,
    markingAllRead,
    error,
    hasNextPage,
    refreshNotifications,
    loadMore,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  const visibleNotifications = useMemo(
    () => notifications.filter((notification) => categoryMatches(notification, filter)),
    [filter, notifications]
  );
  const categoryPreviews = useMemo(() => {
    const important = notifications.find((notification) => notification.category !== 'promotion');
    const promotion = notifications.find((notification) => notification.category === 'promotion');
    return {
      important: important?.message
        ? truncatePreview(important.message)
        : categoryCopy.important.fallbackPreview,
      promotion: promotion?.message
        ? truncatePreview(promotion.message)
        : categoryCopy.promotion.fallbackPreview,
    };
  }, [notifications]);

  const screenTitle = filter === 'all' ? 'Notifications' : categoryCopy[filter].title;
  const sectionTitle = filter === 'all'
    ? 'Service Updates'
    : filter === 'important'
      ? 'Important Updates'
      : 'Promotion Updates';
  const readAllLabel = unreadCount > 0 ? `Read All (${unreadCount})` : 'Read All';

  const handleBack = () => {
    if (filter !== 'all') {
      setFilter('all');
      void Haptics.selectionAsync();
      return;
    }
    router.back();
  };

  const handleReadAll = async () => {
    if (markingAllRead || unreadCount === 0) return;
    try {
      await markAllAsRead();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show('All notifications marked as read.', 'success');
    } catch (readError) {
      Toast.show(getApiErrorMessage(readError, 'Unable to mark notifications as read.'), 'error');
    }
  };

  const openNotification = async (notification: NotificationRecord) => {
    if (openingId) return;
    setOpeningId(notification.id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (!notification.isRead) {
      try {
        await markAsRead(notification.id);
      } catch (readError) {
        Toast.show(getApiErrorMessage(readError, 'Unable to update this notification.'), 'error');
      }
    }

    try {
      if (!hasNotificationAction(notification)) return;
      const route = getNotificationRoute(notification);
      const entityId = getNotificationEntityId(notification);
      const actionType = String(notification.actionType || '').toLowerCase();
      const requiresBookingRecord = [
        'booking', 'tracking', 'damage_report', 'payment', 'receipt',
      ].includes(actionType);
      if (entityId && requiresBookingRecord) {
        try {
          await bookingService.getBookingById(entityId);
        } catch {
          Toast.show('This booking or service record is no longer available.', 'warning');
          return;
        }
      }
      router.push(route as any);
    } finally {
      setOpeningId(null);
    }
  };

  const listHeader = (
    <View style={styles.listHeader}>
      {filter === 'all' ? (
        <View style={styles.categoryStack}>
          <CategoryRow
            category="important"
            unreadCount={importantUnread}
            preview={categoryPreviews.important}
            onPress={() => {
              setFilter('important');
              void Haptics.selectionAsync();
            }}
          />
          <CategoryRow
            category="promotion"
            unreadCount={promotionUnread}
            preview={categoryPreviews.promotion}
            onPress={() => {
              setFilter('promotion');
              void Haptics.selectionAsync();
            }}
          />
        </View>
      ) : null}

      {error && notifications.length > 0 ? (
        <Pressable onPress={() => void refreshNotifications()} style={styles.inlineError}>
          <Ionicons name="cloud-offline-outline" size={16} color="#F5B820" />
          <Text style={styles.inlineErrorText} numberOfLines={2}>{error} Tap to retry.</Text>
        </Pressable>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{sectionTitle}</Text>
        <Pressable
          onPress={() => void handleReadAll()}
          hitSlop={10}
          disabled={unreadCount === 0 || markingAllRead}
          style={({ pressed }) => [
            styles.readAllButton,
            pressed && unreadCount > 0 ? styles.pressed : null,
            unreadCount === 0 || markingAllRead ? styles.disabledAction : null,
          ]}
        >
          {markingAllRead ? (
            <ActivityIndicator size="small" color={Palette.accent} />
          ) : (
            <Text style={styles.readAllText}>{readAllLabel}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );

  if (loading && notifications.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <Header
          title={screenTitle}
          topInset={insets.top}
          onBack={handleBack}
          onSettings={() => router.push('/(screens)/notification-preferences')}
        />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={Palette.accent} />
          <Text style={[styles.stateMessage, { color: colors.textSecondary }]}>Loading notifications…</Text>
        </View>
      </View>
    );
  }

  if (error && notifications.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <Header
          title={screenTitle}
          topInset={insets.top}
          onBack={handleBack}
          onSettings={() => router.push('/(screens)/notification-preferences')}
        />
        <ErrorState message={error} onRetry={() => void refreshNotifications()} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Header
        title={screenTitle}
        topInset={insets.top}
        onBack={handleBack}
        onSettings={() => router.push('/(screens)/notification-preferences')}
      />
      <FlatList
        data={visibleNotifications}
        keyExtractor={(notification) => notification.id}
        style={styles.scroll}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          visibleNotifications.length === 0 ? styles.emptyContent : null,
          { paddingBottom: insets.bottom + Spacing.xl },
        ]}
        ListHeaderComponent={listHeader}
        renderItem={({ item, index }) => (
          <NotificationRow
            notification={item}
            isFirst={index === 0}
            isLast={index === visibleNotifications.length - 1}
            busy={openingId === item.id}
            onPress={() => void openNotification(item)}
          />
        )}
        ListEmptyComponent={<EmptyState />}
        ListFooterComponent={loadingMore ? (
          <ActivityIndicator style={styles.footerLoader} color={Palette.accent} />
        ) : null}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refreshNotifications()}
            tintColor={Palette.accent}
            colors={[Palette.accent]}
          />
        )}
        onEndReached={() => {
          if (hasNextPage) void loadMore();
        }}
        onEndReachedThreshold={0.35}
      />
    </View>
  );
}

function Header({
  title,
  topInset,
  onBack,
  onSettings,
}: {
  title: string;
  topInset: number;
  onBack: () => void;
  onSettings: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: topInset + 8,
          backgroundColor: colors.card,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <HeaderIconButton icon="chevron-back" onPress={onBack} />
      <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
      <HeaderIconButton icon="settings-outline" onPress={onSettings} />
    </View>
  );
}

function HeaderIconButton({ icon, onPress }: { icon: IoniconName; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [
        styles.headerButton,
        { backgroundColor: colors.cardAlt, borderColor: colors.border },
        pressed ? styles.pressed : null,
      ]}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

function CategoryRow({
  category,
  unreadCount,
  preview,
  onPress,
}: {
  category: FilterCategory;
  unreadCount: number;
  preview: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const meta = categoryCopy[category];
  const badgeStyle: StyleProp<ViewStyle> = unreadCount > 0 ? null : styles.zeroBadge;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.categoryRow,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={[styles.categoryIcon, { backgroundColor: meta.background, borderColor: meta.border }]}>
        <Ionicons name={meta.icon} size={22} color={meta.color} />
      </View>
      <View style={styles.categoryCopy}>
        <Text style={[styles.categoryTitle, { color: colors.text }]} numberOfLines={1}>{meta.title}</Text>
        <Text style={[styles.categoryPreview, { color: colors.textMuted }]} numberOfLines={1}>{preview}</Text>
      </View>
      <View style={[styles.countBadge, badgeStyle]}>
        <Text style={styles.countText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function NotificationRow({
  notification,
  isFirst,
  isLast,
  busy,
  onPress,
}: {
  notification: NotificationRecord;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const event = String(notification.event || notification.type || '').toLowerCase();
  const meta = iconMeta[event]
    || (notification.category === 'promotion' ? iconMeta.promotion : defaultIconMeta);
  const label = actionLabel(notification);
  return (
    <View style={[styles.list, isFirst ? styles.listFirst : null, isLast ? styles.listLast : null]}>
      <Pressable
        onPress={onPress}
        disabled={busy}
        style={({ pressed }) => [
          styles.notificationRow,
          {
            borderBottomColor: isLast ? 'transparent' : colors.borderLight,
            opacity: notification.isRead ? 0.82 : 1,
          },
          pressed ? styles.pressed : null,
        ]}
      >
        <View style={[styles.notificationIcon, { backgroundColor: meta.background, borderColor: meta.border }]}>
          <Ionicons name={meta.icon} size={20} color={meta.color} />
        </View>
        <View style={styles.notificationBody}>
          <View style={styles.notificationTitleRow}>
            <Text style={[styles.notificationTitle, { color: colors.text }]} numberOfLines={2}>
              {notification.title}
            </Text>
            {busy ? (
              <ActivityIndicator size="small" color={Palette.accent} />
            ) : !notification.isRead ? (
              <View style={styles.unreadDot} />
            ) : null}
          </View>
          <Text style={[styles.notificationMessage, { color: colors.textSecondary }]}>
            {notification.message}
          </Text>
          {label ? <Text style={styles.actionText}>{label}</Text> : null}
          <Text style={[styles.notificationTime, { color: colors.textMuted }]}>
            {formatNotificationTime(notification.createdAt)}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

function EmptyState() {
  const { colors } = useTheme();
  return (
    <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <LinearGradient
        colors={['rgba(255, 124, 30, 0.20)', 'rgba(245, 184, 32, 0.08)']}
        style={styles.emptyIcon}
      >
        <Ionicons name="checkmark-circle-outline" size={30} color={Palette.accent} />
      </LinearGradient>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>You&apos;re all caught up</Text>
      <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
        Booking updates, service progress, and important alerts will appear here.
      </Text>
    </View>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.centerState}>
      <View style={[styles.errorIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="cloud-offline-outline" size={30} color="#F5B820" />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>Notifications unavailable</Text>
      <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>{message}</Text>
      <PremiumButton title="Try Again" icon="refresh-outline" onPress={onRetry} style={styles.retryButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  emptyContent: { flexGrow: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { flex: 1, textAlign: 'center', ...Typography.heading, letterSpacing: 0 },
  headerButton: {
    width: 40, height: 40, borderRadius: BorderRadius.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  listHeader: { gap: Spacing.md, marginBottom: Spacing.md },
  categoryStack: { gap: Spacing.sm },
  categoryRow: {
    minHeight: 84, borderRadius: BorderRadius.xl, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row',
    alignItems: 'center', gap: 12,
  },
  categoryIcon: {
    width: 48, height: 48, borderRadius: 24, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  categoryCopy: { flex: 1, minWidth: 0, gap: 4 },
  categoryTitle: { ...Typography.large, letterSpacing: 0 },
  categoryPreview: { ...Typography.body, letterSpacing: 0 },
  countBadge: {
    minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 8,
    backgroundColor: Palette.accent, alignItems: 'center', justifyContent: 'center',
  },
  zeroBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)', borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  countText: {
    color: '#FFFFFF', fontSize: 12, fontWeight: '800',
    fontVariant: ['tabular-nums'], letterSpacing: 0,
  },
  inlineError: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: BorderRadius.md,
    paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'rgba(245, 184, 32, 0.08)',
  },
  inlineErrorText: { flex: 1, color: '#D9BA64', fontSize: 12, lineHeight: 17, fontWeight: '600' },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 34, gap: Spacing.sm,
  },
  sectionTitle: { ...Typography.bodyMedium, letterSpacing: 0 },
  readAllButton: { minWidth: 74, minHeight: 28, alignItems: 'flex-end', justifyContent: 'center' },
  readAllText: { color: Palette.accent, fontSize: 14, fontWeight: '800', letterSpacing: 0 },
  disabledAction: { opacity: 0.48 },
  list: {
    overflow: 'hidden', borderLeftWidth: 1, borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)', backgroundColor: 'rgba(13, 13, 18, 0.92)',
  },
  listFirst: { borderTopWidth: 1, borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl },
  listLast: {
    borderBottomWidth: 1, borderBottomLeftRadius: BorderRadius.xxl,
    borderBottomRightRadius: BorderRadius.xxl,
  },
  notificationRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 14, paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  notificationIcon: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  notificationBody: { flex: 1, minWidth: 0, gap: 6 },
  notificationTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  notificationTitle: {
    flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '800', letterSpacing: 0,
  },
  notificationMessage: { fontSize: 14, lineHeight: 20, fontWeight: '500', letterSpacing: 0 },
  actionText: {
    color: Palette.accent, fontSize: 14, lineHeight: 20,
    fontWeight: '800', textDecorationLine: 'underline', letterSpacing: 0,
  },
  notificationTime: {
    fontSize: 12, lineHeight: 16, fontWeight: '600',
    fontVariant: ['tabular-nums'], letterSpacing: 0,
  },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Palette.accent, marginTop: 6,
  },
  emptyCard: {
    alignItems: 'center', borderRadius: BorderRadius.xxl, borderWidth: 1,
    padding: Spacing.lg, gap: Spacing.sm,
  },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { ...Typography.heading, textAlign: 'center', letterSpacing: 0 },
  emptySubtext: { ...Typography.body, textAlign: 'center', letterSpacing: 0 },
  centerState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.lg, gap: Spacing.md,
  },
  stateMessage: { ...Typography.body, textAlign: 'center' },
  errorIcon: {
    width: 64, height: 64, borderRadius: 32, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  retryButton: { marginTop: Spacing.sm },
  footerLoader: { paddingVertical: Spacing.lg },
  pressed: { opacity: 0.72 },
});
