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
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';
import { Palette, Shadows } from '@/constants/theme';
import PremiumButton from '@/components/ui/PremiumButton';
import PremiumInput from '@/components/ui/PremiumInput';
import { Toast } from '@/components/ui/PremiumToast';
import { Validation } from '@/utils/validation';

const { height } = Dimensions.get('window');

export default function SignUpScreen() {
  const { signUp } = useAuth();
  
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Validation Errors
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  async function handleSignUp() {
    setNameError('');
    setEmailError('');
    setPasswordError('');

    let hasError = false;

    if (!fullName) {
      setNameError('Full name is required');
      hasError = true;
    } else if (!Validation.isValidName(fullName)) {
      setNameError('Please enter a valid full name (min 3 chars)');
      hasError = true;
    }

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
    } else if (!Validation.isStrongPassword(password)) {
      setPasswordError('Must be 8+ chars and contain upper, lower, & numbers');
      hasError = true;
    }

    if (hasError) {
      return;
    }

    setLoading(true);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    const result = await signUp(fullName.trim(), email.trim(), password);
    if (result.success) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } else {
      Toast.show(result.message || 'Unable to create account.', 'error');
    }
    setLoading(false);
  }

  const triggerHapticSelection = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
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
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
            
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

            {/* Branding Header Area */}
            <Animated.View entering={FadeInDown.delay(100).springify().damping(16).stiffness(120)} style={styles.headerContainer}>
              <Text style={styles.welcomeText}>Create Account</Text>
              <Text style={styles.welcomeSubtext}>Join AutoSPF+ for premium vehicle service.</Text>
            </Animated.View>

            {/* Floating Inputs Form */}
            <View style={styles.formContainer}>
                {/* Full Name */}
                <Animated.View entering={FadeInUp.delay(200).springify().damping(16).stiffness(120)}>
                  <PremiumInput
                    label="FULL NAME"
                    iconName="person-outline"
                    placeholder="Juan Dela Cruz"
                    value={fullName}
                    onChangeText={(t) => { setFullName(t); setNameError(''); }}
                    autoCapitalize="words"
                    error={nameError}
                  />
                </Animated.View>

                {/* Email */}
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

                {/* Password */}
                <Animated.View entering={FadeInUp.delay(400).springify().damping(16).stiffness(120)}>
                  <PremiumInput
                    label="PASSWORD"
                    iconName="lock-closed-outline"
                    placeholder="Min. 8 chars, 1 upper, 1 lower, 1 number"
                    value={password}
                    onChangeText={(t) => { setPassword(t); setPasswordError(''); }}
                    isPassword
                    error={passwordError}
                  />
                </Animated.View>

                {/* Sign Up Button */}
                <Animated.View entering={FadeInUp.delay(600).springify().damping(15).stiffness(100)} style={{ marginTop: 40 }}>
                  <PremiumButton
                    title={loading ? 'CREATING...' : 'SIGN UP'}
                    icon={loading ? undefined : 'person-add-outline'}
                    onPress={handleSignUp}
                    disabled={loading}
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
                Already have an account?{' '}
              </Text>
              <TouchableOpacity onPress={() => {
                  triggerHapticLight();
                  router.back();
              }}>
                <Text style={{ color: Palette.accent, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 }}>
                  Sign In
                </Text>
              </TouchableOpacity>
            </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContainer: {
    paddingHorizontal: 32,
    paddingTop: height * 0.15,
    paddingBottom: 40,
    flexGrow: 1,
  },
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

  headerContainer: { alignItems: 'flex-start', marginBottom: 40, marginTop: 40 },
  welcomeText: { fontSize: 32, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  welcomeSubtext: { fontSize: 14, color: '#8A8A9A', marginTop: 8, fontWeight: '500', lineHeight: 22 },
  
  formContainer: {
    width: '100%',
  },
});
