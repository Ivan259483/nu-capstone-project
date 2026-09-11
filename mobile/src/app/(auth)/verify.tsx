import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type KeyboardEvent,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { apiClient, getApiErrorMessage } from '@/services/api/client';
import AuthButton from '@/components/auth/AuthButton';
import AuthOtpInput, { type AuthOtpInputHandle } from '@/components/auth/AuthOtpInput';
import AuthStatusCard, { type AuthStatusData } from '@/components/auth/AuthStatusCard';
import { AuthColors, AuthFontFamily, AuthRadius, AuthTypography } from '@/constants/authTheme';
import { Haptics } from '@/utils/haptics';

const OTP_LENGTH = 6;
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));
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
  const [keyboardHeight, setKeyboardHeight] = useState(() => (
    Platform.OS === 'web' ? 0 : (Keyboard.metrics()?.height ?? 0)
  ));
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [now, setNow] = useState(Date.now());
  const [signupResendAvailableAt, setSignupResendAvailableAt] = useState(Date.now() + 60_000);
  const [feedback, setFeedback] = useState<AuthStatusData | null>(() => (
    isLoginOtp || Boolean(email)
      ? {
          type: 'success',
          title: 'Verification code sent',
          message: 'Check your email for the 6-digit code.',
        }
      : null
  ));
  const restingWindowHeightRef = useRef(windowHeight);
  const otpInputRef = useRef<AuthOtpInputHandle | null>(null);

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

  const resetOtpInput = () => {
    setOtp('');
    otpInputRef.current?.focus();
  };

  async function handleVerifyOtp() {
    const token = otp;
    setFeedback(null);

    if (token.length !== OTP_LENGTH) {
      Haptics.formSubmitError();
      setFeedback({
        type: 'error',
        title: 'Complete the code',
        message: 'Enter all 6 digits to continue.',
      });
      return;
    }
    if (isLoginOtp && (!pendingLoginOtp || challengeExpired)) {
      Haptics.formSubmitError();
      setFeedback({
        type: 'error',
        title: 'Verification session expired',
        message: 'Change account and sign in again.',
      });
      return;
    }
    if (isLoginOtp && codeExpired) {
      Haptics.formSubmitError();
      setFeedback({
        type: 'error',
        title: 'Verification code expired',
        message: 'Request a new code to continue.',
      });
      return;
    }
    if (!isLoginOtp && !email) {
      Haptics.formSubmitError();
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
      Haptics.formSubmitError();
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
    setOtp(text);
    setFeedback(null);
  }

  async function handleResend() {
    if (busyAction || resendSeconds > 0) return;
    if (!isLoginOtp) {
      if (!email) {
        Haptics.formSubmitError();
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
        setFeedback({
          type: 'success',
          title: 'Verification code sent',
          message: 'Check your email for the new 6-digit code.',
        });
      } catch (error) {
        Haptics.formSubmitError();
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
      Haptics.formSubmitError();
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
      setFeedback({
        type: 'success',
        title: 'Verification code sent',
        message: 'Check your email for the new 6-digit code.',
      });
    } catch (error) {
      const message = getApiErrorMessage(error, 'Unable to resend code. Please try again.');
      Haptics.formSubmitError();
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
    <View style={[styles.container, { backgroundColor: AuthColors.bg, paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
        style={styles.keyboardView}
      >
        <TouchableOpacity onPress={handleBack} style={styles.backButton} accessibilityLabel="Change account">
          <Ionicons name="arrow-back" size={20} color={AuthColors.textPrimary} />
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
          <Text style={styles.title}>Enter verification code</Text>
          <Text
            style={[
              styles.subtitle,
              keyboardVisible && { marginTop: keyboardLayout.subtitleGap },
            ]}
          >
            Enter the 6-digit code sent to your email
          </Text>
          {displayedEmail ? (
            <Text
              style={[
                styles.email,
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
            <AuthOtpInput
              ref={otpInputRef}
              value={otp}
              onChangeText={handleOtpChange}
              error={feedback?.type === 'error'}
              disabled={Boolean(busyAction) || challengeExpired}
            />

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
                <AuthStatusCard {...feedback} />
              ) : isLoginOtp && !codeExpired ? (
                <Text style={styles.expiryText}>Code expires in {formatClock(codeSeconds)}</Text>
              ) : null}
            </View>

            <AuthButton
              title={busyAction === 'verify' ? 'Verifying…' : 'Verify & sign in'}
              onPress={handleVerifyOtp}
              loading={busyAction === 'verify'}
              disabled={Boolean(busyAction) || challengeExpired || codeExpired || otp.length !== OTP_LENGTH}
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
                <Text style={styles.resendCountdown}>Verification session expired</Text>
              ) : resendSeconds > 0 ? (
                <Text style={styles.resendCountdown}>Resend code in {resendSeconds}s</Text>
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
                <Ionicons name="person-outline" size={15} color={AuthColors.textSecondary} />
                <Text style={styles.changeAccountText}>Change account</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {!keyboardVisible || keyboardLayout.showHelp ? (
            <Text
              style={[
                styles.helpText,
                keyboardVisible && { marginTop: 16 },
              ]}
            >
              Check spam or all inboxes if the email does not appear.
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
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AuthRadius.full,
    borderWidth: 1,
    borderColor: AuthColors.borderHairline,
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
  title: {
    fontFamily: AuthTypography.h1.fontFamily,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: AuthTypography.h1.letterSpacing,
    color: AuthColors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: AuthFontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 9,
    color: AuthColors.textSecondary,
  },
  email: {
    fontFamily: AuthFontFamily.medium,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 3,
    color: AuthColors.textPrimary,
  },
  form: { width: '100%', maxWidth: 420, marginTop: 32 },
  statusSlot: { minHeight: 84, justifyContent: 'center', paddingHorizontal: 3, paddingVertical: 10 },
  expiryText: { fontFamily: AuthFontFamily.regular, fontSize: 12, textAlign: 'center', color: AuthColors.textTertiary },
  resendArea: { alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 16 },
  resendCountdown: { fontFamily: AuthFontFamily.medium, fontSize: 13, color: AuthColors.textTertiary },
  resendLink: { color: AuthColors.textPrimary, fontFamily: AuthFontFamily.medium, fontSize: 14 },
  changeAccountButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  changeAccountText: { fontFamily: AuthFontFamily.medium, fontSize: 13, color: AuthColors.textSecondary },
  helpText: {
    fontFamily: AuthFontFamily.regular,
    maxWidth: 320,
    marginTop: 24,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    color: AuthColors.textTertiary,
  },
});
