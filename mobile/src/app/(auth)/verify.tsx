import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useThemeContext';
import { useAuth } from '@/context/AuthContext';
import { apiClient, getApiErrorMessage } from '@/services/api/client';
import { Palette } from '@/constants/theme';
import PremiumButton from '@/components/ui/PremiumButton';
import { Toast } from '@/components/ui/PremiumToast';

const OTP_LENGTH = 6;
const OTP_GAP = 8;
const OTP_BOX_SIZE = Math.min(
  48,
  Math.floor((Dimensions.get('window').width - 64 - OTP_GAP * (OTP_LENGTH - 1)) / OTP_LENGTH),
);
const normalizeOtp = (value: string) => value.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH);
const normalizeEmail = (value: string) => value.trim().toLowerCase();
const firstParam = (value?: string | string[]): string =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

const maskEmail = (value: string): string => {
  const [local = '', domain = ''] = normalizeEmail(value).split('@');
  if (!local || !domain) return '';
  return `${local.slice(0, Math.min(2, local.length))}${'*'.repeat(Math.max(3, local.length - 2))}@${domain}`;
};

const formatClock = (seconds: number): string => {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
};

type Feedback = { type: 'error' | 'success' | 'info'; message: string } | null;
type BusyAction = 'verify' | 'resend' | null;

