import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import SectionHeader from './SectionHeader';

const ACCENT = '#FF6B35';

/* ── Demo scan history data (aligned with capstone AI scope) ── */
const DEMO_SCANS = [
  {
    id: 's1',
    image: null,
    issueType: 'Rear Bumper Scratch',
    severity: 'Moderate',
    costEstimate: '₱12,000',
    confidence: 92,
    scanDate: 'Mar 28, 2026',
    status: 'Estimate Ready',
  },
  {
    id: 's2',
    image: null,
    issueType: 'Front Hood Dent',
    severity: 'Severe',
    costEstimate: '₱24,500',
    confidence: 88,
    scanDate: 'Mar 15, 2026',
    status: 'Repair Confirmed',
  },
  {
    id: 's3',
    image: null,
    issueType: 'Side Panel Paint Chip',
    severity: 'Minor',
    costEstimate: '₱5,800',
    confidence: 95,
    scanDate: 'Feb 22, 2026',
    status: 'Completed',
  },
];

const SEVERITY_COLORS: Record<string, string> = {
  Minor: '#10B981',
  Moderate: '#F59E0B',
  Severe: '#EF4444',
};

const STATUS_COLORS: Record<string, string> = {
  'Estimate Ready': '#3B82F6',
  'Repair Confirmed': ACCENT,
  Completed: '#10B981',
};

export default function ScanHistorySection() {
  const renderCard = ({ item }: { item: (typeof DEMO_SCANS)[0] }) => {
    const sevColor = SEVERITY_COLORS[item.severity] || '#6B6B78';
    const statColor = STATUS_COLORS[item.status] || '#6B6B78';

    return (
      <Animated.View entering={FadeIn.duration(300)} style={s.card}>
        <LinearGradient
          colors={['rgba(255,255,255,0.03)', 'rgba(255,255,255,0.01)']}
          style={s.cardInner}
        >
          {/* Thumbnail placeholder */}
          <View style={s.thumb}>
            <Ionicons name="scan-outline" size={22} color="rgba(255,107,53,0.4)" />
          </View>

          {/* Issue type */}
          <Text style={s.issueType} numberOfLines={2}>{item.issueType}</Text>

          {/* Severity badge */}
          <View style={[s.sevBadge, { borderColor: sevColor + '40', backgroundColor: sevColor + '10' }]}>
            <View style={[s.sevDot, { backgroundColor: sevColor }]} />
            <Text style={[s.sevText, { color: sevColor }]}>{item.severity}</Text>
          </View>

          {/* Cost */}
          <Text style={s.cost}>{item.costEstimate}</Text>

          {/* Confidence meter */}
          <View style={s.confRow}>
            <View style={s.confBarOuter}>
              <View
                style={[
                  s.confBarInner,
                  {
                    width: `${item.confidence}%`,
                    backgroundColor:
                      item.confidence >= 90 ? '#10B981' : item.confidence >= 80 ? '#F59E0B' : '#EF4444',
                  },
                ]}
              />
            </View>
            <Text style={s.confText}>{item.confidence}%</Text>
          </View>

          {/* Date + Status */}
          <View style={s.footerRow}>
            <Text style={s.dateText}>{item.scanDate}</Text>
            <View style={[s.statusBadge, { backgroundColor: statColor + '15' }]}>
              <Text style={[s.statusText, { color: statColor }]}>{item.status}</Text>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>
    );
  };

  return (
    <Animated.View entering={FadeInUp.delay(300).duration(200)}>
      <SectionHeader title="AI Scan History" icon="scan-outline" action="View All" onAction={() => {}} />
      <FlatList
        data={DEMO_SCANS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        snapToInterval={180}
        decelerationRate="fast"
        contentContainerStyle={s.list}
        renderItem={renderCard}
      />
    </Animated.View>
  );
}

const CARD_W = 168;

const s = StyleSheet.create({
  list: { paddingRight: 16, gap: 12 },
  card: {
    width: CARD_W,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  cardInner: {
    padding: 14,
    gap: 6,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,107,53,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.12)',
    marginBottom: 4,
  },
  issueType: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E8E8ED',
    letterSpacing: 0.2,
    lineHeight: 17,
  },
  sevBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  sevDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  sevText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cost: {
    fontSize: 16,
    fontWeight: '800',
    color: ACCENT,
    letterSpacing: 0.3,
  },
  confRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  confBarOuter: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  confBarInner: {
    height: '100%',
    borderRadius: 2,
  },
  confText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8A8A9A',
    letterSpacing: 0.3,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  dateText: {
    fontSize: 9,
    color: '#5A5A68',
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
