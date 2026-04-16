import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps, TouchableOpacity, Platform, ViewProps, ViewStyle } from 'react-native';
import Animated, { 
  FadeInUp, 
  useSharedValue, 
  useAnimatedStyle, 
  withSequence, 
  withTiming, 
  interpolateColor
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface PremiumInputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  error?: string;
  isPassword?: boolean;
  containerStyle?: ViewProps['style'];
  style?: TextInputProps['style'];
}

export default function PremiumInput({ 
  label, 
  iconName, 
  error, 
  isPassword, 
  containerStyle,
  style, 
  ...props 
}: PremiumInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(!isPassword);

  // ── Animation Values ──
  const shakeX = useSharedValue(0);
  const glowBorder = useSharedValue(0); // 0 = default, 1 = focus, 2 = error

  useEffect(() => {
    if (error) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      shakeX.value = withSequence(
        withTiming(10, { duration: 50 }),
        withTiming(-10, { duration: 50 }),
        withTiming(10, { duration: 50 }),
        withTiming(0, { duration: 50 })
      );
      glowBorder.value = withTiming(2, { duration: 200 });
    } else {
      glowBorder.value = withTiming(isFocused ? 1 : 0, { duration: 200 });
    }
  }, [error]);

  useEffect(() => {
    if (!error) {
      glowBorder.value = withTiming(isFocused ? 1 : 0, { duration: 200 });
    }
  }, [isFocused]);

  const animatedContainerStyle = useAnimatedStyle(() => {
    const borderColor = interpolateColor(
      glowBorder.value,
      [0, 1, 2],
      ['rgba(255,255,255,0.08)', 'rgba(249, 115, 22, 0.6)', 'rgba(239, 68, 68, 0.8)']
    );

    const backgroundColor = interpolateColor(
      glowBorder.value,
      [0, 1, 2],
      ['rgba(255,255,255,0.02)', 'rgba(249, 115, 22, 0.05)', 'rgba(239, 68, 68, 0.05)']
    );

    return {
      borderColor,
      backgroundColor,
      transform: [{ translateX: shakeX.value }],
    };
  });

  return (
    <View style={[styles.wrapper, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      
      <Animated.View style={[styles.inputContainer, animatedContainerStyle]}>
        {iconName && (
          <Ionicons 
            name={iconName} 
            size={18} 
            color={error ? '#EF4444' : isFocused ? '#F97316' : '#8A8A9A'} 
          />
        )}
        
        <TextInput
          style={styles.input}
          placeholderTextColor="#6B7280"
          secureTextEntry={isPassword && !showPassword}
          onFocus={(e) => {
            setIsFocused(true);
            if (props.onFocus) props.onFocus(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            if (props.onBlur) props.onBlur(e);
          }}
          {...props}
        />
        
        {isPassword && (
          <TouchableOpacity 
             onPress={() => {
                if (Platform.OS !== 'web') Haptics.selectionAsync();
                setShowPassword(!showPassword);
             }}
             hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color="#8A8A9A"
            />
          </TouchableOpacity>
        )}
      </Animated.View>

      {error ? (
        <Animated.Text entering={FadeInUp.duration(200)} style={styles.errorText}>
          {error}
        </Animated.Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    marginBottom: 20,
  },
  label: { 
    fontSize: 10, 
    fontWeight: '800', 
    letterSpacing: 2, 
    color: '#6B7280', 
    marginBottom: 10 
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    gap: 12,
  },
  input: { 
    flex: 1, 
    fontSize: 15, 
    height: '100%', 
    color: '#FFFFFF', 
    fontWeight: '500' 
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    marginLeft: 4,
  }
});
