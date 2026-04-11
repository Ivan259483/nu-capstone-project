/**
 * AutoSPF+ Welcome & Intro Screen
 * Features a cinematic entry for the application.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp, ZoomIn, useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Palette } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

// We use the brand amber instead of lime green, per default instruction
const BRAND_AMBER = Palette.accent || '#FF6B35';

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();

  // Animations
  const bgScale = useSharedValue(1.15); // Start slightly zoomed in
  const ctaScale = useSharedValue(1);

  useEffect(() => {
    // 1. Ken Burns Slow Zoom Effect on Background
    bgScale.value = withTiming(1, { duration: 12000, easing: Easing.out(Easing.cubic) });

    // 2. Subtle breathing pulse on the CTA button
    ctaScale.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // 3. Welcome Mount Haptic (feels like a premium app finished loading)
    if (Platform.OS !== 'web') {
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }, 600); // Trigger haptic exactly when the text slams in
    }
  }, []);

  const bgAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bgScale.value }]
  }));

  const ctaAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ctaScale.value }]
  }));

  const triggerHapticImpact = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const triggerHapticLight = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={styles.container}>
      {/* ── Background Cinematic Image with Slow Zoom ── */}
      <View style={StyleSheet.absoluteFillObject}>
        <Animated.View style={[StyleSheet.absoluteFillObject, bgAnimatedStyle]}>
          <Image 
            source={{ uri: 'file:///Users/ivan/.gemini/antigravity/brain/5b01b4a1-0e1b-416a-9e4c-b5f5c5235ae0/ultra_premium_sports_car_bg_1775840444238.png' }} 
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            transition={1000} // Smooth image load fade
          />
        </Animated.View>
        
        {/* Dark Gradient Overlay starting halfway down */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.4)', '#000000', '#000000']}
          locations={[0, 0.45, 0.8, 1]}
          style={StyleSheet.absoluteFillObject}
        />
      </View>

      {/* ── Top Left Logo ── */}
      <Animated.View 
        entering={ZoomIn.duration(1000).springify().delay(200)} 
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
        
        {/* Typography */}
        <Animated.View entering={FadeInUp.delay(500).duration(1000).springify().damping(14)} style={styles.textWrap}>
          <Text style={styles.title}>
            Redefining{'\n'}Auto Perfection
          </Text>
          <Text style={styles.subtitle}>
            Experience AI-driven damage analysis, elite paint protection, and premium detailing—crafted for those who demand the best.
          </Text>
        </Animated.View>

        {/* Action Buttons */}
        <Animated.View entering={FadeInUp.delay(800).springify().damping(16).stiffness(100)} style={styles.actionWrap}>
          
          <Animated.View style={[styles.ctaWrapper, ctaAnimatedStyle]}>
            <TouchableOpacity 
              style={styles.primaryButton}
              activeOpacity={0.85}
              onPress={() => {
                triggerHapticImpact();
                router.push('/(auth)/signup');
              }}
            >
              <Text style={styles.primaryButtonText}>Get Started</Text>
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.loginRow}>
            <Text style={styles.loginTextSub}>Already have an account? </Text>
            <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => {
              triggerHapticLight();
              router.push('/(auth)/login');
            }}>
              <Text style={styles.loginTextLink}>Login</Text>
            </TouchableOpacity>
          </View>
          
        </Animated.View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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
    color: '#FFF',
    fontSize: 42,
    fontWeight: '800',
    lineHeight: 48,
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.8,
  },
  subtitle: {
    color: '#A0A0A0',
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 24,
    textAlign: 'center',
    paddingHorizontal: 12,
    letterSpacing: 0.2,
  },
  actionWrap: {
    width: '100%',
    alignItems: 'center',
    gap: 24,
  },
  ctaWrapper: {
    width: '100%',
  },
  primaryButton: {
    width: '100%',
    height: 60,
    backgroundColor: BRAND_AMBER,
    borderRadius: 12, // slightly rounder for a modern native feel
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: BRAND_AMBER,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryButtonText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  loginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4, // pull closer
  },
  loginTextSub: {
    color: '#A0A0A0',
    fontSize: 15,
    fontWeight: '400',
  },
  loginTextLink: {
    color: BRAND_AMBER,
    fontSize: 15,
    fontWeight: '700',
  },
});
