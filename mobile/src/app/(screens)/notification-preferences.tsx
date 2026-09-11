import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Palette } from '@/constants/theme';
import { Toast } from '@/components/ui/PremiumToast';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api/client';
import {
  notificationPreferenceService,
  type NotificationPreferences,
} from '@/services/api/notificationPreferenceService';
import {
  ensureCurrentPushTokenRegistered,
  getPushNotificationPermissionState,
  type PushPermissionState,
} from '@/hooks/usePushNotifications';

const SURFACE = '#111114';
const BORDER = '#2A2A30';

type PreferenceKey = keyof NotificationPreferences;
type PushUiState = PushPermissionState | 'checking' | 'ready';

function preferencesEqual(
  left: NotificationPreferences | null,
  right: NotificationPreferences | null
) {
  if (!left || !right) return left === right;
  return (
    left.pushEnabled === right.pushEnabled
    && left.emailEnabled === right.emailEnabled
    && left.bookingConfirmation === right.bookingConfirmation
    && left.jobStatusUpdates === right.jobStatusUpdates
    && left.paymentReminders === right.paymentReminders
    && left.vehicleReminders === right.vehicleReminders
  );
}

function ToggleRow({
  iconName,
  iconColor,
  iconBg,
  title,
  subtitle,
  value,
  onToggle,
  loading = false,
}: {
  iconName: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  value: boolean;
  onToggle: (value: boolean) => void;
  loading?: boolean;
}) {
  return (
    <View style={s.toggleRow}>
      <View style={[s.toggleIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={iconName} size={16} color={iconColor} />
      </View>
      <View style={s.toggleInfo}>
        <Text style={s.toggleTitle}>{title}</Text>
        <Text style={s.toggleSubtitle}>{subtitle}</Text>
      </View>
      {loading ? (
        <View style={s.switchLoader} accessibilityLabel={`Verifying ${title}`}>
          <ActivityIndicator size="small" color={Palette.accent} />
        </View>
      ) : (
        <Switch
          accessibilityLabel={title}
          value={value}
          onValueChange={(nextValue) => {

            onToggle(nextValue);
          }}
          trackColor={{ false: 'rgba(255,255,255,0.1)', true: Palette.accent }}
          thumbColor="#FFF"
        />
      )}
    </View>
  );
}

const Divider = () => <View style={s.divider} />;

function Section({
  title,
  children,
  delay,
}: {
  title: string;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(200)} style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionCard}>{children}</View>
    </Animated.View>
  );
}

