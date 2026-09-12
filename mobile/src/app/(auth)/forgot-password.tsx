import React, { useRef, useState } from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import AuthLayout from '@/components/auth/AuthLayout';
import AuthInput from '@/components/auth/AuthInput';
import AuthButton from '@/components/auth/AuthButton';
import AuthOtpInput, { type AuthOtpInputHandle } from '@/components/auth/AuthOtpInput';
import AuthStatusCard, { type AuthStatusData } from '@/components/auth/AuthStatusCard';
import { AuthColors, AuthFontFamily, AuthRadius, AuthTypography } from '@/constants/authTheme';
import { Validation } from '@/utils/validation';
import { authService } from '@/services/api/authService';
import { apiClient, getApiErrorMessage } from '@/services/api/client';
import { Haptics } from '@/utils/haptics';

type Step = 'email' | 'otp' | 'newPassword' | 'success';
const OTP_LENGTH = 6;
const normalizeOtp = (value: string) => value.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH);
const normalizeEmail = (value: string) => value.trim().toLowerCase();

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [feedback, setFeedback] = useState<AuthStatusData | null>(null);
  const otpInputRef = useRef<AuthOtpInputHandle | null>(null);

  function startCountdown() {
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  function validateEmailField(value: string) {
    const normalized = normalizeEmail(value);
    if (!normalized) return 'Email is required';
    if (!Validation.isValidEmail(normalized)) return 'Please enter a valid email address';
    return '';
  }

  function validateNewPasswordField(value: string) {
    if (!value) return 'Password is required';
    if (!Validation.isStrongPassword(value)) return 'Must be 8+ chars with upper, lower, number & special character';
    return '';
  }

  function validateConfirmField(value: string, against: string) {
    if (!value) return 'Please confirm your password';
    if (value !== against) return 'Passwords do not match';
    return '';
  }

  // ── Step 1: Send OTP ─────────────────────────────────────────────────────────
  async function handleSendOtp() {
    if (loading) return;
    const nextEmailError = validateEmailField(email);
    setEmailTouched(true);
    setEmailError(nextEmailError);
    setFeedback(null);
    if (nextEmailError) {
      Haptics.formSubmitError();
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    setLoading(true);
    try {
      const res = await apiClient.post('/auth/forgot-password', { email: normalizedEmail });
      if (res.data?.success) {
        setEmail(normalizedEmail);
        setStep('otp');
        setFeedback({
          type: 'success',
          title: 'Verification code sent',
          message: 'Check your email for the 6-digit reset code.',
        });
        startCountdown();
      } else {
        throw new Error(res.data?.message || 'Unable to send reset code.');
      }
    } catch (err: any) {
      Haptics.formSubmitError();
      setFeedback({
        type: 'error',
        title: 'Unable to send code',
        message: getApiErrorMessage(err, 'Please try again.'),
      });
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Verify OTP ────────────────────────────────────────────────────────
  async function handleVerifyOtp() {
    if (loading) return;
    const code = normalizeOtp(otp);
    setFeedback(null);
    if (code.length < OTP_LENGTH) {
      Haptics.formSubmitError();
      setFeedback({
        type: 'error',
        title: 'Complete the code',
        message: 'Enter all 6 digits to continue.',
      });
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post('/auth/verify-reset-otp', { email: normalizeEmail(email), otp: code });
      if (res.data?.success) {
        setStep('newPassword');
        setFeedback({
          type: 'success',
          title: 'Code verified',
          message: 'Choose a new password for your account.',
        });
      } else {
        throw new Error(res.data?.message || 'Incorrect code. Please try again.');
      }
    } catch (err: any) {
      Haptics.formSubmitError();
      setFeedback({
        type: 'error',
        title: 'Incorrect verification code',
        message: getApiErrorMessage(err, 'Check the code and try again.'),
      });
      setOtp('');
      otpInputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  // ── Step 3: Set new password ──────────────────────────────────────────────────
  async function handleResetPassword() {
    if (loading) return;
    const nextPasswordError = validateNewPasswordField(newPassword);
    const nextConfirmError = validateConfirmField(confirmPassword, newPassword);
    setPasswordTouched(true);
    setConfirmTouched(true);
    setPasswordError(nextPasswordError);
    setConfirmError(nextConfirmError);
    setFeedback(null);
    if (nextPasswordError || nextConfirmError) {
      Haptics.formSubmitError();
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post('/auth/reset-password', {
        email: normalizeEmail(email),
        otp: normalizeOtp(otp),
        newPassword,
      });
      if (res.data?.success) {
        // Also trigger Firebase password reset so Firebase Auth stays in sync
        await authService.syncFirebasePasswordReset(normalizeEmail(email));
        setStep('success');
      } else {
        throw new Error(res.data?.message || 'Failed to reset password.');
      }
    } catch (err: any) {
      Haptics.formSubmitError();
      setFeedback({
        type: 'error',
        title: 'Unable to reset password',
        message: getApiErrorMessage(err, 'Please try again.'),
      });
    } finally {
      setLoading(false);
    }
  }

  const stepConfig: Record<Step, { title?: string; subtitle?: string }> = {
    email: {
      title: 'Reset password',
      subtitle: "Enter your email and we'll send a verification code to reset your password.",
    },
    otp: {
      title: 'Enter code',
      subtitle: `We sent a 6-digit code to ${email}`,
    },
    newPassword: {
      title: 'New password',
      subtitle: 'Choose a strong password for your account.',
    },
    success: {},
  };

  const actions = (() => {
    if (step === 'email') {
      return (
        <AuthButton
          title={loading ? 'Sending code…' : 'Send reset code'}
          onPress={handleSendOtp}
          disabled={loading}
          loading={loading}
          appearance="loginBrand"
        />
      );
    }
    if (step === 'otp') {
      return (
        <View style={{ gap: 16 }}>
          <AuthButton
            title={loading ? 'Verifying…' : 'Verify code'}
            onPress={handleVerifyOtp}
            disabled={loading || normalizeOtp(otp).length < OTP_LENGTH}
            loading={loading}
            appearance="loginBrand"
          />
          <View style={styles.resendRow}>
            {countdown > 0 ? (
              <Text style={styles.resendMuted}>Resend in {countdown}s</Text>
            ) : (
              <TouchableOpacity disabled={loading} onPress={handleSendOtp}>
                <Text style={styles.resendLink}>Resend code</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }
    if (step === 'newPassword') {
      return (
        <AuthButton
          title={loading ? 'Saving…' : 'Reset password'}
          onPress={handleResetPassword}
          disabled={loading}
          loading={loading}
          appearance="loginBrand"
        />
      );
    }
    return (
      <AuthButton
        title="Back to sign in"
        onPress={() => router.replace('/(auth)/login')}
        appearance="loginBrand"
      />
    );
  })();

  return (
    <AuthLayout
      appearance="loginBrand"
      showBack
      onBack={() => router.back()}
      title={stepConfig[step].title}
      subtitle={stepConfig[step].subtitle}
    >
      {feedback ? <AuthStatusCard {...feedback} style={styles.feedbackCard} /> : null}

      {step === 'email' && (
        <Animated.View entering={FadeInUp.duration(200)}>
          <AuthInput
            label="Email address"
            placeholder="name@example.com"
            value={email}
            onChangeText={(t) => { setEmail(t); setEmailError(''); }}
            onBlur={() => { setEmailTouched(true); setEmailError(validateEmailField(email)); }}
            keyboardType="email-address"
            autoCapitalize="none"
            textContentType="emailAddress"
            autoComplete="email"
            error={emailTouched ? emailError : ''}
            appearance="loginBrand"
            reserveErrorSpace
          />
        </Animated.View>
      )}

      {step === 'otp' && (
        <Animated.View entering={FadeInUp.duration(200)} style={{ alignItems: 'center' }}>
          <AuthOtpInput
            ref={otpInputRef}
            value={otp}
            onChangeText={setOtp}
            error={feedback?.type === 'error'}
            disabled={loading}
          />
        </Animated.View>
      )}

      {step === 'newPassword' && (
        <Animated.View entering={FadeInUp.duration(200)}>
          <AuthInput
            label="New password"
            placeholder="Min. 8 chars, 1 upper, 1 lower, 1 number"
            value={newPassword}
            onChangeText={(t) => {
              setNewPassword(t);
              setPasswordError('');
              setConfirmError('');
            }}
            onBlur={() => { setPasswordTouched(true); setPasswordError(validateNewPasswordField(newPassword)); }}
            isPassword
            textContentType="newPassword"
            autoComplete="new-password"
            error={passwordTouched ? passwordError : ''}
            appearance="loginBrand"
            reserveErrorSpace
          />
          <AuthInput
            label="Confirm password"
            placeholder="Re-enter your new password"
            value={confirmPassword}
            onChangeText={(t) => { setConfirmPassword(t); setConfirmError(''); }}
            onBlur={() => { setConfirmTouched(true); setConfirmError(validateConfirmField(confirmPassword, newPassword)); }}
            isPassword
            textContentType="newPassword"
            autoComplete="new-password"
            error={confirmTouched ? confirmError : ''}
            appearance="loginBrand"
            reserveErrorSpace
          />
        </Animated.View>
      )}

      {step === 'success' && (
        <Animated.View entering={FadeInUp.duration(260)} style={styles.successCard}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={26} color={AuthColors.textPrimary} />
          </View>
          <Text style={styles.successTitle}>Password reset</Text>
          <Text style={styles.successSub}>
            Your password has been updated successfully.{'\n\n'}
            <Text style={styles.successEmphasis}>Action required: </Text>
            we also sent a password reset link to your email. Open it to finish syncing your
            login, then sign in with your new password.
          </Text>
        </Animated.View>
      )}

      <View
        style={[
          styles.actionSlot,
          step === 'otp' && styles.actionSlotAfterOtp,
          step === 'success' && styles.actionSlotAfterSuccess,
        ]}
      >
        {actions}
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  feedbackCard: { marginBottom: 20 },
  actionSlot: { marginTop: 12 },
  actionSlotAfterOtp: { marginTop: 32 },
  actionSlotAfterSuccess: { marginTop: 30 },
  resendRow: { alignItems: 'center' },
  resendMuted: { color: AuthColors.textTertiary, fontFamily: AuthFontFamily.regular, fontSize: 13 },
  resendLink: { color: AuthColors.textPrimary, fontFamily: AuthFontFamily.medium, fontSize: 14 },
  successCard: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: AuthColors.card,
    borderRadius: AuthRadius.card,
    borderWidth: 1,
    borderColor: AuthColors.borderHairline,
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: AuthRadius.full,
    backgroundColor: AuthColors.elevated,
    borderWidth: 1,
    borderColor: AuthColors.borderHairline,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  successTitle: {
    fontFamily: AuthTypography.h1.fontFamily,
    fontSize: 22,
    color: AuthColors.textPrimary,
    marginBottom: 10,
  },
  successSub: {
    fontFamily: AuthFontFamily.regular,
    fontSize: 14,
    color: AuthColors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  successEmphasis: {
    color: AuthColors.textPrimary,
    fontFamily: AuthFontFamily.medium,
  },
});
