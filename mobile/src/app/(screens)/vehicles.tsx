/**
 * Saved Vehicles Screen
 * Premium vehicle management — view, add, and remove registered cars.
 * Matches the luxury dark aesthetic of the AutoSPF+ design system.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp, FadeIn, SlideInRight } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vehicleService } from '@/services/api/vehicleService';
import { Palette } from '@/constants/theme';
import PremiumInput from '@/components/ui/PremiumInput';
import { Toast } from '@/components/ui/PremiumToast';
import SkeletonPulse from '@/components/ui/SkeletonPulse';
import type { Vehicle } from '@/services/api/types';

const SURFACE = '#111114';
const BORDER = '#2A2A30';

// ── Vehicle Card ──
function VehicleCard({
  vehicle,
  index,
  onDelete,
}: {
  vehicle: Vehicle;
  index: number;
  onDelete: (id: string) => void;
}) {
  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      'Remove Vehicle',
      `Remove ${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.plateNumber}) from your saved vehicles?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => onDelete(vehicle.id || vehicle._id || ''),
        },
      ]
    );
  };

  return (
    <Animated.View
      entering={FadeInUp.delay(100 + index * 80)
        .springify()
        .damping(16)
        .stiffness(120)}
      style={s.vehicleCard}
    >
      {/* Icon */}
      <LinearGradient
        colors={['rgba(255,107,53,0.2)', 'rgba(255,107,53,0.05)']}
        style={s.vehicleIcon}
      >
        <Ionicons name="car-sport" size={24} color={Palette.accent} />
      </LinearGradient>

      {/* Details */}
      <View style={s.vehicleInfo}>
        <Text style={s.vehicleName}>
          {vehicle.year} {vehicle.make} {vehicle.model}
        </Text>
        <View style={s.vehicleMeta}>
          <View style={s.plateBadge}>
            <Text style={s.plateText}>{vehicle.plateNumber}</Text>
          </View>
          {vehicle.color && (
            <View style={s.colorBadge}>
              <View
                style={[
                  s.colorDot,
                  {
                    backgroundColor:
                      vehicle.color.toLowerCase() === 'white'
                        ? '#E5E7EB'
                        : vehicle.color.toLowerCase() === 'black'
                        ? '#374151'
                        : vehicle.color.toLowerCase() === 'red'
                        ? '#EF4444'
                        : vehicle.color.toLowerCase() === 'blue'
                        ? '#3B82F6'
                        : vehicle.color.toLowerCase() === 'silver' ||
                          vehicle.color.toLowerCase() === 'gray' ||
                          vehicle.color.toLowerCase() === 'grey'
                        ? '#9CA3AF'
                        : Palette.accent,
                  },
                ]}
              />
              <Text style={s.colorText}>{vehicle.color}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Delete */}
      <TouchableOpacity
        onPress={handleDelete}
        style={s.deleteBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="trash-outline" size={18} color="#EF4444" />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Main Screen ──
export default function VehiclesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [modalVisible, setModalVisible] = useState(false);
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [formError, setFormError] = useState('');

  // ── Fetch vehicles ──
  const {
    data: vehicles = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['my-vehicles'],
    queryFn: vehicleService.getMyVehicles,
  });

  // ── Add vehicle mutation ──
  const addMutation = useMutation({
    mutationFn: vehicleService.addVehicle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-vehicles'] });
      Toast.show('Vehicle added successfully!', 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetForm();
      setModalVisible(false);
    },
    onError: (error: any) => {
      Toast.show(error.message || 'Failed to add vehicle', 'error');
    },
  });

  // ── Delete vehicle mutation ──
  const deleteMutation = useMutation({
    mutationFn: vehicleService.deleteVehicle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-vehicles'] });
      Toast.show('Vehicle removed', 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      Toast.show(error.message || 'Failed to remove vehicle', 'error');
    },
  });

  const resetForm = () => {
    setMake('');
    setModel('');
    setYear('');
    setColor('');
    setPlateNumber('');
    setFormError('');
  };

  const handleAddVehicle = () => {
    setFormError('');
    if (!make.trim()) return setFormError('Make is required');
    if (!model.trim()) return setFormError('Model is required');
    if (!year.trim() || isNaN(Number(year)) || Number(year) < 1980 || Number(year) > 2030)
      return setFormError('Enter a valid year (1980–2030)');
    if (!plateNumber.trim()) return setFormError('Plate number is required');

    addMutation.mutate({
      make: make.trim(),
      model: model.trim(),
      year: year.trim(),
      color: color.trim() || undefined,
      plateNumber: plateNumber.trim().toUpperCase(),
    });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  // ── Empty State ──
  const EmptyState = () => (
    <Animated.View entering={FadeIn.delay(200)} style={s.emptyContainer}>
      <View style={s.emptyIconWrap}>
        <Ionicons name="car-outline" size={48} color="rgba(255,107,53,0.3)" />
      </View>
      <Text style={s.emptyTitle}>No Saved Vehicles</Text>
      <Text style={s.emptySubtitle}>
        Add your vehicle details for faster booking and a personalized experience.
      </Text>
    </Animated.View>
  );

  // ── Skeleton Loader ──
  const VehicleSkeleton = () => (
    <SkeletonPulse style={s.vehicleCard}>
      <View style={[s.vehicleIcon, { backgroundColor: 'rgba(255,255,255,0.05)' }]} />
      <View style={s.vehicleInfo}>
        <View style={{ height: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 4, width: '60%', marginBottom: 12 }} />
        <View style={s.vehicleMeta}>
           <View style={{ height: 20, width: 60, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 6 }} />
           <View style={{ height: 20, width: 80, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 6 }} />
        </View>
      </View>
      <View style={[s.deleteBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }]} />
    </SkeletonPulse>
  );

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={18} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Saved Vehicles</Text>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setModalVisible(true);
          }}
          style={s.addHeaderBtn}
        >
          <Ionicons name="add" size={20} color={Palette.accent} />
        </TouchableOpacity>
      </View>

      {/* ── Vehicle count badge ── */}
      <Animated.View entering={FadeInDown.delay(100).springify()} style={s.countRow}>
        <Text style={s.countText}>
          {vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} registered
        </Text>
      </Animated.View>

      {/* ── Vehicle List ── */}
      {isLoading ? (
        <ScrollView contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
          {[1, 2, 3].map((k) => (
            <VehicleSkeleton key={k} />
          ))}
        </ScrollView>
      ) : vehicles.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={(item) => item.id || item._id || ''}
          renderItem={({ item, index }) => (
            <VehicleCard vehicle={item} index={index} onDelete={handleDelete} />
          )}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── Floating Add Button ── */}
      <TouchableOpacity
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setModalVisible(true);
        }}
        activeOpacity={0.8}
        style={s.fab}
      >
        <LinearGradient
          colors={[Palette.accent, '#E55A2B']}
          style={s.fabGradient}
        >
          <Ionicons name="add" size={28} color="#FFF" />
        </LinearGradient>
      </TouchableOpacity>

      {/* ═══ Add Vehicle Modal ═══ */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.modalOverlay}
        >
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>Add Vehicle</Text>
                <Text style={s.modalSubtitle}>
                  Register a new car for faster booking
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={s.modalCloseBtn}
              >
                <Ionicons name="close" size={22} color="#A0A0AB" />
              </TouchableOpacity>
            </View>

            {formError ? (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={14} color="#EF4444" />
                <Text style={s.errorText}>{formError}</Text>
              </View>
            ) : null}

            <View style={{ gap: 14 }}>
              <PremiumInput
                label="MAKE"
                iconName="car-outline"
                placeholder="e.g. Toyota, Honda, Ford"
                value={make}
                onChangeText={(t) => {
                  setMake(t);
                  setFormError('');
                }}
                autoCapitalize="words"
              />
              <PremiumInput
                label="MODEL"
                iconName="speedometer-outline"
                placeholder="e.g. Fortuner, Civic, Ranger"
                value={model}
                onChangeText={(t) => {
                  setModel(t);
                  setFormError('');
                }}
                autoCapitalize="words"
              />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <PremiumInput
                    label="YEAR"
                    iconName="calendar-outline"
                    placeholder="e.g. 2024"
                    value={year}
                    onChangeText={(t) => {
                      setYear(t);
                      setFormError('');
                    }}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <PremiumInput
                    label="COLOR (OPTIONAL)"
                    iconName="color-palette-outline"
                    placeholder="e.g. White"
                    value={color}
                    onChangeText={(t) => {
                      setColor(t);
                      setFormError('');
                    }}
                    autoCapitalize="words"
                  />
                </View>
              </View>
              <PremiumInput
                label="PLATE NUMBER"
                iconName="reader-outline"
                placeholder="e.g. ABC 1234"
                value={plateNumber}
                onChangeText={(t) => {
                  setPlateNumber(t);
                  setFormError('');
                }}
                autoCapitalize="characters"
              />
            </View>

            <TouchableOpacity
              style={[s.actionBtn, addMutation.isPending && { opacity: 0.6 }]}
              onPress={handleAddVehicle}
              disabled={addMutation.isPending}
              activeOpacity={0.8}
            >
              {addMutation.isPending ? (
                <ActivityIndicator color="#111" />
              ) : (
                <Text style={s.actionBtnText}>Add Vehicle</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
//  STYLES
// ══════════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  addHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.3)',
    backgroundColor: 'rgba(255,107,53,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Count row
  countRow: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  countText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8A8A9A',
    letterSpacing: 0.3,
  },

  // List
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },

  // Vehicle Card
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 16,
    marginBottom: 12,
  },
  vehicleIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  vehicleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  plateBadge: {
    backgroundColor: 'rgba(255,107,53,0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.2)',
  },
  plateText: {
    fontSize: 11,
    fontWeight: '700',
    color: Palette.accent,
    letterSpacing: 1.2,
  },
  colorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  colorText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#8A8A9A',
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Empty
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: 'rgba(255,107,53,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6A6A7A',
    textAlign: 'center',
    lineHeight: 20,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    shadowColor: Palette.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0D0D12',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingBottom: 48,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  modalSubtitle: {
    color: '#8A8A9A',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
  },
  modalCloseBtn: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    padding: 12,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    gap: 8,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  actionBtn: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.accent,
    marginTop: 16,
    shadowColor: Palette.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: 0.5,
  },
});
