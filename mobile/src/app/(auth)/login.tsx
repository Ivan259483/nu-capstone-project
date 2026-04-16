import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp, FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useThemeContext';
import { useAuth } from '@/context/AuthContext';
import { Palette, Shadows } from '@/constants/theme';
import PremiumButton from '@/components/ui/PremiumButton';
import PremiumInput from '@/components/ui/PremiumInput';
import { Toast } from '@/components/ui/PremiumToast';
import { Validation } from '@/utils/validation';

const { width, height } = Dimensions.get('window');



/* ═══════════════════════════════════════
   LoginScreen Component
═══════════════════════════════════════ */
export default function LoginScreen() {
  const { signIn } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Brute-force lock state (driven by backend structured data)
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [lockUntilMs, setLockUntilMs] = useState<number | null>(null);
  const [lockCountdown, setLockCountdown] = useState('');

  // Validation errors
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');


  // Lock countdown timer
  useEffect(() => {
    if (!isLocked || !lockUntilMs) return;
    const tick = () => {
      const diff = lockUntilMs - Date.now();
      if (diff <= 0) {
        setIsLocked(false);
        setLockUntilMs(null);
        setLockCountdown('');
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

  async function handleLogin() {
    if (isLocked) {
      Toast.show(`Account locked. Try again in ${lockCountdown}.`, 'error');
      return;
    }

    setEmailError('');
    setPasswordError('');
    
    let hasError = false;

    if (!email) {
      setEmailError('Email is required');
      hasError = true;
    } else if (!Validation.isValidEmail(email)) {
      setEmailError('Please enter a valid email address');
      hasError = true;
    }

    if (!password) {
      setPasswordError('Password is required');
      hasError = true;
    }

    if (hasError) return;

    setLoading(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    const result = await signIn(email.trim(), password);

    if (result.success) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      // Reset attempt tracking on success
      setLoginAttempts(0);
      setRemainingAttempts(null);
      setIsLocked(false);
      setLockUntilMs(null);
      router.replace('/');
    } else {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      // Parse structured lock / attempt data from backend
      if (result.data?.locked || result.data?.lockUntilMs) {
        setIsLocked(true);
        setLockUntilMs(result.data.lockUntilMs ?? Date.now() + 15 * 60 * 1000);
        setLoginAttempts(0);
        setRemainingAttempts(0);
        Toast.show(result.message || 'Account locked for 15 minutes.', 'error');
      } else if (result.data?.remainingAttempts !== undefined) {
        setLoginAttempts(result.data.loginAttempts ?? loginAttempts + 1);
        setRemainingAttempts(result.data.remainingAttempts);
        Toast.show(result.message || 'Invalid credentials.', 'error');
      } else {
        // Firebase-level error or unknown (no structured data)
        Toast.show(result.message || 'Invalid credentials. Please try again.', 'error');
      }
    }

    setLoading(false);
  }

  const triggerHapticSelection = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
  };

  const triggerHapticImpact = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const triggerHapticLight = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={[styles.container, { backgroundColor: '#050505' }]}>
      {/* Ambient Backgrounds */}
      <View style={styles.ambientBackground}>
        <LinearGradient
          colors={['rgba(249, 115, 22, 0.1)', 'transparent']}
          style={styles.ambientTopGlow}
        />
        <LinearGradient
          colors={['transparent', 'rgba(249, 115, 22, 0.05)']}
          style={styles.ambientBottomFade}
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 32 }}
      >
        {/* Premium Back Button */}
        <Animated.View entering={FadeInDown.delay(50).duration(200)} style={styles.backButtonContainer}>
             <TouchableOpacity 
                style={styles.backButton}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                onPress={() => {
                   triggerHapticLight();
                   router.back();
                }}
             >
                <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
             </TouchableOpacity>
        </Animated.View>

        {/* Branding & Logo */}
        <Animated.View entering={FadeInDown.delay(100).duration(200)} style={styles.headerContainer}>
          <View style={styles.iconWrapper}>
            <LinearGradient
              colors={[Palette.accent, Palette.accentDark]}
              style={[StyleSheet.absoluteFillObject, { borderRadius: 18 }]}
            />
            <Text style={styles.iconLetter}>A</Text>
          </View>
          <Text style={styles.title}>
            AutoSPF<Text style={{ color: Palette.accent }}>+</Text>
          </Text>
          <Text style={styles.subtitle}>CUSTOMER PORTAL</Text>
        </Animated.View>

        {/* Welcome Text */}
        <Animated.View entering={FadeInUp.delay(200).duration(200)} style={styles.welcomeArea}>
            <Text style={styles.welcomeText}>Welcome Back</Text>
            <Text style={styles.welcomeSubtext}>
              Access your appointments, vehicle status, and service history
            </Text>
        </Animated.View>



            {/* Floating Inputs Form */}
        <View style={styles.formContainer}>
            <Animated.View entering={FadeInUp.delay(300).duration(200)}>
              <PremiumInput
                label="EMAIL ADDRESS"
                iconName="mail-outline"
                placeholder="name@example.com"
                value={email}
                onChangeText={(t) => { setEmail(t); setEmailError(''); }}
                autoCapitalize="none"
                keyboardType="email-address"
                error={emailError}
              />
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(400).duration(200)}>
              <PremiumInput
                label="PASSWORD"
                iconName="lock-closed-outline"
                placeholder="••••••••"
                value={password}
                onChangeText={(t) => { setPassword(t); setPasswordError(''); }}
                isPassword
                error={passwordError}
              />
            </Animated.View>

            {/* ── Failed-attempt inline warning ── */}
            {loginAttempts > 0 && !isLocked && remainingAttempts !== null && (
              <Animated.View entering={FadeInUp.duration(200)} style={styles.warningBanner}>
                <Ionicons name="warning-outline" size={16} color="#FCD34D" />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.warningTitle}>{loginAttempts} Failed Attempt{loginAttempts !== 1 ? 's' : ''}</Text>
                  <Text style={styles.warningBody}>
                    {remainingAttempts} attempt{remainingAttempts !== 1 ? 's' : ''} remaining before your account is locked for 15 minutes.
                  </Text>
                </View>
              </Animated.View>
            )}

            {/* ── Account locked panel ── */}
            {isLocked && (
              <Animated.View entering={FadeInUp.duration(200)} style={styles.lockBanner}>
                <Ionicons name="lock-closed" size={20} color="#F87171" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.lockTitle}>Account Temporarily Locked</Text>
                  <Text style={styles.lockBody}>
                    Too many failed attempts. Try again in{' '}
                    <Text style={styles.lockTimer}>{lockCountdown || '15:00'}</Text>.
                  </Text>
                </View>
              </Animated.View>
            )}

            {/* Forgot Password */}
            <Animated.View entering={FadeInUp.delay(500).duration(200)}>
              <TouchableOpacity
                style={{ alignSelf: 'flex-end', marginTop: 16 }}
                onPress={() => {
                  triggerHapticSelection();
                  router.push('/(auth)/forgot-password');
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: Palette.accent, letterSpacing: 0.5 }}>
                  Forgot Password?
                </Text>
              </TouchableOpacity>
            </Animated.View>

            {/* Sign In Button */}
            <Animated.View entering={FadeInUp.delay(600).duration(200)} style={{ marginTop: 32 }}>
              <PremiumButton
                title={isLocked ? `LOCKED — ${lockCountdown || '15:00'}` : loading ? 'SIGNING IN...' : 'SIGN IN'}
                icon={loading || isLocked ? undefined : 'log-in-outline'}
                onPress={handleLogin}
                disabled={loading || isLocked}
              />
            </Animated.View>
        </View>

        {/* Footer */}
        <Animated.View
          entering={FadeInUp.delay(700).duration(200)}
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            marginTop: 40,
          }}
        >
          <Text style={{ color: '#8A8A9A', fontSize: 13, fontWeight: '500' }}>
            Don't have an account?{' '}
          </Text>
          <TouchableOpacity onPress={() => {
              triggerHapticImpact();
              router.push('/(auth)/signup');
          }}>
            <Text style={{ color: Palette.accent, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 }}>
              Create Account
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  ambientBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#050505',
    zIndex: -1,
  },
  ambientTopGlow: {
    position: 'absolute',
    top: -50,
    left: 0,
    right: 0,
    height: height * 0.5,
  },
  ambientBottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '40%',
  },

  backButtonContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 24,
    zIndex: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  headerContainer: { alignItems: 'center', marginBottom: 24 },
  iconWrapper: {
    width: 60,
    height: 60,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    ...Shadows.glow,
  },
  iconLetter: { color: '#fff', fontSize: 28, fontWeight: '900', zIndex: 2 },
  title: { fontSize: 32, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  subtitle: { fontSize: 10, fontWeight: '800', color: '#8A8A9A', letterSpacing: 3, marginTop: 6 },
  
  welcomeArea: {
    marginBottom: 16,
    alignItems: 'center',
  },
  welcomeText: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', letterSpacing: 0.5 },
  welcomeSubtext: { fontSize: 14, color: '#8A8A9A', textAlign: 'center', marginTop: 8, fontWeight: '500' },
  


  formContainer: {
    width: '100%',
  },

  // Failed-attempt warning banner
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
  },
  warningTitle: { fontSize: 13, fontWeight: '700', color: '#FCD34D' },
  warningBody: { fontSize: 12, color: 'rgba(252, 211, 77, 0.75)', marginTop: 3, lineHeight: 17 },

  // Account locked panel
  lockBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  lockTitle: { fontSize: 14, fontWeight: '700', color: '#F87171' },
  lockBody: { fontSize: 12, color: 'rgba(248, 113, 113, 0.75)', marginTop: 3, lineHeight: 17 },
  lockTimer: { fontWeight: '900', color: '#F87171', fontVariant: ['tabular-nums'] as any },
});
