import React from 'react';
import { Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Keyframe, useReducedMotion } from 'react-native-reanimated';

export type AuthFeedbackType = 'success' | 'warning' | 'error' | 'info';

export type AuthFeedbackData = {
  type: AuthFeedbackType;
  title: string;
  message?: string;
};

type AuthFeedbackProps = AuthFeedbackData & {
  mode?: 'inline' | 'floating';
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const ENTERING = new Keyframe({
  0: {
    opacity: 0,
    transform: [{ translateY: -8 }, { scale: 0.98 }],
  },
  100: {
    opacity: 1,
    transform: [{ translateY: 0 }, { scale: 1 }],
  },
}).duration(210);

const EXITING = new Keyframe({
  0: {
    opacity: 1,
    transform: [{ translateY: 0 }, { scale: 1 }],
  },
  100: {
    opacity: 0,
    transform: [{ translateY: -4 }, { scale: 0.99 }],
  },
}).duration(170);

const STATUS: Record<
  AuthFeedbackType,
  {
    color: string;
    borderColor: string;
    iconBackground: string;
    icon: keyof typeof Ionicons.glyphMap;
  }
> = {
  success: {
    color: '#FFB066',
    borderColor: 'rgba(255,122,26,0.25)',
    iconBackground: 'rgba(255,122,26,0.10)',
    icon: 'checkmark',
  },
  warning: {
    color: '#E9B95D',
    borderColor: 'rgba(233,185,93,0.23)',
    iconBackground: 'rgba(233,185,93,0.09)',
    icon: 'warning-outline',
  },
  error: {
    color: '#F08A7A',
    borderColor: 'rgba(240,138,122,0.23)',
    iconBackground: 'rgba(240,138,122,0.09)',
    icon: 'alert-circle-outline',
  },
  info: {
    color: '#A7B4C4',
    borderColor: 'rgba(167,180,196,0.20)',
    iconBackground: 'rgba(167,180,196,0.08)',
    icon: 'information-circle-outline',
  },
};

/** Shared presentation for persistent auth status cards and floating toasts. */
export default function AuthFeedback({
  type,
  title,
  message,
  mode = 'inline',
  style,
  testID,
}: AuthFeedbackProps) {
  const reduceMotion = useReducedMotion();
  const status = STATUS[type];
  const isFloating = mode === 'floating';

  const content = (
    <>
      <View style={[styles.iconWell, { backgroundColor: status.iconBackground }]}>
        <Ionicons name={status.icon} size={16} color={status.color} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
    </>
  );

  return (
    <Animated.View
      entering={reduceMotion ? undefined : ENTERING}
      exiting={reduceMotion ? undefined : EXITING}
      accessible
      accessibilityLabel={[title, message].filter(Boolean).join('. ')}
      accessibilityLiveRegion={type === 'error' ? 'assertive' : 'polite'}
      accessibilityRole={type === 'error' || type === 'warning' ? 'alert' : 'text'}
      testID={testID}
      style={[
        isFloating ? styles.floatingOuter : styles.inlineOuter,
        style,
      ]}
    >
      {isFloating ? (
        <BlurView
          intensity={32}
          tint="dark"
          style={[
            styles.surface,
            styles.floatingSurface,
            { borderColor: status.borderColor },
          ]}
        >
          {content}
        </BlurView>
      ) : (
        <View
          style={[
            styles.surface,
            styles.inlineSurface,
            { borderColor: status.borderColor },
          ]}
        >
          {content}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  inlineOuter: {
    width: '100%',
  },
  floatingOuter: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: Platform.OS === 'ios' ? 0.34 : 0,
    shadowRadius: 22,
    elevation: 10,
  },
  surface: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 17,
  },
  inlineSurface: {
    minHeight: 60,
    paddingHorizontal: 13,
    paddingVertical: 11,
    backgroundColor: '#151515',
  },
  floatingSurface: {
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(18,18,18,0.88)',
  },
  iconWell: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  copy: {
    flex: 1,
    paddingRight: 2,
  },
  title: {
    color: '#F4F4F5',
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: 0.05,
  },
  message: {
    color: 'rgba(255,255,255,0.53)',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    marginTop: 1,
  },
});
