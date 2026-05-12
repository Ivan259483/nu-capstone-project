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

export default function VerifyScreen() {
  const { colors } = useTheme();
  const { email: emailParam } = useLocalSearchParams<{ email?: string | string[] }>();
  const email = useMemo(() => {
    if (emailParam == null) return '';
    return Array.isArray(emailParam) ? (emailParam[0] ?? '') : emailParam;
  }, [emailParam]);

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const otpRefs = useRef<(TextInput | null)[]>([]);

  // ── Verify OTP ─────────────────────────────────────────────
  async function handleVerifyOtp() {
    const token = otp.join('');
    if (token.length !== 6) {
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
        email: email.trim().toLowerCase(),
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
    const digit = text.replace(/[^0-9]/g, '');
    const newOtp = [...otp];

    if (digit.length > 1) {
      const chars = digit.slice(0, 6).split('');
      chars.forEach((c, i) => {
        if (i < 6) newOtp[i] = c;
      });
      setOtp(newOtp);
      otpRefs.current[Math.min(chars.length, 5)]?.focus();
      return;
    }

    newOtp[index] = digit;
    setOtp(newOtp);

    if (digit && index < 5) {
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
        email: email.trim().toLowerCase(),
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
                  maxLength={i === 0 ? 6 : 1}
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
                disabled={loading || otp.join('').length !== 6}
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
