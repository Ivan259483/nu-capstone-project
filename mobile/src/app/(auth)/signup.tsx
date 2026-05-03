/**
 * Registration Screen — synced with web auth/register logic
 *
 * Fields:   First Name · Middle Name (optional) · Last Name · Email · Password
 * Validation matches Login.tsx (web):
 *   - firstName / lastName: required, no digits
 *   - middleName: optional, no digits if supplied
 *   - email: required, valid format
 *   - password: min 8 chars + at least 1 number + at least 1 special character
 *
 * API chain:  POST /auth/send-otp  →  POST /auth/verify-otp  →  signUp(fullName, email, password)
 *             signUp → Firebase createUser → POST /auth/register { name, email, password, role, firebaseUid }
 *                   → POST /auth/social-login → JWT stored → router.replace('/')
 */

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
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';
import PremiumButton from '@/components/ui/PremiumButton';
import PremiumInput from '@/components/ui/PremiumInput';
import { Toast } from '@/components/ui/PremiumToast';
import { authService } from '@/services/api/authService';
import { getApiErrorMessage } from '@/services/api/client';

// ─── Validation ───────────────────────────────────────────────────────────────
const EMAIL_RE   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SPECIAL_RE = /[!@#$%^&*()\-_=+\[\]{};':",.<>/?\\|`~]/;

/** Per-rule live checks — must mirror backend register password policy exactly */
const pwCheck = (v: string) => ({
  length:  v.length >= 8,
  upper:   /[A-Z]/.test(v),
  lower:   /[a-z]/.test(v),
  number:  /[0-9]/.test(v),
  special: SPECIAL_RE.test(v),
});

const validators = {
  firstName: (v: string) => {
    if (!v.trim()) return 'First name is required';
    if (/[0-9]/.test(v)) return 'First name cannot contain numbers';
    return '';
  },
  middleName: (v: string) => {
    if (v.trim() && /[0-9]/.test(v)) return 'Middle name cannot contain numbers';
    return '';
  },
  lastName: (v: string) => {
    if (!v.trim()) return 'Last name is required';
    if (/[0-9]/.test(v)) return 'Last name cannot contain numbers';
    return '';
  },
  email: (v: string) => {
    if (!v.trim()) return 'Email is required';
    if (!EMAIL_RE.test(v)) return 'Please enter a valid email address';
    return '';
  },
  password: (v: string) => {
    if (!v) return 'Password is required';
    const r = pwCheck(v);
    if (!r.length)  return 'Password must be at least 8 characters';
    if (!r.upper)   return 'Password must contain at least 1 uppercase letter';
    if (!r.lower)   return 'Password must contain at least 1 lowercase letter';
    if (!r.number)  return 'Password must contain at least 1 number';
    if (!r.special) return 'Password must contain at least 1 special character';
    return '';
  },
};

type FieldKey = keyof typeof validators;

// ─── Password rule row ────────────────────────────────────────────────────────
function PwRule({ met, label }: { met: boolean; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 }}>
      <Ionicons
        name={met ? 'checkmark-circle' : 'close-circle'}
        size={13}
        color={met ? '#22C55E' : '#EF4444'}
      />
      <Text style={{ fontSize: 12, color: met ? '#22C55E' : 'rgba(255,255,255,0.45)', fontWeight: '500' }}>
        {label}
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SignUpScreen() {
  const { signUp } = useAuth();

  // ── Form fields ──
  const [firstName,  setFirstName]  = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName,   setLastName]   = useState('');
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');

  // ── UI state ──
  const [loading,  setLoading]  = useState(false);
  const [apiError, setApiError] = useState('');

  // ── Per-field inline errors ──
  const [errors, setErrors] = useState<Record<FieldKey, string>>({
    firstName: '', middleName: '', lastName: '', email: '', password: '',
  });
  const [touched, setTouched] = useState<Record<FieldKey, boolean>>({
    firstName: false, middleName: false, lastName: false, email: false, password: false,
  });

  // ── OTP state ──
  const [otpStep,     setOtpStep]     = useState<'form' | 'verify'>('form');
  const [otpDigits,   setOtpDigits]   = useState(['', '', '', '', '', '']);
  const [otpCountdown,setOtpCountdown]= useState(0);
  const otpRefs = React.useRef<Array<TextInput | null>>([]);

  React.useEffect(() => {
    if (otpCountdown > 0) {
      const t = setTimeout(() => setOtpCountdown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [otpCountdown]);

  // ── Blur handler ──
  const handleBlur = (field: FieldKey) => {
    setTouched(p => ({ ...p, [field]: true }));
    const vals: Record<FieldKey, string> = {
      firstName, middleName, lastName, email, password,
    };
    const msg = field === 'middleName'
      ? validators.middleName(middleName)
      : validators[field](vals[field]);
    setErrors(p => ({ ...p, [field]: msg }));
  };

  // ── Change handler — clears field error and API banner ──
  const handleChange = (field: FieldKey, val: string, setter: (v: string) => void) => {
    setter(val);
    if (errors[field]) setErrors(p => ({ ...p, [field]: '' }));
    if (apiError)       setApiError('');
  };

  // ── Live password rule state (drives the checklist UI) ──
  const pwRules = useMemo(() => pwCheck(password), [password]);
  const pwAllValid = pwRules.length && pwRules.upper && pwRules.lower && pwRules.number && pwRules.special;

  // ── Form validity ──
  const isFormValid = useMemo(() => {
    const nameOk = (v: string) => v.trim().length > 0 && !/[0-9]/.test(v);
    return (
      nameOk(firstName) &&
      (!middleName.trim() || !/[0-9]/.test(middleName)) &&
      nameOk(lastName) &&
      EMAIL_RE.test(email) &&
      pwAllValid
    );
  }, [firstName, middleName, lastName, email, pwAllValid]);

  // ── Run all validators at once (used before submit) ──
  const validateAll = (): boolean => {
    const newErrors: Record<FieldKey, string> = {
      firstName:  validators.firstName(firstName),
      middleName: validators.middleName(middleName),
      lastName:   validators.lastName(lastName),
      email:      validators.email(email),
      password:   validators.password(password),
    };
    setErrors(newErrors);
    setTouched({ firstName: true, middleName: true, lastName: true, email: true, password: true });
    return !Object.values(newErrors).some(Boolean);
  };

  // ── Send OTP (step 1) ──
  const handleSendOtp = async () => {
    if (!validateAll()) return;

    setLoading(true);
    setApiError('');
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await authService.sendOtp(email.trim().toLowerCase());
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setOtpStep('verify');
      setOtpCountdown(60);
    } catch (err: any) {
      const msg = getApiErrorMessage(err, 'Failed to send verification code.');
      // Surface duplicate-email as an inline field error
      const status = err?.response?.status;
      if (status === 409 || /already.*(in use|exist|taken)/i.test(msg)) {
        setErrors(p => ({ ...p, email: 'An account with this email already exists' }));
        setTouched(p => ({ ...p, email: true }));
      } else {
        setApiError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Verify OTP + Register (step 2) ──
  const handleVerifyOtp = async () => {
    const otp = otpDigits.join('');
    if (otp.length < 6) {
      Alert.alert('Incomplete', 'Please enter the full 6-digit verification code.');
      return;
    }

    // middleName: send empty string if not filled (web spec)
    const fullName = [firstName.trim(), middleName.trim() || '', lastName.trim()]
      .filter(Boolean)
      .join(' ');

    setLoading(true);
    setApiError('');
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await authService.verifyOtp(email.trim().toLowerCase(), otp);

      const result = await signUp(fullName, email.trim().toLowerCase(), password);
      if (result.success) {
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Toast.show('Account created! Welcome to AutoSPF+', 'success');
        router.replace('/');
      } else {
        const msg = result.message || 'Unable to create account. Please try again.';
        if (/email|already|in use|exist/i.test(msg)) {
          setErrors(p => ({ ...p, email: 'An account with this email already exists' }));
          setOtpStep('form');
        } else {
          setApiError(msg);
        }
      }
    } catch (err: any) {
      const msg = getApiErrorMessage(err, 'Invalid verification code.');
      const status = err?.response?.status;
      if (status === 409 || /email|already|in use|exist/i.test(msg)) {
        setErrors(p => ({ ...p, email: 'An account with this email already exists' }));
        setOtpStep('form');
      } else {
        setApiError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── OTP digit handlers ──
  const handleOtpChange = (text: string, i: number) => {
    const digit = text.replace(/[^0-9]/g, '').slice(0, 1);
    const next = [...otpDigits];
    next[i] = digit;
    setOtpDigits(next);
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpKeyPress = (e: any, i: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otpDigits[i] && i > 0) {
      otpRefs.current[i - 1]?.focus();
      const next = [...otpDigits];
      next[i - 1] = '';
      setOtpDigits(next);
    }
  };

  const hapticLight = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <Animated.View entering={FadeInDown.delay(40).duration(200)} style={s.backWrap}>
            <TouchableOpacity
              style={s.backBtn}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              onPress={() => { hapticLight(); router.back(); }}
            >
              <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.80)" />
            </TouchableOpacity>
          </Animated.View>

          {/* Header */}
          <Animated.View entering={FadeInDown.delay(80).duration(200)} style={s.header}>
            <Text style={s.title}>Create Account</Text>
            <Text style={s.subtitle}>Join AutoSPF+ for premium vehicle service.</Text>
          </Animated.View>

          {/* ── FORM ── */}
          <View style={s.form}>
            {otpStep === 'form' ? (
              <>
                {/* First Name */}
                <Animated.View entering={FadeInUp.delay(120).duration(200)}>
                  <PremiumInput
                    label="FIRST NAME"
                    iconName="person-outline"
                    placeholder="Juan"
                    value={firstName}
                    onChangeText={v => handleChange('firstName', v, setFirstName)}
                    onBlur={() => handleBlur('firstName')}
                    autoCapitalize="words"
                    error={touched.firstName ? errors.firstName : ''}
                  />
                </Animated.View>

                {/* Middle Name (optional) */}
                <Animated.View entering={FadeInUp.delay(160).duration(200)}>
                  <PremiumInput
                    label="MIDDLE NAME (OPTIONAL)"
                    iconName="person-outline"
                    placeholder="Santos"
                    value={middleName}
                    onChangeText={v => handleChange('middleName', v, setMiddleName)}
                    onBlur={() => handleBlur('middleName')}
                    autoCapitalize="words"
                    error={touched.middleName ? errors.middleName : ''}
                  />
                </Animated.View>

                {/* Last Name */}
                <Animated.View entering={FadeInUp.delay(200).duration(200)}>
                  <PremiumInput
                    label="LAST NAME"
                    iconName="person-outline"
                    placeholder="Dela Cruz"
                    value={lastName}
                    onChangeText={v => handleChange('lastName', v, setLastName)}
                    onBlur={() => handleBlur('lastName')}
                    autoCapitalize="words"
                    error={touched.lastName ? errors.lastName : ''}
                  />
                </Animated.View>

                {/* Email */}
                <Animated.View entering={FadeInUp.delay(240).duration(200)}>
                  <PremiumInput
                    label="EMAIL ADDRESS"
                    iconName="mail-outline"
                    placeholder="name@example.com"
                    value={email}
                    onChangeText={v => handleChange('email', v.trim(), setEmail)}
                    onBlur={() => handleBlur('email')}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    error={touched.email ? errors.email : ''}
                  />
                </Animated.View>

                {/* Password + live checklist */}
                <Animated.View entering={FadeInUp.delay(280).duration(200)}>
                  <PremiumInput
                    label="PASSWORD"
                    iconName="lock-closed-outline"
                    placeholder="Min 8 chars, 1 number, 1 special char"
                    value={password}
                    onChangeText={v => {
                      setPassword(v);
                      if (apiError) setApiError('');
                      // Mark touched as soon as user starts typing so checklist appears
                      if (!touched.password) setTouched(p => ({ ...p, password: true }));
                    }}
                    onBlur={() => handleBlur('password')}
                    isPassword
                    containerStyle={{ marginBottom: password.length > 0 ? 6 : undefined }}
                  />
                  {/* Live password rule checklist — shown as soon as user starts typing */}
                  {password.length > 0 && (
                    <View style={s.pwChecklist}>
                      <PwRule met={pwRules.length}  label="8+ characters" />
                      <PwRule met={pwRules.upper}   label="At least 1 uppercase letter (A–Z)" />
                      <PwRule met={pwRules.lower}   label="At least 1 lowercase letter (a–z)" />
                      <PwRule met={pwRules.number}  label="At least 1 number (0–9)" />
                      <PwRule met={pwRules.special} label="At least 1 special character (!@#$…)" />
                    </View>
                  )}
                </Animated.View>

                {/* API error banner */}
                {!!apiError && (
                  <Animated.View entering={FadeInUp.duration(200)} style={s.errorBanner}>
                    <Ionicons name="alert-circle" size={18} color="#EF4444" />
                    <Text style={s.errorText}>{apiError}</Text>
                  </Animated.View>
                )}

                {/* Submit button — disabled until valid + not loading */}
                <Animated.View entering={FadeInUp.delay(320).duration(200)} style={{ marginTop: 28 }}>
                  <PremiumButton
                    title={loading ? 'SENDING CODE...' : 'CREATE ACCOUNT'}
                    icon={loading ? undefined : 'arrow-forward-outline'}
                    onPress={handleSendOtp}
                    disabled={loading || !isFormValid}
                  />
                </Animated.View>

                {!isFormValid && !loading && (
                  <Animated.View entering={FadeInUp.delay(360).duration(200)}>
                    <Text style={s.hint}>Fill in all required fields to continue</Text>
                  </Animated.View>
                )}

                {/* ToS */}
                <Animated.View entering={FadeInUp.delay(380).duration(200)}>
                  <Text style={s.tos}>
                    By registering, you agree to our{' '}
                    <Text style={s.tosLink}>Terms of Service</Text>.
                  </Text>
                </Animated.View>
              </>
            ) : (
              /* ── OTP Step ── */
              <Animated.View entering={FadeInUp.delay(60).duration(220)}>
                <Text style={s.otpInstructions}>
                  Enter the 6-digit verification code sent to{'\n'}
                  <Text style={s.otpEmail}>{email}</Text>
                </Text>

                <View style={s.otpRow}>
                  {otpDigits.map((d, i) => (
                    <TextInput
                      key={i}
                      ref={r => { otpRefs.current[i] = r; }}
                      style={[s.otpBox, !!d && s.otpBoxFilled]}
                      maxLength={1}
                      keyboardType="number-pad"
                      value={d}
                      onChangeText={t => handleOtpChange(t, i)}
                      onKeyPress={e => handleOtpKeyPress(e, i)}
                      selectTextOnFocus
                    />
                  ))}
                </View>

                {!!apiError && (
                  <Animated.View entering={FadeInUp.duration(200)} style={s.errorBanner}>
                    <Ionicons name="alert-circle" size={18} color="#EF4444" />
                    <Text style={s.errorText}>{apiError}</Text>
                  </Animated.View>
                )}

                <Animated.View entering={FadeInUp.delay(180).duration(200)} style={{ marginTop: 28 }}>
                  <PremiumButton
                    title={loading ? 'VERIFYING...' : 'VERIFY & CREATE ACCOUNT'}
                    icon={loading ? undefined : 'checkmark-circle-outline'}
                    onPress={handleVerifyOtp}
                    disabled={loading || otpDigits.join('').length < 6}
                  />
                </Animated.View>

                <View style={s.otpFooter}>
                  <TouchableOpacity
                    disabled={otpCountdown > 0 || loading}
                    onPress={handleSendOtp}
                  >
                    <Text style={[s.resend, otpCountdown > 0 && s.resendDisabled]}>
                      {otpCountdown > 0 ? `Resend in ${otpCountdown}s` : 'Resend Code'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setOtpStep('form'); setApiError(''); }}>
                    <Text style={s.editDetails}>Edit Details</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}
          </View>

          {/* Footer — Sign In link */}
          <Animated.View entering={FadeInUp.delay(420).duration(200)} style={s.footer}>
            <Text style={s.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => { hapticLight(); router.back(); }}>
              <Text style={s.footerLink}>Sign In</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  scroll: {
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 100 : 80,
    paddingBottom: 56,
    flexGrow: 1,
  },

  backWrap: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 24,
    zIndex: 10,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center', alignItems: 'center',
  },

  header: { alignItems: 'flex-start', marginBottom: 28, marginTop: 20 },
  title:    { fontSize: 32, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.50)', marginTop: 8, fontWeight: '400', lineHeight: 22 },

  form: { width: '100%' },

  // Password rule checklist
  pwChecklist: {
    paddingHorizontal: 4,
    paddingBottom: 14,
  },

  // Error banner — dark variant
  errorBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.10)', borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.30)',
    borderRadius: 14, padding: 14, marginTop: 10, gap: 10,
  },
  errorText: { flex: 1, color: '#EF4444', fontSize: 13, fontWeight: '600', lineHeight: 18 },

  hint: {
    color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: '500',
    textAlign: 'center', marginTop: 12, letterSpacing: 0.3,
  },

  tos: {
    textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.40)',
    marginTop: 18, lineHeight: 18,
  },
  tosLink: { color: '#F97316', fontWeight: '700' },

  // OTP — dark
  otpInstructions: {
    fontSize: 14, color: 'rgba(255,255,255,0.50)', marginBottom: 24,
    textAlign: 'center', lineHeight: 22,
  },
  otpEmail:   { color: '#F97316', fontWeight: '700' },
  otpRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  otpBox: {
    width: 48, height: 56, borderRadius: 12,
    backgroundColor: '#141414', borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    color: '#FFFFFF', fontSize: 24, fontWeight: '700', textAlign: 'center',
  },
  otpBoxFilled: { borderColor: '#F97316', backgroundColor: 'rgba(249,115,22,0.06)' },
  otpFooter: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 20, paddingHorizontal: 4,
  },
  resend:         { color: '#F97316', fontSize: 14, fontWeight: '600' },
  resendDisabled: { color: 'rgba(255,255,255,0.30)' },
  editDetails:    { color: 'rgba(255,255,255,0.35)', fontSize: 14, fontWeight: '500' },

  // Footer
  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: 28, paddingBottom: 12 },
  footerText: { color: 'rgba(255,255,255,0.40)', fontSize: 13, fontWeight: '500' },
  footerLink: { color: '#F97316', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
});
