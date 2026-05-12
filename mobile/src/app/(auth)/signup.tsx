/**
 * Customer registration — aligned with web Login.tsx register tab:
 *   firstName, lastName, phone (E.164), email, password, confirmPassword
 *   POST /auth/register → navigate to verify email (no session until OTP + login).
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import PremiumButton from '@/components/ui/PremiumButton';
import PremiumInput from '@/components/ui/PremiumInput';
import { Toast } from '@/components/ui/PremiumToast';
import { RegisterPhoneField } from '@/components/auth/RegisterPhoneField';
import { authService } from '@/services/api/authService';
import { REGISTER_COUNTRY_DIALS } from '@/lib/countries-dial-data';
import { validateRegisterNationalDigits, buildRegisterE164 } from '@/lib/phoneRegister';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Must match web Login.tsx + backend auth.controller register password check */
const REGISTER_PASSWORD_SPECIAL_RE = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/;

const pwCheck = (v: string) => ({
  length: v.length >= 8,
  upper: /[A-Z]/.test(v),
  lower: /[a-z]/.test(v),
  number: /[0-9]/.test(v),
  special: REGISTER_PASSWORD_SPECIAL_RE.test(v),
});

function registerPasswordPolicyError(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  if (!REGISTER_PASSWORD_SPECIAL_RE.test(password)) {
    return 'Password must contain at least one special character (!@#$%^&* etc.).';
  }
  return null;
}

const validators = {
  firstName: (v: string) => {
    if (!v.trim()) return 'First name is required';
    if (/[0-9]/.test(v)) return 'First name cannot contain numbers';
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
    return registerPasswordPolicyError(v) || '';
  },
  confirmPassword: (v: string, password: string) => {
    if (!v) return 'Please confirm your password';
    if (v !== password) return 'Passwords do not match';
    return '';
  },
};

type FieldKey = keyof typeof validators;

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

