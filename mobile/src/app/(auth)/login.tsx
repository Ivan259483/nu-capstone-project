import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  type KeyboardEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useAuth } from '@/context/AuthContext';
import { Validation } from '@/utils/validation';
import { AuthBackdrop } from '@/components/auth/AuthLayout';
import AuthInput from '@/components/auth/AuthInput';
import AuthButton from '@/components/auth/AuthButton';
import AuthStatusCard, { type AuthStatusData } from '@/components/auth/AuthStatusCard';
import { AuthColors, AuthFontFamily, AuthSpacing, AuthTypography } from '@/constants/authTheme';
import { Haptics } from '@/utils/haptics';

type AuthButtonState = 'idle' | 'loading' | 'success';
type FocusedField = 'email' | 'password' | null;

const MIN_KEYBOARD_GAP = 24;
const MAX_KEYBOARD_GAP = 48;
const MIN_COMPACT_TOP_SPACING = 8;

function getKeyboardOpenContentTop(viewportHeight: number, contentHeight: number) {
  const freeSpace = Math.max(0, viewportHeight - contentHeight);
  const preferredKeyboardGap = Math.min(
    MAX_KEYBOARD_GAP,
    Math.max(MIN_KEYBOARD_GAP, Math.round(viewportHeight * 0.07)),
  );
  const preferredTop = freeSpace - preferredKeyboardGap;
  const maximumTopWithMinimumGap = Math.max(0, freeSpace - MIN_KEYBOARD_GAP);

  // Large viewports spend their extra space above the group, keeping the CTA
  // close to the keyboard. Small viewports reduce top spacing first while
  // preserving the minimum keyboard gap whenever the content fits.
  return Math.min(
    maximumTopWithMinimumGap,
    Math.max(MIN_COMPACT_TOP_SPACING, preferredTop),
  );
}

