import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
} from 'react-native';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { vehicleService } from '@/services/api/vehicleService';
import type { Vehicle } from '@/services/api/types';
import SectionHeader from './SectionHeader';

const ACCENT = '#FF6B35';

/* ── Brand logo fallback colors ── */
const BRAND_COLORS: Record<string, string> = {
  toyota: '#EB0A1E',
  honda: '#CC0000',
  mitsubishi: '#E60012',
  ford: '#003399',
  chevrolet: '#D4AF37',
  nissan: '#C3002F',
  hyundai: '#002C5F',
  kia: '#05141F',
  bmw: '#0066B1',
  mercedes: '#333333',
  default: '#FF6B35',
};

const getBrandColor = (make: string) => {
  const key = (make || '').toLowerCase();
  return BRAND_COLORS[key] || BRAND_COLORS.default;
};

interface VehiclesSectionProps {
  onAddVehicle?: () => void;
  onEditVehicle?: (vehicle: Vehicle) => void;
  onViewHistory?: (vehicle: Vehicle) => void;
}

export default function VehiclesSection({
  onAddVehicle,
  onEditVehicle,
  onViewHistory,
}: VehiclesSectionProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await vehicleService.getMyVehicles();
        setVehicles(data);
      } catch {
        // Silently fail — empty state
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleDelete = useCallback((vehicle: Vehicle) => {
    Alert.alert(
      'Remove Vehicle',
      `Remove ${vehicle.make} ${vehicle.model}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            setVehicles((prev) => prev.filter((v) => v.id !== vehicle.id));
          },
        },
      ]
    );
  }, []);

  const renderAddCard = () => (
    <TouchableOpacity
      style={s.addCard}
      activeOpacity={0.7}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onAddVehicle?.();
      }}
    >
      <View style={s.addIconCircle}>
        <Ionicons name="add" size={28} color={ACCENT} />
      </View>
      <Text style={s.addTitle}>Add Vehicle</Text>
      <Text style={s.addSub}>Register a new vehicle</Text>
    </TouchableOpacity>
  );

  const renderVehicleCard = ({ item }: { item: Vehicle }) => {
    const brandColor = getBrandColor(item.make);
    return (
      <Animated.View entering={FadeIn.duration(300)} style={s.vehicleCard}>
        <LinearGradient
          colors={['rgba(255,255,255,0.03)', 'rgba(255,255,255,0.01)']}
          style={s.vehicleCardInner}
        >
          {/* Brand avatar */}
          <View style={[s.brandCircle, { borderColor: brandColor + '40' }]}>
            <Text style={[s.brandInitial, { color: brandColor }]}>
              {(item.make || '?')[0].toUpperCase()}
            </Text>
          </View>

          {/* Info */}
          <Text style={s.vehicleName} numberOfLines={1}>
            {item.make} {item.model}
          </Text>
          <View style={s.detailRow}>
            <Ionicons name="calendar-outline" size={10} color="#6B6B78" />
            <Text style={s.detailText}>{item.year}</Text>
          </View>
          {item.color && (
            <View style={s.detailRow}>
              <Ionicons name="color-palette-outline" size={10} color="#6B6B78" />
              <Text style={s.detailText}>{item.color}</Text>
            </View>
          )}
          <View style={s.detailRow}>
            <Ionicons name="card-outline" size={10} color="#6B6B78" />
            <Text style={s.detailText}>{item.plateNumber || 'No Plate'}</Text>
          </View>

          {/* Action buttons */}
          <View style={s.actionRow}>
            <TouchableOpacity
              style={s.actionBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onEditVehicle?.(item);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={13} color={ACCENT} />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.actionBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onViewHistory?.(item);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="time-outline" size={13} color="#64B5F6" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: 'rgba(239,68,68,0.08)' }]}
              onPress={() => handleDelete(item)}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={13} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </Animated.View>
    );
  };

  const listData = [{ id: '__add__' } as any, ...vehicles];

  return (
    <Animated.View entering={FadeInUp.delay(200).duration(200)}>
      <SectionHeader title="My Vehicles" icon="car-sport-outline" action="See All" onAction={() => {}} />
      <FlatList
        data={listData}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        snapToInterval={168}
        decelerationRate="fast"
        contentContainerStyle={s.listContent}
        renderItem={({ item }) =>
          item.id === '__add__' ? renderAddCard() : renderVehicleCard({ item })
        }
      />
    </Animated.View>
  );
}

const CARD_WIDTH = 156;

const s = StyleSheet.create({
  listContent: {
    paddingRight: 16,
    gap: 12,
  },
  addCard: {
    width: CARD_WIDTH,
    height: 200,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,107,53,0.2)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255,107,53,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,107,53,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.2)',
  },
  addTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: ACCENT,
    letterSpacing: 0.3,
  },
  addSub: {
    fontSize: 10,
    color: '#6B6B78',
    fontWeight: '500',
  },
  vehicleCard: {
    width: CARD_WIDTH,
    height: 200,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  vehicleCardInner: {
    flex: 1,
    padding: 14,
    justifyContent: 'space-between',
  },
  brandCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  brandInitial: {
    fontSize: 18,
    fontWeight: '800',
  },
  vehicleName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E8E8ED',
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  detailText: {
    fontSize: 10,
    color: '#8A8A9A',
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(255,107,53,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
