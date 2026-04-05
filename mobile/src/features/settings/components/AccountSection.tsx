import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const ACCENT = '#FF6B35';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface AccountSectionProps {
  onPersonalInfo: () => void;
  onSecurity: () => void;
  onChangePassword: () => void;
  onOTPStatus: () => void;
  onTrustedDevices: () => void;
  onLogout: () => void;
}

interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  isLast?: boolean;
  isDanger?: boolean;
}

function SettingsRow({ icon, title, subtitle, onPress, isLast, isDanger }: SettingsRowProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 12, stiffness: 200 });
  };
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const iconColor = isDanger ? '#EF4444' : ACCENT;
  const iconBg = isDanger ? 'rgba(239,68,68,0.1)' : 'rgba(255,107,53,0.08)';

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[s.row, !isLast && s.rowBorder, animStyle]}
    >
      <View style={[s.iconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={s.rowContent}>
        <Text style={[s.rowTitle, isDanger && { color: '#EF4444' }]}>{title}</Text>
        <Text style={s.rowSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={isDanger ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.15)'}
      />
    </AnimatedPressable>
  );
}

export default function AccountSection({
  onPersonalInfo,
  onSecurity,
  onChangePassword,
  onOTPStatus,
  onTrustedDevices,
  onLogout,
}: AccountSectionProps) {
  return (
    <Animated.View entering={FadeInUp.delay(100).springify().damping(18)} style={s.card}>
      <SettingsRow
        icon="person-outline"
        title="Personal Information"
        subtitle="Manage your personal details"
        onPress={onPersonalInfo}
      />
      <SettingsRow
        icon="shield-checkmark-outline"
        title="Security & Login"
        subtitle="Two-factor, sessions, and login activity"
        onPress={onSecurity}
      />
      <SettingsRow
        icon="key-outline"
        title="Change Password"
        subtitle="Update your account password"
        onPress={onChangePassword}
      />
      <SettingsRow
        icon="phone-portrait-outline"
        title="OTP Verification"
        subtitle="SMS verification status"
        onPress={onOTPStatus}
      />
      <SettingsRow
        icon="laptop-outline"
        title="Trusted Devices"
        subtitle="Manage your signed-in devices"
        onPress={onTrustedDevices}
      />
      <SettingsRow
        icon="log-out-outline"
        title="Log Out"
        subtitle="Sign out of your account"
        onPress={onLogout}
        isLast
        isDanger
      />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E8E8ED',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  rowSubtitle: {
    fontSize: 11,
    color: '#6B6B78',
    fontWeight: '500',
    letterSpacing: 0.1,
  },
});
