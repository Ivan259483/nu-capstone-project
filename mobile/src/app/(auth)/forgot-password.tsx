import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

import { Ionicons } from '@expo/vector-icons';

import { Palette } from '@/constants/theme';
import PremiumInput from '@/components/ui/PremiumInput';
import PremiumButton from '@/components/ui/PremiumButton';
import { Validation } from '@/utils/validation';
import { authService } from '@/services/api/authService';
import { apiClient, getApiErrorMessage } from '@/services/api/client';

type Step = 'email' | 'otp' | 'newPassword' | 'success';
const OTP_LENGTH = 6;
const normalizeOtp = (value: string) => value.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH);
const normalizeEmail = (value: string) => value.trim().toLowerCase();

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const otpRefs = React.useRef<(TextInput | null)[]>([]);

  const haptic = (type: 'light' | 'success' | 'error' = 'light') => {
    if (Platform.OS === 'web') return;
    if (type === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (type === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  function startCountdown() {
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  // ── Step 1: Send OTP ─────────────────────────────────────────────────────────
  async function handleSendOtp() {
    setEmailError('');
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) { setEmailError('Email is required'); return; }
    if (!Validation.isValidEmail(normalizedEmail)) { setEmailError('Please enter a valid email address'); return; }

    setLoading(true);
    haptic();
    try {
      const res = await apiClient.post('/auth/forgot-password', { email: normalizedEmail });
      if (res.data?.success) {
        setEmail(normalizedEmail);
        haptic('success');
        setStep('otp');
        startCountdown();
      } else {
        throw new Error(res.data?.message || 'Unable to send reset code.');
      }
    } catch (err: any) {
      haptic('error');
      Alert.alert('Error', getApiErrorMessage(err, 'Failed to send reset code.'));
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Verify OTP ────────────────────────────────────────────────────────
  async function handleVerifyOtp() {
    const code = normalizeOtp(otp.join(''));
    if (code.length < OTP_LENGTH) { Alert.alert('Invalid', 'Please enter the full 6-digit code.'); return; }

    setLoading(true);
    haptic();
    try {
      const res = await apiClient.post('/auth/verify-otp', { email: normalizeEmail(email), otp: code });
      if (res.data?.success) {
        haptic('success');
        setStep('newPassword');
      } else {
        throw new Error(res.data?.message || 'Incorrect code. Please try again.');
      }
    } catch (err: any) {
      haptic('error');
      Alert.alert('Verification Failed', getApiErrorMessage(err));
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  // ── Step 3: Set new password ──────────────────────────────────────────────────
  async function handleResetPassword() {
    setPasswordError('');
    setConfirmError('');

    if (!newPassword) { setPasswordError('Password is required'); return; }
    if (!Validation.isStrongPassword(newPassword)) {
      setPasswordError('Must be 8+ chars with upper, lower & number');
      return;
    }
    if (newPassword !== confirmPassword) { setConfirmError('Passwords do not match'); return; }

    setLoading(true);
    haptic();
    try {
      const res = await apiClient.post('/auth/reset-password', {
        email: normalizeEmail(email),
        otp: normalizeOtp(otp.join('')),
        newPassword,
      });
      if (res.data?.success) {
        haptic('success');
        // Also trigger Firebase password reset so Firebase Auth stays in sync
        await authService.syncFirebasePasswordReset(normalizeEmail(email));
        setStep('success');
      } else {
        throw new Error(res.data?.message || 'Failed to reset password.');
      }
    } catch (err: any) {
      haptic('error');
      Alert.alert('Reset Failed', getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // ── OTP input helpers ─────────────────────────────────────────────────────────
  function handleOtpChange(text: string, index: number) {
    const digit = normalizeOtp(text);
    const next = [...otp];
    if (digit.length > 1) {
      const chars = digit.split('');
      next.fill('');
      chars.forEach((c, i) => { if (i < OTP_LENGTH) next[i] = c; });
      setOtp(next);
      otpRefs.current[Math.min(chars.length, OTP_LENGTH - 1)]?.focus();
      return;
    }
    next[index] = digit;
    setOtp(next);
    if (digit && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();
  }

  function handleOtpKeyPress(key: string, index: number) {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      const next = [...otp];
      next[index - 1] = '';
      setOtp(next);
      otpRefs.current[index - 1]?.focus();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Back button */}
          <Animated.View entering={FadeInDown.delay(50).duration(200)} style={styles.backBtn}>
            <TouchableOpacity style={styles.backBtnInner} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.80)" />
            </TouchableOpacity>
          </Animated.View>

          {/* ── STEP: email ── */}
          {step === 'email' && (
            <>
              <Animated.View entering={FadeInDown.delay(100).duration(200)} style={styles.header}>
                <View style={styles.iconBox}>
                  <Ionicons name="lock-closed-outline" size={32} color={Palette.accent} />
                </View>
                <Text style={styles.title}>Reset Password</Text>
                <Text style={styles.subtitle}>Enter your email and we'll send a verification code to reset your password.</Text>
              </Animated.View>

              <Animated.View entering={FadeInUp.delay(200).duration(200)}>
                <PremiumInput
                  label="EMAIL ADDRESS"
                  iconName="mail-outline"
                  placeholder="name@example.com"
                  value={email}
                  onChangeText={(t: string) => { setEmail(t); setEmailError(''); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  error={emailError}
                />
              </Animated.View>

              <Animated.View entering={FadeInUp.delay(300).duration(200)} style={{ marginTop: 32 }}>
                <PremiumButton
                  title={loading ? 'SENDING CODE...' : 'SEND RESET CODE'}
                  icon={loading ? undefined : 'paper-plane-outline'}
                  onPress={handleSendOtp}
                  disabled={loading}
                />
              </Animated.View>
            </>
          )}

          {/* ── STEP: otp ── */}
          {step === 'otp' && (
            <>
              <Animated.View entering={FadeInDown.delay(100).duration(200)} style={styles.header}>
                <View style={styles.iconBox}>
                  <Ionicons name="shield-checkmark-outline" size={32} color={Palette.accent} />
                </View>
                <Text style={styles.title}>Enter Code</Text>
                <Text style={styles.subtitle}>
                  We sent a 6-digit code to{'\n'}
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{email}</Text>
                </Text>
              </Animated.View>

              <Animated.View entering={FadeInUp.delay(200).duration(200)}>
                <View style={styles.otpRow}>
                  {otp.map((digit, i) => (
                    <TextInput
                      key={i}
                      ref={r => { otpRefs.current[i] = r; }}
                      style={[styles.otpBox, digit && styles.otpBoxFilled]}
                      value={digit}
                      onChangeText={t => handleOtpChange(t, i)}
                      onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, i)}
                      keyboardType="number-pad"
                      maxLength={i === 0 ? OTP_LENGTH : 1}
                      textContentType="oneTimeCode"
                      autoFocus={i === 0}
                      selectTextOnFocus
                    />
                  ))}
                </View>
              </Animated.View>

              <Animated.View entering={FadeInUp.delay(300).duration(200)} style={{ marginTop: 32 }}>
                <PremiumButton
                  title={loading ? 'VERIFYING...' : 'VERIFY CODE'}
                  icon={loading ? undefined : 'checkmark-circle-outline'}
                  onPress={handleVerifyOtp}
                  disabled={loading || normalizeOtp(otp.join('')).length < OTP_LENGTH}
                />
              </Animated.View>

              <View style={{ alignItems: 'center', marginTop: 20 }}>
                {countdown > 0 ? (
                  <Text style={{ color: 'rgba(255,255,255,0.50)', fontSize: 13 }}>
                    Resend in <Text style={{ color: Palette.accent, fontWeight: '700' }}>{countdown}s</Text>
                  </Text>
                ) : (
                  <TouchableOpacity disabled={loading} onPress={handleSendOtp}>
                    <Text style={{ color: Palette.accent, fontSize: 14, fontWeight: '700' }}>Resend Code</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {/* ── STEP: newPassword ── */}
          {step === 'newPassword' && (
            <>
              <Animated.View entering={FadeInDown.delay(100).duration(200)} style={styles.header}>
                <View style={styles.iconBox}>
                  <Ionicons name="key-outline" size={32} color={Palette.accent} />
                </View>
                <Text style={styles.title}>New Password</Text>
                <Text style={styles.subtitle}>Choose a strong password for your account.</Text>
              </Animated.View>

              <Animated.View entering={FadeInUp.delay(200).duration(200)}>
                <PremiumInput
                  label="NEW PASSWORD"
                  iconName="lock-closed-outline"
                  placeholder="Min. 8 chars, 1 upper, 1 lower, 1 number"
                  value={newPassword}
                  onChangeText={(t: string) => { setNewPassword(t); setPasswordError(''); }}
                  isPassword
                  error={passwordError}
                />
              </Animated.View>

              <Animated.View entering={FadeInUp.delay(280).duration(200)} style={{ marginTop: 12 }}>
                <PremiumInput
                  label="CONFIRM PASSWORD"
                  iconName="lock-closed-outline"
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChangeText={(t: string) => { setConfirmPassword(t); setConfirmError(''); }}
                  isPassword
                  error={confirmError}
                />
              </Animated.View>

              <Animated.View entering={FadeInUp.delay(360).duration(200)} style={{ marginTop: 32 }}>
                <PremiumButton
                  title={loading ? 'SAVING...' : 'RESET PASSWORD'}
                  icon={loading ? undefined : 'checkmark-done-outline'}
                  onPress={handleResetPassword}
                  disabled={loading}
                />
              </Animated.View>
            </>
          )}

          {/* ── STEP: success ── */}
          {step === 'success' && (
            <Animated.View entering={FadeInUp.delay(100).duration(300)} style={styles.successCard}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle-outline" size={52} color={Palette.accent} />
              </View>
              <Text style={styles.successTitle}>Password Reset!</Text>
              <Text style={styles.successSub}>
                Your password has been updated successfully.{'\n\n'}
                <Text style={{ color: '#F97316', fontWeight: '700' }}>Action Required: </Text>
                We also sent a <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Firebase reset link</Text> to your email. Click it to finish syncing your login, then sign in with your new password.
              </Text>
              <View style={{ marginTop: 32, width: '100%' }}>
                <PremiumButton
                  title="BACK TO LOGIN"
                  icon="log-in-outline"
                  onPress={() => router.replace('/(auth)/login')}
                />
              </View>
            </Animated.View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  scroll: {
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 100 : 80,
    paddingBottom: 60,
    flexGrow: 1,
    flex: 1,
    justifyContent: 'center',
  },
  backBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 40, left: 20, zIndex: 10 },
  backBtnInner: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center', alignItems: 'center',
  },
  header: { alignItems: 'center', marginBottom: 36 },
  iconBox: {
    width: 68, height: 68, borderRadius: 20,
    backgroundColor: 'rgba(249,115,22,0.10)',
    borderWidth: 1, borderColor: 'rgba(249,115,22,0.25)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  title: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5, marginBottom: 10 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.50)', textAlign: 'center', lineHeight: 22 },

  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 8 },
  otpBox: {
    width: 48, height: 58, borderRadius: 12,
    backgroundColor: '#111111', borderWidth: 1, borderColor: '#2a2a2a',
    color: '#FFFFFF', fontSize: 24, fontWeight: '700', textAlign: 'center',
  },
  otpBoxFilled: { borderColor: '#FF6B00', backgroundColor: 'rgba(249,115,22,0.06)' },

  successCard: {
    alignItems: 'center', padding: 28,
    backgroundColor: '#111111',
    borderRadius: 24, borderWidth: 1, borderColor: '#2a2a2a',
  },
  successIcon: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(249,115,22,0.10)',
    borderWidth: 1, borderColor: 'rgba(249,115,22,0.25)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  successTitle: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', marginBottom: 10 },
  successSub: { fontSize: 14, color: 'rgba(255,255,255,0.50)', textAlign: 'center', lineHeight: 22 },
});
