/**
 * AutoSPF+ Welcome & Intro Screen
 * Cinematic entry point for the app — shares the Sign In screen's photo +
 * neutral scrim treatment (see `AuthBackdrop`), but keeps its own
 * bottom-anchored hero content rather than the form-shaped AuthLayout
 * slots, since it has no back button and no form fields.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import Animated, { FadeInUp, ZoomIn, cancelAnimation, useReducedMotion, useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthBackdrop } from '@/components/auth/AuthLayout';
import AuthButton from '@/components/auth/AuthButton';
import MotionPressable from '@/components/ui/MotionPressable';
import { AuthColors, AuthFontFamily, AuthTypography } from '@/constants/authTheme';

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  // Ken Burns slow zoom on the background — a one-directional entrance
  // effect, not a bounce, so it stays under the "nothing bounces" rule.
  const bgScale = useSharedValue(1.15);

  useEffect(() => {
    if (reducedMotion) {
      bgScale.value = 1;
      return;
    }
    bgScale.value = withTiming(1, { duration: 12000, easing: Easing.out(Easing.cubic) });
    return () => cancelAnimation(bgScale);
  }, [bgScale, reducedMotion]);

  const bgAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bgScale.value }]
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[StyleSheet.absoluteFill, bgAnimatedStyle]}>
        <AuthBackdrop source={require('../../../assets/images/login-cinematic-bg.png')} />
      </Animated.View>

      {/* ── Top Left Logo Watermark ── */}
      <Animated.View
        entering={ZoomIn.duration(600).delay(200)}
        style={[styles.logoWrap, { top: Math.max(insets.top, 20) + 10 }]}
      >
        <Image
          source={require('../../../assets/images/logo-glow.png')}
          style={styles.logo}
          contentFit="contain"
        />
      </Animated.View>

      {/* ── Content Container (Bottom Aligned) ── */}
      <View style={[styles.contentContainer, { paddingBottom: Math.max(insets.bottom, 20) + 20 }]}>

        <Animated.View entering={FadeInUp.delay(500).duration(500)} style={styles.textWrap}>
          <Text style={styles.title}>
            Redefining{'\n'}Auto Perfection
          </Text>
          <Text style={styles.subtitle}>
            Experience AI-driven damage analysis, elite paint protection, and premium detailing — crafted for those who demand the best.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(700).duration(400)} style={styles.actionWrap}>
          <AuthButton title="Get started" onPress={() => router.push('/(auth)/signup')} />

          <View style={styles.loginRow}>
            <Text style={styles.loginTextSub}>Already have an account? </Text>
            <MotionPressable
              haptic="light"
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              onPress={() => router.push('/(auth)/login')}
            >
              <Text style={styles.loginTextLink}>Log in</Text>
            </MotionPressable>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AuthColors.bg,
  },
  logoWrap: {
    position: 'absolute',
    left: 24,
    zIndex: 10,
  },
  logo: {
    width: 60,
    height: 60,
    opacity: 0.9,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
  },
  textWrap: {
    marginBottom: 44,
    alignItems: 'center',
  },
  title: {
    fontFamily: AuthFontFamily.semiBold,
    color: AuthColors.textPrimary,
    fontSize: 38,
    lineHeight: 44,
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.7,
  },
  subtitle: {
    fontFamily: AuthTypography.body.fontFamily,
    color: AuthColors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  actionWrap: {
    width: '100%',
    alignItems: 'center',
    gap: 24,
  },
  loginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginTextSub: {
    fontFamily: AuthFontFamily.regular,
    color: AuthColors.textSecondary,
    fontSize: 15,
  },
  loginTextLink: {
    fontFamily: AuthFontFamily.semiBold,
    color: AuthColors.textPrimary,
    fontSize: 15,
  },
});
