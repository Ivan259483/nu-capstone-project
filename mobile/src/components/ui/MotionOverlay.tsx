import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Motion, reducedMotionDuration } from '@/constants/motion';
import { Haptics } from '@/utils/haptics';

type BaseOverlayProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  dismissOnBackdrop?: boolean;
  accessibilityLabel?: string;
  fullScreen?: boolean;
  onClosed?: () => void;
};

export function MotionModal({
  visible,
  onClose,
  children,
  contentStyle,
  dismissOnBackdrop = true,
  accessibilityLabel = 'Dialog',
  fullScreen = false,
  onClosed,
}: BaseOverlayProps) {
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const mountedRef = useRef(false);
  const onClosedRef = useRef(onClosed);
  const progress = useSharedValue(0);
  const backdropProgress = useSharedValue(0);
  const renderedChildren = useRef(children);
  onClosedRef.current = onClosed;
  if (visible) renderedChildren.current = children;

  const mountOverlay = useCallback((nextMounted: boolean) => {
    mountedRef.current = nextMounted;
    setMounted(nextMounted);
  }, []);

  const completeClose = useCallback(() => {
    mountOverlay(false);
    onClosedRef.current?.();
  }, [mountOverlay]);

  useEffect(() => {
    if (visible) {
      mountOverlay(true);
      progress.value = withTiming(1, {
        duration: reducedMotionDuration(reducedMotion, Motion.duration.modalOpen),
        easing: Motion.easing.enter,
      });
      backdropProgress.value = withTiming(1, {
        duration: reducedMotionDuration(reducedMotion, Motion.duration.backdropOpen),
        easing: Motion.easing.enter,
      });
      return;
    }
    if (!mountedRef.current) return;
    backdropProgress.value = withTiming(0, {
      duration: reducedMotionDuration(reducedMotion, Motion.duration.backdropClose),
      easing: Motion.easing.exit,
    });
    progress.value = withTiming(0, {
      duration: reducedMotionDuration(reducedMotion, Motion.duration.modalClose),
      easing: Motion.easing.exit,
    }, (finished) => {
      if (finished) runOnJS(completeClose)();
    });
  }, [backdropProgress, completeClose, mountOverlay, progress, reducedMotion, visible]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropProgress.value,
  }));
  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: reducedMotion
      ? []
      : [
          { translateY: interpolate(progress.value, [0, 1], [Motion.distance.modalY, 0]) },
          { scale: interpolate(progress.value, [0, 1], [Motion.scale.modalFrom, 1]) },
        ],
  }));

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View
        style={[styles.modalRoot, fullScreen && styles.modalRootFullscreen]}
        accessibilityLabel={accessibilityLabel}
        onAccessibilityEscape={onClose}
      >
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismissOnBackdrop ? onClose : undefined}
            accessibilityRole={dismissOnBackdrop ? 'button' : undefined}
            accessibilityLabel={dismissOnBackdrop ? 'Close dialog' : undefined}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.modalContent,
            fullScreen && styles.modalContentFullscreen,
            contentStyle,
            contentAnimatedStyle,
          ]}
        >
          {renderedChildren.current}
        </Animated.View>
      </View>
    </Modal>
  );
}

type MotionSheetProps = BaseOverlayProps & {
  swipeToDismiss?: boolean;
  keyboardAvoiding?: boolean;
  backdropOpacity?: number;
};

