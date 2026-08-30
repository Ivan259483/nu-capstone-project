import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  cancelAnimation,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { MobileProfile } from '@/services/api/types';
import { PremiumLoader } from '@/components/ui/loading';
import { Motion } from '@/constants/motion';
import MotionPressable from '@/components/ui/MotionPressable';

const ACCENT = '#FF6B35';

interface ProfileHeaderProps {
  profile: MobileProfile | null;
  isUpdatingAvatar: boolean;
  onPickImage: () => void;
}

export default function ProfileHeader({ profile, isUpdatingAvatar, onPickImage }: ProfileHeaderProps) {
  // ── Pulsing glow animation ──
  const glowOpacity = useSharedValue(0.25);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      glowOpacity.value = 0.25;
      return;
    }
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.55, { duration: 1800 }),
        withTiming(0.25, { duration: 1800 })
      ),
      -1,
      true
    );
    return () => cancelAnimation(glowOpacity);
  }, [glowOpacity, reducedMotion]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const initials = profile?.full_name
    ? profile.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase()
    : 'JD';

  return (
    <Animated.View entering={FadeInDown.duration(200)} style={s.container}>
      {/* Avatar with glow ring */}
      <MotionPressable
        onPress={onPickImage}
        pressedScale={Motion.scale.compactPress}
        haptic="light"
        style={s.avatarOuter}
        disabled={isUpdatingAvatar}
        accessibilityRole="button"
        accessibilityLabel={isUpdatingAvatar ? 'Updating profile photo' : 'Change profile photo'}
      >
        {/* Animated glow ring */}
        <Animated.View style={[s.glowRing, glowStyle]} />

        <View style={s.avatarRing}>
          <View style={s.avatarInner}>
            {profile?.avatar_url ? (
              <Image source={profile.avatar_url} style={s.avatarImage} contentFit="cover" cachePolicy="memory-disk" transition={200} />
            ) : (
              <LinearGradient
                colors={['rgba(255,107,53,0.3)', 'rgba(255,107,53,0.1)']}
                style={s.avatarFallback}
              >
                <Text style={s.avatarInitials}>{initials}</Text>
              </LinearGradient>
            )}
            {isUpdatingAvatar && (
              <View style={s.avatarLoading}>
                <PremiumLoader size={22} accessibilityLabel="Updating profile photo" />
              </View>
            )}
          </View>
        </View>

        {/* Camera edit badge */}
        <View style={s.editBadge}>
          <Ionicons name="camera" size={13} color="#FFF" />
        </View>
      </MotionPressable>

      {/* Name + Email */}
      <Text style={s.name}>{profile?.full_name || 'Customer User'}</Text>
      <Text style={s.email}>{profile?.email || 'customer@example.com'}</Text>

      {/* Badges row */}
      <View style={s.badgeRow}>
        <View style={[s.badge, s.badgeSilver]}>
          <Ionicons name="shield-checkmark" size={10} color="#94A3B8" />
          <Text style={[s.badgeText, { color: '#94A3B8' }]}>Silver Tier</Text>
        </View>

        <View style={[s.badge, s.badgePoints]}>
          <Ionicons name="star" size={10} color="#FBBF24" />
          <Text style={[s.badgeText, { color: '#FBBF24' }]}>2,450 pts</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarOuter: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  glowRing: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: ACCENT,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
  },
  avatarRing: {
    width: 94,
    height: 94,
    borderRadius: 47,
    borderWidth: 1.5,
    borderColor: 'rgba(255,107,53,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,107,53,0.04)',
  },
  avatarInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,107,53,0.12)',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: '800',
    color: ACCENT,
    letterSpacing: 1,
  },
  avatarLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: 2,
    right: 5,
    backgroundColor: ACCENT,
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: '#040405',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  email: {
    fontSize: 13,
    color: '#8A8A9A',
    marginBottom: 16,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.2)',
  },
  badgeSilver: {
    borderColor: 'rgba(148,163,184,0.2)',
    backgroundColor: 'rgba(148,163,184,0.06)',
  },
  badgePoints: {
    borderColor: 'rgba(251,191,36,0.2)',
    backgroundColor: 'rgba(251,191,36,0.06)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: ACCENT,
    letterSpacing: 0.5,
  },
});
