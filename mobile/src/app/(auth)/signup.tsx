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
  Platform,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp, ZoomIn } from 'react-native-reanimated';
import AuthLayout from '@/components/auth/AuthLayout';
import AuthButton from '@/components/auth/AuthButton';
import AuthInput from '@/components/auth/AuthInput';
import AuthStepIndicator from '@/components/auth/AuthStepIndicator';
import AuthPasswordRequirements from '@/components/auth/AuthPasswordRequirements';
import { MotionSheet } from '@/components/ui/MotionOverlay';
import { Toast } from '@/components/ui/PremiumToast';
import RegisterCountryCodePicker from '@/components/auth/RegisterCountryCodePicker';
import { AuthColors, AuthFontFamily, AuthRadius, AuthTypography } from '@/constants/authTheme';
import { authService } from '@/services/api/authService';
import { REGISTER_COUNTRY_DIALS } from '@/lib/countries-dial-data';
import { validateRegisterNationalDigits, buildRegisterE164 } from '@/lib/phoneRegister';
import { Haptics } from '@/utils/haptics';
import {
  PPF_TERMS_BUSINESS,
  PPF_TERMS_INTRO,
  PPF_TERMS_SECTIONS,
} from '@/content/ppfRegistrationTerms';

const SCREEN_H = Dimensions.get('window').height;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Must match web Login.tsx + backend auth.controller register password check */
const REGISTER_PASSWORD_SPECIAL_RE = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/;

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

  const handleRegisterPhoneChange = useCallback(
    (raw: string) => {
      let digits = raw.replace(/\D/g, '');
      if (dial === '63') {
        if (digits.startsWith('0')) digits = digits.slice(1);
        digits = digits.slice(0, 10);
      } else {
        digits = digits.slice(0, 15);
      }
      setRegisterPhoneNational(digits);
      setPhoneError('');
      setApiError('');
    },
    [dial]
  );

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
    if (apiError) setApiError('');
  };

  const validatePhoneField = useCallback(() => {
    if (!registerPhoneNational.replace(/\D/g, '').length) {
      return 'Phone number is required.';
    }
    const phoneCheck = validateRegisterNationalDigits(dial, registerPhoneNational);
    return phoneCheck.ok ? '' : phoneCheck.message || 'Invalid phone number.';
  }, [dial, registerPhoneNational]);

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

    const nextPhoneError = validatePhoneField();
    setPhoneError(nextPhoneError);
    return !firstNameError && !lastNameError && !nextPhoneError;
  };

  const handleContinueStep = () => {
    if (!validateStepOne()) {
      Haptics.formSubmitError();
      return;
    }
    if (apiError) setApiError('');
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

    const nextPhoneError = validatePhoneField();
    setPhoneError(nextPhoneError);

    return !Object.values(newErrors).some(Boolean) && !nextPhoneError;
  };

  const handleRegisterSubmit = async () => {
    if (!validateAll()) {
      Haptics.formSubmitError();
      return;
    }
    if (!registerLegalAcknowledged) {
      Haptics.formSubmitError();
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

    const result = await authService.registerCustomer({
      name: fullName,
      email: emailNorm,
      password,
      phone: phoneE164,
    });

    setLoading(false);

    if (result.success) {
      setRegisteredEmail(emailNorm);
      setShowRegistrationSuccess(true);
      return;
    }

    Haptics.formSubmitError();
    const msg = result.message || 'Registration failed.';
    if (result.status === 409 || /already exists|already in use/i.test(msg)) {
      setErrors((p) => ({ ...p, email: 'An account with this email already exists' }));
      setTouched((p) => ({ ...p, email: true }));
    } else {
      setApiError(msg);
    }
  };

  return (
    <AuthLayout
      appearance="loginBrand"
      showBack={!showRegistrationSuccess}
      onBack={() => {
        router.back();
      }}
      logo={showRegistrationSuccess ? null : undefined}
      title={showRegistrationSuccess ? undefined : 'Create account'}
      subtitle={showRegistrationSuccess ? undefined : 'Join AutoSPF+ for premium vehicle service.'}
      footer={
        showRegistrationSuccess ? null : (
          <View style={s.footer}>
            <Text style={s.footerText}>Already have an account? </Text>
            <TouchableOpacity
              onPress={() => {
                router.back();
              }}
            >
              <Text style={s.footerLink}>Sign in</Text>
            </TouchableOpacity>
          </View>
        )
      }
    >
      {showRegistrationSuccess ? (
        <Animated.View entering={FadeInUp.duration(260)} style={s.successState}>
          <Animated.View entering={ZoomIn.delay(80).duration(260)} style={s.successIcon}>
            <Ionicons name="checkmark" size={30} color={AuthColors.textPrimary} />
          </Animated.View>
          <Text style={s.successTitle}>Welcome to AutoSPF+</Text>
          <Text style={s.successSubtitle}>Your account is ready.</Text>
          <Text style={s.successBody}>{"Let's set up your first vehicle."}</Text>
          <AuthButton
            title="Continue"
            onPress={handleRegistrationSuccessContinue}
            appearance="loginBrand"
            style={s.successCta}
          />
        </Animated.View>
      ) : (
        <>
          <AuthStepIndicator
            currentStep={step}
            label={step === 1 ? 'Your details' : 'Account & password'}
          />

          {step === 1 ? (
            <Animated.View key="register-step-1" entering={FadeInUp.duration(240)} style={s.stepPanel}>
              <AuthInput
                label="First name"
                placeholder="First name"
                value={firstName}
                onChangeText={(v) => handleChange('firstName', v, setFirstName)}
                onBlur={() => handleBlur('firstName')}
                autoCapitalize="words"
                textContentType="givenName"
                autoComplete="name-given"
                error={touched.firstName ? errors.firstName : ''}
                appearance="loginBrand"
                reserveErrorSpace
              />

              <AuthInput
                label="Last name"
                placeholder="Last name"
                value={lastName}
                onChangeText={(v) => handleChange('lastName', v, setLastName)}
                onBlur={() => handleBlur('lastName')}
                autoCapitalize="words"
                textContentType="familyName"
                autoComplete="name-family"
                error={touched.lastName ? errors.lastName : ''}
                appearance="loginBrand"
                reserveErrorSpace
              />

              <AuthInput
                label="Phone number"
                leftAccessory={
                  <RegisterCountryCodePicker
                    countryIso={registerPhoneCountryIso}
                    onCountryIsoChange={(iso) => {
                      setRegisterPhoneCountryIso(iso);
                      setPhoneError('');
                      if (apiError) setApiError('');
                    }}
                  />
                }
                placeholder={dial === '63' ? '9XXXXXXXXX' : 'Phone number'}
                value={registerPhoneNational}
                onChangeText={handleRegisterPhoneChange}
                onBlur={() => {
                  setRegisterPhoneTouched(true);
                  setPhoneError(validatePhoneField());
                }}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                error={registerPhoneTouched ? phoneError : ''}
                appearance="loginBrand"
                reserveErrorSpace
              />

              <AuthButton
                title="Continue"
                onPress={handleContinueStep}
                appearance="loginBrand"
                style={s.stepCta}
              />
            </Animated.View>
          ) : (
            <Animated.View key="register-step-2" entering={FadeInUp.duration(240)} style={s.stepPanel}>
              <TouchableOpacity
                style={s.stepBackBtn}
                activeOpacity={0.78}
                onPress={() => {
                  setStep(1);
                }}
              >
                <Ionicons name="chevron-back" size={16} color={AuthColors.textSecondary} />
                <Text style={s.stepBackText}>Your details</Text>
              </TouchableOpacity>

              <AuthInput
                label="Email address"
                placeholder="name@example.com"
                value={email}
                onChangeText={(v) => handleChange('email', v.trim(), setEmail)}
                onBlur={() => handleBlur('email')}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                error={touched.email ? errors.email : ''}
                appearance="loginBrand"
                reserveErrorSpace
              />

              <AuthInput
                label="Password"
                placeholder="Password"
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  if (errors.password) setErrors((p) => ({ ...p, password: '' }));
                  if (errors.confirmPassword) {
                    setErrors((p) => ({ ...p, confirmPassword: '' }));
                  }
                  if (apiError) setApiError('');
                }}
                onBlur={() => handleBlur('password')}
                isPassword
                textContentType="newPassword"
                autoComplete="new-password"
                error={touched.password ? errors.password : ''}
                containerStyle={password.length > 0 ? s.passwordInputWithMeter : undefined}
                appearance="loginBrand"
                reserveErrorSpace
              />
              {password.length > 0 && <AuthPasswordRequirements password={password} />}

              <AuthInput
                label="Confirm password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChangeText={(v) => handleChange('confirmPassword', v, setConfirmPassword)}
                onBlur={() => handleBlur('confirmPassword')}
                isPassword
                textContentType="newPassword"
                autoComplete="new-password"
                error={touched.confirmPassword ? errors.confirmPassword : ''}
                appearance="loginBrand"
                reserveErrorSpace
              />

              <View style={s.legalGroup}>
                <TouchableOpacity
                  style={s.agreeRow}
                  activeOpacity={0.75}
                  onPress={() => {
                    if (ppfTermsAgreed) {
                      setPpfTermsAgreed(false);
                    } else {
                      setPpfTermsModalScrolledToEnd(false);
                      setPpfTermsModalBodyKey((k) => k + 1);
                      setPpfTermsModalOpen(true);
                    }
                  }}
                >
                  <View style={[s.agreeBox, ppfTermsAgreed && s.agreeBoxOn]}>
                    {ppfTermsAgreed ? <Ionicons name="checkmark" size={15} color={AuthColors.bg} /> : null}
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
                  }}
                >
                  <View style={[s.agreeBox, registerWebsiteTermsAgreed && s.agreeBoxOn]}>
                    {registerWebsiteTermsAgreed ? (
                      <Ionicons name="checkmark" size={15} color={AuthColors.bg} />
                    ) : null}
                  </View>
                  <Text style={s.agreeText}>
                    I confirm the website <Text style={s.agreeLink}>Terms of Service</Text>.
                  </Text>
                </TouchableOpacity>
              </View>

              {!!apiError && (
                <Animated.View entering={FadeInUp.duration(200)} style={s.errorBanner}>
                  <Text style={s.errorText}>{apiError}</Text>
                </Animated.View>
              )}

              <AuthButton
                title={loading ? 'Creating account…' : 'Create account'}
                onPress={handleRegisterSubmit}
                disabled={loading}
                loading={loading}
                appearance="loginBrand"
                style={s.stepCta}
              />
            </Animated.View>
          )}
        </>
      )}

      <MotionSheet
        visible={ppfTermsModalOpen}
        onClose={() => setPpfTermsModalOpen(false)}
        contentStyle={[s.ppfModalSheet, { maxHeight: SCREEN_H * 0.94 }]}
        accessibilityLabel="Paint protection film terms"
      >
        <View style={s.ppfModalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.ppfModalTitle}>Paint Protection Film — Terms & Acknowledgement</Text>
            <Text style={s.ppfModalBrand}>AutoSPF+ Sun Protection Film</Text>
            <Text style={s.ppfModalBiz}>{PPF_TERMS_BUSINESS.name}</Text>
          </View>
          <TouchableOpacity
            style={s.ppfModalClose}
            onPress={() => setPpfTermsModalOpen(false)}
            hitSlop={12}
          >
            <Ionicons name="close" size={24} color={AuthColors.textSecondary} />
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
            <Text style={s.ppfModalScrollHintText}>Scroll to the bottom to enable &quot;I accept&quot;.</Text>
          </View>
        ) : null}
        <View style={s.ppfModalFooter}>
          <AuthButton
            title="Cancel"
            variant="secondary"
            fullWidth={false}
            style={s.ppfModalCancel}
            onPress={() => setPpfTermsModalOpen(false)}
          />
          <AuthButton
            title="I accept the PPF terms"
            fullWidth={false}
            disabled={!ppfTermsModalScrolledToEnd}
            style={s.ppfModalAccept}
            onPress={() => {
              if (!ppfTermsModalScrolledToEnd) return;
              setPpfTermsAgreed(true);
              setPpfTermsModalOpen(false);
            }}
          />
        </View>
      </MotionSheet>
    </AuthLayout>
  );
}

