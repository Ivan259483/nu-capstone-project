/**
 * AutoSPF+ Welcome & Intro Screen
 * Features a cinematic entry for the application.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp, ZoomIn, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Palette, Shadows } from '@/constants/theme';
import PremiumButton from '@/components/ui/PremiumButton';

const { width, height } = Dimensions.get('window');

const services = [
  { name: "CERAMIC COATING", icon: "sparkles", delay: 200, style: { top: '15%', left: '8%' } },
  { name: "PAINT CORRECTION", icon: "color-wand", delay: 600, style: { top: '30%', right: '5%' } },
  { name: "PPF INSTALLATION", icon: "shield-checkmark", delay: 1000, style: { top: '55%', left: '5%' } },
  { name: "INTERIOR DETAIL", icon: "car-sport", delay: 1400, style: { top: '45%', right: '8%' } },
];

function FloatingBadge({ name, icon, delay, style }: { name: string, icon: any, delay: number, style: any }) {
    const translateY = useSharedValue(0);

    useEffect(() => {
        // Start from a random position in the cycle to make them look organic
        const randomStart = Math.random() * 10;
        translateY.value = withRepeat(
            withSequence(
                withTiming(15, { duration: 3000 + randomStart * 100, easing: Easing.inOut(Easing.ease) }),
                withTiming(-15, { duration: 3000 + randomStart * 100, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            true
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }]
    }));

    return (
        <Animated.View 
            entering={FadeInUp.delay(delay).duration(1500).springify().damping(14)} 
            style={[styles.floatingBadge, style, animatedStyle]}
        >
            <Ionicons name={icon} size={14} color={Palette.accent} style={{ marginRight: 6 }} />
            <Text style={styles.floatingBadgeText}>{name}</Text>
        </Animated.View>
    );
}

export default function WelcomeScreen() {
  
  const orb1Scale = useSharedValue(1);
  const orb2Scale = useSharedValue(1);

  useEffect(() => {
    orb1Scale.value = withRepeat(
      withSequence(
        withTiming(1.8, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    orb2Scale.value = withRepeat(
      withSequence(
        withTiming(1.6, { duration: 6000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.8, { duration: 6000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const orb1Style = useAnimatedStyle(() => ({
    transform: [{ scale: orb1Scale.value }]
  }));
  const orb2Style = useAnimatedStyle(() => ({
    transform: [{ scale: orb2Scale.value }]
  }));

  const triggerHapticImpact = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const triggerHapticLight = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={styles.container}>
      {/* Immersive Dark Studio Canvas */}
      <View style={styles.ambientBackground}>
        {/* Living Ambient Orbs */}
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <Animated.View style={[styles.orb, styles.orb1, orb1Style]} />
          <Animated.View style={[styles.orb, styles.orb2, orb2Style]} />
          {/* Glass-melt blur gradient overlay */}
          <LinearGradient
            colors={['rgba(5,5,5,0.6)', '#050505', '#050505']}
            style={StyleSheet.absoluteFillObject}
          />
        </View>

        {/* Floating Detailing Services */}
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
           {services.map((service, index) => (
               <FloatingBadge key={index} {...service} />
           ))}
        </View>

        <LinearGradient
          colors={['transparent', 'rgba(249, 115, 22, 0.08)']}
          style={styles.ambientBottomFade}
        />
      </View>

      <View style={styles.contentContainer}>
        {/* Cinematic Logo Intro */}
        <Animated.View entering={ZoomIn.duration(1200).springify().damping(18).stiffness(90)} style={styles.logoContainer}>
            <Image 
                source={require('../../../assets/images/logo-glow.png')} 
                style={styles.logo}
                contentFit="contain"
            />
        </Animated.View>

        {/* Majestic Typography Entrance */}
        <Animated.View entering={FadeInUp.delay(300).duration(800).springify()} style={styles.textContainer}>
            <Text style={styles.title}>
              AutoSPF<Text style={{ color: Palette.accent }}>+</Text>
            </Text>
            <Text style={styles.tagline}>
              ELITE AUTO DETAILING STUDIO
            </Text>
            
            <Text style={styles.description}>
              Paint correction, ceramic coating, and PPF installation straight from your device.
            </Text>
        </Animated.View>
      </View>

      {/* Footer Call to Actions */}
      <Animated.View entering={FadeInUp.delay(600).springify().damping(16).stiffness(100)} style={styles.footerContainer}>
         <PremiumButton
            title="SIGN IN"
            onPress={() => {
                triggerHapticImpact();
                router.push('/(auth)/login');
            }}
            style={{ marginBottom: 16 }}
         />
         <TouchableOpacity 
            style={styles.secondaryButton}
            onPress={() => {
                triggerHapticLight();
                router.push('/(auth)/signup');
            }}
         >
           <Text style={styles.secondaryButtonText}>CREATE ACCOUNT</Text>
         </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
    justifyContent: 'space-between',
  },
  ambientBackground: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
  },
  orb: {
    position: 'absolute',
    borderRadius: 9999,
    backgroundColor: Palette.accent,
  },
  orb1: {
    width: 400,
    height: 400,
    top: -150,
    right: -150,
    opacity: 0.12,
  },
  orb2: {
    width: 300,
    height: 300,
    top: height * 0.4,
    left: -150,
    opacity: 0.08,
  },
  ambientBottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: height * 0.1,
  },
  logoContainer: {
    marginBottom: 40,
    ...Shadows.glow,
  },
  logo: {
    width: 140,
    height: 140,
    opacity: 0.95,
  },
  textContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 12,
    fontWeight: '800',
    color: Palette.accent,
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: 24,
    textTransform: 'uppercase',
  },
  description: {
    fontSize: 15,
    fontWeight: '500',
    color: '#8A8A9A',
    textAlign: 'center',
    letterSpacing: 0.5,
    lineHeight: 22,
    maxWidth: '85%',
  },
  footerContainer: {
    paddingHorizontal: 32,
    paddingBottom: Platform.OS === 'ios' ? 50 : 40,
    width: '100%',
  },
  secondaryButton: {
    height: 56,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  floatingBadge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  floatingBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
});
