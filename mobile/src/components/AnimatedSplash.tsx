/**
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │          AutoSPF+ — Premium Video Splash Screen                     │
 * │                                                                      │
 * │  Full-screen MP4 video intro that auto-plays on launch.             │
 * │  After the video finishes, a smooth opacity fade-out transitions   │
 * │  to the main app (login or home, based on auth state).             │
 * │                                                                      │
 * │  Technical:                                                          │
 * │  • expo-av Video component with ResizeMode.COVER                   │
 * │  • react-native-reanimated for silky 600ms fade-out                │
 * │  • No controls, muted audio, no user interaction                   │
 * │  • Falls back to the existing animated splash if video is missing  │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, Dimensions, Text } from 'react-native';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ── Video Asset ────────────────────────────────────────────────────────
// Place your MP4 file at: mobile/assets/videos/splash.mp4
const SPLASH_VIDEO = require('../../assets/videos/splash.mp4');

// ── Configuration ──────────────────────────────────────────────────────
const FADE_IN_DURATION = 400;   // ms — video screen fades in
const FADE_OUT_DURATION = 600;  // ms — smooth exit transition
const MIN_DISPLAY_TIME = 2000;  // ms — ensure at least 2s even if video is very short

interface AnimatedSplashProps {
  onAnimationComplete: () => void;
}

// ── Animated wrapper for Video ─────────────────────────────────────────
const AnimatedView = Animated.createAnimatedComponent(View);

export default function AnimatedSplash({ onAnimationComplete }: AnimatedSplashProps) {
  const videoRef = useRef<Video>(null);
  const [hasVideoError, setHasVideoError] = useState(false);
  const startTimeRef = useRef(Date.now());
  const hasTriggeredExitRef = useRef(false);

  // ── Animation Values ──
  const containerOpacity = useSharedValue(0);
  const overlayOpacity = useSharedValue(0);

  // Fade the container in immediately
  React.useEffect(() => {
    containerOpacity.value = withTiming(1, {
      duration: FADE_IN_DURATION,
      easing: Easing.out(Easing.cubic),
    });
  }, []);

  // ── Graceful exit with fade-out ──
  const triggerExit = useCallback(() => {
    if (hasTriggeredExitRef.current) return;
    hasTriggeredExitRef.current = true;

    const elapsed = Date.now() - startTimeRef.current;
    const remainingDelay = Math.max(0, MIN_DISPLAY_TIME - elapsed);

    // 1. Dark overlay fades in first (cinematic)
    overlayOpacity.value = withDelay(
      remainingDelay,
      withTiming(1, { duration: FADE_OUT_DURATION * 0.5, easing: Easing.in(Easing.cubic) })
    );

    // 2. Entire container fades to black, then fires callback
    containerOpacity.value = withDelay(
      remainingDelay + FADE_OUT_DURATION * 0.3,
      withTiming(0, {
        duration: FADE_OUT_DURATION,
        easing: Easing.in(Easing.cubic),
      }, (finished) => {
        if (finished) {
          runOnJS(onAnimationComplete)();
        }
      })
    );
  }, [onAnimationComplete]);

  // ── Video playback status handler ──
  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;

    // When video finishes playing → trigger exit
    if (status.didJustFinish) {
      triggerExit();
    }
  }, [triggerExit]);

  // ── Video error handler (fallback to branded title) ──
  const onVideoError = useCallback(() => {
    console.warn('[AnimatedSplash] Video failed to load, using fallback.');
    setHasVideoError(true);

    // Show fallback for 3 seconds then exit
    setTimeout(() => {
      triggerExit();
    }, 3000);
  }, [triggerExit]);

  // ── Animated Styles ──
  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const darkOverlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {/* ── Black Base (always visible behind everything) ── */}
      <View style={styles.blackBase} />

      {!hasVideoError ? (
        /* ── Video Player ── */
        <Video
          ref={videoRef}
          source={SPLASH_VIDEO}
          style={styles.video}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping={false}
          isMuted
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          onError={onVideoError}
        />
      ) : (
        /* ── Fallback — minimal branded splash ── */
        <View style={styles.fallback}>
          <LinearGradient
            colors={['#000000', '#0a0a0a', '#000000']}
            style={StyleSheet.absoluteFillObject}
          />
          <Text style={styles.fallbackTitle}>
            Auto<Text style={styles.fallbackAccent}>SPF+</Text>
          </Text>
          <View style={styles.fallbackLoader}>
            <View style={styles.loaderDot} />
          </View>
        </View>
      )}

      {/* ── Dark Overlay (fades in before exit for cinematic feel) ── */}
      <Animated.View style={[styles.darkOverlay, darkOverlayStyle]} pointerEvents="none" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    elevation: 99999,
  },
  blackBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  video: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },

  // ── Fallback Styles ──
  fallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  fallbackTitle: {
    fontSize: 54,
    fontWeight: '300',
    color: '#ffffff',
    letterSpacing: 2,
  },
  fallbackAccent: {
    fontWeight: '800',
    color: '#f97316',
  },
  fallbackLoader: {
    position: 'absolute',
    bottom: 80,
    alignItems: 'center',
  },
  loaderDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'rgba(249, 115, 22, 0.15)',
    borderTopColor: '#f97316',
  },
});
