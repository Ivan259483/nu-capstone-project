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
      ['#E9EAEC', 'rgba(249, 115, 22, 0.7)', 'rgba(239, 68, 68, 0.8)']
    );

    const backgroundColor = interpolateColor(
      glowBorder.value,
      [0, 1, 2],
      ['#FAFAFA', 'rgba(249, 115, 22, 0.04)', 'rgba(239, 68, 68, 0.04)']
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
            color={error ? '#EF4444' : isFocused ? '#F97316' : '#9CA3AF'} 
          />
        )}
        
        <TextInput
          style={styles.input}
          placeholderTextColor="#C0C0C0"
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
    fontSize: 12, 
    fontWeight: '700', 
    letterSpacing: 0.3, 
    color: '#374151', 
    marginBottom: 8 
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
    color: '#111111', 
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
