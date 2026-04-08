/**
 * Home Screen — AutoSPF+ Dashboard (Tesla International Redesign)
 * Immersive hero area, edge-to-edge tracking, sleek glass pills, fluid animations.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp, FadeInRight, withRepeat, withTiming, useAnimatedStyle, useSharedValue, withSequence, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useThemeContext';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api/client';
import { bookingService } from '@/services/api/bookingService';
import { Palette, TabBarHeight, Shadows } from '@/constants/theme';


const { width, height } = Dimensions.get('window');

// Advanced Double-Sonar Pulsing Indicator
function PulsingDot({ color }: { color: string }) {
  const scale1 = useSharedValue(1);
  const opacity1 = useSharedValue(1);
  const scale2 = useSharedValue(1);
  const opacity2 = useSharedValue(1);

  useEffect(() => {
    scale1.value = withRepeat(withTiming(2.5, { duration: 2000, easing: Easing.out(Easing.ease) }), -1, false);
    opacity1.value = withRepeat(withTiming(0, { duration: 2000, easing: Easing.out(Easing.ease) }), -1, false);
    
    // Stagger the second sonar ring
    setTimeout(() => {
      scale2.value = withRepeat(withTiming(3, { duration: 2000, easing: Easing.out(Easing.ease) }), -1, false);
      opacity2.value = withRepeat(withTiming(0, { duration: 2000, easing: Easing.out(Easing.ease) }), -1, false);
    }, 1000);
  }, []);

  const ring1 = useAnimatedStyle(() => ({
    transform: [{ scale: scale1.value }],
    opacity: opacity1.value,
  }));
  const ring2 = useAnimatedStyle(() => ({
    transform: [{ scale: scale2.value }],
    opacity: opacity2.value,
  }));

  return (
    <View style={{ width: 10, height: 10, justifyContent: 'center', alignItems: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: color }, ring2]} />
      <Animated.View style={[{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: color }, ring1]} />
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, shadowColor: color, shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0} }} />
    </View>
  );
}

// 3D Glass Floating Car Icon
function FloatingCarIcon() {
  const transY = useSharedValue(0);
  const glowOpacity = useSharedValue(0.5);

  useEffect(() => {
    transY.value = withRepeat(
      withSequence(
        withTiming(-10, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 2500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: transY.value }]
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value
  }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', height: 120, width: 120, marginBottom: 16 }}>
      {/* Intense Glowing Stage Light behind the car */}
      <Animated.View style={[{ position: 'absolute', width: 120, height: 120, backgroundColor: 'rgba(249,115,22,0.1)', borderRadius: 60, shadowColor: '#f97316', shadowOpacity: 0.5, shadowRadius: 30, shadowOffset: { width: 0, height: 0 } }, glowStyle]} />
      <Animated.View style={[{ position: 'absolute', width: 80, height: 80, backgroundColor: 'rgba(249,115,22,0.2)', borderRadius: 40, shadowColor: '#f97316', shadowOpacity: 0.8, shadowRadius: 15, shadowOffset: { width: 0, height: 0 } }, glowStyle]} />
      
      {/* The hovering car */}
      <Animated.View style={animatedStyle}>
        <Ionicons name="car-sport" size={90} color="#FFFFFF" style={{
          textShadowColor: 'rgba(255,255,255,0.4)',
          textShadowOffset: { width: 0, height: 15 },
          textShadowRadius: 20,
        }} />
      </Animated.View>
    </View>
  );
}

