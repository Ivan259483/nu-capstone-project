/**
 * Notifications Screen
 * Local customer notification inbox until backend notification categories are wired.
 */

import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
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
import {
  initialCustomerNotifications,
  type CustomerNotification,
  type CustomerNotificationCategory,
  type CustomerNotificationType,
} from '@/data/customerNotifications';

type InboxFilter = 'all' | CustomerNotificationCategory;
type IoniconName = keyof typeof Ionicons.glyphMap;

const categoryCopy: Record<
  CustomerNotificationCategory,
  {
    title: string;
    preview: string;
    icon: IoniconName;
    color: string;
    background: string;
    border: string;
  }
> = {
  important: {
    title: 'Important',
    preview: 'Your booking has been confirmed',
    icon: 'alert-circle',
    color: '#FF8A3D',
    background: 'rgba(255, 124, 30, 0.14)',
    border: 'rgba(255, 124, 30, 0.28)',
  },
  promotions: {
    title: 'Promotions',
    preview: 'Get 10% off ceramic coating this week',
    icon: 'pricetag',
    color: '#F5B820',
    background: 'rgba(245, 184, 32, 0.12)',
    border: 'rgba(245, 184, 32, 0.25)',
  },
};

const notificationMeta: Record<
  CustomerNotificationType,
  {
    icon: IoniconName;
    color: string;
    background: string;
    border: string;
  }