export default function SignUpScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [registerPhoneCountryIso, setRegisterPhoneCountryIso] = useState('PH');
  const [registerPhoneNational, setRegisterPhoneNational] = useState('');
  const [registerPhoneTouched, setRegisterPhoneTouched] = useState(false);

  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const [errors, setErrors] = useState<Record<FieldKey, string>>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [touched, setTouched] = useState<Record<FieldKey, boolean>>({
    firstName: false,
    lastName: false,
    email: false,
    password: false,
    confirmPassword: false,
  });
  const [phoneError, setPhoneError] = useState('');

  const dial =
    REGISTER_COUNTRY_DIALS.find((c) => c.iso === registerPhoneCountryIso)?.dial ?? '63';

  const handleBlur = (field: FieldKey) => {
    setTouched((p) => ({ ...p, [field]: true }));
    if (field === 'confirmPassword') {
      setErrors((p) => ({
        ...p,
        confirmPassword: validators.confirmPassword(confirmPassword, password),
      }));
      return;
    }
    const val =
      field === 'firstName'
        ? firstName
        : field === 'lastName'
          ? lastName
          : field === 'email'
            ? email
            : password;
    setErrors((p) => ({ ...p, [field]: validators[field](val as string) }));
  };

  const handleChange = (
    field: FieldKey,
    val: string,
    setter: (v: string) => void
  ) => {
    setter(val);
    if (errors[field]) setErrors((p) => ({ ...p, [field]: '' }));
    if (field === 'password' && touched.confirmPassword && confirmPassword) {
      setErrors((p) => ({
        ...p,
        confirmPassword: validators.confirmPassword(confirmPassword, val),
      }));
    }
    if (apiError) setApiError('');
  };

  const pwRules = useMemo(() => pwCheck(password), [password]);
  const pwAllValid =
    pwRules.length && pwRules.upper && pwRules.lower && pwRules.number && pwRules.special;

  const isFormValid = useMemo(() => {
    const nameOk = (v: string) => v.trim().length > 0 && !/[0-9]/.test(v);
    const phoneOk =
      registerPhoneNational.replace(/\D/g, '').length > 0 &&
      validateRegisterNationalDigits(dial, registerPhoneNational).ok;
    return (
      nameOk(firstName) &&
      nameOk(lastName) &&
      EMAIL_RE.test(email) &&
      pwAllValid &&
      confirmPassword === password &&
      confirmPassword.length > 0 &&
      phoneOk
    );
  }, [firstName, lastName, email, pwAllValid, confirmPassword, password, dial, registerPhoneNational]);

  const validateAll = (): boolean => {
    const newErrors: Record<FieldKey, string> = {
      firstName: validators.firstName(firstName),
      lastName: validators.lastName(lastName),
      email: validators.email(email),
      password: validators.password(password),
      confirmPassword: validators.confirmPassword(confirmPassword, password),
    };
    setErrors(newErrors);
    setTouched({
      firstName: true,
      lastName: true,
      email: true,
      password: true,
      confirmPassword: true,
    });
    setRegisterPhoneTouched(true);

    if (!registerPhoneNational.replace(/\D/g, '').length) {
      setPhoneError('Phone number is required.');
      return false;
    }
    const phoneCheck = validateRegisterNationalDigits(dial, registerPhoneNational);
    if (!phoneCheck.ok) {
      setPhoneError(phoneCheck.message || 'Invalid phone number.');
      return false;
    }
    setPhoneError('');

    return !Object.values(newErrors).some(Boolean);
  };

  const handleRegisterSubmit = async () => {
    if (!validateAll()) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
    const phoneE164 = buildRegisterE164(dial, registerPhoneNational);
    const emailNorm = email.trim().toLowerCase();

    setLoading(true);
    setApiError('');
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await authService.registerCustomer({
      name: fullName,
      email: emailNorm,
      password,
      phone: phoneE164,
    });

    setLoading(false);

    if (result.success) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show('Account created! Please check your email for a verification code.', 'success');
      router.replace({
        pathname: '/(auth)/verify',
        params: { email: emailNorm },
      });
      return;
    }

    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    const msg = result.message || 'Registration failed.';
    if (result.status === 409 || /already exists|already in use/i.test(msg)) {
      setErrors((p) => ({ ...p, email: 'An account with this email already exists' }));
      setTouched((p) => ({ ...p, email: true }));
    } else {
      setApiError(msg);
    }
  };

  const hapticLight = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

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
          <Animated.View entering={FadeInDown.delay(40).duration(200)} style={s.backWrap}>
            <TouchableOpacity
              style={s.backBtn}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              onPress={() => {
                hapticLight();
                router.back();
              }}
            >
              <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.80)" />
            </TouchableOpacity>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80).duration(200)} style={s.header}>
            <Text style={s.title}>Create Account</Text>
            <Text style={s.subtitle}>Join AutoSPF+ for premium vehicle service.</Text>
          </Animated.View>

          <View style={s.form}>
            <Animated.View entering={FadeInUp.delay(120).duration(200)}>
              <PremiumInput
                label="FIRST NAME *"
                iconName="person-add-outline"
                placeholder="First name"
                value={firstName}
                onChangeText={(v) => handleChange('firstName', v, setFirstName)}
                onBlur={() => handleBlur('firstName')}
                autoCapitalize="words"
                error={touched.firstName ? errors.firstName : ''}
              />
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(160).duration(200)}>
              <PremiumInput
                label="LAST NAME *"
                iconName="person-add-outline"
                placeholder="Last name"
                value={lastName}
                onChangeText={(v) => handleChange('lastName', v, setLastName)}
                onBlur={() => handleBlur('lastName')}
                autoCapitalize="words"
                error={touched.lastName ? errors.lastName : ''}
              />
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(200).duration(200)}>
              <RegisterPhoneField
                countryIso={registerPhoneCountryIso}
                onCountryIsoChange={(iso) => {
                  setRegisterPhoneCountryIso(iso);
                  setPhoneError('');
                  if (apiError) setApiError('');
                }}
                nationalDigits={registerPhoneNational}
                onNationalDigitsChange={(v) => {
                  setRegisterPhoneNational(v);
                  setPhoneError('');
                  if (apiError) setApiError('');
                }}
                hasError={registerPhoneTouched && !!phoneError}
                error={registerPhoneTouched ? phoneError : undefined}
              />
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(240).duration(200)}>
              <PremiumInput
                label="EMAIL ADDRESS"
                iconName="mail-outline"
                placeholder="Email address"
                value={email}
                onChangeText={(v) => handleChange('email', v.trim(), setEmail)}
                onBlur={() => handleBlur('email')}
                autoCapitalize="none"
                keyboardType="email-address"
                error={touched.email ? errors.email : ''}
              />
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(280).duration(200)}>
              <PremiumInput
                label="CREATE PASSWORD *"
                iconName="lock-closed-outline"
                placeholder="Password"
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  if (errors.password) setErrors((p) => ({ ...p, password: '' }));
                  if (touched.confirmPassword && confirmPassword) {
                    setErrors((p) => ({
                      ...p,
                      confirmPassword: validators.confirmPassword(confirmPassword, v),
                    }));
                  }
                  if (apiError) setApiError('');
                  if (!touched.password) setTouched((p) => ({ ...p, password: true }));
                }}
                onBlur={() => handleBlur('password')}
                isPassword
                containerStyle={{ marginBottom: password.length > 0 ? 6 : undefined }}
              />
              {password.length > 0 && (
                <View style={s.pwChecklist}>
                  <PwRule met={pwRules.length} label="8+ characters" />
                  <PwRule met={pwRules.upper} label="At least 1 uppercase letter (A–Z)" />
                  <PwRule met={pwRules.lower} label="At least 1 lowercase letter (a–z)" />
                  <PwRule met={pwRules.number} label="At least 1 number (0–9)" />
                  <PwRule met={pwRules.special} label="At least 1 special character (!@#$…)" />
                </View>
              )}
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(320).duration(200)}>
              <PremiumInput
                label="CONFIRM PASSWORD *"
                iconName="lock-closed-outline"
                placeholder="Confirm password"
                value={confirmPassword}
                onChangeText={(v) => handleChange('confirmPassword', v, setConfirmPassword)}
                onBlur={() => handleBlur('confirmPassword')}
                isPassword
                error={touched.confirmPassword ? errors.confirmPassword : ''}
              />
            </Animated.View>

            {!!apiError && (
              <Animated.View entering={FadeInUp.duration(200)} style={s.errorBanner}>
                <Ionicons name="alert-circle" size={18} color="#EF4444" />
                <Text style={s.errorText}>{apiError}</Text>
              </Animated.View>
            )}

            <Animated.View entering={FadeInUp.delay(360).duration(200)} style={{ marginTop: 28 }}>
              <PremiumButton
                title={loading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'}
                icon={loading ? undefined : 'person-add-outline'}
                onPress={handleRegisterSubmit}
                disabled={loading || !isFormValid}
              />
            </Animated.View>

            {!isFormValid && !loading && (
              <Animated.View entering={FadeInUp.delay(400).duration(200)}>
                <Text style={s.hint}>Fill in all required fields to continue</Text>
              </Animated.View>
            )}

            <Animated.View entering={FadeInUp.delay(420).duration(200)}>
              <Text style={s.tos}>
                By registering, you agree to our <Text style={s.tosLink}>Terms of Service</Text>.
              </Text>
            </Animated.View>
          </View>

          <Animated.View entering={FadeInUp.delay(460).duration(200)} style={s.footer}>
            <Text style={s.footerText}>Already have an account? </Text>
            <TouchableOpacity
              onPress={() => {
                hapticLight();
                router.back();
              }}
            >
              <Text style={s.footerLink}>Sign In</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: { alignItems: 'flex-start', marginBottom: 28, marginTop: 20 },
  title: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.50)',
    marginTop: 8,
    fontWeight: '400',
    lineHeight: 22,
  },
  form: { width: '100%' },
  pwChecklist: { paddingHorizontal: 4, paddingBottom: 14 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.30)',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    gap: 10,
  },
  errorText: { flex: 1, color: '#EF4444', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  hint: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 12,
    letterSpacing: 0.3,
  },
  tos: {
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(255,255,255,0.40)',
    marginTop: 18,
    lineHeight: 18,
  },
  tosLink: { color: '#F97316', fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 28, paddingBottom: 12 },
  footerText: { color: 'rgba(255,255,255,0.40)', fontSize: 13, fontWeight: '500' },
  footerLink: { color: '#F97316', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
});