// Tesla-style Animated Progress Bar
function AnimatedProgressBar({ percentage }: { percentage: number }) {
  const widthAnim = useSharedValue(0);

  useEffect(() => {
    setTimeout(() => {
      widthAnim.value = withTiming(percentage, {
        duration: 2000,
        easing: Easing.out(Easing.exp)
      });
    }, 600); // Wait for the hero card to drop in
  }, [percentage]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${widthAnim.value}%`,
  }));

  return (
    <View style={styles.heroProgressBarTrack}>
      <Animated.View style={[styles.heroProgressBarFill, animatedStyle]}>
        <LinearGradient
            colors={['#f97316', '#fb923c', '#ffedd5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ width: '100%', height: '100%' }}
        />
      </Animated.View>
    </View>
  );
}

export default function HomeScreen() {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const router = useRouter();

  
  const [activeCount, setActiveCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [nextAppointment, setNextAppointment] = useState<any>(null);

  useEffect(() => {
    if (profile?.id) {
      fetchBookings();
    }
  }, [profile]);

  // Premium Intelligence Helpers
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'GOOD MORNING';
    if (hour < 18) return 'GOOD AFTERNOON';
    return 'GOOD EVENING';
  };

  const getFirstName = () => {
    if (!profile?.full_name) return 'VIP Guest';
    return profile.full_name.split(' ')[0];
  };

  async function fetchBookings() {
    try {
      const bookings = await bookingService.getMyBookings();
      setTotalCount(bookings.length);
      const active = bookings.filter((b) => !['completed', 'cancelled', 'failed'].includes(b.status));
      setActiveCount(active.length);
      setCompletedCount(bookings.filter((b) => b.status === 'completed').length);
      if (active.length > 0) {
        setNextAppointment(active[0]);
      } else {
        setNextAppointment(null);
      }
    } catch (error) {
      console.warn('Failed to load booking stats:', getApiErrorMessage(error));
    }
  }

  const quickActions = [
    {
      icon: 'calendar-outline' as const,
      label: 'Book Service',
      onPress: () => { Haptics.selectionAsync(); router.push('/(customer)/book'); },
    },
    {
      icon: 'list-outline' as const,
      label: 'Appointments',
      onPress: () => { Haptics.selectionAsync(); router.push('/(screens)/appointments'); },
    },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: '#050505' }]}>
      {/* Background Ambience / Immersive Mesh Equivalent */}
      <View style={styles.ambientBackground}>
        <LinearGradient
          colors={['rgba(249, 115, 22, 0.15)', 'transparent']}
          style={styles.ambientTopGlow}
        />
        <LinearGradient
          colors={['transparent', '#050505']}
          style={styles.ambientBottomFade}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: TabBarHeight + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header - Sleek Typography */}
        <Animated.View entering={FadeInDown.delay(100).springify().damping(16).stiffness(120)} style={styles.headerArea}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <View style={styles.greetRow}>
              <Ionicons name="sparkles" size={12} color="#f97316" style={{ marginRight: 6 }} />
              <Text style={styles.headerGreet}>{getGreeting()}</Text>
            </View>
            <View style={styles.nameRow}>
              <Text style={styles.headerName} numberOfLines={1}>{getFirstName()}</Text>
              <View style={styles.eliteBadgeWrap}>
                 <LinearGradient colors={['#f97316', '#fb923c']} style={styles.eliteBadgeGradient} start={{ x:0, y:0 }} end={{ x:1, y:1 }}>
                    <Ionicons name="shield-checkmark" size={10} color="#FFFFFF" />
                    <Text style={styles.eliteBadgeText}>ELITE</Text>
                 </LinearGradient>
              </View>
            </View>
          </View>
          <View style={styles.avatarGlassRing}>
            <View style={styles.avatarWrap}>
              {profile?.avatar_url ? (
                <Image source={profile.avatar_url} style={styles.avatarImage} contentFit="cover" cachePolicy="memory-disk" transition={200} />
              ) : (
                <Text style={styles.avatarText}>
                  {profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'JD'}
                </Text>
              )}
            </View>
          </View>
        </Animated.View>

        {/* Unified, Minimalist Stats Row */}
        <Animated.View entering={FadeInDown.delay(200).springify().damping(16).stiffness(120)}>
             <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.01)']} style={styles.statsContainer}>
                 <View style={styles.statItem}>
                     <Text style={[styles.statValue, { color: '#fb923c' }]}>{activeCount}</Text>
                     <Text style={styles.statLabel}>ACTIVE</Text>
                 </View>
                 <View style={styles.statDivider} />
                 <View style={styles.statItem}>
                     <Text style={[styles.statValue, { color: '#E0E0E0' }]}>{totalCount - activeCount}</Text>
                     <Text style={styles.statLabel}>PENDING</Text>
                 </View>
                 <View style={styles.statDivider} />
                 <View style={styles.statItem}>
                     <Text style={[styles.statValue, { color: Palette.success }]}>{completedCount}</Text>
                     <Text style={styles.statLabel}>COMPLETED</Text>
                 </View>
             </LinearGradient>
        </Animated.View>

        {/* Hero Vehicle Concept */}
        <Animated.View entering={FadeInUp.delay(350).springify().damping(20).stiffness(90)}>
            <TouchableOpacity activeOpacity={0.9} style={styles.heroVehicleCard}>
                <LinearGradient colors={['rgba(249,115,22,0.15)', 'rgba(255,255,255,0.02)']} style={styles.heroVehicleGradient} start={{x: 0, y: 0}} end={{x: 0, y: 1}}>
                    <View style={styles.heroHeaderRow}>
                         <View style={styles.statusLivePill}>
                             <PulsingDot color={Palette.info} />
                             <Text style={styles.statusLiveText}>IN SERVICE</Text>
                         </View>
                         <View style={styles.licensePlate}>
                             <Text style={styles.licensePlateText}>AAA 1234</Text>
                         </View>
                    </View>

                    <View style={styles.heroMainCenter}>
                        <FloatingCarIcon />
                        <Text style={styles.heroVehicleName}>TOYOTA FORTUNER</Text>
                        <Text style={styles.heroVehicleSub}>2022 Model</Text>
                    </View>

                     {/* Premium Hairline Progress Component */}
                     <View style={styles.heroProgressArea}>
                          <View style={styles.heroProgressHeader}>
                               <Text style={styles.heroProgressLabel}>SERVICE PROGRESS</Text>
                               <Text style={styles.heroProgressValueText}>65%</Text>
                          </View>
                          <AnimatedProgressBar percentage={65} />
                          <Text style={styles.heroEstText}>Est. Completion — Apr 4, 2:00 PM</Text>
                     </View>
                </LinearGradient>
            </TouchableOpacity>
        </Animated.View>

        {/* Quick Actions (Sleek Horizontal Scroll instead of grid) */}
        <Animated.View entering={FadeInUp.delay(500).springify().damping(16).stiffness(120)}>
           <Text style={styles.sectionHeader}>QUICK ACTIONS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickActionsScroll}>
               {quickActions.map((a, index) => (
                    <Animated.View key={a.label} entering={FadeInRight.delay(500 + index * 100).springify().damping(18).stiffness(100)}>
                        <TouchableOpacity style={styles.quickActionPillWrap} onPress={a.onPress} activeOpacity={0.7}>
                           <LinearGradient colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.01)']} style={styles.quickActionGradient}>
                                <View style={styles.quickActionIconRing}>
                                   <Ionicons name={a.icon} size={20} color="#f97316" />
                                </View>
                                <Text style={styles.quickActionText}>{a.label}</Text>
                           </LinearGradient>
                        </TouchableOpacity>
                    </Animated.View>
               ))}
            </ScrollView>
        </Animated.View>

        {/* Floating Notification Toast (Replacing the heavy box) */}
        <Animated.View entering={FadeInUp.delay(650).springify().damping(16).stiffness(120)} style={styles.notificationFloatingToast}>
             <LinearGradient colors={['rgba(16,185,129,0.1)', 'transparent']} style={styles.toastGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                 <View style={styles.toastIconWrapper}>
                     <Ionicons name="checkmark-sharp" size={16} color={Palette.success} />
                 </View>
                 <View style={styles.toastContent}>
                     <Text style={styles.toastTitle}>Engine flush completed</Text>
                     <Text style={styles.toastTime}>Vehicle ready for body inspection</Text>
                 </View>
                 <Text style={styles.toastTimeRight}>2h</Text>
             </LinearGradient>
        </Animated.View>

      </ScrollView>


    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  ambientBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#050505',
    zIndex: -1,
  },
  ambientTopGlow: {
    position: 'absolute',
    top: -50,
    left: 0,
    right: 0,
    height: height * 0.4,
  },
  ambientBottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  scroll: { flex: 1 },
  content: { 
    paddingHorizontal: 24, 
    paddingTop: 60,
    gap: 36, 
  },

  // Header
  headerArea: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 10,
    zIndex: 10,
  },
  greetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerGreet: {
    fontSize: 10,
    color: '#f97316',
    fontWeight: '800',
    letterSpacing: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerName: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1,
    lineHeight: 40,
    textShadowColor: 'rgba(255,255,255,0.2)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
  },
  eliteBadgeWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#f97316',
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  eliteBadgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  eliteBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  avatarGlassRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: 'rgba(249, 115, 22, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    shadowColor: '#f97316',
    shadowOpacity: 0.5,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 4 },
  },
  avatarWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#1E1E24',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 1,
  },
  avatarImage: { width: '100%', height: '100%' },

  // Stats
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    ...Shadows.glow,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
    textShadowColor: 'rgba(255,255,255,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#8A8A9A',
    letterSpacing: 1.5,
  },

  // Hero Area
  heroVehicleCard: {
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.3)',
    overflow: 'hidden',
    marginTop: 20,
    ...Shadows.glow,
  },
  heroVehicleGradient: {
    padding: 24,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  statusLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
  },
  statusLiveText: {
    color: Palette.info,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  licensePlate: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  licensePlateText: {
    color: '#000000',
    fontWeight: '900',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 2,
  },
  heroMainCenter: {
    alignItems: 'center',
    marginBottom: 32,
  },
  heroCarIcon: {
    marginBottom: 4,
    textShadowColor: 'rgba(249,115,22,0.8)',
    textShadowOffset: { width: 0, height: 8 },
    textShadowRadius: 20,
  },
  heroVehicleName: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1,
    textAlign: 'center',
    lineHeight: 38,
  },
  heroVehicleSub: {
    fontSize: 14,
    color: '#A0A0AB',
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 1,
    textAlign: 'center',
  },

  // Hero Progress
  heroProgressArea: {
    width: '100%',
  },
  heroProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  heroProgressLabel: {
    fontSize: 9,
    color: '#A0A0AB',
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  heroProgressValueText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '900',
  },
  heroProgressBarTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  heroProgressBarFill: {
    height: '100%',
    borderRadius: 2,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  heroEstText: {
    fontSize: 12,
    color: '#8A8A9A',
    fontWeight: '600',
    marginTop: 14,
    textAlign: 'center',
    letterSpacing: 0.5,
  },

  // Quick Actions Section
  sectionHeader: {
    fontSize: 10,
    color: '#A0A0AB',
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 16,
    paddingHorizontal: 24,
    marginTop: 32,
  },
  quickActionsScroll: {
    paddingHorizontal: 20,
    gap: 12,
  },
  quickActionPillWrap: {
    width: 130,
    height: 140,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  quickActionGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  quickActionIconRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(249,115,22,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.2)',
    shadowColor: '#f97316',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  quickActionText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.5,
  },

  // Floating Toast
  notificationFloatingToast: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  toastGradient: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
  },
  toastIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  toastContent: {
    flex: 1,
  },
  toastTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  toastTime: {
    color: '#8A8A9A',
    fontSize: 11,
    fontWeight: '500',
  },
  toastTimeRight: {
    color: '#8A8A9A',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 8,
  },
});
