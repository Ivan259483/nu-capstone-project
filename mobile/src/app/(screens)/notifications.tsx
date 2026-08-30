/** Premium customer notification inbox backed by the authenticated notifications API. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Haptics } from '@/utils/haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageSkeleton, PremiumLoader } from '@/components/ui/loading';
import PremiumButton from '@/components/ui/PremiumButton';
import { MotionSheet } from '@/components/ui/MotionOverlay';
import { Toast } from '@/components/ui/PremiumToast';
import { BorderRadius, Colors, Palette, Spacing, Typography } from '@/constants/theme';
import { useNotifications } from '@/context/NotificationsContext';
import { getApiErrorMessage } from '@/services/api/client';
import type { NotificationRecord } from '@/services/api/types';
import {
  getNotificationRoute,
  hasNotificationAction,
} from '@/utils/notificationNavigation';

type InboxFilter = 'all' | 'important' | 'unread' | 'bookings' | 'payments' | 'promotions';
type SummaryCategory = 'important' | 'promotions';
type IoniconName = keyof typeof Ionicons.glyphMap;

const FILTERS: { id: InboxFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'payments', label: 'Payments' },
];

const SUMMARY_COPY: Record<SummaryCategory, {
  title: string;
  subtitle: string;
  icon: IoniconName;
}> = {
  important: {
    title: 'Important',
    subtitle: 'Booking & payment alerts',
    icon: 'alert-circle-outline',
  },
  promotions: {
    title: 'Promotions',
    subtitle: 'Offers & rewards',
    icon: 'pricetag-outline',
  },
};

type IconMeta = {
  icon: IoniconName;
  color: string;
  background: string;
  border: string;
};

const ORANGE_ICON: IconMeta = {
  icon: 'notifications-outline',
  color: Palette.accent,
  background: 'rgba(255, 107, 53, 0.12)',
  border: 'rgba(255, 107, 53, 0.28)',
};

const SUCCESS_ICON: IconMeta = {
  icon: 'checkmark-circle-outline',
  color: Palette.success,
  background: 'rgba(16, 185, 129, 0.12)',
  border: 'rgba(16, 185, 129, 0.26)',
};

const URGENT_ICON: IconMeta = {
  icon: 'alert-circle-outline',
  color: Palette.danger,
  background: 'rgba(255, 76, 76, 0.12)',
  border: 'rgba(255, 76, 76, 0.26)',
};

const ICON_META: Record<string, IconMeta> = {
  booking_confirmed: { ...ORANGE_ICON, icon: 'calendar-clear-outline' },
  booking_cancelled: { ...URGENT_ICON, icon: 'calendar-outline' },
  booking_rejected: { ...URGENT_ICON, icon: 'close-circle-outline' },
  booking_rescheduled: { ...ORANGE_ICON, icon: 'calendar-number-outline' },
  appointment_reminder: { ...ORANGE_ICON, icon: 'alarm-outline' },
  vehicle_received: { ...ORANGE_ICON, icon: 'car-sport-outline' },
  service_started: { ...ORANGE_ICON, icon: 'construct-outline' },
  service_progress: { ...ORANGE_ICON, icon: 'speedometer-outline' },
  service_completed: { ...SUCCESS_ICON, icon: 'shield-checkmark-outline' },
  payment_required: { ...ORANGE_ICON, icon: 'wallet-outline' },
  payment_confirmed: { ...SUCCESS_ICON, icon: 'receipt-outline' },
  receipt_available: { ...ORANGE_ICON, icon: 'receipt-outline' },
  damage_report_ready: { ...ORANGE_ICON, icon: 'warning-outline' },
  promotion: { ...ORANGE_ICON, icon: 'pricetag-outline' },
};

function notificationEvent(notification: NotificationRecord): string {
  return String(notification.event || notification.type || '').toLowerCase();
}

function isPaymentNotification(notification: NotificationRecord): boolean {
  const event = notificationEvent(notification);
  const actionType = String(notification.actionType || '').toLowerCase();
  return actionType === 'payment'
    || actionType === 'receipt'
    || event.includes('payment')
    || event.includes('receipt');
}

function isBookingNotification(notification: NotificationRecord): boolean {
  const event = notificationEvent(notification);
  const actionType = String(notification.actionType || '').toLowerCase();
  return actionType === 'booking'
    || event.startsWith('booking_')
    || event === 'appointment_reminder';
}

function matchesFilter(notification: NotificationRecord, filter: InboxFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'important') {
    return notification.category !== 'promotion' && notificationEvent(notification) !== 'promotion';
  }
  if (filter === 'unread') return !notification.isRead;
  if (filter === 'bookings') return isBookingNotification(notification);
  if (filter === 'payments') return isPaymentNotification(notification);
  return notification.category === 'promotion' || notificationEvent(notification) === 'promotion';
}

function formatNotificationTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const elapsed = Math.max(0, now.getTime() - date.getTime());
  if (elapsed < 60_000) return 'Just now';
  if (elapsed < 60 * 60_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 24 * 60 * 60_000) return `${Math.floor(elapsed / (60 * 60_000))}h ago`;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const notificationDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round((today.getTime() - notificationDay.getTime()) / 86_400_000);
  if (dayDifference === 1) return 'Yesterday';

  const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

function formatCategoryNotificationTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const notificationDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round((today.getTime() - notificationDay.getTime()) / 86_400_000);
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  if (dayDifference === 0) return `Today · ${time}`;
  if (dayDifference === 1) return `Yesterday · ${time}`;
  const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${day} · ${time}`;
}

function formatFullTimestamp(value?: string): string {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  const day = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

function actionLabel(notification: NotificationRecord): string | null {
  const metadata = notification.metadata || notification.data || {};
  const explicit = notification.action?.label || metadata.ctaLabel;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  if (!hasNotificationAction(notification)) return null;
  const event = notificationEvent(notification);
  if (isPaymentNotification(notification)) {
    return event === 'payment_confirmed' || event.includes('receipt')
      ? 'View receipt'
      : 'View payment';
  }
  if (event === 'damage_report_ready') return 'View damage report';
  if (event.startsWith('service_') || event === 'vehicle_received') return 'Track service';
  if (notification.category === 'promotion') return 'View offer';
  return 'View booking';
}

function iconMetaFor(notification: NotificationRecord): IconMeta {
  return ICON_META[notificationEvent(notification)]
    || (notification.category === 'promotion' ? ICON_META.promotion : ORANGE_ICON);
}

function detailFacts(notification: NotificationRecord): { label: string; value: string }[] {
  const metadata = notification.metadata || notification.data || {};
  const candidates: { label: string; value: unknown; date?: boolean }[] = [
    { label: 'Service', value: metadata.serviceName || metadata.packageName },
    { label: 'Vehicle', value: metadata.vehicleName || metadata.vehicleDisplay || metadata.vehicle },
    { label: 'Schedule', value: metadata.appointmentDate || metadata.scheduledAt, date: true },
    { label: 'Reference', value: metadata.bookingReference || metadata.orderNumber || metadata.referenceNumber },
  ];

  return candidates.flatMap(({ label, value, date }) => {
    if (typeof value !== 'string' && typeof value !== 'number') return [];
    const raw = String(value).trim();
    if (!raw) return [];
    if (!date) return [{ label, value: raw }];
    const parsed = new Date(raw);
    return [{
      label,
      value: Number.isNaN(parsed.getTime()) ? raw : formatFullTimestamp(parsed.toISOString()),
    }];
  });
}

export default function NotificationsScreen() {
  const colors = Colors.dark;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [categoryView, setCategoryView] = useState<SummaryCategory | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [detailNotification, setDetailNotification] = useState<NotificationRecord | null>(null);
  const navigationInFlightRef = useRef(false);
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
    setReadState,
    clearNotification,
    markAllAsRead,
  } = useNotifications();

  const activeFilter: InboxFilter = categoryView || filter;
  const visibleNotifications = useMemo(
    () => notifications.filter((notification) => matchesFilter(notification, activeFilter)),
    [activeFilter, notifications]
  );

  useFocusEffect(useCallback(() => {
    navigationInFlightRef.current = false;
    setOpeningId(null);
    return undefined;
  }, []));

  useEffect(() => {
    if (!categoryView) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setCategoryView(null);
      return true;
    });
    return () => subscription.remove();
  }, [categoryView]);

  const handleFilterChange = (nextFilter: InboxFilter) => {
    setFilter(nextFilter);
    Haptics.selection();
  };

  const openCategoryView = (category: SummaryCategory) => {
    setCategoryView(category);
    Haptics.selection();
  };

  const handleHeaderBack = () => {
    if (categoryView) {
      setCategoryView(null);
      return;
    }
    router.back();
  };

  const handleReadAll = async () => {
    if (markingAllRead || unreadCount === 0) return;
    try {
      await markAllAsRead();
      Haptics.notify('success');
      Toast.show('All notifications marked as read.', 'success');
    } catch (readError) {
      Toast.show(getApiErrorMessage(readError, 'Unable to mark notifications as read.'), 'error');
    }
  };

  const openDetail = (notification: NotificationRecord) => {
    Haptics.impact('light');
    setDetailNotification({ ...notification, isRead: true });
    if (!notification.isRead) {
      void markAsRead(notification.id).catch((readError) => {
        Toast.show(getApiErrorMessage(readError, 'Unable to update this notification.'), 'error');
      });
    }
  };

  const navigateToAction = (notification: NotificationRecord) => {
    if (!hasNotificationAction(notification) || navigationInFlightRef.current) return;
    navigationInFlightRef.current = true;
    setOpeningId(notification.id);
    setDetailNotification(null);
    router.push(getNotificationRoute(notification) as any);
  };

  const handleNotificationAction = (notification: NotificationRecord) => {
    if (!notification.isRead) {
      void markAsRead(notification.id).catch((readError) => {
        Toast.show(getApiErrorMessage(readError, 'Unable to update this notification.'), 'error');
      });
    }
    navigateToAction(notification);
  };

  const toggleReadState = async (notification: NotificationRecord) => {
    try {
      await setReadState(notification.id, !notification.isRead);
      Haptics.selection();
    } catch (readError) {
      Toast.show(getApiErrorMessage(readError, 'Unable to update this notification.'), 'error');
    }
  };

  const deleteNotification = async (notification: NotificationRecord) => {
    try {
      await clearNotification(notification.id);
      if (detailNotification?.id === notification.id) setDetailNotification(null);
      Haptics.notify('success');
      Toast.show('Notification removed.', 'success');
    } catch (clearError) {
      Toast.show(getApiErrorMessage(clearError, 'Unable to remove this notification.'), 'error');
    }
  };

  const listHeader = categoryView ? null : (
    <View style={styles.listHeader}>
      <View style={styles.categoryStack}>
        <SummaryRow
          category="important"
          unreadCount={importantUnread}
          onPress={() => openCategoryView('important')}
        />
        <SummaryRow
          category="promotions"
          unreadCount={promotionUnread}
          onPress={() => openCategoryView('promotions')}
        />
      </View>

      <FilterChips selected={filter} onSelect={handleFilterChange} />

      {error && notifications.length > 0 ? (
        <Pressable onPress={() => void refreshNotifications()} style={styles.inlineError}>
          <Ionicons name="cloud-offline-outline" size={16} color={Palette.accent} />
          <Text style={styles.inlineErrorText} numberOfLines={2}>{error} Tap to retry.</Text>
        </Pressable>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>SERVICE UPDATES</Text>
        {unreadCount > 0 ? (
          <Pressable
            onPress={() => void handleReadAll()}
            hitSlop={10}
            disabled={markingAllRead}
            style={({ pressed }) => [
              styles.readAllButton,
              pressed ? styles.pressed : null,
              markingAllRead ? styles.disabledAction : null,
            ]}
          >
            {markingAllRead ? (
              <PremiumLoader size="small" accessibilityLabel="Marking notifications as read" />
            ) : (
              <Text style={styles.readAllText}>Mark all as read ({unreadCount})</Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  if (loading && notifications.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <Header
          topInset={insets.top}
          onBack={() => router.back()}
          onSettings={() => router.push('/(screens)/notification-preferences')}
        />
        <PageSkeleton preset="list" rows={5} />
      </View>
    );
  }

  if (error && notifications.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <Header
          topInset={insets.top}
          onBack={() => router.back()}
          onSettings={() => router.push('/(screens)/notification-preferences')}
        />
        <ErrorState message={error} onRetry={() => void refreshNotifications()} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={[styles.screen, { backgroundColor: colors.background }]}>
      <Header
        topInset={insets.top}
        title={categoryView === 'important' ? 'Important' : categoryView === 'promotions' ? 'Promotions' : 'Notifications'}
        onBack={handleHeaderBack}
        onSettings={categoryView ? undefined : () => router.push('/(screens)/notification-preferences')}
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
        renderItem={({ item }) => (
          <NotificationRow
            notification={item}
            busy={openingId === item.id}
            onPress={() => void openDetail(item)}
            onAction={() => void handleNotificationAction(item)}
            calendarTimestamp={Boolean(categoryView)}
            showInlineActions={categoryView !== 'important'}
            onToggleRead={() => void toggleReadState(item)}
            onDelete={() => void deleteNotification(item)}
          />
        )}
        ListEmptyComponent={<EmptyState filter={activeFilter} />}
        ListFooterComponent={loadingMore ? (
          <PremiumLoader
            style={styles.footerLoader}
            size="small"
            accessibilityLabel="Loading more notifications"
          />
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
      <NotificationDetailModal
        notification={detailNotification}
        bottomInset={insets.bottom}
        busy={Boolean(detailNotification && openingId === detailNotification.id)}
        onClose={() => setDetailNotification(null)}
        onAction={(notification) => void navigateToAction(notification)}
      />
    </GestureHandlerRootView>
  );
}

function Header({
  topInset,
  title,
  onBack,
  onSettings,
}: {
  topInset: number;
  title?: string;
  onBack: () => void;
  onSettings?: () => void;
}) {
  const colors = Colors.dark;
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: topInset + 8,
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <HeaderIconButton icon="chevron-back" label="Go back" onPress={onBack} />
      <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{title || 'Notifications'}</Text>
      {onSettings ? (
        <HeaderIconButton icon="settings-outline" label="Notification settings" onPress={onSettings} subtle />
      ) : (
        <View style={styles.headerSideSpacer} />
      )}
    </View>
  );
}

function HeaderIconButton({
  icon,
  label,
  onPress,
  subtle = false,
}: {
  icon: IoniconName;
  label: string;
  onPress: () => void;
  subtle?: boolean;
}) {
  const colors = Colors.dark;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.headerButton,
        {
          backgroundColor: 'transparent',
          borderColor: 'transparent',
        },
        pressed ? styles.pressed : null,
      ]}
    >
      <Ionicons name={icon} size={subtle ? 21 : 23} color={subtle ? colors.textSecondary : colors.text} />
    </Pressable>
  );
}

function FilterChips({
  selected,
  onSelect,
}: {
  selected: InboxFilter;
  onSelect: (filter: InboxFilter) => void;
}) {
  const colors = Colors.dark;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterContent}
      style={styles.filterScroll}
    >
      {FILTERS.map((item) => {
        const active = selected === item.id;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(item.id)}
            style={({ pressed }) => [
              styles.filterChip,
              {
                backgroundColor: active ? 'rgba(255, 107, 53, 0.11)' : colors.cardAlt,
                borderColor: active ? Palette.accent : colors.border,
              },
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={[styles.filterLabel, { color: active ? Palette.accent : colors.textSecondary }]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function SummaryRow({
  category,
  unreadCount,
  onPress,
}: {
  category: SummaryCategory;
  unreadCount: number;
  onPress: () => void;
}) {
  const colors = Colors.dark;
  const copy = SUMMARY_COPY[category];
  const emptyLabel = category === 'promotions' ? 'No new offers' : '0 unread';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${copy.title}, ${unreadCount > 0 ? `${unreadCount} unread` : emptyLabel}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.summaryRow,
        {
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={[styles.summaryIcon, { borderColor: 'rgba(255, 107, 53, 0.24)' }]}>
        <Ionicons name={copy.icon} size={20} color={Palette.accent} />
      </View>
      <View style={styles.summaryCopy}>
        <Text style={[styles.summaryTitle, { color: colors.text }]}>{copy.title}</Text>
        <Text style={[styles.summarySubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
          {copy.subtitle}
        </Text>
      </View>
      <View style={styles.summaryTrailing}>
        {unreadCount > 0 ? (
          <View style={styles.summaryBadge}>
            <Text style={styles.summaryBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
          </View>
        ) : (
          <Text style={[styles.summaryEmptyLabel, { color: colors.textMuted }]} numberOfLines={1}>
            {emptyLabel}
          </Text>
        )}
        <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

function NotificationRow({
  notification,
  busy,
  onPress,
  onAction,
  calendarTimestamp,
  showInlineActions,
  onToggleRead,
  onDelete,
}: {
  notification: NotificationRecord;
  busy: boolean;
  onPress: () => void;
  onAction: () => void;
  calendarTimestamp: boolean;
  showInlineActions: boolean;
  onToggleRead: () => void;
  onDelete: () => void;
}) {
  const colors = Colors.dark;
  const swipeableRef = useRef<Swipeable>(null);
  const meta = iconMetaFor(notification);
  const label = actionLabel(notification);
  const hasLongMessage = notification.message.trim().length > 120;

  const confirmDelete = () => {
    Haptics.impact('medium');
    Alert.alert(
      'Remove notification?',
      'This removes it from your inbox without deleting the service record.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => swipeableRef.current?.close() },
        { text: 'Remove', style: 'destructive', onPress: onDelete },
      ]
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      friction={1.6}
      rightThreshold={36}
      overshootRight={false}
      renderRightActions={() => (
        <View style={styles.swipeActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={notification.isRead ? 'Mark as unread' : 'Mark as read'}
            onPress={() => {
              swipeableRef.current?.close();
              onToggleRead();
            }}
            style={styles.swipeReadAction}
          >
            <Ionicons
              name={notification.isRead ? 'mail-unread-outline' : 'checkmark-outline'}
              size={21}
              color="#FFFFFF"
            />
            <Text style={styles.swipeActionText}>{notification.isRead ? 'Unread' : 'Read'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove notification"
            onPress={confirmDelete}
            style={styles.swipeDeleteAction}
          >
            <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
            <Text style={styles.swipeActionText}>Remove</Text>
          </Pressable>
        </View>
      )}
      containerStyle={styles.swipeContainer}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${notification.isRead ? 'Read' : 'Unread'} notification: ${notification.title}`}
        onPress={onPress}
        disabled={busy}
        style={({ pressed }) => [
          styles.notificationRow,
          {
            backgroundColor: notification.isRead ? colors.background : 'rgba(255, 107, 53, 0.045)',
          },
          !notification.isRead ? styles.notificationUnread : null,
          pressed ? styles.pressed : null,
        ]}
      >
        <View style={[styles.notificationIcon, { backgroundColor: meta.background, borderColor: meta.border }]}>
          <Ionicons name={meta.icon} size={19} color={meta.color} />
        </View>
        <View style={styles.notificationBody}>
          <View style={styles.notificationTitleRow}>
            <Text
              style={[
                styles.notificationTitle,
                { color: colors.text },
                notification.isRead ? styles.notificationTitleRead : null,
              ]}
              numberOfLines={2}
            >
              {notification.title}
            </Text>
            {busy ? (
              <PremiumLoader size="small" accessibilityLabel="Opening notification" />
            ) : !notification.isRead ? (
              <View style={styles.unreadDot} />
            ) : null}
          </View>
          <Text
            style={[
              styles.notificationMessage,
              { color: colors.textSecondary },
            ]}
            numberOfLines={4}
          >
            {notification.message}
          </Text>
          <View style={styles.notificationMetaRow}>
            <Text style={[styles.notificationTime, { color: colors.textMuted }]}>
              {calendarTimestamp
                ? formatCategoryNotificationTime(notification.createdAt)
                : formatNotificationTime(notification.createdAt)}
            </Text>
            <View style={styles.rowActions}>
              {showInlineActions && hasLongMessage ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="See full notification"
                  onPress={(event) => {
                    event.stopPropagation();
                    onPress();
                  }}
                  hitSlop={8}
                  style={({ pressed }) => pressed ? styles.pressed : null}
                >
                  <Text style={styles.moreText}>See more</Text>
                </Pressable>
              ) : null}
              {showInlineActions && label ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={label}
                  onPress={(event) => {
                    event.stopPropagation();
                    onAction();
                  }}
                  hitSlop={8}
                  style={({ pressed }) => [styles.cardAction, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.actionText}>{label}</Text>
                  <Ionicons name="arrow-forward" size={14} color={Palette.accent} />
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>
    </Swipeable>
  );
}

function NotificationDetailModal({
  notification,
  bottomInset,
  busy,
  onClose,
  onAction,
}: {
  notification: NotificationRecord | null;
  bottomInset: number;
  busy: boolean;
  onClose: () => void;
  onAction: (notification: NotificationRecord) => void;
}) {
  const colors = Colors.dark;
  const previousNotification = useRef<NotificationRecord | null>(notification);
  if (notification) previousNotification.current = notification;
  const displayedNotification = notification || previousNotification.current;
  if (!displayedNotification) return null;
  const meta = iconMetaFor(displayedNotification);
  const label = actionLabel(displayedNotification);
  const facts = detailFacts(displayedNotification);
  return (
    <MotionSheet
      visible={Boolean(notification)}
      onClose={onClose}
      accessibilityLabel="Notification details"
      contentStyle={[
        styles.detailSheet,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          paddingBottom: Math.max(bottomInset, Spacing.md) + Spacing.md,
        },
      ]}
    >
          <View style={styles.sheetHandle} />
          <View style={styles.detailHeader}>
            <View style={[styles.detailIcon, { backgroundColor: meta.background, borderColor: meta.border }]}>
              <Ionicons name={meta.icon} size={22} color={meta.color} />
            </View>
            <View style={styles.detailHeading}>
              <Text style={[styles.detailEyebrow, { color: Palette.accent }]}>NOTIFICATION</Text>
              <Text style={[styles.detailTitle, { color: colors.text }]}>{displayedNotification.title}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: colors.cardAlt }]}
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailScroll}>
            <Text style={[styles.detailMessage, { color: colors.textSecondary }]}>
              {displayedNotification.message}
            </Text>
            <View style={styles.detailTimestampRow}>
              <Ionicons name="time-outline" size={15} color={colors.textMuted} />
              <Text style={[styles.detailTimestamp, { color: colors.textMuted }]}>
                {formatFullTimestamp(displayedNotification.createdAt)}
              </Text>
            </View>
            {facts.length > 0 ? (
              <View style={[styles.factCard, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                {facts.map((fact, index) => (
                  <View
                    key={`${fact.label}-${fact.value}`}
                    style={[
                      styles.factRow,
                      index < facts.length - 1
                        ? { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }
                        : null,
                    ]}
                  >
                    <Text style={[styles.factLabel, { color: colors.textMuted }]}>{fact.label}</Text>
                    <Text style={[styles.factValue, { color: colors.text }]} numberOfLines={2}>{fact.value}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>

          {label ? (
            <PremiumButton
              title={label}
              icon="arrow-forward-outline"
              loading={busy}
              onPress={() => onAction(displayedNotification)}
              style={styles.detailAction}
            />
          ) : null}
    </MotionSheet>
  );
}

function EmptyState({ filter }: { filter: InboxFilter }) {
  const colors = Colors.dark;
  const promotions = filter === 'promotions';
  return (
    <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.emptyIcon}>
        <Ionicons
          name={promotions ? 'pricetag-outline' : 'checkmark-circle-outline'}
          size={27}
          color={Palette.accent}
        />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        {promotions ? 'No new offers right now.' : 'You’re all caught up.'}
      </Text>
      <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
        {promotions
          ? 'New AutoSPF+ offers and rewards will appear here.'
          : 'Important booking and service updates will appear here.'}
      </Text>
    </View>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = Colors.dark;
  return (
    <View style={styles.centerState}>
      <View style={[styles.errorIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="cloud-offline-outline" size={29} color={Palette.accent} />
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
  content: { paddingTop: 0 },
  emptyContent: { flexGrow: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: 12, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.2 },
  headerButton: {
    width: 44, height: 44, borderRadius: BorderRadius.md, borderWidth: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  headerSideSpacer: { width: 44, height: 44 },
  listHeader: { marginBottom: 0 },
  filterScroll: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.075)' },
  filterContent: { paddingHorizontal: 18, paddingVertical: 10, gap: 6 },
  filterChip: {
    minHeight: 28, borderRadius: BorderRadius.full, borderWidth: 1,
    paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center',
  },
  filterLabel: { fontSize: 11.5, lineHeight: 15, fontWeight: '700', letterSpacing: 0 },
  categoryStack: { paddingHorizontal: 18, paddingTop: 4 },
  summaryRow: {
    minHeight: 88, borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 2, paddingVertical: 12,
  },
  summaryIcon: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1,
    backgroundColor: 'rgba(255, 107, 53, 0.09)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  summaryCopy: { flex: 1, minWidth: 0, gap: 2 },
  summaryTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700', letterSpacing: -0.1 },
  summarySubtitle: { fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: 0 },
  summaryTrailing: { maxWidth: 112, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  summaryBadge: { minWidth: 25, height: 25, paddingHorizontal: 7, borderRadius: 13, backgroundColor: Palette.accent, alignItems: 'center', justifyContent: 'center' },
  summaryBadgeText: { color: '#FFFFFF', fontSize: 11.5, lineHeight: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  summaryEmptyLabel: { flexShrink: 1, fontSize: 11.5, lineHeight: 16, fontWeight: '500', textAlign: 'right' },
  inlineError: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: BorderRadius.md,
    marginHorizontal: 18, marginVertical: 10, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: 'rgba(255, 107, 53, 0.09)',
  },
  inlineErrorText: { flex: 1, color: Palette.accent, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  sectionHeader: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: Spacing.sm,
    paddingHorizontal: 18, backgroundColor: 'rgba(255,255,255,0.025)',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.075)',
  },
  sectionTitle: { fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 0.8 },
  readAllButton: { minHeight: 32, alignItems: 'flex-end', justifyContent: 'center' },
  readAllText: { color: Palette.accent, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  disabledAction: { opacity: 0.48 },
  swipeContainer: { marginHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.075)', overflow: 'hidden' },
  swipeActions: { width: 154, flexDirection: 'row' },
  swipeReadAction: {
    flex: 1, backgroundColor: Palette.accent,
    alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  swipeDeleteAction: {
    flex: 1, backgroundColor: Palette.danger,
    alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  swipeActionText: { color: '#FFFFFF', fontSize: 11, lineHeight: 14, fontWeight: '700' },
  notificationRow: {
    minHeight: 116, flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 2, paddingVertical: 16,
  },
  notificationUnread: { borderLeftWidth: 2, borderLeftColor: Palette.accent, paddingLeft: 10 },
  notificationIcon: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  notificationBody: { flex: 1, minWidth: 0, gap: 6 },
  notificationTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  notificationTitle: { flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '700', letterSpacing: -0.1 },
  notificationTitleRead: { fontWeight: '600' },
  notificationMessage: { fontSize: 14, lineHeight: 20, fontWeight: '400', letterSpacing: 0 },
  notificationMetaRow: {
    minHeight: 21, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 10, rowGap: 4,
  },
  notificationTime: { fontSize: 12, lineHeight: 16, fontWeight: '500', fontVariant: ['tabular-nums'] },
  rowActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', columnGap: 11, rowGap: 3 },
  moreText: { color: Palette.accent, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  cardAction: { minHeight: 20, flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { color: Palette.accent, fontSize: 12.5, lineHeight: 17, fontWeight: '700' },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Palette.accent, marginTop: 6 },
  emptyCard: {
    alignItems: 'center', borderRadius: BorderRadius.xl, borderWidth: 1,
    marginHorizontal: 18, marginTop: 24, paddingHorizontal: Spacing.lg, paddingVertical: 28, gap: 7,
  },
  emptyIcon: {
    width: 52, height: 52, borderRadius: 18,
    backgroundColor: 'rgba(255, 107, 53, 0.11)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 3,
  },
  emptyTitle: { ...Typography.heading, textAlign: 'center', letterSpacing: 0 },
  emptySubtext: { ...Typography.body, textAlign: 'center', letterSpacing: 0 },
  centerState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.lg, gap: Spacing.md,
  },
  errorIcon: {
    width: 58, height: 58, borderRadius: 20, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  retryButton: { marginTop: Spacing.sm },
  footerLoader: { paddingVertical: Spacing.lg },
  detailSheet: {
    maxHeight: '86%', minHeight: 360,
    borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1,
    paddingHorizontal: Spacing.md, paddingTop: 9,
  },
  sheetHandle: {
    width: 38, height: 4, borderRadius: 2, alignSelf: 'center',
    backgroundColor: 'rgba(161, 161, 170, 0.42)', marginBottom: 14,
  },
  detailHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  detailIcon: {
    width: 44, height: 44, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  detailHeading: { flex: 1, minWidth: 0, gap: 2 },
  detailEyebrow: { fontSize: 10, lineHeight: 13, fontWeight: '700', letterSpacing: 1.1 },
  detailTitle: { fontSize: 19, lineHeight: 25, fontWeight: '700', letterSpacing: 0 },
  closeButton: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  detailScroll: { paddingTop: 19, paddingBottom: 16, gap: 14 },
  detailMessage: { fontSize: 15, lineHeight: 23, fontWeight: '400' },
  detailTimestampRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailTimestamp: { fontSize: 12, lineHeight: 16, fontWeight: '500', fontVariant: ['tabular-nums'] },
  factCard: { borderRadius: BorderRadius.lg, borderWidth: 1, paddingHorizontal: 13 },
  factRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  factLabel: { width: 72, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  factValue: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600', textAlign: 'right' },
  detailAction: { marginTop: 4 },
  pressed: { opacity: 0.72 },
});