export default function LoginScreen() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [buttonState, setButtonState] = useState<AuthButtonState>('idle');
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const [feedback, setFeedback] = useState<AuthStatusData | null>(null);
  const { reason } = useLocalSearchParams<{ reason?: string | string[] }>();
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const requestInFlightRef = useRef(false);
  const fullViewportHeightRef = useRef(0);
  const keyboardSessionViewportHeightRef = useRef<number | null>(null);
  const compactContentHeightRef = useRef(0);
  const compactContentTopRef = useRef<number | null>(null);
  const [compactContentTop, setCompactContentTop] = useState<number | null>(null);

  const [loginAttempts, setLoginAttempts] = useState(0);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [lockUntilMs, setLockUntilMs] = useState<number | null>(null);
  const [lockCountdown, setLockCountdown] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [credentialsRejected, setCredentialsRejected] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);

  const isSigningIn = buttonState === 'loading';
  const compactMode = keyboardVisible;

  const validateEmailField = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return 'Email is required';
    if (!Validation.isValidEmail(trimmed)) return 'Please enter a valid email';
    return '';
  }, []);

  const validatePasswordField = useCallback((value: string) => {
    if (!value) return 'Password is required';
    return '';
  }, []);

  const handleFieldFocus = useCallback(() => {
    // Android has no keyboardWillShow event, so prepare its compact layout at
    // focus time. iOS changes mode from keyboardWillShow, allowing the reflow
    // to use the keyboard's native animation curve.
    if (Platform.OS === 'android' || Keyboard.isVisible()) setKeyboardVisible(true);
  }, []);

  const handleFieldBlur = useCallback((field: Exclude<FocusedField, null>) => {
    if (field === 'email') {
      setEmailTouched(true);
      setEmailError(validateEmailField(email));
    } else {
      setPasswordTouched(true);
      setPasswordError(validatePasswordField(password));
    }
  }, [email, password, validateEmailField, validatePasswordField]);

  const updateCompactContentTop = useCallback(() => {
    const viewportHeight = keyboardSessionViewportHeightRef.current;
    const contentHeight = compactContentHeightRef.current;
    if (!viewportHeight || !contentHeight) return;

    const nextTop = getKeyboardOpenContentTop(viewportHeight, contentHeight);
    const currentTop = compactContentTopRef.current;

    // Latch one bottom-aware position per keyboard session. If content grows it
    // may move upward to remain visible, but keyboard accessory/frame changes
    // never move it during the Email → Password handoff.
    if (currentTop !== null && nextTop >= currentTop) return;
    compactContentTopRef.current = nextTop;
    setCompactContentTop(nextTop);
  }, []);

  const setKeyboardSessionViewport = useCallback((event?: KeyboardEvent) => {
    if (keyboardSessionViewportHeightRef.current !== null) return;

    const fullViewportHeight = fullViewportHeightRef.current;
    const keyboardTop = event?.endCoordinates?.screenY;
    const coordinateHeight = typeof keyboardTop === 'number'
      ? keyboardTop - insets.top
      : 0;
    const viewportHeight = coordinateHeight > 0
      ? Math.min(fullViewportHeight || coordinateHeight, coordinateHeight)
      : fullViewportHeight;

    if (viewportHeight <= 0) return;
    keyboardSessionViewportHeightRef.current = viewportHeight;
    updateCompactContentTop();
  }, [insets.top, updateCompactContentTop]);

  const handleViewportLayout = useCallback((event: LayoutChangeEvent) => {
    const viewportHeight = Math.round(event.nativeEvent.layout.height);
    if (!compactMode) {
      fullViewportHeightRef.current = viewportHeight;
      return;
    }

    // Android resize mode and an already-visible keyboard can reach this path
    // without a usable show-event coordinate. Capture only once per session.
    if (
      keyboardSessionViewportHeightRef.current === null
      && viewportHeight > 0
      && Keyboard.isVisible()
    ) {
      keyboardSessionViewportHeightRef.current = viewportHeight;
      updateCompactContentTop();
    }
  }, [compactMode, updateCompactContentTop]);

  const handleCompactContentLayout = useCallback((event: LayoutChangeEvent) => {
    if (!compactMode) return;
    compactContentHeightRef.current = Math.round(event.nativeEvent.layout.height);
    updateCompactContentTop();
  }, [compactMode, updateCompactContentTop]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const showSubscription = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
    });

    // Use the completed hide event on both platforms. iOS can emit a transient
    // will-hide while swapping from the email keyboard to the password/AutoFill
    // keyboard. Collapsing compact mode at that point produces a one-frame jump.
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      // A keyboard implementation can still finish the old keyboard's hide
      // after the next login field has focused. In that handoff, the following
      // show/frame event belongs to the same keyboard session, so retain the
      // single compact layout.
      if (emailInputRef.current?.isFocused() || passwordInputRef.current?.isFocused()) return;
      setKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    // Keep viewport measurement separate from the keyboard-visibility effect
    // above so the proven focus/handoff behavior remains unchanged.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const showSubscription = Keyboard.addListener(showEvent, setKeyboardSessionViewport);
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      if (emailInputRef.current?.isFocused() || passwordInputRef.current?.isFocused()) return;
      keyboardSessionViewportHeightRef.current = null;
      compactContentHeightRef.current = 0;
      compactContentTopRef.current = null;
      setCompactContentTop(null);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [setKeyboardSessionViewport]);

  useEffect(() => {
    if (!isLocked || !lockUntilMs) return;
    const tick = () => {
      const diff = lockUntilMs - Date.now();
      if (diff <= 0) {
        setIsLocked(false);
        setLockUntilMs(null);
        setLockCountdown('');
        setLoginAttempts(0);
        setRemainingAttempts(null);
        setFeedback(null);
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setLockCountdown(`${mins}:${secs.toString().padStart(2, '0')}`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [isLocked, lockUntilMs]);

  function clearAttemptState() {
    setLoginAttempts(0);
    setRemainingAttempts(null);
    setIsLocked(false);
    setLockUntilMs(null);
    setLockCountdown('');
    setCredentialsRejected(false);
    setFeedback(null);
  }

  useEffect(() => {
    const value = Array.isArray(reason) ? reason[0] : reason;
    if (value !== 'challenge-expired') return;
    setFeedback({
      type: 'error',
      title: 'Verification session expired',
      message: 'Your code was not confirmed in time. Sign in again to get a new one.',
    });
    router.setParams({ reason: undefined });
  }, [reason]);

  async function handleLogin() {
    Keyboard.dismiss();

    // State updates are not synchronous, so this ref protects the request even
    // when two taps land before React can paint the disabled button.
    if (requestInFlightRef.current || isSigningIn) return;
    if (isLocked) {
      setFeedback({
        type: 'error',
        title: 'Sign-in temporarily locked',
        message: `Try again in ${lockCountdown || '15:00'}.`,
      });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const nextEmailError = validateEmailField(email);
    const nextPasswordError = validatePasswordField(password);
    setEmailTouched(true);
    setPasswordTouched(true);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setCredentialsRejected(false);
    setFeedback(null);
    if (nextEmailError || nextPasswordError) {
      Haptics.formSubmitError();
      return;
    }

    requestInFlightRef.current = true;
    setButtonState('loading');

    try {
      const result = await signIn(normalizedEmail, password);

      if (result.success) {
        setIsLocked(false);
        setLockUntilMs(null);
        setButtonState('success');
        router.replace('/');
      } else if (result.requiresEmailOtp && result.verifyEmail) {
        setButtonState('idle');
        router.push(`/(auth)/verify?email=${encodeURIComponent(result.verifyEmail)}`);
      } else if (result.requiresLoginOtp && result.userId && result.challengeToken) {
        // The opaque challenge is held in encrypted storage by AuthContext. Do
        // not put it (or the raw email) in navigation URLs/history.
        setButtonState('success');
        router.push('/(auth)/verify');
      } else {
        Haptics.formSubmitError();
        setButtonState('idle');

        if (result.data?.locked || result.data?.lockUntilMs) {
          setIsLocked(true);
          setLockUntilMs(result.data.lockUntilMs ?? Date.now() + 15 * 60 * 1000);
          setRemainingAttempts(0);
          setFeedback({
            type: 'error',
            title: 'Sign-in temporarily locked',
            message: result.message || 'Try again in 15 minutes.',
          });
        } else if (result.data?.remainingAttempts !== undefined) {
          setLoginAttempts(previous => result.data?.loginAttempts ?? previous + 1);
          setRemainingAttempts(result.data.remainingAttempts);
          setCredentialsRejected(true);
          setFeedback(null);
        } else {
          const message = result.message || 'Check your details and try again.';
          const isNetworkError = /network|offline|timeout|connect/i.test(message);
          setCredentialsRejected(/invalid|credential|password|email/i.test(message));
          setFeedback({
            type: 'error',
            title: isNetworkError ? 'Network unavailable' : 'Unable to sign in',
            message: isNetworkError
              ? 'Check your connection and try again.'
              : message,
          });
        }
      }
    } catch {
      Haptics.formSubmitError();
      setButtonState('idle');
      setFeedback({
        type: 'error',
        title: 'Unable to sign in',
        message: 'Something went wrong. Please try again.',
      });
    } finally {
      requestInFlightRef.current = false;
      setButtonState(current => current === 'loading' ? 'idle' : current);
    }
  }

  const displayedFeedback: AuthStatusData | null = isLocked
    ? {
        type: 'error',
        title: 'Sign-in temporarily locked',
        message: `Try again in ${lockCountdown || '15:00'}.`,
      }
    : loginAttempts > 0 && remainingAttempts !== null
      ? {
          type: 'warning',
          title: 'Sign-in unsuccessful',
          message: `${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining`,
        }
      : feedback;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AuthBackdrop source={require('../../../assets/images/login-cinematic-bg.png')} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoidingView}
      >
        <View style={styles.availableViewport} onLayout={handleViewportLayout}>
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              compactMode && styles.scrollContentCompact,
            ]}
            scrollEnabled={!compactMode}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustKeyboardInsets={false}
            showsVerticalScrollIndicator={false}
            bounces={false}
            alwaysBounceVertical={false}
            overScrollMode="never"
          >
          <View style={[
            styles.centeredContent,
            compactMode && styles.centeredContentCompact,
            compactMode && compactContentTop !== null
              ? { paddingTop: compactContentTop }
              : null,
          ]}>
            <View style={styles.contentColumn} onLayout={handleCompactContentLayout}>
              <View style={[
                styles.headerBlock,
                compactMode && styles.headerBlockCompact,
              ]}>
                <Animated.View
                  entering={reduceMotion ? undefined : FadeInDown.duration(360)}
                  style={styles.brandBlock}
                >
                  <Image
                    source={require('../../../assets/images/autospf-logo.png')}
                    style={[styles.logo, compactMode && styles.logoCompact]}
                    contentFit="contain"
                    accessibilityLabel="AutoSPF+ Logo"
                  />
                  <Animated.View entering={reduceMotion ? undefined : FadeIn.delay(110).duration(330)}>
                    <Text style={[styles.heading, compactMode && styles.headingCompact]}>Welcome back</Text>
                    <Text style={[styles.subheading, compactMode && styles.subheadingCompact]}>
                      Sign in to continue to your account
                    </Text>
                  </Animated.View>
                </Animated.View>
              </View>

              {!compactMode && displayedFeedback ? (
                <AuthStatusCard
                  {...displayedFeedback}
                  style={styles.feedbackCard}
                  testID="login-auth-feedback"
                />
              ) : null}

              <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(170).duration(360)}>
                <AuthInput
                  ref={emailInputRef}
                  label="Email address"
                  placeholder="name@example.com"
                  value={email}
                  onChangeText={t => {
                    setEmail(t);
                    setEmailError('');
                    setPasswordError('');
                    setCredentialsRejected(false);
                    clearAttemptState();
                  }}
                  onFocus={handleFieldFocus}
                  onBlur={() => handleFieldBlur('email')}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                  autoComplete="email"
                  textContentType="emailAddress"
                  surfaceColor={AuthColors.cardOnPhoto}
                  error={emailTouched ? emailError : ''}
                  containerStyle={styles.fieldSpacing}
                />

                <AuthInput
                  ref={passwordInputRef}
                  label="Password"
                  placeholder="Password"
                  value={password}
                  onChangeText={t => {
                    setPassword(t);
                    setPasswordError('');
                    setCredentialsRejected(false);
                    setFeedback(null);
                  }}
                  onFocus={handleFieldFocus}
                  onBlur={() => handleFieldBlur('password')}
                  isPassword
                  returnKeyType="done"
                  submitBehavior="blurAndSubmit"
                  onSubmitEditing={Keyboard.dismiss}
                  autoComplete="current-password"
                  textContentType="password"
                  surfaceColor={AuthColors.cardOnPhoto}
                  error={(passwordTouched && passwordError) || (credentialsRejected ? 'Incorrect email or password' : '')}
                  containerStyle={styles.fieldSpacingTight}
                />

                <View style={[
                  styles.authOptionsRow,
                  compactMode && styles.authOptionsRowCompact,
                ]}>
                  <TouchableOpacity
                    style={styles.checkRow}
                    onPress={() => {  setKeepSignedIn(!keepSignedIn); }}
                    activeOpacity={0.82}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: keepSignedIn }}
                    accessibilityLabel="Remember me"
                  >
                    <View style={[styles.checkbox, keepSignedIn && styles.checkboxOn]}>
                      {keepSignedIn && <Ionicons name="checkmark" size={15} color={AuthColors.bg} />}
                    </View>
                    <Text style={styles.checkLabel}>Remember me</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => router.push('/(auth)/forgot-password')}
                    style={styles.forgotHitbox}
                    accessibilityRole="button"
                  >
                    <Text style={styles.forgotLink}>Forgot password?</Text>
                  </TouchableOpacity>
                </View>

                <AuthButton
                  title={isSigningIn ? 'Signing in…' : isLocked ? `Locked — ${lockCountdown}` : 'Sign in'}
                  onPress={handleLogin}
                  disabled={isLocked}
                  loading={isSigningIn}
                  success={buttonState === 'success'}
                  successTitle="Verified"
                />
                {!compactMode ? (
                  <Animated.View entering={reduceMotion ? undefined : FadeIn.delay(260).duration(240)} style={styles.trustRow}>
                    <Ionicons name="lock-closed" size={13} color={AuthColors.textTertiary} />
                    <Text style={styles.trustText}>Secure authentication powered by AutoSPF+</Text>
                  </Animated.View>
                ) : null}
              </Animated.View>

              {!compactMode ? (
                <Animated.View entering={reduceMotion ? undefined : FadeIn.delay(300).duration(260)} style={styles.footer}>
                  <View style={styles.footerDivider} />
                  <View style={styles.footerCopy}>
                    <Text style={styles.footerText}>New to AutoSPF+?</Text>
                    <TouchableOpacity
                      onPress={() => router.push('/(auth)/signup')}
                      style={styles.footerLinkHitbox}
                      accessibilityRole="button"
                    >
                      <Text style={styles.footerLink}>Create an account</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.footerDivider} />
                </Animated.View>
              ) : null}
            </View>
          </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AuthColors.bg,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  availableViewport: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: AuthSpacing.screenPaddingHorizontal,
  },
  scrollContentCompact: {
    paddingBottom: 12,
  },
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 26,
  },
  centeredContentCompact: {
    // The measured session padding overrides this fallback once the keyboard
    // viewport and compact group have both completed their first layout.
    justifyContent: 'flex-start',
    paddingTop: MIN_COMPACT_TOP_SPACING,
    paddingBottom: 0,
  },
  contentColumn: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
  },

  // Header
  headerBlock: {
    marginBottom: AuthSpacing.sectionGap,
  },
  headerBlockCompact: {
    marginBottom: 6,
  },
  brandBlock: {
    alignItems: 'center',
  },
  logo: {
    width: 120,
    aspectRatio: 604 / 413,
    marginBottom: 16,
  },
  logoCompact: {
    width: 72,
    marginBottom: 4,
  },
  heading: {
    fontFamily: AuthTypography.h1.fontFamily,
    fontSize: AuthTypography.h1.fontSize,
    lineHeight: AuthTypography.h1.lineHeight,
    letterSpacing: AuthTypography.h1.letterSpacing,
    color: AuthColors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  headingCompact: {
    fontSize: 24,
    lineHeight: 28,
    marginBottom: 2,
  },
  subheading: {
    fontFamily: AuthTypography.body.fontFamily,
    fontSize: 15,
    color: AuthColors.textSecondary,
    textAlign: 'center',
  },
  subheadingCompact: {
    fontSize: 12,
    lineHeight: 16,
  },

  feedbackCard: {
    marginBottom: 18,
  },

  fieldSpacing: {
    marginBottom: 0,
  },
  fieldSpacingTight: {
    marginTop: 14,
  },

  authOptionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    marginTop: -4,
    marginBottom: 18,
  },
  authOptionsRowCompact: {
    marginTop: -8,
    marginBottom: 8,
  },
  forgotLink: {
    fontFamily: AuthFontFamily.medium,
    fontSize: 14,
    color: AuthColors.textSecondary,
  },
  forgotHitbox: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingLeft: 12,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: 44,
    paddingRight: 12,
    flexShrink: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: AuthColors.borderFocus,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginRight: 12,
  },
  checkboxOn: {
    backgroundColor: AuthColors.textPrimary,
    borderColor: AuthColors.textPrimary,
  },
  checkLabel: {
    fontFamily: AuthFontFamily.regular,
    fontSize: 14,
    color: AuthColors.textSecondary,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 16,
  },
  trustText: {
    color: AuthColors.textTertiary,
    fontFamily: AuthFontFamily.regular,
    fontSize: 11.5,
  },

  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: AuthSpacing.sectionGap,
    minHeight: 44,
  },
  footerDivider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    maxWidth: 54,
    backgroundColor: AuthColors.borderHairline,
  },
  footerCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 12,
  },
  footerText: {
    fontFamily: AuthFontFamily.regular,
    fontSize: 13.5,
    color: AuthColors.textSecondary,
  },
  footerLinkHitbox: {
    minHeight: 44,
    justifyContent: 'center',
    marginVertical: -12,
    paddingLeft: 6,
  },
  footerLink: {
    fontFamily: AuthFontFamily.medium,
    fontSize: 13.5,
    color: AuthColors.textPrimary,
  },
});
