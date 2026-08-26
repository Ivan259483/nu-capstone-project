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
  type LayoutChangeEvent,
  ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';
import { Validation } from '@/utils/validation';
import PremiumButton from '@/components/ui/PremiumButton';
import AuthFeedback, { type AuthFeedbackData } from '@/components/auth/AuthFeedback';

type AuthButtonState = 'idle' | 'loading' | 'success';
type PostAuthDestination = 'root' | 'verify' | null;
type FocusedField = 'email' | 'password' | null;

// Below this height the keyboard (including an AutoFill suggestion bar) leaves
// too little room for the full header. The logo and heading remain, while the
// lower-priority header copy yields space to the authentication controls.
const CONSTRAINED_KEYBOARD_VIEWPORT = 400;

export default function LoginScreen() {
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [buttonState, setButtonState] = useState<AuthButtonState>('idle');
  const [focusedField, setFocusedField] = useState<FocusedField>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const [availableViewportHeight, setAvailableViewportHeight] = useState(0);
  const [feedback, setFeedback] = useState<AuthFeedbackData | null>(null);
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const requestInFlightRef = useRef(false);
  const postAuthDestinationRef = useRef<PostAuthDestination>(null);

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
  const constrainedMode = compactMode
    && availableViewportHeight > 0
    && availableViewportHeight < CONSTRAINED_KEYBOARD_VIEWPORT;
  const emailFocused = focusedField === 'email';
  const passwordFocused = focusedField === 'password';

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

  const handleViewportLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    setAvailableViewportHeight(current => current === nextHeight ? current : nextHeight);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, event => {
      // On iOS, keep compact spacing on the same animation curve as the
      // keyboard. Android's resized window supplies the native transition.
      if (Platform.OS === 'ios') Keyboard.scheduleLayoutAnimation(event);
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, event => {
      if (Platform.OS === 'ios') Keyboard.scheduleLayoutAnimation(event);
      setKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

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
    if (Platform.OS === 'web') return;
    void Haptics.notificationAsync(
      type === 'success'
        ? Haptics.NotificationFeedbackType.Success
        : type === 'warning'
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Error,
    );
  };

  const handleSuccessAnimationComplete = useCallback(() => {
    const destination = postAuthDestinationRef.current;
    postAuthDestinationRef.current = null;
    if (destination === 'verify') router.push('/(auth)/verify');
    if (destination === 'root') router.replace('/');
  }, []);

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
        postAuthDestinationRef.current = 'root';
        setButtonState('success');
      } else if (result.requiresEmailOtp && result.verifyEmail) {
        triggerOutcomeHaptic('warning');
        setButtonState('idle');
        router.push(`/(auth)/verify?email=${encodeURIComponent(result.verifyEmail)}`);
      } else if (result.requiresLoginOtp && result.userId && result.challengeToken) {
        triggerOutcomeHaptic('success');
        // The opaque challenge is held in encrypted storage by AuthContext. Do
        // not put it (or the raw email) in navigation URLs/history.
        postAuthDestinationRef.current = 'verify';
        setButtonState('success');
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
            constrainedMode && styles.centeredContentConstrained,
          ]}>
          {/* Card */}
          <Animated.View entering={FadeIn.duration(400)} style={styles.card}>

            {/* Logo + Header */}
            <Animated.View
              entering={FadeInDown.delay(80).duration(350)}
              style={[
                styles.headerBlock,
                compactMode && styles.headerBlockCompact,
                constrainedMode && styles.headerBlockConstrained,
              ]}
            >
              <Image
                source={require('../../../assets/images/autospf-logo.png')}
                style={[
                  styles.logo,
                  compactMode && styles.logoCompact,
                  constrainedMode && styles.logoConstrained,
                ]}
                contentFit="contain"
                accessibilityLabel="AutoSPF+ Logo"
              />
              {!constrainedMode ? (
                <Text style={[
                  styles.brandLabel,
                  compactMode && styles.brandLabelCompact,
                ]}>
                  Premium Automotive Care Platform
                </Text>
              ) : null}
              <Text style={[styles.heading, compactMode && styles.headingCompact]}>Welcome back</Text>
              {!constrainedMode ? (
                <Text style={[styles.subheading, compactMode && styles.subheadingCompact]}>
                  Sign in to continue to your account
                </Text>
              ) : null}
            </Animated.View>

            {/* Persistent security status / single feedback slot */}
            {!compactMode && displayedFeedback ? (
              <AuthFeedback
                {...displayedFeedback}
                style={styles.feedbackCard}
                testID="login-auth-feedback"
              />
            ) : null}

            {/* Form */}
            <Animated.View entering={FadeInDown.delay(160).duration(350)}>

              {/* Email — label text only as placeholder inside field */}
              <View style={[
                styles.inputWrap,
                styles.inputWrapFirst,
                compactMode && styles.inputWrapCompact,
                emailFocused && !emailError ? styles.inputWrapFocused : null,
                emailError ? styles.inputWrapError : null,
              ]}>
                <TextInput
                  ref={emailInputRef}
                  style={styles.input}
                  placeholder="Email address"
                  placeholderTextColor="rgba(255,255,255,0.28)"
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
              </View>
              {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}

              {/* Password */}
              <View style={[
                styles.inputWrap,
                styles.inputWrapSpaced,
                compactMode && styles.inputWrapSpacedCompact,
                compactMode && styles.inputWrapCompact,
                passwordFocused && !passwordError && !credentialsRejected ? styles.inputWrapFocused : null,
                passwordError || credentialsRejected ? styles.inputWrapError : null,
              ]}>
                <TextInput
                  ref={passwordInputRef}
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Password"
                  placeholderTextColor="rgba(255,255,255,0.28)"
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
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={18} color="rgba(255,255,255,0.40)" />
                </TouchableOpacity>
              </View>
              <View style={[
                styles.forgotOnlyRow,
                compactMode && styles.forgotOnlyRowCompact,
              ]}>
                <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')}>
                  <Text style={styles.forgotLink}>Forgot password?</Text>
                </TouchableOpacity>
              </View>
              {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}

              {/* Keep signed in */}
              <TouchableOpacity
                style={[styles.checkRow, compactMode && styles.checkRowCompact]}
                onPress={() => { if (Platform.OS !== 'web') Haptics.selectionAsync(); setKeepSignedIn(!keepSignedIn); }}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, keepSignedIn && styles.checkboxOn]}>
                  {keepSignedIn && <Ionicons name="checkmark" size={12} color="#FFF" />}
                </View>
                <Text style={styles.checkLabel}>Keep me signed in</Text>
              </TouchableOpacity>

              {/* Sign In */}
              <PremiumButton
                title={isSigningIn ? 'Signing in…' : isLocked ? `Locked — ${lockCountdown}` : 'Sign in'}
                icon={isSigningIn || isLocked ? undefined : 'arrow-forward'}
                onPress={handleLogin}
                disabled={isLocked}
                loading={isSigningIn}
                success={buttonState === 'success'}
                successTitle="Verified"
                onSuccessAnimationComplete={handleSuccessAnimationComplete}
                premiumAuth
                style={styles.signInBtn}
              />
              {!compactMode ? (
                <Animated.View entering={FadeIn.duration(180)} style={styles.trustRow}>
                  <Ionicons name="lock-closed" size={13} color="rgba(255,255,255,0.42)" />
                  <Text style={styles.trustText}>Secure authentication powered by AutoSPF+</Text>
                </Animated.View>
              ) : null}

            </Animated.View>

            {/* Footer */}
            {!compactMode ? (
              <Animated.View entering={FadeInDown.duration(250)} style={styles.footer}>
                <Text style={styles.footerText}>New to AutoSPF+? </Text>
                <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
                  <Text style={styles.footerLink}>Create an account</Text>
                </TouchableOpacity>
              </Animated.View>
            ) : null}

          </Animated.View>
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
    backgroundColor: '#0A0A0A',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  availableViewport: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
  },
  scrollContentCompact: {
    paddingBottom: 12,
  },
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 24,
  },
  centeredContentCompact: {
    paddingTop: 8,
    paddingBottom: 0,
  },
  centeredContentConstrained: {
    paddingTop: 4,
  },
  card: {
    width: '100%',
  },

  // Header
  headerBlock: {
    marginBottom: 28,
  },
  headerBlockCompact: {
    marginBottom: 10,
  },
  headerBlockConstrained: {
    marginBottom: 6,
  },
  logo: {
    width: 140,
    aspectRatio: 604 / 413,
    alignSelf: 'center',
    marginBottom: 10,
  },
  logoCompact: {
    width: 84,
    marginBottom: 2,
  },
  logoConstrained: {
    width: 60,
    marginBottom: 0,
  },
  brandLabel: {
    color: 'rgba(255,255,255,0.44)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    lineHeight: 14,
    marginBottom: 18,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  brandLabelCompact: {
    marginBottom: 6,
  },
  heading: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0,
    marginBottom: 6,
  },
  headingCompact: {
    fontSize: 28,
    lineHeight: 32,
    marginBottom: 2,
  },
  subheading: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.50)',
    fontWeight: '400',
    lineHeight: 20,
    textAlign: 'center',
  },
  subheadingCompact: {
    fontSize: 13,
    lineHeight: 18,
  },

  // Persistent security feedback
  feedbackCard: {
    marginBottom: 18,
  },

  // Form
  inputWrapFirst: {
    marginTop: 4,
  },
  inputWrapSpaced: {
    marginTop: 18,
  },
  inputWrapSpacedCompact: {
    marginTop: 8,
  },
  forgotOnlyRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  forgotOnlyRowCompact: {
    marginTop: 5,
    marginBottom: 2,
  },
  forgotLink: {
    fontSize: 13,
    color: '#F97316',
    fontWeight: '500',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
    backgroundColor: '#111111',
  },
  inputWrapCompact: {
    height: 48,
  },
  inputWrapFocused: {
    borderColor: '#FF7A1A',
    backgroundColor: 'rgba(255,122,26,0.06)',
    boxShadow: '0 0 0 1px rgba(255,122,26,0.85), 0 0 24px rgba(255,122,26,0.20)',
  } as ViewStyle,
  inputWrapError: {
    borderColor: 'rgba(239,68,68,0.70)',
    backgroundColor: 'rgba(239,68,68,0.06)',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '400',
  },
  eyeBtn: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -8,
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
    fontWeight: '500',
  },
  // Checkbox
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 22,
  },
  checkRowCompact: {
    marginTop: 8,
    marginBottom: 10,
  },
  checkbox: {
    width: 19,
    height: 19,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.20)',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 9,
  },
  checkboxOn: {
    backgroundColor: '#F97316',
    borderColor: '#F97316',
  },
  checkLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.70)',
    fontWeight: '500',
  },

  // Sign In Button — premium orange
  signInBtn: {
    marginTop: 0,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  trustText: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 11,
    fontWeight: '500',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  footerText: { fontSize: 13, color: 'rgba(255,255,255,0.40)' },
  footerLink: { fontSize: 13, color: '#F97316', fontWeight: '700' },
});
