import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/hooks/useThemeContext';
import { apiClient, getApiErrorMessage } from '@/services/api/client';
import { Palette } from '@/constants/theme';
import GlassCard from '@/components/ui/GlassCard';
import PremiumButton from '@/components/ui/PremiumButton';

const OTP_LENGTH = 6;
const normalizeOtp = (value: string) => value.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH);
const normalizeEmail = (value: string) => value.trim().toLowerCase();

export default function VerifyScreen() {
  const { colors } = useTheme();
  const { email: emailParam } = useLocalSearchParams<{ email?: string | string[] }>();
  const email = useMemo(() => {
    if (emailParam == null) return '';
    return normalizeEmail(Array.isArray(emailParam) ? (emailParam[0] ?? '') : emailParam);
  }, [emailParam]);

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const otpRefs = useRef<(TextInput | null)[]>([]);

  // ── Verify OTP ─────────────────────────────────────────────
  async function handleVerifyOtp() {
    const token = normalizeOtp(otp.join(''));
    if (token.length !== OTP_LENGTH) {
      Alert.alert('Invalid Code', 'Please enter the full 6-digit code.');
      return;
    }
    if (!email) {
      Alert.alert('Error', 'Email address is missing.');
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.post('/auth/verify-otp', {
        email,
        otp: token,
      });

      if (response.data?.success) {
        Alert.alert('Success', 'Email verified successfully!', [
          { text: 'OK', onPress: () => router.replace('/(auth)/login') },
        ]);
      } else {
        throw new Error(response.data?.message || 'Verification failed.');
      }
    } catch (error) {
      Alert.alert('Verification Failed', getApiErrorMessage(error));
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  // ── Input Handlers ─────────────────────────────────────────────
  function handleOtpChange(text: string, index: number) {
    const digit = normalizeOtp(text);
    const newOtp = [...otp];

    if (digit.length > 1) {
      const chars = digit.split('');
      newOtp.fill('');
      chars.forEach((c, i) => {
        if (i < OTP_LENGTH) newOtp[i] = c;
      });
      setOtp(newOtp);
      otpRefs.current[Math.min(chars.length, OTP_LENGTH - 1)]?.focus();
      return;
    }

    newOtp[index] = digit;
    setOtp(newOtp);

    if (digit && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyPress(key: string, index: number) {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
      otpRefs.current[index - 1]?.focus();
    }
  }

  function startCountdown() {
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleResend() {
    if (countdown > 0 || !email) return;
    setLoading(true);
    try {
      const response = await apiClient.post('/auth/resend-otp', {
        email,
      });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to resend code.');
      }
      Alert.alert('Code Sent', 'A new verification code has been sent.');
      startCountdown();
      setOtp(['', '', '', '', '', '']);
    } catch (error) {
      Alert.alert('Error', getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, padding: 20, justifyContent: 'center' }}
      >
        <TouchableOpacity 
          onPress={() => router.back()} 
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <Animated.View entering={FadeInDown.duration(200)}>
          <View style={styles.headerContainer}>
            <Text style={[styles.welcomeText, { color: colors.text }]}>
              Verify Email
            </Text>
            <Text style={[styles.welcomeSubtext, { color: colors.textSecondary }]}>
              Enter the 6-digit code sent to{'\n'}
              <Text style={{ fontWeight: '700', color: colors.text }}>
                {email.trim().toLowerCase()}
              </Text>
            </Text>
            <View style={styles.mailNotice}>
              <Ionicons name="mail-unread-outline" size={16} color={Palette.accent} />
              <Text style={styles.mailNoticeText}>
                If the code is not in Gmail All inboxes, please check Spam.
              </Text>
            </View>
          </View>

          <GlassCard style={{ padding: 24, marginTop: 20 }} animated={false}>
            <Text style={[styles.label, { textAlign: 'center' }]}>
              VERIFICATION CODE
            </Text>

            <View style={styles.otpRow}>
              {otp.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={(ref) => { otpRefs.current[i] = ref; }}
                  style={[
                    styles.otpBox,
                    {
                      backgroundColor: colors.cardAlt,
                      borderColor: digit ? Palette.accent : colors.border,
                      color: colors.text,
                    },
                  ]}
                  value={digit}
                  onChangeText={(text) => handleOtpChange(text, i)}
                  onKeyPress={({ nativeEvent }) =>
                    handleOtpKeyPress(nativeEvent.key, i)
                  }
                  keyboardType="number-pad"
                  maxLength={i === 0 ? OTP_LENGTH : 1}
                  textContentType="oneTimeCode"
                  autoFocus={i === 0}
                  selectTextOnFocus
                />
              ))}
            </View>

            <View style={{ marginTop: 24 }}>
              <PremiumButton
                title={loading ? 'Verifying...' : 'Verify Email'}
                icon={loading ? undefined : 'checkmark-circle-outline'}
                onPress={handleVerifyOtp}
                disabled={loading || normalizeOtp(otp.join('')).length !== OTP_LENGTH}
              />
            </View>

            <View style={{ alignItems: 'center', marginTop: 20 }}>
              {countdown > 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  Resend code in{' '}
                  <Text style={{ fontWeight: '700', color: Palette.accent }}>
                    {countdown}s
                  </Text>
                </Text>
              ) : (
                <TouchableOpacity onPress={handleResend} disabled={loading}>
                  <Text style={{ color: Palette.accent, fontSize: 14, fontWeight: '700' }}>
                    Resend Code
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </GlassCard>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backButton: { 
    width: 40, 
    height: 40, 
    justifyContent: 'center', 
    position: 'absolute',
    top: 60,
    left: 20,
    zIndex: 10
  },
  headerContainer: { marginBottom: 20, marginTop: 40 },
  welcomeText: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  welcomeSubtext: { fontSize: 15, marginTop: 8, lineHeight: 22, textAlign: 'center' },
  mailNotice: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(249,115,22,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.25)',
  },
  mailNoticeText: {
    flexShrink: 1,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'center',
  },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: '#9CA3AF', marginBottom: 8 },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  otpBox: {
    width: 48,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '800',
  },
});
