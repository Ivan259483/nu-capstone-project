import React, { useEffect, useState, useRef } from 'react';
import { AppState, View, StyleSheet, Text, TouchableOpacity, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useThemeContext';

export default function AppLockGuard({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const [isLocked, setIsLocked] = useState(false);
  const [appLockEnabled, setAppLockEnabled] = useState(false);
  const appState = useRef(AppState.currentState);
  const isAuthenticating = useRef(false);

  useEffect(() => {
    checkAppLockPref();

    let wasInBackground = false;

    const subscription = AppState.addEventListener('change', nextAppState => {
      // If the app goes explicitly to the background, flag it.
      if (nextAppState === 'background') {
        wasInBackground = true;
      }

      // Read transition to active
      if (nextAppState === 'active') {
        // Only prompt if it actually went to background, or if we haven't authenticated yet
        if (wasInBackground && !isAuthenticating.current) {
          wasInBackground = false; // Reset
          checkAppLockPref(true);
        } else if (!wasInBackground && appState.current === 'inactive' && !isAuthenticating.current) {
          // If it just went inactive then active (like control center), we generally don't lock.
          // BUT we still want to make sure the blur overlay is respected if it's already locked.
        }
      }

      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const checkAppLockPref = async (fromBackground = false) => {
    try {
      const lockPref = await AsyncStorage.getItem('@autospf_app_lock');
      if (lockPref === 'true') {
        setAppLockEnabled(true);
        if (fromBackground || !isLocked) {
           setIsLocked(true);
           promptBiometrics();
        }
      } else {
        setAppLockEnabled(false);
        setIsLocked(false);
      }
    } catch (e) {
      console.log('Error checking app lock pref', e);
    }
  };

  const promptBiometrics = async () => {
    if (isAuthenticating.current) return;
    try {
      isAuthenticating.current = true;
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        setIsLocked(false); // Fallback if no biometrics are available
        isAuthenticating.current = false;
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock AutoSPF+',
        fallbackLabel: 'Use Passcode',
        disableDeviceFallback: false,
      });

      if (result.success) {
        setIsLocked(false);
      }
    } catch (error) {
      console.warn('Biometric auth error', error);
    } finally {
      // Small delay to ensure AppState 'active' event is ignored while we clean up
      setTimeout(() => {
        isAuthenticating.current = false;
      }, 500);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {children}
      {isLocked && appLockEnabled && (
        <View style={[StyleSheet.absoluteFill, styles.lockScreen, { backgroundColor: '#050505' }]}>
          <View style={styles.lockIconContainer}>
            <Ionicons name="lock-closed" size={48} color="#FF6B35" />
          </View>
          <Text style={styles.lockTitle}>AutoSPF+ is Locked</Text>
          <Text style={styles.lockSubtitle}>Use Face ID / Touch ID to unlock your session.</Text>

          <TouchableOpacity style={styles.unlockBtn} onPress={promptBiometrics} activeOpacity={0.8}>
            <Ionicons name="finger-print-outline" size={20} color="#111111" />
            <Text style={styles.unlockText}>Unlock Now</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lockScreen: {
    zIndex: 9999, // Ensure it covers everything
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  lockIconContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,107,53,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  lockTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  lockSubtitle: {
    fontSize: 14,
    color: '#8A8A9A',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 22,
  },
  unlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B35',
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 16,
    gap: 10,
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  unlockText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
  },
});
