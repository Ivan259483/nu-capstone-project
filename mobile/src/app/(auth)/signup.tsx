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
import { authService } from '@/services/api/authService';
import { getApiErrorMessage } from '@/services/api/client';

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

  // OTP State
  const [otpStep, setOtpStep] = useState<'form' | 'verify'>('form');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const otpInputRefs = React.useRef<Array<TextInput | null>>([]);

  React.useEffect(() => {
    if (otpCountdown > 0) {
      const timer = setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpCountdown]);

  const handleSendOtp = async () => {
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

    if (hasError) return;

    setLoading(true);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await authService.sendOtp(email.trim());
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setOtpStep('verify');
      setOtpCountdown(60);
    } catch (error: any) {
      Alert.alert('Error', getApiErrorMessage(error, 'Failed to send verification code.'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const otp = otpDigits.join('');
    if (otp.length < 6) {
      Alert.alert('Invalid', 'Please enter the fully 6-digit code.');
      return;
    }

    setLoading(true);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await authService.verifyOtp(email.trim(), otp);
      
      // OTP matched. Proceed to register the account!
      const result = await signUp(fullName.trim(), email.trim(), password);
      if (result.success) {
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace('/');
      } else {
        Alert.alert('Sign Up Failed', result.message || 'Unable to create account. Please check your details and try again.', [{ text: 'OK' }]);
      }
    } catch (error: any) {
      Alert.alert('Verification Failed', getApiErrorMessage(error, 'Invalid code.'));
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (text: string, index: number) => {
    // Only accept numbers
    const cleanText = text.replace(/[^0-9]/g, '');
    
    const newDigits = [...otpDigits];
    newDigits[index] = cleanText.substring(0, 1);
    setOtpDigits(newDigits);

    // Auto-advance
    if (cleanText && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otpDigits[index] && index > 0) {
      // Auto-retreat
      otpInputRefs.current[index - 1]?.focus();
      const newDigits = [...otpDigits];
      newDigits[index - 1] = '';
      setOtpDigits(newDigits);
    }
  };

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

            {/* Branding Header Area */}
            <Animated.View entering={FadeInDown.delay(100).duration(200)} style={styles.headerContainer}>
              <Text style={styles.welcomeText}>Create Account</Text>
              <Text style={styles.welcomeSubtext}>Join AutoSPF+ for premium vehicle service.</Text>
            </Animated.View>

            {/* Floating Inputs Form & OTP */}
            <View style={styles.formContainer}>
              {otpStep === 'form' ? (
                <>
                  {/* Full Name */}
                  <Animated.View entering={FadeInUp.delay(200).duration(200)}>
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

                  {/* Password */}
                  <Animated.View entering={FadeInUp.delay(400).duration(200)}>
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

                  {/* Send OTP Button */}
                  <Animated.View entering={FadeInUp.delay(600).duration(200)} style={{ marginTop: 40 }}>
                    <PremiumButton
                      title={loading ? 'SENDING CODE...' : 'CONTINUE'}
                      icon={loading ? undefined : 'arrow-forward-outline'}
                      onPress={handleSendOtp}
                      disabled={loading}
                    />
                  </Animated.View>
                </>
              ) : (
                <Animated.View entering={FadeInUp.delay(100).duration(200)}>
                  <Text style={styles.otpInstructions}>
                    Enter the 6-digit verification code sent to {email}
                  </Text>
                  
                  <View style={styles.otpContainer}>
                    {otpDigits.map((digit, index) => (
                      <TextInput
                        key={index}
                        ref={(ref: any) => (otpInputRefs.current[index] = ref)}
                        style={[styles.otpInput, digit && styles.otpInputFilled]}
                        maxLength={1}
                        keyboardType="number-pad"
                        value={digit}
                        onChangeText={(text) => handleOtpChange(text, index)}
                        onKeyPress={(e) => handleOtpKeyPress(e, index)}
                        selectTextOnFocus
                      />
                    ))}
                  </View>

                  <Animated.View entering={FadeInUp.delay(300).duration(200)} style={{ marginTop: 40 }}>
                    <PremiumButton
                      title={loading ? 'VERIFYING...' : 'VERIFY & REGISTER'}
                      icon={loading ? undefined : 'checkmark-circle-outline'}
                      onPress={handleVerifyOtp}
                      disabled={loading || otpDigits.join('').length < 6}
                    />
                  </Animated.View>

                  <View style={styles.otpFooter}>
                    <TouchableOpacity
                      disabled={otpCountdown > 0 || loading}
                      onPress={handleSendOtp}
                    >
                      <Text style={[styles.resendText, otpCountdown > 0 && styles.resendTextDisabled]}>
                        {otpCountdown > 0 ? `Resend Code in ${otpCountdown}s` : 'Resend Code'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setOtpStep('form')}>
                      <Text style={styles.changeEmailText}>Change Email</Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              )}
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

  otpInstructions: {
    fontSize: 14,
    color: '#8A8A9A',
    marginBottom: 24,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  otpInput: {
    width: 48,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    color: '#FFF',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  otpInputFilled: {
    borderColor: Palette.accent,
    backgroundColor: 'rgba(249, 115, 22, 0.05)',
  },
  otpFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    paddingHorizontal: 10,
  },
  resendText: {
    color: Palette.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  resendTextDisabled: {
    color: '#555',
  },
  changeEmailText: {
    color: '#8A8A9A',
    fontSize: 14,
    fontWeight: '500',
  },
});
