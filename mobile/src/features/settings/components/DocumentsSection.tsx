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
import SectionHeader from './SectionHeader';
import { useRouter } from 'expo-router';

const ACCENT = '#FF6B35';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const DOCUMENTS = [
  {
    icon: 'document-text-outline' as const,
    title: 'Digital Waivers',
    subtitle: 'Signed service agreements',
    count: 3,
    route: '/(screens)/waiver',
  },
  {
    icon: 'clipboard-outline' as const,
    title: 'Service Documents',
    subtitle: 'Work orders & inspection reports',
    count: 7,
  },
  {
    icon: 'alert-circle-outline' as const,
    title: 'Damage Reports',
    subtitle: 'AI assessment records',
    count: 4,
  },
  {
    icon: 'images-outline' as const,
    title: 'Before / After Photos',
    subtitle: 'Pre & post repair comparisons',
    count: 12,
  },
  {
    icon: 'receipt-outline' as const,
    title: 'Receipts & Invoices',
    subtitle: 'Downloadable payment records',
    count: 5,
  },
];

function DocRow({ icon, title, subtitle, count, isLast, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  count: number;
  isLast?: boolean;
  onPress?: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (onPress) onPress();
      }}
      onPressIn={() => { scale.value = withSpring(0.97, { damping: 15 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 12 }); }}
      style={[s.row, !isLast && s.rowBorder, animStyle]}
    >
      <View style={s.iconWrap}>
        <Ionicons name={icon} size={17} color={ACCENT} />
      </View>
      <View style={s.rowContent}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.rowSub}>{subtitle}</Text>
      </View>
      <View style={s.countBadge}>
        <Text style={s.countText}>{count}</Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.12)" />
    </AnimatedPressable>
  );
}

export default function DocumentsSection() {
  const router = useRouter();

  return (
    <Animated.View entering={FadeInUp.delay(400).springify().damping(18)}>
      <SectionHeader title="Documents & Records" icon="folder-open-outline" />
      <View style={s.card}>
        {DOCUMENTS.map((doc, idx) => (
          <DocRow
            key={doc.title}
            {...doc}
            isLast={idx === DOCUMENTS.length - 1}
            onPress={() => {
              if ((doc as any).route) {
                router.push((doc as any).route);
              }
            }}
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
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,107,53,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginRight: 10,
  },
  countText: {
    fontSize: 10,
    fontWeight: '800',
    color: ACCENT,
  },
});
