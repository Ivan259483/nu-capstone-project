import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Switch, Platform } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SectionHeader from './SectionHeader';

const ACCENT = '#FF6B35';
const STORAGE_KEY = '@autospf_notif_prefs';

interface NotifPref {
  bookingReminders: boolean;
  repairUpdates: boolean;
  promoAlerts: boolean;
  loyaltyUpdates: boolean;
}

const DEFAULT_PREFS: NotifPref = {
  bookingReminders: true,
  repairUpdates: true,
  promoAlerts: false,
  loyaltyUpdates: true,
};

const TOGGLE_ITEMS: { key: keyof NotifPref; icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }[] = [
  { key: 'bookingReminders', icon: 'alarm-outline', title: 'Booking Reminders', subtitle: 'Alerts before your scheduled appointments' },
  { key: 'repairUpdates', icon: 'construct-outline', title: 'Repair Updates', subtitle: 'Status changes on your service orders' },
  { key: 'promoAlerts', icon: 'megaphone-outline', title: 'Promo Alerts', subtitle: 'Discounts and seasonal offers' },
  { key: 'loyaltyUpdates', icon: 'star-outline', title: 'Loyalty Updates', subtitle: 'Points earned and reward notifications' },
];

export default function NotificationsSection() {
  const [prefs, setPrefs] = useState<NotifPref>(DEFAULT_PREFS);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) setPrefs(JSON.parse(stored));
      } catch {
        // Use defaults
      }
    })();
  }, []);

  const handleToggle = useCallback(async (key: keyof NotifPref) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return (
    <Animated.View entering={FadeInUp.delay(450).springify().damping(18)}>
      <SectionHeader title="Notifications" icon="notifications-outline" />
      <View style={s.card}>
        {TOGGLE_ITEMS.map((item, idx) => (
          <View key={item.key} style={[s.row, idx < TOGGLE_ITEMS.length - 1 && s.rowBorder]}>
            <View style={s.iconWrap}>
              <Ionicons name={item.icon} size={17} color={ACCENT} />
            </View>
            <View style={s.rowContent}>
              <Text style={s.rowTitle}>{item.title}</Text>
              <Text style={s.rowSub}>{item.subtitle}</Text>
            </View>
            <Switch
              value={prefs[item.key]}
              onValueChange={() => handleToggle(item.key)}
              trackColor={{
                false: 'rgba(255,255,255,0.06)',
                true: ACCENT + '60',
              }}
              thumbColor={prefs[item.key] ? ACCENT : '#555'}
              ios_backgroundColor="rgba(255,255,255,0.06)"
              style={Platform.OS === 'ios' ? { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] } : undefined}
            />
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: 'rgba(255,107,53,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowContent: { flex: 1 },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E8E8ED',
    letterSpacing: 0.2,
    marginBottom: 1,
  },
  rowSub: {
    fontSize: 10,
    color: '#6B6B78',
    fontWeight: '500',
  },
});