export default function VerifyScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    pendingLoginOtp,
    completeLoginOtp,
    resendLoginOtp,
    clearPendingLoginOtp,
  } = useAuth();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const email = useMemo(() => normalizeEmail(firstParam(params.email)), [params.email]);
  const isLoginOtp = Boolean(pendingLoginOtp);
  const displayedEmail = isLoginOtp
    ? pendingLoginOtp?.maskedEmail || ''
    : maskEmail(email);

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [now, setNow] = useState(Date.now());
  const [signupResendAvailableAt, setSignupResendAvailableAt] = useState(Date.now() + 60_000);
  const [feedback, setFeedback] = useState<Feedback>(() => (
    isLoginOtp
      ? { type: 'success', message: 'A verification code has been sent to your email.' }
      : null
  ));
  const otpRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isLoginOtp && !email) router.replace('/(auth)/login');
  }, [email, isLoginOtp]);

  const handleChangeAccount = useCallback(async () => {
    await clearPendingLoginOtp();
    setOtp(['', '', '', '', '', '']);
    router.replace('/(auth)/login');
  }, [clearPendingLoginOtp]);

  useFocusEffect(
    useCallback(() => {
      if (!isLoginOtp || Platform.OS === 'web') return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        void handleChangeAccount();
        return true;
      });
      return () => subscription.remove();
    }, [handleChangeAccount, isLoginOtp]),
  );

  const challengeExpired = Boolean(
    isLoginOtp && pendingLoginOtp && pendingLoginOtp.challengeExpiresAt <= now,
  );
  const codeExpired = Boolean(
    isLoginOtp && pendingLoginOtp && pendingLoginOtp.codeExpiresAt <= now,
  );
  const resendSeconds = isLoginOtp && pendingLoginOtp
    ? Math.max(0, Math.ceil((pendingLoginOtp.resendAvailableAt - now) / 1000))
    : Math.max(0, Math.ceil((signupResendAvailableAt - now) / 1000));
  const codeSeconds = isLoginOtp && pendingLoginOtp
    ? Math.max(0, Math.ceil((pendingLoginOtp.codeExpiresAt - now) / 1000))
    : 0;

  useEffect(() => {
    if (codeExpired && !challengeExpired) {
      setFeedback({ type: 'error', message: 'Verification code expired. Request a new code.' });
    }
  }, [challengeExpired, codeExpired]);

  const resetOtpInput = () => {
    setOtp(['', '', '', '', '', '']);
    requestAnimationFrame(() => otpRefs.current[0]?.focus());
  };

  async function handleVerifyOtp() {
    const token = normalizeOtp(otp.join(''));
    setFeedback(null);

    if (token.length !== OTP_LENGTH) {
      setFeedback({ type: 'error', message: 'Enter the complete 6-digit verification code.' });
      return;
    }
    if (isLoginOtp && (!pendingLoginOtp || challengeExpired)) {
      setFeedback({ type: 'error', message: 'Your verification session expired. Change account and sign in again.' });
      return;
    }
    if (isLoginOtp && codeExpired) {
      setFeedback({ type: 'error', message: 'Verification code expired. Request a new code.' });
      return;
    }
    if (!isLoginOtp && !email) {
      setFeedback({ type: 'error', message: 'The email address is missing. Return and try again.' });
      return;
    }

    setBusyAction('verify');
    try {
      if (isLoginOtp && pendingLoginOtp) {
        const result = await completeLoginOtp(
          pendingLoginOtp.userId,
          pendingLoginOtp.challengeToken,
          token,
        );
        if (!result.success) {
          throw new Error(result.message || 'Verification failed. Please try again.');
        }
        setFeedback({ type: 'success', message: 'Email verified successfully.' });
        Toast.show('Email verified successfully.', 'success');
        router.replace('/');
        return;
      }

      const response = await apiClient.post('/auth/verify-otp', { email, otp: token });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Verification failed.');
      }
      setFeedback({ type: 'success', message: 'Email verified successfully. You can now sign in.' });
      Toast.show('Email verified successfully.', 'success');
      router.replace('/(auth)/login');
    } catch (error) {
      const message = getApiErrorMessage(error, 'Verification failed. Please try again.');
      const friendlyMessage = /expired/i.test(message)
        ? 'Verification code expired. Request a new code.'
        : /too many|locked|attempt/i.test(message)
          ? message
          : /invalid|incorrect/i.test(message)
            ? 'Invalid verification code.'
            : message;
      setFeedback({ type: 'error', message: friendlyMessage });
      resetOtpInput();
    } finally {
      setBusyAction(null);
    }
  }

  function handleOtpChange(text: string, index: number) {
    const digits = normalizeOtp(text);
    const next = [...otp];

    if (digits.length > 1) {
      next.fill('');
      digits.split('').forEach((digit, position) => {
        if (position < OTP_LENGTH) next[position] = digit;
      });
      setOtp(next);
      setFeedback(null);
      otpRefs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus();
      return;
    }

    next[index] = digits;
    setOtp(next);
    setFeedback(null);
    if (digits && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();
  }

  function handleOtpKeyPress(key: string, index: number) {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      const next = [...otp];
      next[index - 1] = '';
      setOtp(next);
      otpRefs.current[index - 1]?.focus();
    }
  }

  async function handleResend() {
    if (busyAction || resendSeconds > 0) return;
    if (!isLoginOtp) {
      if (!email) {
        setFeedback({ type: 'error', message: 'Return to sign in and request a new code.' });
        return;
      }
      setBusyAction('resend');
      setFeedback({ type: 'info', message: 'Sending verification code...' });
      try {
        const response = await apiClient.post('/auth/resend-otp', { email });
        if (!response.data?.success) throw new Error(response.data?.message || 'Unable to resend code.');
        setSignupResendAvailableAt(Date.now() + 60_000);
        resetOtpInput();
        setFeedback({ type: 'success', message: 'A new code has been sent to your email.' });
      } catch (error) {
        setFeedback({ type: 'error', message: getApiErrorMessage(error, 'Unable to resend code. Please try again.') });
      } finally {
        setBusyAction(null);
      }
      return;
    }
    if (!pendingLoginOtp || challengeExpired) {
      setFeedback({
        type: 'error',
        message: 'Your verification session expired. Change account and sign in again.',
      });
      return;
    }

    setBusyAction('resend');
    setFeedback({ type: 'info', message: 'Sending verification code...' });
    try {
      const result = await resendLoginOtp(
        pendingLoginOtp.userId,
        pendingLoginOtp.challengeToken,
      );
      if (!result.success) throw new Error(result.message || 'Unable to resend code.');
      resetOtpInput();
      setFeedback({ type: 'success', message: 'A new code has been sent to your email.' });
    } catch (error) {
      const message = getApiErrorMessage(error, 'Unable to resend code. Please try again.');
      setFeedback({
        type: 'error',
        message: /network|timeout/i.test(message)
          ? 'Unable to connect. Check your internet connection and try again.'
          : message,
      });
    } finally {
      setBusyAction(null);
    }
  }

  const handleBack = () => {
    if (isLoginOtp) {
      void handleChangeAccount();
    } else {
      router.back();
    }
  };

  const feedbackColor = feedback?.type === 'error'
    ? '#FCA5A5'
    : feedback?.type === 'success'
      ? '#86EFAC'
      : '#FDBA74';

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <TouchableOpacity onPress={handleBack} style={styles.backButton} accessibilityLabel="Change account">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <Animated.View entering={FadeInDown.duration(220)} style={styles.content}>
          <View style={styles.iconCircle}>
            <Ionicons name="mail-unread-outline" size={27} color={Palette.accent} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Enter verification code</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Enter the 6-digit code sent to your email
          </Text>
          {displayedEmail ? (
            <Text style={[styles.email, { color: colors.text }]}>{displayedEmail}</Text>
          ) : null}

          <View style={styles.form}>
            <View style={styles.otpRow}>
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => { otpRefs.current[index] = ref; }}
                  style={[
                    styles.otpBox,
                    {
                      width: OTP_BOX_SIZE,
                      height: OTP_BOX_SIZE + 9,
                      backgroundColor: colors.cardAlt,
                      borderColor: feedback?.type === 'error'
                        ? 'rgba(239,68,68,0.55)'
                        : digit ? Palette.accent : colors.border,
                      color: colors.text,
                    },
                  ]}
                  value={digit}
                  onChangeText={(text) => handleOtpChange(text, index)}
                  onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, index)}
                  keyboardType="number-pad"
                  maxLength={index === 0 ? OTP_LENGTH : 1}
                  textContentType="oneTimeCode"
                  autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
                  autoFocus={index === 0}
                  selectTextOnFocus
                  editable={!busyAction && !challengeExpired}
                  accessibilityLabel={`Verification code digit ${index + 1}`}
                />
              ))}
            </View>

            <View style={styles.statusSlot}>
              {feedback ? (
                <View style={styles.feedbackRow}>
                  <Ionicons
                    name={feedback.type === 'error' ? 'alert-circle-outline' : feedback.type === 'success' ? 'checkmark-circle-outline' : 'information-circle-outline'}
                    size={16}
                    color={feedbackColor}
                  />
                  <Text style={[styles.feedbackText, { color: feedbackColor }]}>{feedback.message}</Text>
                </View>
              ) : isLoginOtp && !codeExpired ? (
                <Text style={[styles.expiryText, { color: colors.textMuted }]}>Code expires in {formatClock(codeSeconds)}</Text>
              ) : null}
            </View>

            <PremiumButton
              title={busyAction === 'verify' ? 'Verifying...' : 'Verify & Sign In'}
              icon={busyAction ? undefined : 'checkmark-circle-outline'}
              onPress={handleVerifyOtp}
              loading={busyAction === 'verify'}
              disabled={Boolean(busyAction) || challengeExpired || codeExpired || normalizeOtp(otp.join('')).length !== OTP_LENGTH}
              premiumAuth
            />

            <View style={styles.resendArea}>
              {challengeExpired ? (
                <Text style={[styles.resendCountdown, { color: colors.textMuted }]}>Verification session expired</Text>
              ) : resendSeconds > 0 ? (
                <Text style={[styles.resendCountdown, { color: colors.textMuted }]}>Resend code in {resendSeconds}s</Text>
              ) : (
                <TouchableOpacity onPress={handleResend} disabled={Boolean(busyAction)}>
                  <Text style={styles.resendLink}>
                    {busyAction === 'resend' ? 'Sending verification code...' : 'Resend OTP'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {isLoginOtp ? (
              <TouchableOpacity onPress={() => void handleChangeAccount()} style={styles.changeAccountButton}>
                <Ionicons name="person-outline" size={15} color={colors.textSecondary} />
                <Text style={[styles.changeAccountText, { color: colors.textSecondary }]}>Change account</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={[styles.helpText, { color: colors.textMuted }]}>Check Spam or All inboxes if the email does not appear.</Text>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  backButton: {
    position: 'absolute',
    left: 20,
    top: 18,
    zIndex: 2,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
    backgroundColor: 'rgba(249,115,22,0.11)',
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.26)',
  },
  title: { fontSize: 29, fontWeight: '800', textAlign: 'center', letterSpacing: -0.3 },
  subtitle: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 9 },
  email: { fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 3 },
  form: { width: '100%', maxWidth: 420, marginTop: 32 },
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: OTP_GAP },
  otpBox: {
    borderRadius: 12,
    borderWidth: 1.5,
    textAlign: 'center',
    fontSize: 21,
    fontWeight: '800',
  },
  statusSlot: { minHeight: 58, justifyContent: 'center', paddingHorizontal: 3 },
  feedbackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  feedbackText: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: '600', textAlign: 'center' },
  expiryText: { fontSize: 12, textAlign: 'center' },
  resendArea: { alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 8 },
  resendCountdown: { fontSize: 13, fontWeight: '600' },
  resendLink: { color: Palette.accent, fontSize: 14, fontWeight: '800' },
  changeAccountButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  changeAccountText: { fontSize: 13, fontWeight: '700' },
  helpText: { maxWidth: 320, marginTop: 24, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
