import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type KeyboardEvent,
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
import AuthFeedback, { type AuthFeedbackData } from '@/components/auth/AuthFeedback';
import { Haptics } from '@/utils/haptics';

const OTP_LENGTH = 6;
const OTP_GAP = 8;
const OTP_BOX_SIZE = Math.min(
  48,
  Math.floor((Dimensions.get('window').width - 64 - OTP_GAP * (OTP_LENGTH - 1)) / OTP_LENGTH),
);
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));
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

type BusyAction = 'verify' | 'resend' | null;

export default function VerifyScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
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

  const [otp, setOtp] = useState('');
  const [otpFocused, setOtpFocused] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(() => (
    Platform.OS === 'web' ? 0 : (Keyboard.metrics()?.height ?? 0)
  ));
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [now, setNow] = useState(Date.now());
  const [signupResendAvailableAt, setSignupResendAvailableAt] = useState(Date.now() + 60_000);
  const [feedback, setFeedback] = useState<AuthFeedbackData | null>(() => (
    isLoginOtp || Boolean(email)
      ? {
          type: 'success',
          title: 'Verification code sent',
          message: 'Check your email for the 6-digit code.',
        }
      : null
  ));
  const otpInputRef = useRef<TextInput | null>(null);
  const previousOtpLengthRef = useRef(0);
  const restingWindowHeightRef = useRef(windowHeight);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const handleKeyboardShow = (event: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(event);
      setKeyboardHeight(Math.max(0, event.endCoordinates.height));
    };
    const handleKeyboardHide = (event: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(event);
      setKeyboardHeight(0);
    };
    const showSubscription = Keyboard.addListener(showEvent, handleKeyboardShow);
    const hideSubscription = Keyboard.addListener(hideEvent, handleKeyboardHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || keyboardHeight > 0) return;
    restingWindowHeightRef.current = Math.max(restingWindowHeightRef.current, windowHeight);
  }, [keyboardHeight, windowHeight]);

  useEffect(() => {
    if (!isLoginOtp && !email) router.replace('/(auth)/login');
  }, [email, isLoginOtp]);

  const handleChangeAccount = useCallback(async () => {
    await clearPendingLoginOtp();
    setOtp('');
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
      setFeedback({
        type: 'error',
        title: 'Verification code expired',
        message: 'Request a new code to continue.',
      });
    }
  }, [challengeExpired, codeExpired]);

  const triggerOutcomeHaptic = (type: 'success' | 'error') => {
    Haptics.notify(type);
  };

  const resetOtpInput = () => {
    previousOtpLengthRef.current = 0;
    setOtp('');
    otpInputRef.current?.focus();
  };

  async function handleVerifyOtp() {
    const token = otp;
    setFeedback(null);

    if (token.length !== OTP_LENGTH) {
      triggerOutcomeHaptic('error');
      setFeedback({
        type: 'error',
        title: 'Complete the code',
        message: 'Enter all 6 digits to continue.',
      });
      return;
    }
    if (isLoginOtp && (!pendingLoginOtp || challengeExpired)) {
      triggerOutcomeHaptic('error');
      setFeedback({
        type: 'error',
        title: 'Verification session expired',
        message: 'Change account and sign in again.',
      });
      return;
    }
    if (isLoginOtp && codeExpired) {
      triggerOutcomeHaptic('error');
      setFeedback({
        type: 'error',
        title: 'Verification code expired',
        message: 'Request a new code to continue.',
      });
      return;
    }
    if (!isLoginOtp && !email) {
      triggerOutcomeHaptic('error');
      setFeedback({
        type: 'error',
        title: 'Email address missing',
        message: 'Return to sign in and try again.',
      });
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
        triggerOutcomeHaptic('success');
        setFeedback({
          type: 'success',
          title: 'Email verified',
          message: 'Signing you in securely.',
        });
        router.replace('/');
        return;
      }

      const response = await apiClient.post('/auth/verify-otp', { email, otp: token });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Verification failed.');
      }
      triggerOutcomeHaptic('success');
      setFeedback({
        type: 'success',
        title: 'Email verified',
        message: 'You can now sign in to your account.',
      });
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
      triggerOutcomeHaptic('error');
      setFeedback({
        type: 'error',
        title: /expired/i.test(friendlyMessage)
          ? 'Verification code expired'
          : /too many|locked|attempt/i.test(friendlyMessage)
            ? 'Unable to verify code'
            : 'Incorrect verification code',
        message: friendlyMessage,
      });
      resetOtpInput();
    } finally {
      setBusyAction(null);
    }
  }

  function handleOtpChange(text: string) {
    const nextOtp = normalizeOtp(text);
    if (previousOtpLengthRef.current < OTP_LENGTH && nextOtp.length === OTP_LENGTH) {
      Haptics.impact('light');
    }
    previousOtpLengthRef.current = nextOtp.length;
    setOtp(nextOtp);
    setFeedback(null);
  }

  async function handleResend() {
    if (busyAction || resendSeconds > 0) return;
    if (!isLoginOtp) {
      if (!email) {
        setFeedback({
          type: 'error',
          title: 'Email address missing',
          message: 'Return to sign in and request a new code.',
        });
        return;
      }
      setBusyAction('resend');
      setFeedback({
        type: 'info',
        title: 'Sending verification code…',
        message: 'Keep this screen open.',
      });
      try {
        const response = await apiClient.post('/auth/resend-otp', { email });
        if (!response.data?.success) throw new Error(response.data?.message || 'Unable to resend code.');
        setSignupResendAvailableAt(Date.now() + 60_000);
        resetOtpInput();
        triggerOutcomeHaptic('success');
        setFeedback({
          type: 'success',
          title: 'Verification code sent',
          message: 'Check your email for the new 6-digit code.',
        });
      } catch (error) {
        triggerOutcomeHaptic('error');
        setFeedback({
          type: 'error',
          title: 'Unable to send code',
          message: getApiErrorMessage(error, 'Please try again.'),
        });
      } finally {
        setBusyAction(null);
      }
      return;
    }
    if (!pendingLoginOtp || challengeExpired) {
      setFeedback({
        type: 'error',
        title: 'Verification session expired',
        message: 'Change account and sign in again.',
      });
      return;
    }

    setBusyAction('resend');
    setFeedback({
      type: 'info',
      title: 'Sending verification code…',
      message: 'Keep this screen open.',
    });
    try {
      const result = await resendLoginOtp(
        pendingLoginOtp.userId,
        pendingLoginOtp.challengeToken,
      );
      if (!result.success) throw new Error(result.message || 'Unable to resend code.');
      resetOtpInput();
      triggerOutcomeHaptic('success');
      setFeedback({
        type: 'success',
        title: 'Verification code sent',
        message: 'Check your email for the new 6-digit code.',
      });
    } catch (error) {
      const message = getApiErrorMessage(error, 'Unable to resend code. Please try again.');
      triggerOutcomeHaptic('error');
      setFeedback({
        type: 'error',
        title: 'Unable to send code',
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

  // The height fallback also covers older Android versions where keyboard
  // events can be omitted while the activity uses adjustResize.
  const androidWindowIsResized = Platform.OS === 'android'
    && windowHeight < restingWindowHeightRef.current - 100;
  const keyboardVisible = keyboardHeight > 0 || androidWindowIsResized;
  // Android already resizes this window (softwareKeyboardLayoutMode="resize").
  // iOS overlays the keyboard, so its height is reserved by KeyboardAvoidingView.
  const availableHeight = Math.max(
    0,
    windowHeight - insets.top - (Platform.OS === 'ios' ? keyboardHeight : 0),
  );
  const keyboardLayout = useMemo(() => {
    const tight = availableHeight < 460;
    const compact = availableHeight < 560;

    return {
      topBreathingRoom: clamp(availableHeight * 0.07, 24, 40),
      iconGap: tight ? 10 : compact ? 14 : 18,
      subtitleGap: tight ? 5 : compact ? 7 : 9,
      emailGap: tight ? 1 : compact ? 2 : 3,
      formGap: tight ? 14 : compact ? 20 : 26,
      statusHeight: tight ? 60 : compact ? 70 : 78,
      statusPadding: tight ? 4 : compact ? 6 : 8,
      resendHeight: tight ? 34 : compact ? 40 : 44,
      resendGap: tight ? 0 : compact ? 4 : 6,
      changeAccountPadding: tight ? 6 : compact ? 7 : 8,
      bottomClearance: tight ? 16 : compact ? 18 : 20,
      showHelp: availableHeight >= 580,
    };
  }, [availableHeight]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
        style={styles.keyboardView}
      >
        <TouchableOpacity onPress={handleBack} style={styles.backButton} accessibilityLabel="Change account">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <Animated.View
          entering={FadeInDown.duration(220)}
          style={[
            styles.content,
            keyboardVisible && styles.contentKeyboardOpen,
            keyboardVisible && {
              paddingTop: keyboardLayout.topBreathingRoom,
              paddingBottom: keyboardLayout.bottomClearance,
            },
          ]}
        >
          <View
            style={[
              styles.iconCircle,
              keyboardVisible && { marginBottom: keyboardLayout.iconGap },
            ]}
          >
            <Ionicons name="mail-unread-outline" size={27} color={Palette.accent} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Enter verification code</Text>
          <Text
            style={[
              styles.subtitle,
              { color: colors.textSecondary },
              keyboardVisible && { marginTop: keyboardLayout.subtitleGap },
            ]}
          >
            Enter the 6-digit code sent to your email
          </Text>
          {displayedEmail ? (
            <Text
              style={[
                styles.email,
                { color: colors.text },
                keyboardVisible && { marginTop: keyboardLayout.emailGap },
              ]}
            >
              {displayedEmail}
            </Text>
          ) : null}

          <View
            style={[
              styles.form,
              keyboardVisible && { marginTop: keyboardLayout.formGap },
            ]}
          >
            <View style={styles.otpInputContainer}>
              <View
                style={styles.otpRow}
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {Array.from({ length: OTP_LENGTH }, (_, index) => {
                  const digit = otp[index] ?? '';
                  const isActive = otpFocused && index === Math.min(otp.length, OTP_LENGTH - 1);

                  return (
                    <View
                      key={index}
                      style={[
                        styles.otpBox,
                        {
                          width: OTP_BOX_SIZE,
                          height: OTP_BOX_SIZE + 9,
                          backgroundColor: colors.cardAlt,
                          borderColor: feedback?.type === 'error'
                            ? 'rgba(239,68,68,0.55)'
                            : digit || isActive ? Palette.accent : colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.otpDigit, { color: colors.text }]}>{digit}</Text>
                    </View>
                  );
                })}
              </View>
              <TextInput
                ref={otpInputRef}
                style={styles.otpNativeInput}
                value={otp}
                onChangeText={handleOtpChange}
                onFocus={() => setOtpFocused(true)}
                onBlur={() => setOtpFocused(false)}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
                autoFocus
                selection={{ start: otp.length, end: otp.length }}
                selectionColor="transparent"
                caretHidden
                editable={!busyAction && !challengeExpired}
                accessibilityLabel="6-digit verification code"
                accessibilityHint="Enter or paste the code sent to your email"
              />
            </View>

            <View
              style={[
                styles.statusSlot,
                keyboardVisible && {
                  minHeight: keyboardLayout.statusHeight,
                  paddingVertical: keyboardLayout.statusPadding,
                },
              ]}
            >
              {feedback ? (
                <AuthFeedback {...feedback} />
              ) : isLoginOtp && !codeExpired ? (
                <Text style={[styles.expiryText, { color: colors.textMuted }]}>Code expires in {formatClock(codeSeconds)}</Text>
              ) : null}
            </View>

            <PremiumButton
              title={busyAction === 'verify' ? 'Verifying…' : 'Verify & Sign In'}
              icon={busyAction ? undefined : 'checkmark-circle-outline'}
              onPress={handleVerifyOtp}
              loading={busyAction === 'verify'}
              disabled={Boolean(busyAction) || challengeExpired || codeExpired || otp.length !== OTP_LENGTH}
              premiumAuth
            />

            <View
              style={[
                styles.resendArea,
                keyboardVisible && {
                  minHeight: keyboardLayout.resendHeight,
                  marginTop: keyboardLayout.resendGap,
                },
              ]}
            >
              {challengeExpired ? (
                <Text style={[styles.resendCountdown, { color: colors.textMuted }]}>Verification session expired</Text>
              ) : resendSeconds > 0 ? (
                <Text style={[styles.resendCountdown, { color: colors.textMuted }]}>Resend code in {resendSeconds}s</Text>
              ) : (
                <TouchableOpacity onPress={handleResend} disabled={Boolean(busyAction)}>
                  <Text style={styles.resendLink}>
                    {busyAction === 'resend' ? 'Sending verification code…' : 'Resend OTP'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {isLoginOtp ? (
              <TouchableOpacity
                onPress={() => void handleChangeAccount()}
                style={[
                  styles.changeAccountButton,
                  keyboardVisible && { paddingVertical: keyboardLayout.changeAccountPadding },
                ]}
              >
                <Ionicons name="person-outline" size={15} color={colors.textSecondary} />
                <Text style={[styles.changeAccountText, { color: colors.textSecondary }]}>Change account</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {!keyboardVisible || keyboardLayout.showHelp ? (
            <Text
              style={[
                styles.helpText,
                { color: colors.textMuted },
                keyboardVisible && { marginTop: 16 },
              ]}
            >
              Check Spam or All inboxes if the email does not appear.
            </Text>
          ) : null}
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
  contentKeyboardOpen: {
    justifyContent: 'flex-start',
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
  otpInputContainer: { position: 'relative', alignSelf: 'center' },
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: OTP_GAP },
  otpBox: {
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDigit: {
    fontSize: 21,
    fontWeight: '800',
  },
  otpNativeInput: {
    ...StyleSheet.absoluteFillObject,
    color: 'transparent',
    backgroundColor: 'transparent',
  },
  statusSlot: { minHeight: 84, justifyContent: 'center', paddingHorizontal: 3, paddingVertical: 10 },
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
