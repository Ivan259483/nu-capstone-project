import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { sendPasswordResetEmail } from 'firebase/auth';

import { auth } from '@/config/firebase';
import { Palette } from '@/constants/theme';
import PremiumInput from '@/components/ui/PremiumInput';
import PremiumButton from '@/components/ui/PremiumButton';
import { Validation } from '@/utils/validation';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const triggerHapticSelection = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
  };

  const triggerHapticSuccess = () => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  async function handleResetPassword() {
    setEmailError('');
    if (!email) {
      setEmailError('Email is required');
      return;
    } else if (!Validation.isValidEmail(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    triggerHapticSelection();

    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSubmitted(true);
      triggerHapticSuccess();
    } catch (error: any) {
      const msg = error?.code === 'auth/user-not-found' 
        ? 'If this email is registered, a reset link will be sent.' 
        : error?.message || 'Failed to send reset email';
      
      // Even if user not found, for security we often show success to prevent enumeration,
      // but Firebase returns user-not-found explicitly if protection isn't enabled.
      // We will handle it gracefully.
      if (error?.code === 'auth/user-not-found') {
        setSubmitted(true);
        triggerHapticSuccess();
      } else {
        Alert.alert('Reset Failed', msg, [{ text: 'OK' }]);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
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
        {/* Back Button */}
        <Animated.View entering={FadeInDown.delay(50).springify().damping(16).stiffness(120)} style={styles.backButtonContainer}>
             <TouchableOpacity 
                style={styles.backButton}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                onPress={() => {
                   triggerHapticSelection();
                   router.back();
                }}
             >
                <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
             </TouchableOpacity>
        </Animated.View>

        {/* Header */}
        <Animated.View entering={FadeInDown.delay(100).springify().damping(16).stiffness(120)} style={styles.headerContainer}>
          <View style={styles.iconWrapper}>
            <Ionicons name="lock-closed-outline" size={32} color={Palette.accent} />
          </View>
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>
            Enter your email address and we'll send you a link to securely reset your password.
          </Text>
        </Animated.View>

        {/* Form or Success State */}
        {!submitted ? (
          <View style={styles.formContainer}>
            <Animated.View entering={FadeInUp.delay(200).springify().damping(16).stiffness(120)}>
              <PremiumInput
                label="EMAIL ADDRESS"
                iconName="mail-outline"
                placeholder="Ex. johndoe@company.com"
                value={email}
                onChangeText={(t: string) => { setEmail(t); setEmailError(''); }}
                keyboardType="email-address"
                autoCapitalize="none"
                error={emailError}
              />
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(300).springify().damping(15).stiffness(100)} style={{ marginTop: 40 }}>
              <PremiumButton
                title={loading ? 'SENDING LINK...' : 'SEND RESET LINK'}
                icon={loading ? undefined : 'paper-plane-outline'}
                onPress={handleResetPassword}
                disabled={loading}
              />
            </Animated.View>
          </View>
        ) : (
          <Animated.View entering={FadeInUp.delay(100).springify().damping(15).stiffness(100)} style={styles.successContainer}>
            <View style={styles.successIconWrapper}>
              <Ionicons name="mail-unread-outline" size={48} color={Palette.accent} />
            </View>
            <Text style={styles.successTitle}>Check your inbox</Text>
            <Text style={styles.successMessage}>
              If an account exists for <Text style={{ color: '#FFF', fontWeight: '600' }}>{email}</Text>, we have sent a secure password reset link.
            </Text>
            
            <View style={{ marginTop: 40, width: '100%' }}>
              <PremiumButton
                title="BACK TO LOGIN"
                onPress={() => {
                  triggerHapticSelection();
                  router.push('/(auth)/login');
                }}
              />
            </View>
          </Animated.View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  ambientBackground: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  ambientTopGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    opacity: 0.8,
  },
  ambientBottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    opacity: 0.6,
  },
  backButtonContainer: {
    position: 'absolute',
    top: 60,
    left: 20,
    zIndex: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.2)',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: '#8A8A9A',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 10,
  },
  formContainer: {
    width: '100%',
  },
  successContainer: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  successIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  successMessage: {
    fontSize: 15,
    color: '#8A8A9A',
    textAlign: 'center',
    lineHeight: 22,
  },
});
