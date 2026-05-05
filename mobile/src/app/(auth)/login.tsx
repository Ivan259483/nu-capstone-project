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
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as Crypto from 'expo-crypto';
import Svg, { Path, G, ClipPath, Rect, Defs } from 'react-native-svg';
import { useAuth } from '@/context/AuthContext';
import { GOOGLE_WEB_CLIENT_ID } from '@/config/env';
import { Toast } from '@/components/ui/PremiumToast';
import { Validation } from '@/utils/validation';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const { signIn, signInWithGoogle } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

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
    setEmailError(''); setPasswordError('');
    let hasError = false;
    if (!email) { setEmailError('Email is required'); hasError = true; }
    else if (!Validation.isValidEmail(email)) { setEmailError('Please enter a valid email'); hasError = true; }
    if (!password) { setPasswordError('Password is required'); hasError = true; }
    if (hasError) return;

    setLoading(true);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await signIn(email.trim(), password);
    if (result.success) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsLocked(false); setLockUntilMs(null);
      router.replace('/');
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
        Toast.show(result.message || 'Invalid credentials.', 'error');
      } else {
        Toast.show(result.message || 'Invalid credentials. Please try again.', 'error');
      }
    }
    setLoading(false);
  }

  async function promptGoogleSignIn() {
    setGoogleLoading(true);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const randomBytes = await Crypto.getRandomBytesAsync(32);
      const codeVerifier = btoa(String.fromCharCode(...randomBytes))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      const digest = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256, codeVerifier,
        { encoding: Crypto.CryptoEncoding.BASE64 }
      );
      const codeChallenge = digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      const redirectUri = Linking.createURL('');
      const state = Math.random().toString(36).substring(2, 15);
      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(GOOGLE_WEB_CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent('openid profile email')}` +
        `&code_challenge=${codeChallenge}&code_challenge_method=S256` +
        `&state=${state}&access_type=offline&prompt=select_account`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type === 'success' && result.url) {
        const urlObj = new URL(result.url);
        const code = urlObj.searchParams.get('code');
        if (!code) { Toast.show('Google sign-in failed: no code returned.', 'error'); setGoogleLoading(false); return; }
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, client_id: GOOGLE_WEB_CLIENT_ID, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: codeVerifier }).toString(),
        });
        const tokenData = await tokenResponse.json();
        const idToken = tokenData?.id_token;
        if (!idToken) { Toast.show('Google sign-in failed: could not get ID token.', 'error'); setGoogleLoading(false); return; }
        const signInResult = await signInWithGoogle(idToken);
        if (signInResult.success) {
          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.replace('/');
        } else {
          Toast.show(signInResult.message || 'Google sign-in failed.', 'error');
        }
      }
    } catch (error: any) {
      Toast.show(error.message || 'Google sign-in failed.', 'error');
    }
    setGoogleLoading(false);
  }

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Card */}
          <Animated.View entering={FadeIn.duration(400)} style={styles.card}>

            {/* Logo + Header */}
            <Animated.View entering={FadeInDown.delay(80).duration(350)} style={styles.headerBlock}>
              <Text style={styles.logoText}>AutoSPF<Text style={styles.logoPlus}>+</Text></Text>
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
              <View style={[styles.inputWrap, styles.inputWrapFirst, emailError ? styles.inputWrapError : null]}>
                <TextInput
                  style={styles.input}
                  placeholder="Email address"
                  placeholderTextColor="rgba(255,255,255,0.28)"
                  value={email}
                  onChangeText={t => { setEmail(t); setEmailError(''); }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                />
              </View>
              {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}

              {/* Password — forgot link only; placeholder inside field */}
              <View style={styles.forgotOnlyRow}>
                <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')}>
                  <Text style={styles.forgotLink}>Forgot password?</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.inputWrap, passwordError ? styles.inputWrapError : null]}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Password"
                  placeholderTextColor="rgba(255,255,255,0.28)"
                  value={password}
                  onChangeText={t => { setPassword(t); setPasswordError(''); }}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={18} color="rgba(255,255,255,0.40)" />
                </TouchableOpacity>
              </View>
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
                {loading
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Text style={styles.signInBtnText}>{isLocked ? `Locked — ${lockCountdown}` : 'Sign in  →'}</Text>
                }
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.divRow}>
                <View style={styles.divLine} />
                <Text style={styles.divText}>OR</Text>
                <View style={styles.divLine} />
              </View>

              {/* Google */}
              <TouchableOpacity
                style={styles.socialBtn}
                onPress={promptGoogleSignIn}
                disabled={googleLoading || loading}
                activeOpacity={0.87}
              >
                {googleLoading ? <ActivityIndicator size="small" color="#555" /> : (
                  <>
                    <View style={styles.googleIconWrap}>
                      <Svg width={18} height={18} viewBox="0 0 48 48">
                        <Defs>
                          <ClipPath id="gc"><Rect width={48} height={48} rx={24} /></ClipPath>
                        </Defs>
                        <G clipPath="url(#gc)">
                          <Path d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.3-.2-2.7-.5-4z" fill="#FBC02D" />
                          <Path d="M6.3 14.7l7 5.1C15 16.1 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 16.3 3 9.7 7.9 6.3 14.7z" fill="#E53935" />
                          <Path d="M24 45c5.5 0 10.4-1.9 14.2-5.1l-6.6-5.5C29.5 36 26.9 37 24 37c-6.1 0-10.7-3.1-11.8-8.5l-7 5.4C8.6 41 15.8 45 24 45z" fill="#4CAF50" />
                          <Path d="M44.5 20H24v8.5h11.8c-.6 2.9-2.5 5.4-5 7l6.6 5.5C41.7 37.3 44.5 31 44.5 24c0-1.3-.2-2.7-.5-4z" fill="#1565C0" />
                        </G>
                      </Svg>
                    </View>
                    <Text style={styles.socialBtnText}>Continue with Google</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Apple */}
              <TouchableOpacity
                style={styles.socialBtn}
                disabled={loading}
                activeOpacity={0.87}
                onPress={() => Toast.show('Apple Sign-In coming soon.', 'info')}
              >
                <Ionicons name="logo-apple" size={18} color="#FFFFFF" style={{ marginRight: 10 }} />
                <Text style={styles.socialBtnText}>Continue with Apple</Text>
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
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  card: {
    width: '100%',
  },

  // Header
  headerBlock: {
    marginBottom: 28,
  },
  logoText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
    marginBottom: 20,
  },
  logoPlus: {
    color: '#F97316',
  },
  heading: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subheading: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.50)',
    fontWeight: '400',
    lineHeight: 20,
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
  forgotOnlyRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 8,
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
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
    backgroundColor: '#111111',
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
  eyeBtn: { padding: 4 },
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

  // Divider
  divRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  divLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.10)' },
  divText: {
    color: 'rgba(255,255,255,0.30)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginHorizontal: 12,
  },

  // Social Buttons — dark cards
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#111111',
    marginBottom: 12,
  },
  googleIconWrap: { marginRight: 10 },
  socialBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
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