const s = StyleSheet.create({
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
    color: AuthColors.textSecondary,
    fontFamily: AuthFontFamily.medium,
    fontSize: 13,
  },
  stepCta: { marginTop: 10 },
  passwordInputWithMeter: { marginBottom: 8 },
  legalGroup: {
    gap: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  errorBanner: {
    borderWidth: 1,
    borderColor: AuthColors.error,
    borderRadius: AuthRadius.input,
    padding: 14,
    marginTop: 10,
  },
  errorText: { color: AuthColors.error, fontFamily: AuthFontFamily.regular, fontSize: 13, lineHeight: 18 },
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 13,
    borderRadius: AuthRadius.input,
    backgroundColor: AuthColors.card,
    borderWidth: 1,
    borderColor: AuthColors.borderHairline,
  },
  agreeBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: AuthColors.borderFocus,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agreeBoxOn: {
    backgroundColor: AuthColors.textPrimary,
    borderColor: AuthColors.textPrimary,
  },
  agreeTextWrap: { flex: 1 },
  agreeText: {
    fontFamily: AuthFontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: AuthColors.textSecondary,
  },
  agreeLink: { color: AuthColors.textPrimary, fontFamily: AuthFontFamily.medium },
  successState: {
    minHeight: SCREEN_H * 0.6,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: AuthRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AuthColors.card,
    borderWidth: 1,
    borderColor: AuthColors.borderHairline,
    marginBottom: 22,
  },
  successTitle: {
    color: AuthColors.textPrimary,
    fontFamily: AuthTypography.h1.fontFamily,
    fontSize: AuthTypography.h1.fontSize,
    lineHeight: AuthTypography.h1.lineHeight,
    textAlign: 'center',
  },
  successSubtitle: {
    color: AuthColors.textSecondary,
    fontFamily: AuthFontFamily.regular,
    fontSize: 16,
    marginTop: 10,
    textAlign: 'center',
  },
  successBody: {
    color: AuthColors.textTertiary,
    fontFamily: AuthFontFamily.regular,
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  successCta: {
    marginTop: 30,
  },
  ppfModalSheet: {
    backgroundColor: AuthColors.elevated,
    borderTopLeftRadius: AuthRadius.card,
    borderTopRightRadius: AuthRadius.card,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderColor: AuthColors.borderHairline,
  },
  ppfModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: AuthColors.borderHairline,
  },
  ppfModalClose: {
    width: 36,
    height: 36,
    borderRadius: AuthRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: AuthColors.borderHairline,
  },
  ppfModalTitle: {
    fontFamily: AuthFontFamily.semiBold,
    fontSize: 17,
    color: AuthColors.textPrimary,
    lineHeight: 23,
  },
  ppfModalBrand: {
    marginTop: 6,
    fontFamily: AuthFontFamily.medium,
    fontSize: 12,
    color: AuthColors.textSecondary,
  },
  ppfModalBiz: {
    marginTop: 3,
    fontFamily: AuthFontFamily.regular,
    fontSize: 12,
    color: AuthColors.textTertiary,
    lineHeight: 17,
  },
  ppfModalScroll: { backgroundColor: AuthColors.bg },
  ppfModalScrollContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28 },
  ppfModalMeta: {
    fontFamily: AuthFontFamily.regular,
    fontSize: 12,
    color: AuthColors.textTertiary,
    lineHeight: 18,
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: AuthColors.borderHairline,
  },
  ppfModalIntro: {
    fontFamily: AuthFontFamily.regular,
    fontSize: 14,
    color: AuthColors.textPrimary,
    lineHeight: 22,
    marginBottom: 18,
  },
  ppfModalSecTitle: {
    fontFamily: AuthFontFamily.medium,
    fontSize: 13,
    color: AuthColors.textSecondary,
    marginBottom: 8,
  },
  ppfModalSecBody: {
    fontFamily: AuthFontFamily.regular,
    fontSize: 14,
    color: AuthColors.textPrimary,
    lineHeight: 22,
  },
  ppfModalScrollHint: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: AuthColors.borderHairline,
  },
  ppfModalScrollHintText: {
    color: AuthColors.textSecondary,
    fontFamily: AuthFontFamily.regular,
    fontSize: 12,
  },
  ppfModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    borderTopWidth: 1,
    borderTopColor: AuthColors.borderHairline,
  },
  ppfModalCancel: { flex: 1 },
  ppfModalAccept: { flex: 2 },
  footer: { flexDirection: 'row', justifyContent: 'center' },
  footerText: { color: AuthColors.textSecondary, fontFamily: AuthFontFamily.regular, fontSize: 14 },
  footerLink: { color: AuthColors.textPrimary, fontFamily: AuthFontFamily.medium, fontSize: 14 },
});