export default function NotificationPreferencesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { backendUser, profile } = useAuth();
  const accountId = profile?.backend_id || backendUser?._id || backendUser?.id || '';

  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [loadError, setLoadError] = useState('');
  const [pushState, setPushState] = useState<PushUiState>('checking');
  const [pushActivationPending, setPushActivationPending] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const mountedRef = useRef(true);
  const loadGenerationRef = useRef(0);
  const confirmedRef = useRef<NotificationPreferences | null>(null);
  const desiredRef = useRef<NotificationPreferences | null>(null);
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadGenerationRef.current += 1;
      desiredRef.current = null;
      confirmedRef.current = null;
    };
  }, []);

  const flushPreferenceSaves = useCallback(async () => {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    const generation = loadGenerationRef.current;

    try {
      while (
        generation === loadGenerationRef.current
        && desiredRef.current
        && confirmedRef.current
        && !preferencesEqual(desiredRef.current, confirmedRef.current)
      ) {
        const snapshot = { ...desiredRef.current };
        try {
          const saved = await notificationPreferenceService.update(snapshot);
          if (generation !== loadGenerationRef.current) return;

          confirmedRef.current = saved;
          if (preferencesEqual(desiredRef.current, snapshot)) {
            desiredRef.current = saved;
            if (mountedRef.current) setPreferences(saved);
          }
        } catch (saveError) {
          if (generation !== loadGenerationRef.current) return;
          const rollback = confirmedRef.current;
          desiredRef.current = rollback;
          if (mountedRef.current) {
            setPreferences(rollback);
            Toast.show(
              getApiErrorMessage(saveError, 'Unable to save notification preferences.'),
              'error'
            );
          }
          return;
        }
      }
    } finally {
      saveInFlightRef.current = false;
    }
  }, []);

  const applyPreference = useCallback((key: PreferenceKey, value: boolean) => {
    const current = desiredRef.current;
    if (!current || current[key] === value) return;
    const next = { ...current, [key]: value };
    desiredRef.current = next;
    setPreferences(next);
    void flushPreferenceSaves();
  }, [flushPreferenceSaves]);

  const verifyRegisteredPush = useCallback(async (
    requestPermission: boolean,
    generation = loadGenerationRef.current
  ) => {
    setPushState('checking');
    const result = await ensureCurrentPushTokenRegistered({ requestPermission });
    if (generation !== loadGenerationRef.current || !mountedRef.current) return result.state;
    setPushState(result.state);
    return result.state;
  }, []);

  useEffect(() => {
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    confirmedRef.current = null;
    desiredRef.current = null;
    setPreferences(null);
    setLoadError('');
    setPushState('checking');

    if (!accountId) return;

    void (async () => {
      try {
        const [loadedPreferences, permissionState] = await Promise.all([
          notificationPreferenceService.get(),
          getPushNotificationPermissionState(),
        ]);
        if (generation !== loadGenerationRef.current || !mountedRef.current) return;

        confirmedRef.current = loadedPreferences;
        desiredRef.current = loadedPreferences;
        setPreferences(loadedPreferences);
        setPushState(permissionState);

        if (permissionState === 'denied' && loadedPreferences.pushEnabled) {
          const permissionSafePreferences = {
            ...loadedPreferences,
            pushEnabled: false,
          };
          desiredRef.current = permissionSafePreferences;
          setPreferences(permissionSafePreferences);
          void flushPreferenceSaves();
        } else if (permissionState === 'granted' && loadedPreferences.pushEnabled) {
          void verifyRegisteredPush(false, generation);
        }
      } catch (loadFailure) {
        if (generation !== loadGenerationRef.current || !mountedRef.current) return;
        setLoadError(
          getApiErrorMessage(loadFailure, 'Unable to load notification preferences.')
        );
        setPushState('error');
      }
    })();
  }, [accountId, flushPreferenceSaves, reloadToken, verifyRegisteredPush]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !desiredRef.current) return;
      const generation = loadGenerationRef.current;
      void (async () => {
        const permissionState = await getPushNotificationPermissionState();
        if (generation !== loadGenerationRef.current || !mountedRef.current) return;
        setPushState(permissionState);
        if (permissionState === 'granted' && desiredRef.current?.pushEnabled) {
          void verifyRegisteredPush(false, generation);
        } else if (permissionState === 'denied' && desiredRef.current?.pushEnabled) {
          applyPreference('pushEnabled', false);
        }
      })();
    });
    return () => subscription.remove();
  }, [applyPreference, verifyRegisteredPush]);

  const handlePushToggle = useCallback(async (value: boolean) => {
    if (!value) {
      applyPreference('pushEnabled', false);
      return;
    }

    setPushActivationPending(true);
    try {
      const state = await verifyRegisteredPush(true);
      if (state === 'ready') {
        applyPreference('pushEnabled', true);
        return;
      }

      if (state === 'denied' && desiredRef.current?.pushEnabled) {
        applyPreference('pushEnabled', false);
      }
      const message = state === 'denied'
        ? 'Notifications are disabled in your device settings.'
        : state === 'unavailable'
          ? 'Push notifications require a physical development or production build.'
          : 'Unable to verify this device for push notifications.';
      Toast.show(message, 'warning');
    } finally {
      if (mountedRef.current) setPushActivationPending(false);
    }
  }, [applyPreference, verifyRegisteredPush]);

  const effectivePushEnabled = Boolean(
    preferences?.pushEnabled && pushState === 'ready'
  );
  const showPushSettings = pushState === 'denied';
  const pushStatusMessage = showPushSettings
    ? 'Notifications are disabled in your device settings.'
    : pushState === 'unavailable'
      ? 'Push notifications require a physical development or production build.'
      : pushState === 'error' && preferences?.pushEnabled
        ? "We couldn't verify this device's push token."
        : pushState === 'undetermined' && preferences?.pushEnabled
          ? 'Allow device notifications to enable push alerts.'
          : '';

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity
          accessibilityLabel="Go back"
          onPress={() => {

            router.back();
          }}
          style={s.backBtn}
        >
          <Ionicons name="arrow-back" size={18} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Notification Preferences</Text>
        <View style={s.headerSpacer} />
      </View>

      {!preferences ? (
        <View style={s.centerState}>
          {loadError ? (
            <>
              <Ionicons name="cloud-offline-outline" size={24} color="#8A8A9A" />
              <Text style={s.stateTitle}>Preferences unavailable</Text>
              <Text style={s.stateMessage}>{loadError}</Text>
              <TouchableOpacity
                style={s.retryButton}
                onPress={() => setReloadToken((value) => value + 1)}
              >
                <Text style={s.retryText}>Try again</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <ActivityIndicator color={Palette.accent} />
              <Text style={s.loadingText}>Loading preferences…</Text>
            </>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.delay(80).duration(200)} style={s.descBox}>
            <Ionicons name="information-circle-outline" size={18} color="#777786" />
            <Text style={s.descText}>
              Choose how AutoSPF+ keeps you updated.{`\n`}Changes are saved automatically.
            </Text>
          </Animated.View>

          <Section title="Delivery Channels" delay={120}>
            <ToggleRow
              iconName="notifications"
              iconColor="#3B82F6"
              iconBg="rgba(59,130,246,0.1)"
              title="Push Notifications"
              subtitle="Receive alerts on your device"
              value={effectivePushEnabled}
              onToggle={(value) => void handlePushToggle(value)}
              loading={pushActivationPending || (preferences.pushEnabled && pushState === 'checking')}
            />
            {pushStatusMessage ? (
              <View style={s.permissionNotice}>
                <Text style={s.permissionText}>{pushStatusMessage}</Text>
                {showPushSettings ? (
                  <TouchableOpacity onPress={() => void Linking.openSettings()}>
                    <Text style={s.settingsLink}>Open Settings</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            <Divider />
            <ToggleRow
              iconName="mail"
              iconColor="#8B5CF6"
              iconBg="rgba(139,92,246,0.1)"
              title="Email Notifications"
              subtitle="Receive important updates via email"
              value={preferences.emailEnabled}
              onToggle={(value) => applyPreference('emailEnabled', value)}
            />
          </Section>

          <Section title="Booking & Service" delay={200}>
            <ToggleRow
              iconName="checkmark-circle"
              iconColor="#10B981"
              iconBg="rgba(16,185,129,0.1)"
              title="Booking Confirmations"
              subtitle="Confirmation, reschedule, and cancellation updates"
              value={preferences.bookingConfirmation}
              onToggle={(value) => applyPreference('bookingConfirmation', value)}
            />
            <Divider />
            <ToggleRow
              iconName="sync"
              iconColor="#3B82F6"
              iconBg="rgba(59,130,246,0.1)"
              title="Job Status Updates"
              subtitle="Real-time progress while your vehicle is in service"
              value={preferences.jobStatusUpdates}
              onToggle={(value) => applyPreference('jobStatusUpdates', value)}
            />
            <Divider />
            <ToggleRow
              iconName="card"
              iconColor="#F59E0B"
              iconBg="rgba(245,158,11,0.1)"
              title="Payment Reminders"
              subtitle="Payment verification, balances, and payment-related reminders"
              value={preferences.paymentReminders}
              onToggle={(value) => applyPreference('paymentReminders', value)}
            />
          </Section>

          <Section title="Vehicle & Care" delay={280}>
            <ToggleRow
              iconName="car-sport"
              iconColor={Palette.accent}
              iconBg="rgba(255,107,53,0.1)"
              title="Vehicle Reminders"
              subtitle="Service and maintenance reminders"
              value={preferences.vehicleReminders}
              onToggle={(value) => applyPreference('vehicleReminders', value)}
            />
          </Section>

          <Animated.View entering={FadeInUp.delay(340).duration(200)} style={s.footerInfo}>
            <Ionicons name="shield-checkmark" size={14} color="#4B4B58" />
            <Text style={s.footerText}>
              In-app notification history and required security messages remain available.
            </Text>
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
  },
  headerSpacer: { width: 36 },
  content: { padding: 24, paddingTop: 20, paddingBottom: 40 },
  descBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    padding: 14,
    marginBottom: 24,
  },
  descText: { flex: 1, fontSize: 13, color: '#8A8A9A', lineHeight: 19 },
  section: { marginBottom: 24 },
  sectionTitle: {
    marginBottom: 12,
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#8A8A9A',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  sectionCard: {
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 66,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  toggleIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  toggleInfo: { flex: 1, marginRight: 8 },
  toggleTitle: { marginBottom: 3, fontSize: 14, fontWeight: '600', color: '#FFF' },
  toggleSubtitle: { fontSize: 11, color: '#777786', lineHeight: 15 },
  switchLoader: { width: 51, alignItems: 'center', justifyContent: 'center' },
  divider: {
    height: 1,
    marginLeft: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  permissionNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 60,
    paddingTop: 0,
    paddingBottom: 13,
  },
  permissionText: { flex: 1, fontSize: 11, lineHeight: 15, color: '#A1A1AA' },
  settingsLink: { fontSize: 11, fontWeight: '700', color: Palette.accent },
  footerInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 4,
  },
  footerText: { flex: 1, fontSize: 11, color: '#555562', lineHeight: 16 },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  loadingText: { fontSize: 13, color: '#8A8A9A' },
  stateTitle: { marginTop: 2, fontSize: 15, fontWeight: '700', color: '#FFF' },
  stateMessage: { fontSize: 12, lineHeight: 18, color: '#8A8A9A', textAlign: 'center' },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Palette.accent,
  },
  retryText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
});
