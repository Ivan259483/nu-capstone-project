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
  ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useAuth } from '@/context/AuthContext';
import { Validation } from '@/utils/validation';
import PremiumButton from '@/components/ui/PremiumButton';
import AuthFeedback, { type AuthFeedbackData } from '@/components/auth/AuthFeedback';
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
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [buttonState, setButtonState] = useState<AuthButtonState>('idle');
  const [focusedField, setFocusedField] = useState<FocusedField>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const [feedback, setFeedback] = useState<AuthFeedbackData | null>(null);
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
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [credentialsRejected, setCredentialsRejected] = useState(false);

  const isSigningIn = buttonState === 'loading';
  const compactMode = keyboardVisible;
  const emailFocused = focusedField === 'email';
  const passwordFocused = focusedField === 'password';
  const emailFocusProgress = useSharedValue(0);
  const passwordFocusProgress = useSharedValue(0);

  useEffect(() => {
    emailFocusProgress.value = withTiming(emailFocused ? 1 : 0, { duration: reduceMotion ? 0 : 190 });
  }, [emailFocusProgress, emailFocused, reduceMotion]);

  useEffect(() => {
    passwordFocusProgress.value = withTiming(passwordFocused ? 1 : 0, { duration: reduceMotion ? 0 : 190 });
  }, [passwordFocusProgress, passwordFocused, reduceMotion]);

  const emailFocusStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      emailFocusProgress.value,
      [0, 1],
      ['rgba(255,255,255,0.18)', 'rgba(255,122,0,0.76)'],
    ),
    backgroundColor: interpolateColor(
      emailFocusProgress.value,
      [0, 1],
      ['rgba(24,24,24,0.88)', 'rgba(32,24,19,0.92)'],
    ),
  }));

  const passwordFocusStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      passwordFocusProgress.value,
      [0, 1],
      ['rgba(255,255,255,0.18)', 'rgba(255,122,0,0.76)'],
    ),
    backgroundColor: interpolateColor(
      passwordFocusProgress.value,
      [0, 1],
      ['rgba(24,24,24,0.88)', 'rgba(32,24,19,0.92)'],
    ),
  }));

  const handleFieldFocus = useCallback((field: Exclude<FocusedField, null>) => {
    setFocusedField(field);
    // Android has no keyboardWillShow event, so prepare its compact layout at
    // focus time. iOS changes mode from keyboardWillShow, allowing the reflow
    // to use the keyboard's native animation curve.
    if (Platform.OS === 'android' || Keyboard.isVisible()) setKeyboardVisible(true);
  }, []);

  const handleFieldBlur = useCallback((field: Exclude<FocusedField, null>) => {
    setFocusedField(current => current === field ? null : current);
  }, []);

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

  const triggerOutcomeHaptic = (type: 'success' | 'warning' | 'error') => {
    Haptics.notify(type);
  };

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

    setEmailError('');
    setPasswordError('');
    setCredentialsRejected(false);
    setFeedback(null);
    const normalizedEmail = email.trim().toLowerCase();
    let hasError = false;
    if (!normalizedEmail) { setEmailError('Email is required'); hasError = true; }
    else if (!Validation.isValidEmail(normalizedEmail)) { setEmailError('Please enter a valid email'); hasError = true; }
    if (!password) { setPasswordError('Password is required'); hasError = true; }
    if (hasError) return;

    requestInFlightRef.current = true;
    setButtonState('loading');

    try {
      const result = await signIn(normalizedEmail, password);

      if (result.success) {
        triggerOutcomeHaptic('success');
        setIsLocked(false);
        setLockUntilMs(null);
        setButtonState('success');
        router.replace('/');
      } else if (result.requiresEmailOtp && result.verifyEmail) {
        triggerOutcomeHaptic('warning');
        setButtonState('idle');
        router.push(`/(auth)/verify?email=${encodeURIComponent(result.verifyEmail)}`);
      } else if (result.requiresLoginOtp && result.userId && result.challengeToken) {
        triggerOutcomeHaptic('success');
        // The opaque challenge is held in encrypted storage by AuthContext. Do
        // not put it (or the raw email) in navigation URLs/history.
        setButtonState('success');
        router.push('/(auth)/verify');
      } else {
        triggerOutcomeHaptic('error');
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
      triggerOutcomeHaptic('error');
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

  const displayedFeedback: AuthFeedbackData | null = isLocked
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
      <Image
        source={require('../../../assets/images/login-cinematic-bg.png')}
        style={styles.backgroundArtwork}
        contentFit="cover"
        contentPosition="top center"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <LinearGradient
        colors={[
          'rgba(5,5,5,0.28)',
          'rgba(5,5,5,0.44)',
          'rgba(5,5,5,0.82)',
          '#050505',
        ]}
        locations={[0, 0.28, 0.49, 0.72]}
        style={styles.backgroundScrim}
      />
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
                    style={[
                      styles.logo,
                      compactMode && styles.logoCompact,
                    ]}
                    contentFit="contain"
                    accessibilityLabel="AutoSPF+ Logo"
                  />
                  <Text style={[
                    styles.brandLabel,
                    compactMode && styles.brandLabelCompact,
                  ]}>
                    Premium Automotive Care Platform
                  </Text>
                </Animated.View>
                <Animated.View entering={reduceMotion ? undefined : FadeIn.delay(110).duration(330)}>
                  <Text style={[styles.heading, compactMode && styles.headingCompact]}>Welcome back</Text>
                  <Text style={[styles.subheading, compactMode && styles.subheadingCompact]}>
                    Sign in to continue to your account
                  </Text>
                </Animated.View>
              </View>

              {!compactMode && displayedFeedback ? (
                <AuthFeedback
                  {...displayedFeedback}
                  style={styles.feedbackCard}
                  testID="login-auth-feedback"
                />
              ) : null}

              <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(170).duration(360)}>

                <Animated.View style={[
                  styles.inputWrap,
                  styles.inputWrapFirst,
                  compactMode && styles.inputWrapCompact,
                  emailFocusStyle,
                  emailFocused && !emailError ? styles.inputWrapFocused : null,
                  emailError ? styles.inputWrapError : null,
                ]}>
                  <Ionicons
                    name="mail-outline"
                    size={compactMode ? 17 : 19}
                    color={emailFocused ? '#FF8A2A' : 'rgba(255,255,255,0.50)'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    ref={emailInputRef}
                    style={styles.input}
                    placeholder="Email address"
                    placeholderTextColor="rgba(255,255,255,0.42)"
                    value={email}
                    onChangeText={t => {
                      setEmail(t);
                      setEmailError('');
                      setPasswordError('');
                      clearAttemptState();
                    }}
                    onFocus={() => handleFieldFocus('email')}
                    onBlur={() => handleFieldBlur('email')}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoCorrect={false}
                    returnKeyType="next"
                    submitBehavior="submit"
                    onSubmitEditing={() => passwordInputRef.current?.focus()}
                    autoComplete="email"
                    textContentType="emailAddress"
                    accessibilityLabel="Email address"
                  />
                </Animated.View>
                {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}

                <Animated.View style={[
                  styles.inputWrap,
                  styles.inputWrapSpaced,
                  compactMode && styles.inputWrapSpacedCompact,
                  compactMode && styles.inputWrapCompact,
                  passwordFocusStyle,
                  passwordFocused && !passwordError && !credentialsRejected ? styles.inputWrapFocused : null,
                  passwordError || credentialsRejected ? styles.inputWrapError : null,
                ]}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={compactMode ? 17 : 19}
                    color={passwordFocused ? '#FF8A2A' : 'rgba(255,255,255,0.50)'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    ref={passwordInputRef}
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor="rgba(255,255,255,0.42)"
                    value={password}
                    onChangeText={t => {
                      setPassword(t);
                      setPasswordError('');
                      setCredentialsRejected(false);
                      setFeedback(null);
                    }}
                    onFocus={() => handleFieldFocus('password')}
                    onBlur={() => handleFieldBlur('password')}
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                    submitBehavior="blurAndSubmit"
                    onSubmitEditing={Keyboard.dismiss}
                    autoComplete="current-password"
                    textContentType="password"
                    accessibilityLabel="Password"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeBtn}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                      size={19}
                      color={passwordFocused ? 'rgba(255,255,255,0.74)' : 'rgba(255,255,255,0.48)'}
                    />
                  </TouchableOpacity>
                </Animated.View>
                {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
                <View style={[
                  styles.authOptionsRow,
                  compactMode && styles.authOptionsRowCompact,
                ]}>
                  <TouchableOpacity
                    style={styles.checkRow}
                    onPress={() => { Haptics.selection(); setKeepSignedIn(!keepSignedIn); }}
                    activeOpacity={0.82}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: keepSignedIn }}
                    accessibilityLabel="Remember me"
                  >
                    <View style={[styles.checkbox, keepSignedIn && styles.checkboxOn]}>
                      {keepSignedIn && <Ionicons name="checkmark" size={17} color="#FFF" />}
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

                <PremiumButton
                  title={isSigningIn ? 'Signing in…' : isLocked ? `Locked — ${lockCountdown}` : 'Sign in'}
                  icon={isSigningIn || isLocked ? undefined : 'arrow-forward'}
                  onPress={handleLogin}
                  disabled={isLocked}
                  loading={isSigningIn}
                  success={buttonState === 'success'}
                  successTitle="Verified"
                  premiumAuth
                  style={styles.signInBtn}
                />
                {!compactMode ? (
                  <Animated.View entering={reduceMotion ? undefined : FadeIn.delay(260).duration(240)} style={styles.trustRow}>
                    <Ionicons name="lock-closed" size={14} color="rgba(255,255,255,0.43)" />
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
    backgroundColor: '#050505',
  },
  backgroundArtwork: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  backgroundScrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    pointerEvents: 'none',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  availableViewport: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
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
    marginBottom: 24,
  },
  headerBlockCompact: {
    marginBottom: 6,
  },
  brandBlock: {
    alignItems: 'center',
  },
  logo: {
    width: 166,
    aspectRatio: 604 / 413,
    alignSelf: 'center',
    marginBottom: 8,
  },
  logoCompact: {
    width: 84,
    marginBottom: 0,
  },
  brandLabel: {
    color: 'rgba(255,255,255,0.50)',
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 2.25,
    lineHeight: 15,
    marginBottom: 22,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  brandLabelCompact: {
    fontSize: 8,
    lineHeight: 11,
    letterSpacing: 1.25,
    marginBottom: 4,
  },
  heading: {
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '800',
    color: '#FAFAFA',
    textAlign: 'center',
    letterSpacing: -1.25,
    marginBottom: 7,
  },
  headingCompact: {
    fontSize: 27,
    lineHeight: 31,
    letterSpacing: -0.55,
    marginBottom: 1,
  },
  subheading: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.52)',
    fontWeight: '400',
    lineHeight: 22,
    textAlign: 'center',
  },
  subheadingCompact: {
    fontSize: 12,
    lineHeight: 16,
  },

  // Persistent security feedback
  feedbackCard: {
    marginBottom: 18,
  },

  // Form
  inputWrapFirst: {
    marginTop: 0,
  },
  inputWrapSpaced: {
    marginTop: 14,
  },
  inputWrapSpacedCompact: {
    marginTop: 6,
  },
  authOptionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    marginTop: 5,
    marginBottom: 18,
  },
  authOptionsRowCompact: {
    marginTop: 2,
    marginBottom: 8,
  },
  forgotLink: {
    fontSize: 14,
    lineHeight: 19,
    color: '#FF790F',
    fontWeight: '600',
  },
  forgotHitbox: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingLeft: 12,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 50,
    backgroundColor: 'rgba(24,24,24,0.88)',
  },
  inputWrapCompact: {
    height: 44,
    borderRadius: 13,
    paddingHorizontal: 13,
  },
  inputWrapFocused: {
    boxShadow: '0 0 14px rgba(255,107,0,0.12)',
  } as ViewStyle,
  inputWrapError: {
    borderColor: 'rgba(239,112,99,0.78)',
    backgroundColor: 'rgba(35,22,21,0.92)',
  },
  inputIcon: {
    width: 22,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14.5,
    color: '#FFFFFF',
    fontWeight: '400',
    paddingVertical: 0,
  },
  eyeBtn: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -9,
  },
  errorText: {
    fontSize: 11.5,
    lineHeight: 16,
    color: '#F08A7A',
    marginTop: 5,
    marginLeft: 4,
    fontWeight: '500',
  },
  // Checkbox
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: 44,
    paddingRight: 12,
    flexShrink: 1,
  },
  checkbox: {
    width: 25,
    height: 25,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
    backgroundColor: 'rgba(20,20,20,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginRight: 12,
  },
  checkboxOn: {
    backgroundColor: '#FF6B00',
    borderColor: '#FF6B00',
    boxShadow: '0 3px 8px rgba(255,107,0,0.18)',
  },
  checkLabel: {
    fontSize: 15,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.79)',
    fontWeight: '500',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  // Sign In Button — premium orange
  signInBtn: {
    marginTop: 0,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 15,
  },
  trustText: {
    color: 'rgba(255,255,255,0.44)',
    fontSize: 11.5,
    fontWeight: '500',
    letterSpacing: 0.05,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 25,
    minHeight: 44,
  },
  footerDivider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    maxWidth: 54,
    backgroundColor: 'rgba(255,255,255,0.36)',
  },
  footerCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 12,
  },
  footerText: {
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.47)',
  },
  footerLinkHitbox: {
    minHeight: 44,
    justifyContent: 'center',
    marginVertical: -12,
    paddingLeft: 6,
  },
  footerLink: {
    fontSize: 13.5,
    color: '#FF790F',
    fontWeight: '700',
  },
});
