import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp, SlideInRight } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { TabBarHeight } from '@/constants/theme';

const VEHICLE_TYPES = [
  { label: 'Hatchback', value: 'hatchback', icon: 'car-sport-outline' },
  { label: 'Sedan', value: 'sedan', icon: 'car-outline' },
  { label: 'Midsized', value: 'midsized', icon: 'car' },
  { label: 'SUV', value: 'suv', icon: 'car-sport' },
  { label: 'Pickup', value: 'pickup', icon: 'bus-outline' },
  { label: 'Large SUV', value: 'largesuv', icon: 'bus' },
  { label: 'Highend', value: 'highend', icon: 'diamond-outline' },
];

const SPF_PACKAGES = [
  {
    id: 'spf80',
    name: 'SPF 80 (3 Years)',
    prices: { hatchback: '₱7,499', sedan: '₱7,999', midsized: '₱7,999', suv: '₱8,999', pickup: '₱8,499', largesuv: '₱12,999', highend: 'N/A' }
  },
  {
    id: 'spf89',
    name: 'SPF 89 (5 Years)',
    prices: { hatchback: '₱8,999', sedan: '₱9,999', midsized: '₱10,999', suv: '₱11,999', pickup: '₱10,999', largesuv: '₱14,999', highend: '₱17,999' }
  },
  {
    id: 'spf99',
    name: 'SPF 99 (10 Years)',
    prices: { hatchback: '₱13,999', sedan: '₱14,999', midsized: '₱15,999', suv: '₱16,999', pickup: '₱15,999', largesuv: '₱19,999', highend: '₱22,999' },
    isPopular: true
  },
  {
    id: 'spf101',
    name: 'SPF 101 (Flagship ALL-IN)',
    prices: { hatchback: '₱39,999', sedan: '₱39,999', midsized: '₱46,999', suv: '₱46,999', pickup: '₱46,999', largesuv: '₱49,999', highend: '₱49,999' }
  }
];

export default function PremiumPricingMatrix({ selectedServiceId, onServiceSelect }: any) {
  const [vehicleType, setVehicleType] = useState('sedan');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>Select Package</Text>
        <Text style={styles.sectionLabel}>VEHICLE TYPE</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll} contentContainerStyle={{ paddingHorizontal: 22 }}>
        {VEHICLE_TYPES.map((vt, i) => {
          const isActive = vehicleType === vt.value;
          return (
            <Animated.View key={vt.value} entering={SlideInRight.delay(i * 50).duration(200)}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setVehicleType(vt.value);
                }}
                style={[styles.pill, isActive && styles.pillActive]}
              >
                <Ionicons name={vt.icon as any} size={14} color={isActive ? '#050508' : 'rgba(255,255,255,0.5)'} />
                <Text style={[styles.pillTxt, isActive && styles.pillTxtActive]}>{vt.label}</Text>
              </Pressable>
            </Animated.View>
          );
        })}
      </ScrollView>

      <View style={styles.matrix}>
        {SPF_PACKAGES.map((pkg, i) => {
          const isSelected = selectedServiceId === pkg.id;
          const price = (pkg.prices as any)[vehicleType];
          if (price === 'N/A') return null;
          
          return (
            <Animated.View key={pkg.id} entering={FadeInUp.delay(i * 100).duration(200)}>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  onServiceSelect({ id: pkg.id, name: pkg.name, price: price });
                }}
                style={[styles.pkgCard, isSelected && styles.pkgCardActive]}
              >
                <View style={{ flex: 1 }}>
                  {pkg.isPopular && <Text style={styles.popBadge}>POPULAR</Text>}
                  <Text style={[styles.pkgName, isSelected && styles.pkgNameActive]}>{pkg.name}</Text>
                </View>
                <Text style={[styles.pkgPrice, isSelected && styles.pkgPriceActive]}>{price}</Text>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 10 },
  header: { paddingHorizontal: 22, marginBottom: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 6 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,124,30,0.8)', letterSpacing: 1 },
  pillScroll: { marginBottom: 20 },
  pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#101018', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, marginRight: 10, borderWidth: 1, borderColor: '#202030' },
  pillActive: { backgroundColor: '#FF7C1E', borderColor: '#FF7C1E' },
  pillTxt: { color: 'rgba(255,255,255,0.6)', marginLeft: 6, fontSize: 13, fontWeight: '600' },
  pillTxtActive: { color: '#050508', fontWeight: '800' },
  matrix: { paddingHorizontal: 22, gap: 12 },
  pkgCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0B0B12', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#1F1F2E' },
  pkgCardActive: { backgroundColor: 'rgba(255,124,30,0.1)', borderColor: '#FF7C1E' },
  pkgName: { fontSize: 16, fontWeight: '600', color: '#E0E0E0' },
  pkgNameActive: { color: '#FF7C1E', fontWeight: '700' },
  pkgPrice: { fontSize: 18, fontWeight: '800', color: '#FFF' },
  pkgPriceActive: { color: '#FF7C1E' },
  popBadge: { fontSize: 10, fontWeight: '800', color: '#FF7C1E', letterSpacing: 1, marginBottom: 4 }
});
