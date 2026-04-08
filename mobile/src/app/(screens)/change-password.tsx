/**
 * Change Password Screen
 * Premium full-screen modal with animated inputs and backend sync
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';
import { authService } from '@/services/api/authService';
import { getApiErrorMessage } from '@/services/api/client';
import { Palette, BorderRadius } from '@/constants/theme';
import PremiumInput from '@/components/ui/PremiumInput';
import PremiumButton from '@/components/ui/PremiumButton';
import { Toast } from '@/components/ui/PremiumToast';

const SURFACE = '#111114';
const BORDER = '#2A2A30';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Validation errors
  const [currentError, setCurrentError] = useState('');
  const [newError, setNewError] = useState('');
  const [confirmError, setConfirmError] = useState('');

  const validateForm = (): boolean => {
    let hasError = false;
    setCurrentError('');
    setNewError('');
    setConfirmError('');

    if (!currentPassword) {
      setCurrentError('Current password is required');
      hasError = true;
    }

    if (!newPassword) {
      setNewError('New password is required');
      hasError = true;
    } else if (newPassword.length < 8) {
      setNewError('Must be at least 8 characters');
      hasError = true;
    } else if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setNewError('Must contain upper, lower & numbers');
      hasError = true;
    }

    if (!confirmPassword) {
      setConfirmError('Please confirm your new password');
      hasError = true;
    } else if (newPassword !== confirmPassword) {
      setConfirmError('Passwords do not match');
      hasError = true;
    }

    if (currentPassword && newPassword && currentPassword === newPassword) {
      setNewError('New password must be different from current');
      hasError = true;
    }

    return !hasError;
  };

  const handleChangePassword = async () => {
    if (!validateForm()) return;
    if (!user) {
      Toast.show('Authentication required. Please re-login.', 'error');
      return;
    }

    setLoading(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      await authService.reauthenticateAndUpdatePassword(user, currentPassword, newPassword);

      setSuccess(true);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Toast.show('Password updated successfully!', 'success');

      // Auto-navigate back after a short delay
      setTimeout(() => {
        router.back();
      }, 1500);
    } catch (err: any) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      const message = getApiErrorMessage(err);

      // Handle specific Firebase errors
      if (message.includes('wrong-password') || message.includes('invalid-credential') || message.includes('Incorrect')) {
        setCurrentError('Current password is incorrect');
      } else if (message.includes('weak-password')) {
        setNewError('Password is too weak');
      } else if (message.includes('too-many-requests') || message.includes('Too many')) {
        Toast.show('Too many attempts. Please try again later.', 'error');
      } else {
        Toast.show(message || 'Failed to change password', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const triggerHapticLight = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            triggerHapticLight();
            router.back();
          }}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={18} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change Password</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Shield Icon */}
          <Animated.View
            entering={FadeInDown.delay(100).springify().damping(16).stiffness(120)}
            style={styles.iconArea}
          >
            <LinearGradient
              colors={[Palette.accent, Palette.accentDark]}
              style={styles.shieldIcon}
            >
              <Ionicons name="shield-checkmark" size={32} color="#fff" />
            </LinearGradient>
            <Text style={styles.descTitle}>Update Your Password</Text>
            <Text style={styles.descSub}>
              Secure your account with a new password. It must be at least 8 characters with uppercase, lowercase, and numbers.
            </Text>
          </Animated.View>

          {/* Success State */}
          {success ? (
            <Animated.View
              entering={FadeInUp.delay(100).springify()}
              style={styles.successContainer}
            >
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={64} color={Palette.success} />
              </View>
              <Text style={styles.successTitle}>Password Changed!</Text>
              <Text style={styles.successSub}>
                Your password has been updated successfully. Redirecting...
              </Text>
            </Animated.View>
          ) : (
            /* Form */
            <View style={styles.formContainer}>
              <Animated.View entering={FadeInUp.delay(200).springify().damping(16).stiffness(120)}>
                <PremiumInput
                  label="CURRENT PASSWORD"
                  iconName="lock-closed-outline"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChangeText={(t) => {
                    setCurrentPassword(t);
                    setCurrentError('');
                  }}
                  isPassword
                  error={currentError}
                />
              </Animated.View>

              <Animated.View entering={FadeInUp.delay(300).springify().damping(16).stiffness(120)}>
                <PremiumInput
                  label="NEW PASSWORD"
                  iconName="key-outline"
                  placeholder="Min. 8 chars, upper, lower, numbers"
                  value={newPassword}
                  onChangeText={(t) => {
                    setNewPassword(t);
                    setNewError('');
                  }}
                  isPassword
                  error={newError}
                />
              </Animated.View>

              <Animated.View entering={FadeInUp.delay(400).springify().damping(16).stiffness(120)}>
                <PremiumInput
                  label="CONFIRM NEW PASSWORD"
                  iconName="checkmark-circle-outline"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChangeText={(t) => {
                    setConfirmPassword(t);
                    setConfirmError('');
                  }}
                  isPassword
                  error={confirmError}
                />
              </Animated.View>

              <Animated.View
                entering={FadeInUp.delay(500).springify().damping(15).stiffness(100)}
                style={{ marginTop: 12 }}
              >
                <PremiumButton
                  title={loading ? 'UPDATING...' : 'UPDATE PASSWORD'}
                  icon={loading ? undefined : 'shield-checkmark-outline'}
                  onPress={handleChangePassword}
                  disabled={loading}
                />
              </Animated.View>

              {/* Security tip */}
              <Animated.View
                entering={FadeInUp.delay(600).springify()}
                style={styles.tipContainer}
              >
                <Ionicons name="information-circle" size={16} color="#555" />
                <Text style={styles.tipText}>
                  For security, you'll need to re-authenticate with your current password before changing it.
                </Text>
              </Animated.View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
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
  content: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
  },

  // Shield icon area
  iconArea: { alignItems: 'center', marginBottom: 40 },
  shieldIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  descTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  descSub: {
    fontSize: 14,
    color: '#8A8A9A',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 22,
    paddingHorizontal: 10,
  },

  formContainer: { width: '100%' },

  // Tip
  tipContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 28,
    paddingHorizontal: 4,
  },
  tipText: {
    fontSize: 12,
    color: '#555',
    lineHeight: 18,
    flex: 1,
  },

  // Success
  successContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  successIcon: { marginBottom: 20 },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Palette.success,
    marginBottom: 8,
  },
  successSub: {
    fontSize: 14,
    color: '#8A8A9A',
    textAlign: 'center',
    lineHeight: 22,
  },
});
