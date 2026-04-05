/**
 * SupportSection — Functional Support & AI Chatbot hub
 *
 * "24/7 AI Assistant" opens the real chatbot overlay.
 * Other items link to relevant actions (FAQ, booking help, live support, report).
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Linking, Alert } from 'react-native';
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import SectionHeader from './SectionHeader';

const ACCENT = '#FF6B35';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface SupportSectionProps {
  onOpenChatbot: () => void;
  onBookingHelp?: () => void;
}

const SUPPORT_ITEMS: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  online: boolean;
  action: 'chatbot' | 'faq' | 'booking_help' | 'live_support' | 'report';
}[] = [
  {
    icon: 'chatbubbles-outline',
    title: '24/7 AI Assistant',
    subtitle: 'Get instant help from our AI chatbot',
    online: true,
    action: 'chatbot',
  },
  {
    icon: 'help-circle-outline',
    title: 'FAQ',
    subtitle: 'Frequently asked questions',
    online: false,
    action: 'faq',
  },
  {
    icon: 'calendar-outline',
    title: 'Booking Help',
    subtitle: 'Need help scheduling a service?',
    online: false,
    action: 'booking_help',
  },
  {
    icon: 'headset-outline',
    title: 'Live Support',
    subtitle: 'Chat with a real agent',
    online: false,
    action: 'live_support',
  },
  {
    icon: 'warning-outline',
    title: 'Report Issue',
    subtitle: 'Report a problem or bug',
    online: false,
    action: 'report',
  },
];

function SupportRow({
  icon,
  title,
  subtitle,
  online,
  isLast,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  online: boolean;
  isLast?: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 15 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 12 });
      }}
      style={[s.row, !isLast && s.rowBorder, animStyle]}
    >
      <View style={s.iconWrap}>
        <Ionicons name={icon} size={17} color={ACCENT} />
        {online && <View style={s.onlineDot} />}
      </View>
      <View style={s.rowContent}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.rowSub}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.12)" />
    </AnimatedPressable>
  );
}

export default function SupportSection({ onOpenChatbot, onBookingHelp }: SupportSectionProps) {
  const handleAction = (action: string) => {
    switch (action) {
      case 'chatbot':
        onOpenChatbot();
        break;

      case 'faq':
        // Open chatbot with FAQ context
        onOpenChatbot();
        break;

      case 'booking_help':
        if (onBookingHelp) {
          onBookingHelp();
        } else {
          onOpenChatbot();
        }
        break;

      case 'live_support':
        Alert.alert(
          'Live Support',
          'Connect with a real agent?\n\nYou can also call us at +63 917 123 4567.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Call Now',
              onPress: () => Linking.openURL('tel:+639171234567'),
            },
            {
              text: 'Chat',
              onPress: onOpenChatbot,
            },
          ]
        );
        break;

      case 'report':
        Alert.alert(
          'Report Issue',
          'Send a report to our team?\n\nYou can describe the issue via email.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Email Report',
              onPress: () =>
                Linking.openURL(
                  'mailto:support@autospf.com?subject=Issue Report from Mobile App'
                ),
            },
          ]
        );
        break;
    }
  };

  return (
    <Animated.View entering={FadeInUp.delay(500).springify().damping(18)}>
      <SectionHeader title="Support & AI Chatbot" icon="chatbubble-ellipses-outline" />
      <View style={s.card}>
        {SUPPORT_ITEMS.map((item, idx) => (
          <SupportRow
            key={item.title}
            {...item}
            isLast={idx === SUPPORT_ITEMS.length - 1}
            onPress={() => handleAction(item.action)}
          />
        ))}
      </View>
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
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: 'rgba(255,107,53,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    position: 'relative',
  },
  onlineDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    borderWidth: 1.5,
    borderColor: '#040405',
  },
  rowContent: { flex: 1 },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E8E8ED',
    letterSpacing: 0.2,
    marginBottom: 1,
  },
  rowSub: {
    fontSize: 10,
    color: '#6B6B78',
    fontWeight: '500',
  },
});
