import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';
import { Toast } from '@/components/ui/PremiumToast';
import { Validation } from '@/utils/validation';

const SCREEN_H = Dimensions.get('window').height;

export default function LoginScreen() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [authError, setAuthError] = useState('');

  const [loginAttempts, setLoginAttempts] = useState(0);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [lockUntilMs, setLockUntilMs] = useState<number | null>(null);
  const [lockCountdown, setLockCountdown] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    if (!isLocked || !lockUntilMs) return;
    const tick = () => {
      const diff = lockUntilMs - Date.now();
      if (diff <= 0) { setIsLocked(false); setLockUntilMs(null); setLockCountdown(''); return; }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setLockCountdown(`${mins}:${secs.toString().padStart(2, '0')}`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [isLocked, lockUntilMs]);

  async function handleLogin() {
    if (isLocked) { Toast.show(`Locked. Try again in ${lockCountdown}.`, 'error'); return; }
    setEmailError(''); setPasswordError(''); setAuthError('');
    let hasError = false;
    if (!email) { setEmailError('Email is required'); hasError = true; }
    else if (!Validation.isValidEmail(email)) { setEmailError('Please enter a valid email'); hasError = true; }
    if (!password) { setPasswordError('Password is required'); hasError = true; }
    if (hasError) return;

    setLoading(true);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await signIn(email.trim().toLowerCase(), password);
    if (result.success) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsLocked(false); setLockUntilMs(null);
      router.replace('/');
    } else if (result.requiresEmailOtp && result.verifyEmail) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Toast.show(result.message || 'Verify your email first.', 'warning');
      router.push(`/(auth)/verify?email=${encodeURIComponent(result.verifyEmail)}`);
    } else {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (result.data?.locked || result.data?.lockUntilMs) {
        setIsLocked(true);
        setLockUntilMs(result.data.lockUntilMs ?? Date.now() + 15 * 60 * 1000);
        setRemainingAttempts(0);
        Toast.show(result.message || 'Account locked for 15 minutes.', 'error');
      } else if (result.data?.remainingAttempts !== undefined) {
        setLoginAttempts(result.data.loginAttempts ?? loginAttempts + 1);
        setRemainingAttempts(result.data.remainingAttempts);
        setAuthError('Invalid email or password.');
        Toast.show(result.message || 'Invalid credentials.', 'error');
      } else {
        setAuthError('Invalid email or password.');
        Toast.show(result.message || 'Invalid credentials. Please try again.', 'error');
      }
    }
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { minHeight: SCREEN_H - insets.top - insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.centeredContent}>
          {/* Card */}
          <Animated.View entering={FadeIn.duration(400)} style={styles.card}>

            {/* Logo + Header */}
            <Animated.View entering={FadeInDown.delay(80).duration(350)} style={styles.headerBlock}>
              <Image
                source={require('../../../assets/images/autospf-logo.png')}
                style={styles.logo}
                contentFit="contain"
                accessibilityLabel="AutoSPF+ Logo"
              />
              <Text style={styles.heading}>Welcome back</Text>
              <Text style={styles.subheading}>Sign in to continue to your account</Text>
            </Animated.View>

            {/* Lock / Attempt Banner */}
            {isLocked && (
              <Animated.View entering={FadeInDown.duration(200)} style={styles.alertBox}>
                <Ionicons name="lock-closed" size={14} color="#FCA5A5" />
                <Text style={styles.alertText}> Locked — try again in {lockCountdown || '15:00'}</Text>
              </Animated.View>
            )}
            {!isLocked && loginAttempts > 0 && remainingAttempts !== null && (
              <Animated.View entering={FadeInDown.duration(200)} style={[styles.alertBox, styles.alertWarn]}>
                <Ionicons name="warning-outline" size={14} color="#FCD34D" />
                <Text style={[styles.alertText, { color: '#FCD34D' }]}> {loginAttempts} failed attempt{loginAttempts !== 1 ? 's' : ''} · {remainingAttempts} remaining</Text>
              </Animated.View>
            )}

            {/* Form */}
            <Animated.View entering={FadeInDown.delay(160).duration(350)}>

              {/* Email — label text only as placeholder inside field */}
              <View style={[
                styles.inputWrap,
                styles.inputWrapFirst,
                emailFocused && !emailError ? styles.inputWrapFocused : null,
                emailError ? styles.inputWrapError : null,
              ]}>
                <TextInput
                  style={styles.input}
                  placeholder="Email address"
                  placeholderTextColor="rgba(255,255,255,0.28)"
                  value={email}
                  onChangeText={t => { setEmail(t); setEmailError(''); setAuthError(''); }}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                />
              </View>
              {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}

              {/* Password */}
              <View style={[
                styles.inputWrap,
                styles.inputWrapSpaced,
                passwordFocused && !passwordError ? styles.inputWrapFocused : null,
                passwordError ? styles.inputWrapError : null,
              ]}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Password"
                  placeholderTextColor="rgba(255,255,255,0.28)"
                  value={password}
                  onChangeText={t => { setPassword(t); setPasswordError(''); setAuthError(''); }}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={18} color="rgba(255,255,255,0.40)" />
                </TouchableOpacity>
              </View>
              <View style={styles.forgotOnlyRow}>
                <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')}>
                  <Text style={styles.forgotLink}>Forgot password?</Text>
                </TouchableOpacity>
              </View>
              {authError ? <Text style={styles.authErrorText}>{authError}</Text> : null}
              {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}

              {/* Keep signed in */}
              <TouchableOpacity
                style={styles.checkRow}
                onPress={() => { if (Platform.OS !== 'web') Haptics.selectionAsync(); setKeepSignedIn(!keepSignedIn); }}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, keepSignedIn && styles.checkboxOn]}>
                  {keepSignedIn && <Ionicons name="checkmark" size={12} color="#FFF" />}
                </View>
                <Text style={styles.checkLabel}>Keep me signed in</Text>
              </TouchableOpacity>

              {/* Sign In */}
              <TouchableOpacity
                style={[styles.signInBtn, (loading || isLocked) && styles.signInBtnOff]}
                onPress={handleLogin}
                disabled={loading || isLocked}
                activeOpacity={0.87}
              >
                {loading ? (
                  <View style={styles.signInLoadingRow}>
                    <ActivityIndicator size="small" color="#FFF" />
                    <Text style={styles.signInBtnText}>Signing in...</Text>
                  </View>
                ) : (
                  <Text style={styles.signInBtnText}>{isLocked ? `Locked — ${lockCountdown}` : 'Sign in  →'}</Text>
                )}
              </TouchableOpacity>

            </Animated.View>

            {/* Footer */}
            <Animated.View entering={FadeInDown.delay(300).duration(350)} style={styles.footer}>
              <Text style={styles.footerText}>New to AutoSPF+? </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
                <Text style={styles.footerLink}>Create an account</Text>
              </TouchableOpacity>
            </Animated.View>

          </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
  },
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 24,
  },
  card: {
    width: '100%',
  },

  // Header
  headerBlock: {
    marginBottom: 28,
  },
  logo: {
    width: 140,
    aspectRatio: 604 / 413,
    alignSelf: 'center',
    marginBottom: 20,
  },
  heading: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subheading: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.50)',
    fontWeight: '400',
    lineHeight: 20,
    textAlign: 'center',
  },

  // Alert banners — dark variants
  alertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(220,38,38,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.25)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 18,
  },
  alertWarn: {
    backgroundColor: 'rgba(180,83,9,0.10)',
    borderColor: 'rgba(180,83,9,0.25)',
  },
  alertText: {
    fontSize: 13,
    color: '#FCA5A5',
    fontWeight: '500',
  },

  // Form
  inputWrapFirst: {
    marginTop: 4,
  },
  inputWrapSpaced: {
    marginTop: 18,
  },
  forgotOnlyRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
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
  inputWrapFocused: {
    borderColor: '#FF6B00',
  },
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
  authErrorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
    marginBottom: 4,
    fontWeight: '500',
  },
  signInLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  // Checkbox
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 22,
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

  // Sign In Button — orange
  signInBtn: {
    height: 50,
    borderRadius: 13,
    backgroundColor: '#F97316',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 10,
    elevation: 4,
  },
  signInBtnOff: {
    backgroundColor: '#1A1A1A',
    shadowOpacity: 0,
  },
  signInBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
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
