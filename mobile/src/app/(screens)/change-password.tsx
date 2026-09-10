/**
 * Change Password Screen
 * Premium full-screen modal with animated inputs and backend sync
 */

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  LayoutChangeEvent,
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
import { Palette } from '@/constants/theme';
import PremiumInput from '@/components/ui/PremiumInput';
import PremiumButton from '@/components/ui/PremiumButton';
import PasswordRequirementsCard from '@/components/ui/PasswordRequirementsCard';
import { Toast } from '@/components/ui/PremiumToast';
import { isPasswordValid, getPasswordRequirementsMessage, passwordsMatch } from '@/utils/validation';

const SURFACE = '#111114';
const BORDER = '#2A2A30';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // `user` = Firebase user (null for OTP/email-password accounts)
  // `token` = JWT present for all logged-in users regardless of auth method
  const { user, token } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newFocused, setNewFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Validation errors
  const [currentError, setCurrentError] = useState('');
  const [newError, setNewError] = useState('');
  const [confirmError, setConfirmError] = useState('');

  // Derived, live validation state (single source of truth shared by the
  // requirements card, the field states below, and the submit guard).
  const newPasswordValid = isPasswordValid(newPassword);
  // Only flag a mismatch once a typed character actually diverges from the
  // new password, rather than on every keystroke of a still-correct prefix —
  // catches real typos immediately without nagging mid-entry.
  const confirmIsValidPrefix = newPassword.startsWith(confirmPassword);
  const confirmMismatch = confirmPassword.length > 0 && !confirmIsValidPrefix;
  const confirmMatches = confirmPassword.length > 0 && confirmPassword === newPassword;
  const showRequirementsCard = newFocused || (newPassword.length > 0 && !newPasswordValid);
  const confirmDisplayError = confirmError || (confirmMismatch ? "Passwords don't match." : '');
  const canSubmit = currentPassword.length > 0 && newPasswordValid && confirmMatches && !loading;

  // Scroll-into-view targets for the three fields, captured on layout so an
  // invalid submit can bring the first offending field into view. These refs
  // are only ever written from the onLayout event (after render) and read
  // from the submit handler — never during render itself.
  const scrollRef = useRef<ScrollView>(null);
  const fieldOffsets = useRef({ current: 0, new: 0, confirm: 0 });
  const captureOffset = (field: keyof typeof fieldOffsets.current) => (e: LayoutChangeEvent) => {
    // eslint-disable-next-line react-hooks/refs -- write happens inside the onLayout event, not during render
    fieldOffsets.current[field] = e.nativeEvent.layout.y;
  };
  const scrollToField = (field: keyof typeof fieldOffsets.current) => {
    scrollRef.current?.scrollTo({ y: Math.max(fieldOffsets.current[field] - 24, 0), animated: true });
  };

  const validateForm = (): boolean => {
    setCurrentError('');
    setNewError('');
    setConfirmError('');

    let firstInvalidField: keyof typeof fieldOffsets.current | null = null;

    if (!currentPassword) {
      setCurrentError('Current password is required');
      firstInvalidField = 'current';
    }

    if (!newPassword) {
      setNewError('New password is required');
      firstInvalidField = firstInvalidField ?? 'new';
    } else if (!newPasswordValid) {
      setNewError(getPasswordRequirementsMessage(newPassword));
      firstInvalidField = firstInvalidField ?? 'new';
    } else if (currentPassword && currentPassword === newPassword) {
      setNewError('New password must be different from your current password');
      firstInvalidField = firstInvalidField ?? 'new';
    }

    if (!confirmPassword) {
      setConfirmError('Please confirm your new password');
      firstInvalidField = firstInvalidField ?? 'confirm';
    } else if (!passwordsMatch(newPassword, confirmPassword)) {
      setConfirmError("Passwords don't match.");
      firstInvalidField = firstInvalidField ?? 'confirm';
    }

    if (firstInvalidField) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      scrollToField(firstInvalidField);
      return false;
    }

    return true;
  };

  const handleChangePassword = async () => {
    if (!validateForm()) return;

    // Must have either a JWT (email/password users) or a Firebase session (social users)
    if (!token && !user) {
      Toast.show('Session expired. Please re-login.', 'error');
      router.replace('/(auth)/login');
      return;
    }

    setLoading(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      if (user) {
        // Firebase / social user — re-authenticate with Firebase then update
        await authService.reauthenticateAndUpdatePassword(user, currentPassword, newPassword);
      } else {
        // Email/password user — call backend directly with JWT (no Firebase account exists)
        await authService.changePasswordDirect(currentPassword, newPassword);
      }

      setSuccess(true);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Toast.show('Password updated successfully!', 'success');

      setTimeout(() => {
        router.back();
      }, 1500);
    } catch (err: any) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      const message = getApiErrorMessage(err);

      if (
        message.includes('incorrect') ||
        message.includes('wrong-password') ||
        message.includes('invalid-credential') ||
        message.includes('Incorrect')
      ) {
        setCurrentError('Current password is incorrect');
      } else if (message.includes('weak-password')) {
        setNewError('Password is too weak');
      } else if (message.includes('too-many-requests') || message.includes('Too many')) {
        Toast.show('Too many attempts. Please try again later.', 'error');
      } else if (message.includes('must contain')) {
        setNewError(message);
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
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Shield Icon */}
          <Animated.View
            entering={FadeInDown.delay(100).duration(200)}
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
              Secure your account with a new password. It must be at least 8 characters and include uppercase, lowercase, a number, and a special character.
            </Text>
          </Animated.View>

          {/* Success State */}
          {success ? (
            <Animated.View
              entering={FadeInUp.delay(100).duration(200)}
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
              <Animated.View
                entering={FadeInUp.delay(200).duration(200)}
                onLayout={captureOffset('current')}
              >
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

              <Animated.View
                entering={FadeInUp.delay(300).duration(200)}
                onLayout={captureOffset('new')}
              >
                <PremiumInput
                  label="NEW PASSWORD"
                  iconName="key-outline"
                  placeholder="8+ chars, upper, lower, number & special"
                  value={newPassword}
                  onChangeText={(t) => {
                    setNewPassword(t);
                    setNewError('');
                  }}
                  onFocus={() => setNewFocused(true)}
                  onBlur={() => {
                    setNewFocused(false);
                    if (newPassword.length > 0 && !newPasswordValid) {
                      setNewError(getPasswordRequirementsMessage(newPassword));
                    }
                  }}
                  isPassword
                  error={newError}
                  containerStyle={showRequirementsCard ? { marginBottom: 8 } : undefined}
                />
                {showRequirementsCard ? <PasswordRequirementsCard password={newPassword} /> : null}
              </Animated.View>

              <Animated.View
                entering={FadeInUp.delay(400).duration(200)}
                onLayout={captureOffset('confirm')}
              >
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
                  error={confirmDisplayError}
                  containerStyle={confirmMatches ? { marginBottom: 4 } : undefined}
                />
                {confirmMatches ? (
                  <Animated.View entering={FadeInDown.duration(160)} style={styles.matchRow}>
                    <Ionicons name="checkmark-circle" size={14} color={Palette.success} />
                    <Text style={styles.matchText}>Passwords match</Text>
                  </Animated.View>
                ) : null}
              </Animated.View>

              <Animated.View
                entering={FadeInUp.delay(500).duration(200)}
                style={{ marginTop: 12 }}
              >
                <PremiumButton
                  title={loading ? 'UPDATING...' : 'UPDATE PASSWORD'}
                  icon={loading ? undefined : 'shield-checkmark-outline'}
                  onPress={handleChangePassword}
                  disabled={!canSubmit}
                  loading={loading}
                />
              </Animated.View>

              {/* Security tip */}
              <Animated.View
                entering={FadeInUp.delay(600).duration(200)}
                style={styles.tipContainer}
              >
                <Ionicons name="information-circle" size={16} color="#555" />
                <Text style={styles.tipText}>
                  For security, you’ll need to re-authenticate with your current password before changing it.
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
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
    marginLeft: 4,
  },
  matchText: {
    fontSize: 12,
    fontWeight: '600',
    color: Palette.success,
  },

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