> = {
  booking: {
    icon: 'calendar-clear-outline',
    color: '#FF8A3D',
    background: 'rgba(255, 124, 30, 0.12)',
    border: 'rgba(255, 124, 30, 0.28)',
  },
  reminder: {
    icon: 'alarm-outline',
    color: '#F5B820',
    background: 'rgba(245, 184, 32, 0.12)',
    border: 'rgba(245, 184, 32, 0.25)',
  },
  service: {
    icon: 'car-sport-outline',
    color: '#4F91FF',
    background: 'rgba(79, 145, 255, 0.12)',
    border: 'rgba(79, 145, 255, 0.25)',
  },
  progress: {
    icon: 'construct-outline',
    color: '#22D3EE',
    background: 'rgba(34, 211, 238, 0.10)',
    border: 'rgba(34, 211, 238, 0.22)',
  },
  qc: {
    icon: 'shield-checkmark-outline',
    color: '#2DDBA6',
    background: 'rgba(45, 219, 166, 0.10)',
    border: 'rgba(45, 219, 166, 0.22)',
  },
  release: {
    icon: 'key-outline',
    color: '#2DDBA6',
    background: 'rgba(45, 219, 166, 0.10)',
    border: 'rgba(45, 219, 166, 0.22)',
  },
  payment: {
    icon: 'receipt-outline',
    color: '#FF8A3D',
    background: 'rgba(255, 124, 30, 0.12)',
    border: 'rgba(255, 124, 30, 0.28)',
  },
  warranty: {
    icon: 'ribbon-outline',
    color: '#9874FF',
    background: 'rgba(152, 116, 255, 0.12)',
    border: 'rgba(152, 116, 255, 0.25)',
  },
  promo: {
    icon: 'pricetag-outline',
    color: '#F5B820',
    background: 'rgba(245, 184, 32, 0.12)',
    border: 'rgba(245, 184, 32, 0.25)',
  },
  inspection: {
    icon: 'search-outline',
    color: '#F5B820',
    background: 'rgba(245, 184, 32, 0.12)',
    border: 'rgba(245, 184, 32, 0.25)',
  },
  ppf: {
    icon: 'shield-outline',
    color: '#4F91FF',
    background: 'rgba(79, 145, 255, 0.12)',
    border: 'rgba(79, 145, 255, 0.25)',
  },
  referral: {
    icon: 'people-outline',
    color: '#2DDBA6',
    background: 'rgba(45, 219, 166, 0.10)',
    border: 'rgba(45, 219, 166, 0.22)',
  },
  tint: {
    icon: 'sunny-outline',
    color: '#F5B820',
    background: 'rgba(245, 184, 32, 0.12)',
    border: 'rgba(245, 184, 32, 0.25)',
  },
};

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [notifications, setNotifications] = useState<CustomerNotification[]>(
    initialCustomerNotifications
  );

  const visibleNotifications = useMemo(() => {
    if (filter === 'all') return notifications;
    return notifications.filter((notification) => notification.category === filter);
  }, [filter, notifications]);

  const counts = useMemo(
    () => ({
      all: notifications.filter((notification) => notification.unread).length,
      important: notifications.filter(
        (notification) => notification.category === 'important' && notification.unread
      ).length,
      promotions: notifications.filter(
        (notification) => notification.category === 'promotions' && notification.unread
      ).length,
    }),
    [notifications]
  );

  const screenTitle =
    filter === 'all' ? 'Notifications' : categoryCopy[filter].title;

  const sectionTitle =
    filter === 'all'
      ? 'Service Updates'
      : filter === 'important'
      ? 'Important Updates'
      : 'Promotion Updates';

  const readAllLabel = counts.all > 0 ? `Read All (${counts.all})` : 'Read All';

  const handleBack = () => {
    if (filter !== 'all') {
      setFilter('all');
      Haptics.selectionAsync();
      return;
    }
    router.back();
  };

  const markAllRead = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, unread: false }))
    );
  };

  const markOneRead = (id: string) => {
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === id ? { ...notification, unread: false } : notification
      )
    );
  };

  const openCategory = (category: CustomerNotificationCategory) => {
    setFilter(category);
    Haptics.selectionAsync();
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Header
        title={screenTitle}
        topInset={insets.top}
        onBack={handleBack}
        onSettings={() => router.push('/(screens)/notification-preferences')}
      />

      <ScrollView
        style={styles.scroll}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.xl },
        ]}
      >
        {filter === 'all' && (
          <View style={styles.categoryStack}>
            <CategoryRow
              category="important"
              unreadCount={counts.important}
              onPress={() => openCategory('important')}
            />
            <CategoryRow
              category="promotions"
              unreadCount={counts.promotions}
              onPress={() => openCategory('promotions')}
            />
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {sectionTitle}
          </Text>
          <Pressable
            onPress={markAllRead}
            hitSlop={10}
            disabled={counts.all === 0}
            style={({ pressed }) => [
              styles.readAllButton,
              pressed && counts.all > 0 ? styles.pressed : null,
              counts.all === 0 ? styles.disabledAction : null,
            ]}
          >
            <Text style={styles.readAllText}>{readAllLabel}</Text>
          </Pressable>
        </View>

        {visibleNotifications.length > 0 ? (
          <View style={styles.list}>
            {visibleNotifications.map((notification, index) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                isLast={index === visibleNotifications.length - 1}
                onPress={() => {
                  if (notification.unread) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    markOneRead(notification.id);
                  }
                }}
              />
            ))}
          </View>
        ) : (
          <EmptyState onBook={() => router.push('/(customer)/book')} />
        )}
      </ScrollView>
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
      <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
        {title}
      </Text>
      <HeaderIconButton icon="settings-outline" onPress={onSettings} />
    </View>
  );
}

