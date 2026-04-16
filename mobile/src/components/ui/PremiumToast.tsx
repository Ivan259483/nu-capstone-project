import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastData {
  message: string;
  type: ToastType;
}

// ── Imperative Controller ──
// Allows you to do `Toast.show('Error', 'error')` from literally any file
// (e.g. inside Redux thunks, Axios interceptors) without relying on Context.
class ToastController {
  listener: ((data: ToastData | null) => void) | null = null;
  
  show(message: string, type: ToastType = 'error') {
    if (this.listener) {
      if (Platform.OS !== 'web') {
        if (type === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        else if (type === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        else if (type === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      this.listener({ message, type });
    }
  }

  hide() {
    if (this.listener) this.listener(null);
  }
}

export const Toast = new ToastController();

// ── Rendered Component ──
export default function PremiumToast() {
  const [toastData, setToastData] = useState<ToastData | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    Toast.listener = (data) => {
      setToastData(data);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      if (data) {
        timeoutRef.current = setTimeout(() => {
          setToastData(null);
        }, 4000);
      }
    };
    return () => {
      Toast.listener = null;
    };
  }, []);

  if (!toastData) return null;

  const iconName = 
    toastData.type === 'error' ? 'close-circle' :
    toastData.type === 'success' ? 'checkmark-circle' :
    toastData.type === 'warning' ? 'warning' : 'information-circle';

  const color = 
    toastData.type === 'error' ? '#EF4444' :
    toastData.type === 'success' ? '#10B981' :
    toastData.type === 'warning' ? '#F59E0B' : '#3B82F6';

  const glowColor = 
    toastData.type === 'error' ? 'rgba(239, 68, 68, 0.4)' :
    toastData.type === 'success' ? 'rgba(16, 185, 129, 0.4)' :
    toastData.type === 'warning' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(59, 130, 246, 0.4)';

  return (
    <Animated.View 
      entering={FadeInUp.duration(200)}
      exiting={FadeOutUp.duration(300)}
      style={[
        styles.positionContainer, 
        { top: Math.max(insets.top, 50) + 10 }
      ]}
    >
      <BlurView intensity={35} tint="dark" style={[styles.blur, { borderColor: color, shadowColor: glowColor }]}>
        <View style={[styles.indicator, { backgroundColor: color }]} />
        <Ionicons name={iconName} size={22} color={color} style={styles.icon} />
        <Text style={styles.message}>{toastData.message}</Text>
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  positionContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 9999,
  },
  blur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(10, 10, 15, 0.8)',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
    elevation: 8,
  },
  indicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  icon: {
    marginRight: 10,
    marginLeft: 6,
  },
  message: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  }
});
