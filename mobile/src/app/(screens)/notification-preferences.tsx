/**
 * Notification Preferences Screen
 * Granular control over push, email, and SMS notification categories.
 * Stored in AsyncStorage until backend notification preference API is available.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Palette } from '@/constants/theme';
import { Toast } from '@/components/ui/PremiumToast';
import { apiClient } from '@/services/api/client';

const SURFACE = '#111114';
const BORDER = '#2A2A30';
const STORAGE_KEY = '@autospf_notification_prefs';

interface NotifPrefs {
  // Master
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  // Categories
  bookingConfirmation: boolean;
  jobStatusUpdates: boolean;
  paymentReminders: boolean;
  promotionalOffers: boolean;
  chatMessages: boolean;
  vehicleReminders: boolean;
  loyaltyRewards: boolean;
  newsletter: boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  pushEnabled: true,
  emailEnabled: true,
  smsEnabled: false,
  bookingConfirmation: true,
  jobStatusUpdates: true,
  paymentReminders: true,
  promotionalOffers: true,
  chatMessages: true,
  vehicleReminders: true,
  loyaltyRewards: true,
  newsletter: false,
};

// ── Toggle Row Component ──
function ToggleRow({
  iconName,
  iconColor,
  iconBg,
  title,
  subtitle,
  value,
  onToggle,
}: {
  iconName: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  value: boolean;
  onToggle: (val: boolean) => void;
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
      <Switch
        value={value}
        onValueChange={(val) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onToggle(val);
        }}
        trackColor={{ false: 'rgba(255,255,255,0.1)', true: Palette.accent }}
        thumbColor="#FFF"
      />
    </View>
  );
}

const Div = () => <View style={s.divider} />;

// ── Section Component ──
function Section({
  title,
  children,
  delay = 100,
}: {
  title: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <Animated.View
      entering={FadeInUp.delay(delay).springify().damping(18)}
      style={s.section}
    >
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionCard}>{children}</View>
    </Animated.View>
  );
}

export default function NotificationPreferencesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);

  // ── Load ──
  useEffect(() => {
    (async () => {
      try {
        const [meRes, rawLocal] = await Promise.all([
          apiClient.get('/customers/me').catch(() => null),
          AsyncStorage.getItem(STORAGE_KEY).catch(() => null),
        ]);

        let loadedPrefs = null;
        if (meRes?.data?.data?.notificationPreferences) {
          loadedPrefs = meRes.data.data.notificationPreferences;
        } else if (rawLocal) {
          loadedPrefs = JSON.parse(rawLocal);
        }

        if (loadedPrefs) {
          // Merge with defaults in case of missing keys
          setPrefs({ ...DEFAULT_PREFS, ...loadedPrefs });
        }
      } catch {
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // ── Auto-save on change ──
  useEffect(() => {
    if (!loaded) return;
    const save = async () => {
      try {
        // Optimistically save to local first to keep feel snappy
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
        
        // Sync with backend
        await apiClient.put('/customers/me', { notificationPreferences: prefs });
      } catch (err) {
        console.error('Failed to sync notification preferences to backend:', err);
      }
    };
    
    // We can debounce the save since it auto triggers on every toggle
    const timeoutProcess = setTimeout(() => {
      save();
    }, 500);

    return () => clearTimeout(timeoutProcess);
  }, [prefs, loaded]);

  const toggle = (key: keyof NotifPrefs) => (val: boolean) => {
    setPrefs((prev) => ({ ...prev, [key]: val }));
  };

  // When push master is off, categories are meaningless
  const categoriesDisabled = !prefs.pushEnabled;

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={s.backBtn}
        >
          <Ionicons name="arrow-back" size={18} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Notification Preferences</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Description ── */}
        <Animated.View
          entering={FadeInDown.delay(80).springify()}
          style={s.descBox}
        >
          <Ionicons
            name="information-circle-outline"
            size={18}
            color="#6A6A7A"
          />
          <Text style={s.descText}>
            Control how and when AutoSPF+ notifies you. Your preferences are
            saved automatically.
          </Text>
        </Animated.View>

        {/* ═══ DELIVERY CHANNELS ═══ */}
        <Section title="Delivery Channels" delay={120}>
          <ToggleRow
            iconName="notifications"
            iconColor="#3B82F6"
            iconBg="rgba(59,130,246,0.1)"
            title="Push Notifications"
            subtitle="Receive alerts on your device"
            value={prefs.pushEnabled}
            onToggle={toggle('pushEnabled')}
          />
          <Div />
          <ToggleRow
            iconName="mail"
            iconColor="#8B5CF6"
            iconBg="rgba(139,92,246,0.1)"
            title="Email Notifications"
            subtitle="Receive updates via email"
            value={prefs.emailEnabled}
            onToggle={toggle('emailEnabled')}
          />
          <Div />
          <ToggleRow
            iconName="chatbox-ellipses"
            iconColor="#10B981"
            iconBg="rgba(16,185,129,0.1)"
            title="SMS Notifications"
            subtitle="Text messages for urgent updates"
            value={prefs.smsEnabled}
            onToggle={toggle('smsEnabled')}
          />
        </Section>

        {/* ═══ BOOKING & SERVICE ═══ */}
        <Section title="Booking & Service" delay={200}>
          <ToggleRow
            iconName="checkmark-circle"
            iconColor="#10B981"
            iconBg="rgba(16,185,129,0.1)"
            title="Booking Confirmations"
            subtitle="When your appointment is confirmed"
            value={prefs.bookingConfirmation && !categoriesDisabled}
            onToggle={toggle('bookingConfirmation')}
          />
          <Div />
          <ToggleRow
            iconName="sync"
            iconColor="#3B82F6"
            iconBg="rgba(59,130,246,0.1)"
            title="Job Status Updates"
            subtitle="Real-time progress of your vehicle service"
            value={prefs.jobStatusUpdates && !categoriesDisabled}
            onToggle={toggle('jobStatusUpdates')}
          />
          <Div />
          <ToggleRow
            iconName="card"
            iconColor="#F59E0B"
            iconBg="rgba(245,158,11,0.1)"
            title="Payment Reminders"
            subtitle="Due balances and payment confirmations"
            value={prefs.paymentReminders && !categoriesDisabled}
            onToggle={toggle('paymentReminders')}
          />
          <Div />
          <ToggleRow
            iconName="chatbubble"
            iconColor="#8B5CF6"
            iconBg="rgba(139,92,246,0.1)"
            title="Chat Messages"
            subtitle="New messages from staff or AI assistant"
            value={prefs.chatMessages && !categoriesDisabled}
            onToggle={toggle('chatMessages')}
          />
        </Section>

        {/* ═══ VEHICLE & CARE ═══ */}
        <Section title="Vehicle & Care" delay={280}>
          <ToggleRow
            iconName="car-sport"
            iconColor={Palette.accent}
            iconBg="rgba(255,107,53,0.1)"
            title="Vehicle Reminders"
            subtitle="Maintenance schedules and service due dates"
            value={prefs.vehicleReminders && !categoriesDisabled}
            onToggle={toggle('vehicleReminders')}
          />
          <Div />
          <ToggleRow
            iconName="diamond"
            iconColor="#FBBF24"
            iconBg="rgba(251,191,36,0.08)"
            title="Loyalty & Rewards"
            subtitle="Points earned, tier upgrades, and perks"
            value={prefs.loyaltyRewards && !categoriesDisabled}
            onToggle={toggle('loyaltyRewards')}
          />
        </Section>

        {/* ═══ MARKETING ═══ */}
        <Section title="Marketing" delay={350}>
          <ToggleRow
            iconName="megaphone"
            iconColor="#EC4899"
            iconBg="rgba(236,72,153,0.1)"
            title="Promotional Offers"
            subtitle="Exclusive deals, discounts, and seasonal promos"
            value={prefs.promotionalOffers}
            onToggle={toggle('promotionalOffers')}
          />
          <Div />
          <ToggleRow
            iconName="newspaper"
            iconColor="#6B7280"
            iconBg="rgba(107,114,128,0.1)"
            title="Newsletter"
            subtitle="Monthly tips, product news, and car care guides"
            value={prefs.newsletter}
            onToggle={toggle('newsletter')}
          />
        </Section>

        {/* ── Footer info ── */}
        <Animated.View
          entering={FadeInUp.delay(400).springify()}
          style={s.footerInfo}
        >
          <Ionicons name="shield-checkmark" size={14} color="#3A3A48" />
          <Text style={s.footerText}>
            We respect your privacy. You can change these settings at any time.
            Transactional notifications (receipts, security alerts) cannot be
            disabled.
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
//  STYLES
// ══════════════════════════════════════════════════════════════════

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
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },

  content: { padding: 24, paddingTop: 20, paddingBottom: 40 },

  // Description box
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
  descText: {
    flex: 1,
    fontSize: 13,
    color: '#6A6A7A',
    lineHeight: 18,
  },

  // Section
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8A8A9A',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 12,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },

  // Toggle Row
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingVertical: 14,
  },
  toggleIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 8,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 2,
  },
  toggleSubtitle: {
    fontSize: 11,
    color: '#6A6A7A',
    lineHeight: 14,
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginLeft: 54,
  },

  // Footer
  footerInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  footerText: {
    fontSize: 11,
    color: '#3A3A48',
    lineHeight: 16,
    flex: 1,
  },
});