function HeaderIconButton({
  icon,
  onPress,
}: {
  icon: IoniconName;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [
        styles.headerButton,
        {
          backgroundColor: colors.cardAlt,
          borderColor: colors.border,
        },
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
  onPress,
}: {
  category: CustomerNotificationCategory;
  unreadCount: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const meta = categoryCopy[category];
  const badgeStyle: StyleProp<ViewStyle> =
    unreadCount > 0 ? null : styles.zeroBadge;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.categoryRow,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
        pressed ? styles.pressed : null,
      ]}
    >
      <View
        style={[
          styles.categoryIcon,
          {
            backgroundColor: meta.background,
            borderColor: meta.border,
          },
        ]}
      >
        <Ionicons name={meta.icon} size={22} color={meta.color} />
      </View>
      <View style={styles.categoryCopy}>
        <Text style={[styles.categoryTitle, { color: colors.text }]} numberOfLines={1}>
          {meta.title}
        </Text>
        <Text
          selectable
          style={[styles.categoryPreview, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {meta.preview}
        </Text>
      </View>
      <View style={[styles.countBadge, badgeStyle]}>
        <Text style={styles.countText}>{unreadCount}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function NotificationRow({
  notification,
  isLast,
  onPress,
}: {
  notification: CustomerNotification;
  isLast: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const meta = notificationMeta[notification.type];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.notificationRow,
        {
          borderBottomColor: isLast ? 'transparent' : colors.borderLight,
          opacity: notification.unread ? 1 : 0.82,
        },
        pressed ? styles.pressed : null,
      ]}
    >
      <View
        style={[
          styles.notificationIcon,
          {
            backgroundColor: meta.background,
            borderColor: meta.border,
          },
        ]}
      >
        <Ionicons name={meta.icon} size={20} color={meta.color} />
      </View>
      <View style={styles.notificationBody}>
        <View style={styles.notificationTitleRow}>
          <Text
            selectable
            style={[styles.notificationTitle, { color: colors.text }]}
            numberOfLines={2}
          >
            {notification.title}
          </Text>
          {notification.unread && <View style={styles.unreadDot} />}
        </View>
        <Text
          selectable
          style={[styles.notificationMessage, { color: colors.textSecondary }]}
        >
          {notification.message}
        </Text>
        {notification.actionLabel ? (
          <Text style={styles.actionText}>{notification.actionLabel}</Text>
        ) : null}
        <Text selectable style={[styles.notificationTime, { color: colors.textMuted }]}>
          {notification.time}
        </Text>
      </View>
    </Pressable>
  );
}

function EmptyState({ onBook }: { onBook: () => void }) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.emptyCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <LinearGradient
        colors={['rgba(255, 124, 30, 0.20)', 'rgba(245, 184, 32, 0.08)']}
        style={styles.emptyIcon}
      >
        <Ionicons name="notifications-outline" size={28} color={Palette.accent} />
      </LinearGradient>
      <Text selectable style={[styles.emptyTitle, { color: colors.text }]}>
        No notifications yet
      </Text>
      <Text selectable style={[styles.emptySubtext, { color: colors.textSecondary }]}>
        Updates about your bookings, services, and account will appear here.
      </Text>
      <PremiumButton
        title="Book a Service"
        icon="calendar-outline"
        onPress={onBook}
        style={styles.emptyButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    ...Typography.heading,
    letterSpacing: 0,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryStack: {
    gap: Spacing.sm,
  },
  categoryRow: {
    minHeight: 84,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  categoryTitle: {
    ...Typography.large,
    letterSpacing: 0,
  },
  categoryPreview: {
    ...Typography.body,
    letterSpacing: 0,
  },
  countBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 8,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zeroBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  countText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 34,
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.bodyMedium,
    letterSpacing: 0,
  },
  readAllButton: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  readAllText: {
    color: Palette.accent,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0,
  },
  disabledAction: {
    opacity: 0.48,
  },
  list: {
    overflow: 'hidden',
    borderRadius: BorderRadius.xxl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(13, 13, 18, 0.92)',
  },
  notificationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  notificationIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  notificationBody: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  notificationTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  notificationTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
    letterSpacing: 0,
  },
  notificationMessage: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    letterSpacing: 0,
  },
  actionText: {
    color: Palette.accent,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    textDecorationLine: 'underline',
    letterSpacing: 0,
  },
  notificationTime: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Palette.accent,
    marginTop: 6,
  },
  emptyCard: {
    alignItems: 'center',
    borderRadius: BorderRadius.xxl,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    ...Typography.heading,
    textAlign: 'center',
    letterSpacing: 0,
  },
  emptySubtext: {
    ...Typography.body,
    textAlign: 'center',
    letterSpacing: 0,
  },
  emptyButton: {
    marginTop: Spacing.sm,
  },
  pressed: {
    opacity: 0.72,
  },
});
