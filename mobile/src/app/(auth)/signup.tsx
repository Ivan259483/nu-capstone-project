/**
 * Customer registration — aligned with web Login.tsx register tab:
 *   firstName, lastName, phone (E.164), email, password, confirmPassword
 *   POST /auth/register → navigate to verify email (no session until OTP + login).
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import PremiumButton from '@/components/ui/PremiumButton';
import PremiumInput from '@/components/ui/PremiumInput';
import { Toast } from '@/components/ui/PremiumToast';
import { RegisterPhoneField } from '@/components/auth/RegisterPhoneField';
import { authService } from '@/services/api/authService';
import { REGISTER_COUNTRY_DIALS } from '@/lib/countries-dial-data';
import { validateRegisterNationalDigits, buildRegisterE164 } from '@/lib/phoneRegister';
import {
  PPF_TERMS_BUSINESS,
  PPF_TERMS_INTRO,
  PPF_TERMS_SECTIONS,
} from '@/content/ppfRegistrationTerms';

const SCREEN_H = Dimensions.get('window').height;

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
type RegisterStep = 1 | 2;
type PasswordStrengthLabel = 'Weak' | 'Fair' | 'Strong' | 'Very Strong';

function getPasswordStrength(password: string): {
  label: PasswordStrengthLabel;
  color: string;
  progress: number;
} {
  if (!password) return { label: 'Weak', color: '#EF4444', progress: 0 };
  const checks = pwCheck(password);
  let score = 0;
  if (checks.length) score += 1;
  if (checks.upper && checks.lower) score += 1;
  if (checks.number) score += 1;
  if (checks.special) score += 1;
  if (password.length >= 12) score += 1;

  if (score <= 1) return { label: 'Weak', color: '#EF4444', progress: 0.25 };
  if (score <= 3) return { label: 'Fair', color: '#FF7A1A', progress: 0.5 };
  if (score === 4) return { label: 'Strong', color: '#60A5FA', progress: 0.75 };
  return { label: 'Very Strong', color: '#22C55E', progress: 1 };
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
  const [step, setStep] = useState<RegisterStep>(1);
  const [showRegistrationSuccess, setShowRegistrationSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

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

  const [ppfTermsModalOpen, setPpfTermsModalOpen] = useState(false);
  const [ppfTermsModalBodyKey, setPpfTermsModalBodyKey] = useState(0);
  const [ppfTermsModalScrolledToEnd, setPpfTermsModalScrolledToEnd] = useState(false);
  const [ppfTermsAgreed, setPpfTermsAgreed] = useState(false);
  const [registerWebsiteTermsAgreed, setRegisterWebsiteTermsAgreed] = useState(false);

  const registerLegalAcknowledged = useMemo(
    () => ppfTermsAgreed && registerWebsiteTermsAgreed,
    [ppfTermsAgreed, registerWebsiteTermsAgreed]
  );

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
  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);
  const pwAllValid =
    pwRules.length && pwRules.upper && pwRules.lower && pwRules.number && pwRules.special;

  const isStepOneValid = useMemo(() => {
    const nameOk = (v: string) => v.trim().length > 0 && !/[0-9]/.test(v);
    const phoneOk =
      registerPhoneNational.replace(/\D/g, '').length > 0 &&
      validateRegisterNationalDigits(dial, registerPhoneNational).ok;
    return nameOk(firstName) && nameOk(lastName) && phoneOk;
  }, [firstName, lastName, dial, registerPhoneNational]);

  const isStepTwoValid = useMemo(
    () =>
      EMAIL_RE.test(email) &&
      pwAllValid &&
      confirmPassword === password &&
      confirmPassword.length > 0,
    [email, pwAllValid, confirmPassword, password]
  );

  const isFormValid = useMemo(
    () => isStepOneValid && isStepTwoValid,
    [isStepOneValid, isStepTwoValid]
  );

  const canRegister = useMemo(
    () => isFormValid && registerLegalAcknowledged,
    [isFormValid, registerLegalAcknowledged]
  );

  const handlePpfTermsScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const threshold = 56;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - threshold) {
      setPpfTermsModalScrolledToEnd(true);
    }
  }, []);

  const validateStepOne = (): boolean => {
    const firstNameError = validators.firstName(firstName);
    const lastNameError = validators.lastName(lastName);

    setErrors((p) => ({
      ...p,
      firstName: firstNameError,
      lastName: lastNameError,
    }));
    setTouched((p) => ({ ...p, firstName: true, lastName: true }));
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
    return !firstNameError && !lastNameError;
  };

  const handleContinueStep = () => {
    if (!validateStepOne()) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    if (apiError) setApiError('');
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep(2);
  };

  const handleRegistrationSuccessContinue = () => {
    const emailForVerify = registeredEmail || email.trim().toLowerCase();
    router.replace({
      pathname: '/(auth)/verify',
      params: { email: emailForVerify },
    });
  };

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
    if (!registerLegalAcknowledged) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Toast.show(
        'Both checkboxes are required: accept the PPF terms in the popup, and confirm the website Terms of Service.',
        'error'
      );
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
      setRegisteredEmail(emailNorm);
      setShowRegistrationSuccess(true);
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
          {showRegistrationSuccess ? (
            <Animated.View entering={FadeInUp.duration(260)} style={s.successState}>
              <Animated.View entering={ZoomIn.delay(80).duration(260)} style={s.successIcon}>
                <Ionicons name="checkmark" size={34} color="#111111" />
              </Animated.View>
              <Text style={s.successTitle}>Welcome to AutoSPF+</Text>
              <Text style={s.successSubtitle}>Your account is ready.</Text>
              <Text style={s.successBody}>{"Let's set up your first vehicle."}</Text>
              <PremiumButton
                title="Continue"
                icon="arrow-forward"
                onPress={handleRegistrationSuccessContinue}
                premiumAuth
                style={s.successCta}
              />
            </Animated.View>
          ) : (
            <>
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

              <Animated.View entering={FadeInDown.delay(80).duration(220)} style={s.header}>
                <Image
                  source={require('../../../assets/images/autospf-logo.png')}
                  style={s.logo}
                  contentFit="contain"
                  accessibilityLabel="AutoSPF+ Logo"
                />
                <Text style={s.brandLabel}>Premium Automotive Care Platform</Text>
                <Text style={s.title}>Create Account</Text>
                <Text style={s.subtitle}>Join AutoSPF+ for premium vehicle service.</Text>
              </Animated.View>

              <Animated.View entering={FadeInUp.delay(110).duration(220)} style={s.progressWrap}>
                <View style={s.progressTextRow}>
                  <Text style={s.stepText}>Step {step} of 2</Text>
                  <Text style={s.stepContext}>{step === 1 ? 'Contact details' : 'Secure access'}</Text>
                </View>
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, { width: step === 1 ? '50%' : '100%' }]} />
                </View>
              </Animated.View>

              <View style={s.form}>
                {step === 1 ? (
                  <Animated.View key="register-step-1" entering={FadeInUp.duration(240)} style={s.stepPanel}>
                    <PremiumInput
                      label="FIRST NAME *"
                      iconName="person-add-outline"
                      placeholder="First name"
                      value={firstName}
                      onChangeText={(v) => handleChange('firstName', v, setFirstName)}
                      onBlur={() => handleBlur('firstName')}
                      autoCapitalize="words"
                      error={touched.firstName ? errors.firstName : ''}
                      premiumFocus
                    />

                    <PremiumInput
                      label="LAST NAME *"
                      iconName="person-add-outline"
                      placeholder="Last name"
                      value={lastName}
                      onChangeText={(v) => handleChange('lastName', v, setLastName)}
                      onBlur={() => handleBlur('lastName')}
                      autoCapitalize="words"
                      error={touched.lastName ? errors.lastName : ''}
                      premiumFocus
                    />

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
                      premiumFocus
                    />

                    <PremiumButton
                      title="Continue"
                      icon="arrow-forward"
                      onPress={handleContinueStep}
                      premiumAuth
                      style={s.stepCta}
                    />
                  </Animated.View>
                ) : (
                  <Animated.View key="register-step-2" entering={FadeInUp.duration(240)} style={s.stepPanel}>
                    <TouchableOpacity
                      style={s.stepBackBtn}
                      activeOpacity={0.78}
                      onPress={() => {
                        hapticLight();
                        setStep(1);
                      }}
                    >
                      <Ionicons name="chevron-back" size={17} color="#FDBA74" />
                      <Text style={s.stepBackText}>Contact details</Text>
                    </TouchableOpacity>

                    <PremiumInput
                      label="EMAIL ADDRESS *"
                      iconName="mail-outline"
                      placeholder="Email address"
                      value={email}
                      onChangeText={(v) => handleChange('email', v.trim(), setEmail)}
                      onBlur={() => handleBlur('email')}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      error={touched.email ? errors.email : ''}
                      premiumFocus
                    />

                    <PremiumInput
                      label="PASSWORD *"
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
                      error={touched.password ? errors.password : ''}
                      containerStyle={password.length > 0 ? s.passwordInputWithMeter : undefined}
                      premiumFocus
                    />
                    {password.length > 0 && (
                      <Animated.View entering={FadeInUp.duration(200)} style={s.strengthWrap}>
                        <View style={s.strengthTextRow}>
                          <Text style={s.strengthText}>Password strength:</Text>
                          <Text style={[s.strengthValue, { color: passwordStrength.color }]}>
                            {passwordStrength.label}
                          </Text>
                        </View>
                        <View style={s.strengthTrack}>
                          <View
                            style={[
                              s.strengthFill,
                              {
                                width: `${passwordStrength.progress * 100}%`,
                                backgroundColor: passwordStrength.color,
                              },
                            ]}
                          />
                        </View>
                      </Animated.View>
                    )}

                    <PremiumInput
                      label="CONFIRM PASSWORD *"
                      iconName="lock-closed-outline"
                      placeholder="Confirm password"
                      value={confirmPassword}
                      onChangeText={(v) => handleChange('confirmPassword', v, setConfirmPassword)}
                      onBlur={() => handleBlur('confirmPassword')}
                      isPassword
                      error={touched.confirmPassword ? errors.confirmPassword : ''}
                      premiumFocus
                    />

                    <Animated.View entering={FadeInUp.delay(80).duration(220)} style={s.legalGroup}>
                      <TouchableOpacity
                        style={s.agreeRow}
                        activeOpacity={0.75}
                        onPress={() => {
                          if (ppfTermsAgreed) {
                            setPpfTermsAgreed(false);
                            hapticLight();
                          } else {
                            setPpfTermsModalScrolledToEnd(false);
                            setPpfTermsModalBodyKey((k) => k + 1);
                            setPpfTermsModalOpen(true);
                            hapticLight();
                          }
                        }}
                      >
                        <View style={[s.agreeBox, ppfTermsAgreed && s.agreeBoxOn]}>
                          {ppfTermsAgreed ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                        </View>
                        <View style={s.agreeTextWrap}>
                          <Text style={s.agreeText}>
                            I acknowledge the{' '}
                            <Text style={s.agreeLink}>Paint Protection Film General Terms and Conditions</Text>.
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={s.agreeRow}
                        activeOpacity={0.75}
                        onPress={() => {
                          setRegisterWebsiteTermsAgreed((v) => !v);
                          hapticLight();
                        }}
                      >
                        <View style={[s.agreeBox, registerWebsiteTermsAgreed && s.agreeBoxOn]}>
                          {registerWebsiteTermsAgreed ? (
                            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                          ) : null}
                        </View>
                        <Text style={s.agreeText}>
                          I confirm the website <Text style={s.agreeLink}>Terms of Service</Text>.
                        </Text>
                      </TouchableOpacity>
                    </Animated.View>

                    {!!apiError && (
                      <Animated.View entering={FadeInUp.duration(200)} style={s.errorBanner}>
                        <Ionicons name="alert-circle" size={18} color="#EF4444" />
                        <Text style={s.errorText}>{apiError}</Text>
                      </Animated.View>
                    )}

                    <Animated.View entering={FadeInUp.delay(120).duration(220)} style={s.stepCta}>
                      <PremiumButton
                        title={loading ? 'Creating account...' : 'Create Account'}
                        icon={loading ? undefined : 'person-add-outline'}
                        onPress={handleRegisterSubmit}
                        disabled={loading || !canRegister}
                        loading={loading}
                        premiumAuth
                      />
                    </Animated.View>

                    {!isFormValid && !loading && (
                      <Animated.View entering={FadeInUp.delay(150).duration(200)}>
                        <Text style={s.hint}>Complete step 2 and required acknowledgements to continue</Text>
                      </Animated.View>
                    )}
                  </Animated.View>
                )}
              </View>

              <Animated.View entering={FadeInUp.delay(180).duration(220)} style={s.footer}>
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
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={ppfTermsModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPpfTermsModalOpen(false)}
      >
        <View style={s.ppfModalRoot}>
          <TouchableOpacity
            style={s.ppfModalBackdrop}
            activeOpacity={1}
            onPress={() => setPpfTermsModalOpen(false)}
          />
          <View style={[s.ppfModalSheet, { maxHeight: SCREEN_H * 0.94 }]}>
            <View style={s.ppfModalHeader}>
              <Ionicons name="shield-checkmark" size={22} color="#F97316" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.ppfModalTitle}>Paint Protection Film — Terms & Acknowledgement</Text>
                <Text style={s.ppfModalBrand}>AUTOSPF+ SUN PROTECTION FILM</Text>
                <Text style={s.ppfModalBiz}>{PPF_TERMS_BUSINESS.name}</Text>
              </View>
              <TouchableOpacity
                style={s.ppfModalClose}
                onPress={() => setPpfTermsModalOpen(false)}
                hitSlop={12}
              >
                <Ionicons name="close" size={26} color="rgba(255,255,255,0.85)" />
              </TouchableOpacity>
            </View>
            <ScrollView
              key={ppfTermsModalBodyKey}
              style={[s.ppfModalScroll, { maxHeight: SCREEN_H * 0.58 }]}
              contentContainerStyle={s.ppfModalScrollContent}
              showsVerticalScrollIndicator
              onScroll={handlePpfTermsScroll}
              scrollEventThrottle={16}
              onContentSizeChange={(_, ch) => {
                const maxH = SCREEN_H * 0.58;
                if (ch > 0 && ch <= maxH + 32) setPpfTermsModalScrolledToEnd(true);
              }}
            >
              <Text style={s.ppfModalMeta}>
                {PPF_TERMS_BUSINESS.address} · {PPF_TERMS_BUSINESS.phone}
              </Text>
              <Text style={s.ppfModalIntro}>{PPF_TERMS_INTRO}</Text>
              {PPF_TERMS_SECTIONS.map((sec, i) => (
                <View key={sec.title} style={{ marginBottom: i === PPF_TERMS_SECTIONS.length - 1 ? 0 : 14 }}>
                  <Text style={s.ppfModalSecTitle}>
                    {i + 1}. {sec.title}
                  </Text>
                  <Text style={s.ppfModalSecBody}>{sec.body}</Text>
                </View>
              ))}
            </ScrollView>
            {!ppfTermsModalScrolledToEnd ? (
              <View style={s.ppfModalScrollHint}>
                <Ionicons name="arrow-down-circle-outline" size={15} color="#FDBA74" />
                <Text style={s.ppfModalScrollHintText}>
                  Scroll to the bottom to enable &quot;I accept&quot;.
                </Text>
              </View>
            ) : null}
            <View style={s.ppfModalFooter}>
              <TouchableOpacity
                style={s.ppfModalCancel}
                onPress={() => setPpfTermsModalOpen(false)}
                activeOpacity={0.85}
              >
                <Text style={s.ppfModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.ppfModalAccept, !ppfTermsModalScrolledToEnd && s.ppfModalAcceptDisabled]}
                disabled={!ppfTermsModalScrolledToEnd}
                onPress={() => {
                  if (!ppfTermsModalScrolledToEnd) return;
                  setPpfTermsAgreed(true);
                  setPpfTermsModalOpen(false);
                  if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }}
                activeOpacity={0.9}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={ppfTermsModalScrolledToEnd ? '#171717' : 'rgba(255,255,255,0.55)'}
                />
                <Text
                  style={[
                    s.ppfModalAcceptText,
                    !ppfTermsModalScrolledToEnd && s.ppfModalAcceptTextDisabled,
                  ]}
                >
                  I accept the PPF terms
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  scroll: {
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 92 : 72,
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
  header: { alignItems: 'center', marginBottom: 22, marginTop: 8 },
  logo: {
    width: 140,
    aspectRatio: 604 / 413,
    alignSelf: 'center',
    marginBottom: 10,
  },
  brandLabel: {
    color: 'rgba(255,255,255,0.44)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    lineHeight: 14,
    marginBottom: 18,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  title: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0, textAlign: 'center' },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.50)',
    marginTop: 8,
    fontWeight: '400',
    lineHeight: 22,
    textAlign: 'center',
  },
  progressWrap: {
    marginBottom: 24,
  },
  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  stepText: {
    color: '#FDBA74',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  stepContext: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 12,
    fontWeight: '600',
  },
  progressTrack: {
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#FF7A1A',
  },
  form: { width: '100%' },
  stepPanel: {
    width: '100%',
  },
  stepBackBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    marginBottom: 12,
  },
  stepBackText: {
    color: '#FDBA74',
    fontSize: 12,
    fontWeight: '700',
  },
  stepCta: { marginTop: 10 },
  passwordInputWithMeter: { marginBottom: 8 },
  strengthWrap: {
    marginBottom: 18,
    paddingHorizontal: 2,
  },
  strengthTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  strengthText: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 12,
    fontWeight: '600',
  },
  strengthValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  strengthTrack: {
    height: 4,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 999,
  },
  legalGroup: {
    gap: 12,
    marginTop: 4,
  },
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
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 13,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.22)',
  },
  agreeBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(251, 191, 36, 0.65)',
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 3,
  },
  agreeBoxOn: {
    backgroundColor: '#EA580C',
    borderColor: 'rgba(253, 224, 171, 0.95)',
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 6,
  },
  agreeTextWrap: { flex: 1 },
  agreeText: {
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.78)',
    fontWeight: '500',
  },
  agreeLink: { color: '#F97316', fontWeight: '700' },
  successState: {
    flex: 1,
    minHeight: SCREEN_H * 0.72,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  successIcon: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFB347',
    marginBottom: 22,
    boxShadow: '0 12px 30px rgba(255,122,26,0.28)',
  },
  successTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
    textAlign: 'center',
    letterSpacing: 0,
  },
  successSubtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 10,
    textAlign: 'center',
  },
  successBody: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
  },
  successCta: {
    marginTop: 30,
  },
  ppfModalRoot: { flex: 1, justifyContent: 'flex-end' },
  ppfModalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.76)' },
  ppfModalSheet: {
    backgroundColor: '#0B0B0D',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderColor: 'rgba(249,115,22,0.35)',
  },
  ppfModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(249,115,22,0.24)',
    backgroundColor: '#0A0A0C',
  },
  ppfModalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  ppfModalTitle: { fontSize: 17, fontWeight: '800', color: '#FFFFFF', lineHeight: 23 },
  ppfModalBrand: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: '#FB923C',
  },
  ppfModalBiz: { marginTop: 3, fontSize: 12, color: 'rgba(255,255,255,0.58)', lineHeight: 17 },
  ppfModalScroll: { backgroundColor: '#121214' },
  ppfModalScrollContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28 },
  ppfModalMeta: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.58)',
    lineHeight: 18,
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  ppfModalIntro: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.86)',
    lineHeight: 22,
    marginBottom: 18,
  },
  ppfModalSecTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FDBA74',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  ppfModalSecBody: { fontSize: 14, color: 'rgba(255,255,255,0.78)', lineHeight: 22 },
  ppfModalScrollHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: 'rgba(251,146,60,0.16)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(251,146,60,0.22)',
  },
  ppfModalScrollHintText: {
    flex: 1,
    color: '#FDBA74',
    fontSize: 12,
    fontWeight: '700',
  },
  ppfModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    backgroundColor: '#0B0B0D',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  ppfModalCancel: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#111113',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  ppfModalCancelText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  ppfModalAccept: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#F97316',
    borderWidth: 1,
    borderColor: '#F97316',
  },
  ppfModalAcceptDisabled: {
    backgroundColor: 'rgba(249,115,22,0.16)',
    borderColor: 'rgba(249,115,22,0.28)',
  },
  ppfModalAcceptText: { fontSize: 14, fontWeight: '900', color: '#171717' },
  ppfModalAcceptTextDisabled: { color: 'rgba(255,255,255,0.55)' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 28, paddingBottom: 12 },
  footerText: { color: 'rgba(255,255,255,0.40)', fontSize: 13, fontWeight: '500' },
  footerLink: { color: '#F97316', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
});