export function MotionSheet({
  visible,
  onClose,
  children,
  contentStyle,
  dismissOnBackdrop = true,
  swipeToDismiss = true,
  keyboardAvoiding = true,
  accessibilityLabel = 'Bottom sheet',
  onClosed,
  backdropOpacity = 0.76,
}: MotionSheetProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const mountedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const onClosedRef = useRef(onClosed);
  const progress = useSharedValue(0);
  const backdropProgress = useSharedValue(0);
  const dragY = useSharedValue(0);
  const sheetHeight = useSharedValue(720);
  const renderedChildren = useRef(children);
  onCloseRef.current = onClose;
  onClosedRef.current = onClosed;
  if (visible) renderedChildren.current = children;

  const mountOverlay = useCallback((nextMounted: boolean) => {
    mountedRef.current = nextMounted;
    setMounted(nextMounted);
  }, []);

  const completeClose = useCallback(() => {
    mountOverlay(false);
    onClosedRef.current?.();
  }, [mountOverlay]);

  useEffect(() => {
    if (visible) {
      mountOverlay(true);
      dragY.value = 0;
      progress.value = withTiming(1, {
        duration: reducedMotionDuration(reducedMotion, Motion.duration.sheetOpen),
        easing: Motion.easing.enter,
      });
      backdropProgress.value = withTiming(1, {
        duration: reducedMotionDuration(reducedMotion, Motion.duration.backdropOpen),
        easing: Motion.easing.enter,
      });
      return;
    }
    if (!mountedRef.current) return;
    backdropProgress.value = withTiming(0, {
      duration: reducedMotionDuration(reducedMotion, Motion.duration.backdropClose),
      easing: Motion.easing.exit,
    });
    progress.value = withTiming(0, {
      duration: reducedMotionDuration(reducedMotion, Motion.duration.sheetClose),
      easing: Motion.easing.exit,
    }, (finished) => {
      if (finished) runOnJS(completeClose)();
    });
  }, [backdropProgress, completeClose, dragY, mountOverlay, progress, reducedMotion, visible]);

  const completeGestureDismiss = useCallback(() => {
    mountOverlay(false);
    Haptics.selection();
    onCloseRef.current();
    onClosedRef.current?.();
  }, [mountOverlay]);

  const pan = Gesture.Pan()
    .enabled(swipeToDismiss && !reducedMotion)
    .activeOffsetY(2)
    .failOffsetX([-18, 18])
    .onUpdate((event) => {
      dragY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      const shouldDismiss = event.velocityY > 900 || dragY.value > sheetHeight.value * 0.22;
      if (shouldDismiss) {
        dragY.value = withTiming(sheetHeight.value, {
          duration: Motion.duration.sheetClose,
          easing: Motion.easing.exit,
        }, (finished) => {
          if (finished) runOnJS(completeGestureDismiss)();
        });
        return;
      }
      dragY.value = withSpring(0, {
        damping: 26,
        stiffness: 320,
        mass: 0.82,
        overshootClamping: true,
      });
    });

  const backdropStyle = useAnimatedStyle(() => {
    const dragProgress = Math.min(1, dragY.value / Math.max(1, sheetHeight.value));
    return { opacity: backdropProgress.value * (1 - dragProgress) };
  });
  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: reducedMotion
      ? []
      : [{ translateY: (1 - progress.value) * sheetHeight.value + dragY.value }],
  }));

  const handleLayout = (event: LayoutChangeEvent) => {
    sheetHeight.value = Math.max(1, event.nativeEvent.layout.height);
  };

  if (!mounted) return null;

  const sheet = (
    <Animated.View
      onLayout={handleLayout}
      style={[
        styles.sheetContent,
        { paddingBottom: Math.max(insets.bottom, 12) },
        contentStyle,
        sheetAnimatedStyle,
      ]}
    >
      <GestureDetector gesture={pan}>
        <View style={styles.sheetGestureArea} accessible={false} />
      </GestureDetector>
      {renderedChildren.current}
    </Animated.View>
  );

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <GestureHandlerRootView
        style={styles.sheetRoot}
        accessibilityLabel={accessibilityLabel}
        onAccessibilityEscape={onClose}
      >
        <Animated.View
          style={[styles.backdrop, { backgroundColor: `rgba(0,0,0,${backdropOpacity})` }, backdropStyle]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismissOnBackdrop ? onClose : undefined}
            accessibilityRole={dismissOnBackdrop ? 'button' : undefined}
            accessibilityLabel={dismissOnBackdrop ? 'Close bottom sheet' : undefined}
          />
        </Animated.View>
        {keyboardAvoiding ? (
          <KeyboardAvoidingView
            pointerEvents="box-none"
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.sheetKeyboard}
          >
            {sheet}
          </KeyboardAvoidingView>
        ) : sheet}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalRootFullscreen: {
    padding: 0,
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetKeyboard: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.76)',
  },
  modalContent: {
    width: '100%',
    maxWidth: 560,
  },
  modalContentFullscreen: {
    flex: 1,
    maxWidth: undefined,
  },
  sheetContent: {
    maxHeight: '92%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  sheetGestureArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 32,
    zIndex: 20,
  },
});
