/**
 * Notifications Screen
 */

import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/hooks/useThemeContext';
import { Palette } from '@/constants/theme';
import GlassCard from '@/components/ui/GlassCard';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api/client';
import { notificationService } from '@/services/api/notificationService';

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    if (!profile) return;

    const loadNotifications = async () => {
      try {
        const rows = await notificationService.getNotifications();
        setNotifications(rows);
      } catch (error) {
        console.warn('Failed to fetch notifications:', getApiErrorMessage(error));
      }
    };

    loadNotifications();
  }, [profile]);

  const markAsRead = async (id: string) => {
    try {
      await notificationService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === id ? { ...notification, isRead: true } : notification
        )
      );
    } catch (error) {
      console.warn('Failed to mark notification as read:', getApiErrorMessage(error));
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.backHeader, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.backTitle, { color: colors.text }]}>Notifications</Text>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        ListEmptyComponent={
          <GlassCard style={{ alignItems: 'center', padding: 30 }}>
            <Ionicons name="notifications-off-outline" size={32} color={colors.textMuted} style={{ marginBottom: 12 }} />
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>No notifications yet.</Text>
          </GlassCard>
        }
        renderItem={({ item: n, index: i }) => (
          <Animated.View entering={FadeInDown.delay(100 + i * 80).duration(200)}>
            <GlassCard
              onPress={() => {
                if (!n.isRead) markAsRead(n.id);
              }}
              style={
                !n.isRead
                  ? { borderColor: colors.accentBorder, backgroundColor: colors.accentLight }
                  : undefined
              }
            >
              <View style={styles.notifRow}>
                <Ionicons name="notifications" size={24} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.notifTitle, { color: colors.text }]}>{n.title}</Text>
                  <Text style={[styles.notifSub, { color: colors.textSecondary }]}>{n.message}</Text>
                  <Text style={[styles.notifTime, { color: colors.textMuted }]}>
                    {n.createdAt ? new Date(n.createdAt).toLocaleDateString() : ''}
                  </Text>
                </View>
                {!n.isRead && <View style={styles.unreadDot} />}
              </View>
            </GlassCard>
          </Animated.View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 12, paddingTop: 16, paddingBottom: 40 },
  backHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  backTitle: { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
  notifRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  notifEmoji: { fontSize: 24 },
  notifTitle: { fontWeight: '700', fontSize: 14 },
  notifSub: { fontSize: 13, marginTop: 2 },
  notifTime: { fontSize: 11, marginTop: 6 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Palette.accent, marginTop: 4 },
});
