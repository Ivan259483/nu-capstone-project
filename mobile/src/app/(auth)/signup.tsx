import React, { useState, useMemo } from 'react';
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
import { Palette } from '@/constants/theme';
import PremiumButton from '@/components/ui/PremiumButton';
import PremiumInput from '@/components/ui/PremiumInput';
import { Toast } from '@/components/ui/PremiumToast';
import { Validation } from '@/utils/validation';
import { authService } from '@/services/api/authService';
import { getApiErrorMessage } from '@/services/api/client';

const { height } = Dimensions.get('window');

/* ═══════════════════════════════════════
   FIELD VALIDATORS — per-field on-blur
═══════════════════════════════════════ */
const validators = {
  fullName: (v: string) => {
    if (!v.trim()) return 'Full name is required';
    if (!Validation.isValidName(v)) return 'Please enter a valid full name (min 3 chars)';
    return '';
  },
  contactNumber: (v: string) => {
    if (!v.trim()) return 'Contact number is required';
    if (!Validation.isValidPhone(v)) return 'Use Philippine format: 09171234567 or +639171234567';
    return '';
  },
  email: (v: string) => {
    if (!v.trim()) return 'Email is required';
    if (!Validation.isValidEmail(v)) return 'Please enter a valid email address';
    return '';
  },
  password: (v: string) => {
    if (!v) return 'Password is required';
    if (!Validation.isStrongPassword(v)) return 'Must be 8+ chars with upper, lower, number & special char';
    return '';
  },
  confirmPassword: (v: string, password: string) => {
    if (!v) return 'Please confirm your password';
    if (v !== password) return 'Passwords do not match';
    return '';
  },
  address: (v: string) => {
    if (!v.trim()) return 'Address is required';
    if (v.trim().length < 5) return 'Please enter a complete address';
    return '';
  },
};

