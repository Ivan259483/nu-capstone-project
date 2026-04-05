import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { MobileProfile } from '@/services/api/types';

const ACCENT = '#FF6B35';

interface ProfileHeaderProps {
  profile: MobileProfile | null;
  isUpdatingAvatar: boolean;
  onPickImage: () => void;
}

export default function ProfileHeader({ profile, isUpdatingAvatar, onPickImage }: ProfileHeaderProps) {
  // ── Pulsing glow animation ──
  const glowOpacity = useSharedValue(0.25);

  useEffect(() => {
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.55, { duration: 1800 }),
        withTiming(0.25, { duration: 1800 })
      ),
      -1,
      true
    );
  }, []);

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
    <Animated.View entering={FadeInDown.springify().damping(18).stiffness(140)} style={s.container}>
      {/* Avatar with glow ring */}
      <TouchableOpacity onPress={onPickImage} activeOpacity={0.8} style={s.avatarOuter}>
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
                <ActivityIndicator color={ACCENT} />
              </View>
            )}
          </View>
        </View>

        {/* Camera edit badge */}
        <View style={s.editBadge}>
          <Ionicons name="camera" size={13} color="#FFF" />
        </View>
      </TouchableOpacity>

      {/* Name + Email */}
      <Text style={s.name}>{profile?.full_name || 'Customer User'}</Text>
      <Text style={s.email}>{profile?.email || 'customer@example.com'}</Text>

      {/* Badges row */}
      <View style={s.badgeRow}>
        <LinearGradient
          colors={['rgba(255,107,53,0.15)', 'rgba(255,107,53,0.05)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.badge}
        >
          <Ionicons name="diamond" size={10} color={ACCENT} />
          <Text style={s.badgeText}>Premium Member</Text>
        </LinearGradient>

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
    width: 116,
    height: 116,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  glowRing: {
    position: 'absolute',
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: ACCENT,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
  },
  avatarRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1.5,
    borderColor: 'rgba(255,107,53,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,107,53,0.04)',
  },
  avatarInner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,107,53,0.12)',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 44,
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 30,
    fontWeight: '800',
    color: ACCENT,
    letterSpacing: 1,
  },
  avatarLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: 4,
    right: 8,
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
