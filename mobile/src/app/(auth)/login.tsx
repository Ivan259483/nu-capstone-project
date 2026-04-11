import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useThemeContext';
import { useAuth } from '@/context/AuthContext';
import { Palette, Shadows } from '@/constants/theme';
import PremiumButton from '@/components/ui/PremiumButton';
import PremiumInput from '@/components/ui/PremiumInput';
import { Toast } from '@/components/ui/PremiumToast';
import { Validation } from '@/utils/validation';

const { height } = Dimensions.get('window');

export default function LoginScreen() {
  const { signIn } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  
  // Validation errors
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Cooldown timer for rate-limiting
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleLogin() {
    if (cooldown > 0) {
      Toast.show(`Please wait ${cooldown}s before trying again.`, 'error');
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

    if (hasError) {
      return;
    }

    setLoading(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const result = await signIn(email.trim(), password);
    if (result.success) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.replace('/');
    } else {
      // If rate-limited or locked, enforce a 30-second cooldown locally
      if (result.message?.toLowerCase().includes('too many') || result.message?.toLowerCase().includes('locked')) {
        setCooldown(30);
      }
      Alert.alert('Login Failed', result.message || 'Invalid credentials. Please try again.', [{ text: 'OK' }]);
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
        <Animated.View entering={FadeInDown.delay(50).springify().damping(16).stiffness(120)} style={styles.backButtonContainer}>
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
        <Animated.View entering={FadeInDown.delay(100).springify().damping(16).stiffness(120)} style={styles.headerContainer}>
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
        <Animated.View entering={FadeInUp.delay(200).springify().damping(16).stiffness(120)} style={styles.welcomeArea}>
            <Text style={styles.welcomeText}>Welcome Back</Text>
            <Text style={styles.welcomeSubtext}>Sign in to manage your vehicle services.</Text>
        </Animated.View>

        {/* Floating Inputs Form */}
        <View style={styles.formContainer}>
            <Animated.View entering={FadeInUp.delay(300).springify().damping(16).stiffness(120)}>
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

            <Animated.View entering={FadeInUp.delay(400).springify().damping(16).stiffness(120)}>
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

            {/* Forgot Password */}
            <Animated.View entering={FadeInUp.delay(500).springify().damping(16).stiffness(120)}>
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
            <Animated.View entering={FadeInUp.delay(600).springify().damping(15).stiffness(100)} style={{ marginTop: 32 }}>
              <PremiumButton
                title={cooldown > 0 ? `WAIT ${cooldown}s` : loading ? 'SIGNING IN...' : 'SIGN IN'}
                icon={loading || cooldown > 0 ? undefined : 'log-in-outline'}
                onPress={handleLogin}
                disabled={loading || cooldown > 0}
              />
            </Animated.View>
        </View>

        {/* Footer */}
        <Animated.View
          entering={FadeInUp.delay(700).springify().damping(16).stiffness(120)}
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

  headerContainer: { alignItems: 'center', marginBottom: 40 },
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
    marginBottom: 40,
    alignItems: 'center',
  },
  welcomeText: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', letterSpacing: 0.5 },
  welcomeSubtext: { fontSize: 14, color: '#8A8A9A', textAlign: 'center', marginTop: 8, fontWeight: '500' },
  
  formContainer: {
    width: '100%',
  },
});