/* ═══════════════════════════════════════
   SignUpScreen Component
═══════════════════════════════════════ */
export default function SignUpScreen() {
  const { signUp } = useAuth();

  // ── Form state ──
  const [fullName, setFullName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [address, setAddress] = useState('');

  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  // ── Per-field errors ──
  const [errors, setErrors] = useState({
    fullName: '',
    contactNumber: '',
    email: '',
    password: '',
    confirmPassword: '',
    address: '',
  });

  // ── Track which fields have been blurred (touched) ──
  const [touched, setTouched] = useState({
    fullName: false,
    contactNumber: false,
    email: false,
    password: false,
    confirmPassword: false,
    address: false,
  });

  // ── OTP State ──
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

  // ── On-blur validation ──
  const handleBlur = (field: keyof typeof errors) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    let errorMsg = '';
    if (field === 'confirmPassword') {
      errorMsg = validators.confirmPassword(confirmPassword, password);
    } else {
      const value = { fullName, contactNumber, email, password, address }[field] ?? '';
      errorMsg = validators[field](value);
    }
    setErrors(prev => ({ ...prev, [field]: errorMsg }));
  };

  // ── Clear error on change ──
  const handleChange = (field: keyof typeof errors, value: string, setter: (v: string) => void) => {
    setter(value);
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
    if (apiError) setApiError('');
  };

  // ── Determine if form is valid ──
  const isFormValid = useMemo(() => {
    return (
      fullName.trim().length >= 3 &&
      Validation.isValidPhone(contactNumber) &&
      Validation.isValidEmail(email) &&
      Validation.isStrongPassword(password) &&
      confirmPassword === password &&
      confirmPassword.length > 0 &&
      address.trim().length >= 5
    );
  }, [fullName, contactNumber, email, password, confirmPassword, address]);

  // ── Run all validators at once before submit ──
  const validateAll = (): boolean => {
    const newErrors = {
      fullName: validators.fullName(fullName),
      contactNumber: validators.contactNumber(contactNumber),
      email: validators.email(email),
      password: validators.password(password),
      confirmPassword: validators.confirmPassword(confirmPassword, password),
      address: validators.address(address),
    };
    setErrors(newErrors);
    setTouched({ fullName: true, contactNumber: true, email: true, password: true, confirmPassword: true, address: true });
    return !Object.values(newErrors).some(Boolean);
  };

  // ── Send OTP ──
  const handleSendOtp = async () => {
    if (!validateAll()) return;

    setLoading(true);
    setApiError('');
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await authService.sendOtp(email.trim());
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setOtpStep('verify');
      setOtpCountdown(60);
    } catch (error: any) {
      setApiError(getApiErrorMessage(error, 'Failed to send verification code.'));
    } finally {
      setLoading(false);
    }
  };

  // ── Verify OTP & Register ──
  const handleVerifyOtp = async () => {
    const otp = otpDigits.join('');
    if (otp.length < 6) {
      Alert.alert('Invalid', 'Please enter the full 6-digit code.');
      return;
    }

    setLoading(true);
    setApiError('');
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await authService.verifyOtp(email.trim(), otp);

      // OTP matched. Register the account!
      const result = await signUp(fullName.trim(), email.trim(), password);
      if (result.success) {
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Toast.show('Account created successfully! Welcome to AutoSPF+', 'success');
        router.replace('/');
      } else {
        setApiError(result.message || 'Unable to create account. Please check your details and try again.');
      }
    } catch (error: any) {
      setApiError(getApiErrorMessage(error, 'Invalid verification code.'));
    } finally {
      setLoading(false);
    }
  };

  // ── OTP Input Handlers ──
  const handleOtpChange = (text: string, index: number) => {
    const cleanText = text.replace(/[^0-9]/g, '');
    const newDigits = [...otpDigits];
    newDigits[index] = cleanText.substring(0, 1);
    setOtpDigits(newDigits);
    if (cleanText && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
      const newDigits = [...otpDigits];
      newDigits[index - 1] = '';
      setOtpDigits(newDigits);
    }
  };

  const triggerHapticLight = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={[styles.container, { backgroundColor: '#050505' }]}>
      {/* Ambient Backgrounds */}
      <View style={styles.ambientBackground}>
        <LinearGradient
          colors={['rgba(232, 101, 10, 0.1)', 'transparent']}
          style={styles.ambientTopGlow}
        />
        <LinearGradient
          colors={['transparent', 'rgba(232, 101, 10, 0.05)']}
          style={styles.ambientBottomFade}
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
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

          {/* Branding Header Area */}
          <Animated.View entering={FadeInDown.delay(100).duration(200)} style={styles.headerContainer}>
            <Text style={styles.welcomeText}>Create Account</Text>
            <Text style={styles.welcomeSubtext}>
              Join AutoSPF+ for premium vehicle service.
            </Text>
          </Animated.View>

          {/* Form / OTP */}
          <View style={styles.formContainer}>
            {otpStep === 'form' ? (
              <>
                {/* Full Name */}
                <Animated.View entering={FadeInUp.delay(150).duration(200)}>
                  <PremiumInput
                    label="FULL NAME"
                    iconName="person-outline"
                    placeholder="Juan Dela Cruz"
                    value={fullName}
                    onChangeText={(t) => handleChange('fullName', t, setFullName)}
                    onBlur={() => handleBlur('fullName')}
                    autoCapitalize="words"
                    error={touched.fullName ? errors.fullName : ''}
                  />
                </Animated.View>

                {/* Contact Number */}
                <Animated.View entering={FadeInUp.delay(200).duration(200)}>
                  <PremiumInput
                    label="CONTACT NUMBER"
                    iconName="call-outline"
                    placeholder="09171234567"
                    value={contactNumber}
                    onChangeText={(t) => handleChange('contactNumber', t, setContactNumber)}
                    onBlur={() => handleBlur('contactNumber')}
                    keyboardType="phone-pad"
                    error={touched.contactNumber ? errors.contactNumber : ''}
                  />
                </Animated.View>

                {/* Email */}
                <Animated.View entering={FadeInUp.delay(250).duration(200)}>
                  <PremiumInput
                    label="EMAIL ADDRESS"
                    iconName="mail-outline"
                    placeholder="name@example.com"
                    value={email}
                    onChangeText={(t) => handleChange('email', t, setEmail)}
                    onBlur={() => handleBlur('email')}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    error={touched.email ? errors.email : ''}
                  />
                </Animated.View>

                {/* Password */}
                <Animated.View entering={FadeInUp.delay(300).duration(200)}>
                  <PremiumInput
                    label="PASSWORD"
                    iconName="lock-closed-outline"
                    placeholder="Min. 8 chars, upper, lower, number, special"
                    value={password}
                    onChangeText={(t) => handleChange('password', t, setPassword)}
                    onBlur={() => handleBlur('password')}
                    isPassword
                    error={touched.password ? errors.password : ''}
                  />
                </Animated.View>

                {/* Confirm Password */}
                <Animated.View entering={FadeInUp.delay(350).duration(200)}>
                  <PremiumInput
                    label="CONFIRM PASSWORD"
                    iconName="shield-checkmark-outline"
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChangeText={(t) => handleChange('confirmPassword', t, setConfirmPassword)}
                    onBlur={() => handleBlur('confirmPassword')}
                    isPassword
                    error={touched.confirmPassword ? errors.confirmPassword : ''}
                  />
                </Animated.View>

                {/* Address */}
                <Animated.View entering={FadeInUp.delay(400).duration(200)}>
                  <PremiumInput
                    label="ADDRESS"
                    iconName="location-outline"
                    placeholder="123 Main St, Quezon City"
                    value={address}
                    onChangeText={(t) => handleChange('address', t, setAddress)}
                    onBlur={() => handleBlur('address')}
                    autoCapitalize="words"
                    error={touched.address ? errors.address : ''}
                  />
                </Animated.View>

                {/* API Error */}
                {apiError ? (
                  <Animated.View entering={FadeInUp.duration(200)} style={styles.apiErrorBanner}>
                    <Ionicons name="alert-circle" size={18} color="#EF4444" />
                    <Text style={styles.apiErrorText}>{apiError}</Text>
                  </Animated.View>
                ) : null}

                {/* Register Button */}
                <Animated.View entering={FadeInUp.delay(450).duration(200)} style={{ marginTop: 28 }}>
                  <PremiumButton
                    title={loading ? 'SENDING CODE...' : 'REGISTER'}
                    icon={loading ? undefined : 'arrow-forward-outline'}
                    onPress={handleSendOtp}
                    disabled={loading || !isFormValid}
                  />
                </Animated.View>

                {/* Disabled hint */}
                {!isFormValid && (
                  <Animated.View entering={FadeInUp.delay(500).duration(200)}>
                    <Text style={styles.disabledHint}>
                      Fill in all fields correctly to continue
                    </Text>
                  </Animated.View>
                )}
              </>
            ) : (
              <Animated.View entering={FadeInUp.delay(100).duration(200)}>
                <Text style={styles.otpInstructions}>
                  Enter the 6-digit verification code sent to{'\n'}
                  <Text style={{ color: '#E8650A', fontWeight: '700' }}>{email}</Text>
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

                {/* API Error in OTP step */}
                {apiError ? (
                  <Animated.View entering={FadeInUp.duration(200)} style={styles.apiErrorBanner}>
                    <Ionicons name="alert-circle" size={18} color="#EF4444" />
                    <Text style={styles.apiErrorText}>{apiError}</Text>
                  </Animated.View>
                ) : null}

                <Animated.View entering={FadeInUp.delay(300).duration(200)} style={{ marginTop: 32 }}>
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
                  <TouchableOpacity onPress={() => { setOtpStep('form'); setApiError(''); }}>
                    <Text style={styles.changeEmailText}>Edit Details</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}
          </View>

          {/* Footer */}
          <Animated.View
            entering={FadeInUp.delay(550).duration(200)}
            style={styles.footer}
          >
            <Text style={{ color: '#8A8A9A', fontSize: 13, fontWeight: '500' }}>
              Already have an account?{' '}
            </Text>
            <TouchableOpacity onPress={() => {
              triggerHapticLight();
              router.back();
            }}>
              <Text style={{ color: '#E8650A', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 }}>
                Sign In
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/* ═══════════════════════════════════════
   STYLES
═══════════════════════════════════════ */
const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContainer: {
    paddingHorizontal: 32,
    paddingTop: Platform.OS === 'ios' ? 100 : 80,
    paddingBottom: 50,
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

  headerContainer: { alignItems: 'flex-start', marginBottom: 32, marginTop: 20 },
  welcomeText: { fontSize: 32, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  welcomeSubtext: { fontSize: 14, color: '#8A8A9A', marginTop: 8, fontWeight: '500', lineHeight: 22 },

  formContainer: {
    width: '100%',
  },

  // API Error banner
  apiErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
    gap: 10,
  },
  apiErrorText: {
    flex: 1,
    color: '#F87171',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },

  // Disabled hint
  disabledHint: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 14,
    letterSpacing: 0.3,
  },

  // OTP
  otpInstructions: {
    fontSize: 14,
    color: '#8A8A9A',
    marginBottom: 24,
    textAlign: 'center',
    paddingHorizontal: 10,
    lineHeight: 22,
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
    borderColor: '#E8650A',
    backgroundColor: 'rgba(232, 101, 10, 0.05)',
  },
  otpFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    paddingHorizontal: 10,
  },
  resendText: {
    color: '#E8650A',
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

  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
    paddingBottom: 20,
  },
});
