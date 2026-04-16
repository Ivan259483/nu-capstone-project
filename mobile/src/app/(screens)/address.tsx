/**
 * Address & Location Screen
 * Manage saved addresses — Home, Work, or custom pick-up locations.
 * Stored in AsyncStorage until backend address endpoints are available.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp, FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Palette } from '@/constants/theme';
import PremiumInput from '@/components/ui/PremiumInput';
import { Toast } from '@/components/ui/PremiumToast';
import SkeletonPulse from '@/components/ui/SkeletonPulse';
import { useAuth } from '@/context/AuthContext';
import { apiClient } from '@/services/api/client';

const SURFACE = '#111114';
const BORDER = '#2A2A30';
const STORAGE_KEY = '@autospf_addresses';

type AddressLabel = 'Home' | 'Work' | 'Other';

interface SavedAddress {
  id: string;
  label: AddressLabel;
  street: string;
  city: string;
  province: string;
  zipCode: string;
  isDefault: boolean;
}

const LABEL_CONFIG: Record<
  AddressLabel,
  { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
> = {
  Home: { icon: 'home', color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
  Work: { icon: 'briefcase', color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
  Other: { icon: 'location', color: Palette.accent, bg: 'rgba(255,107,53,0.1)' },
};

// ── Address Card ──
function AddressCard({
  address,
  index,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  address: SavedAddress;
  index: number;
  onEdit: (a: SavedAddress) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}) {
  const cfg = LABEL_CONFIG[address.label];

  return (
    <Animated.View
      entering={FadeInUp.delay(100 + index * 80)
        .duration(200)
        .damping(16)}
      style={s.addressCard}
    >
      <View style={s.addressRow}>
        <View style={[s.labelIcon, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.icon} size={20} color={cfg.color} />
        </View>
        <View style={s.addressInfo}>
          <View style={s.labelRow}>
            <Text style={s.labelText}>{address.label}</Text>
            {address.isDefault && (
              <View style={s.defaultBadge}>
                <Text style={s.defaultText}>Default</Text>
              </View>
            )}
          </View>
          <Text style={s.streetText} numberOfLines={2}>
            {address.street}
          </Text>
          <Text style={s.cityText}>
            {address.city}, {address.province} {address.zipCode}
          </Text>
        </View>
      </View>

      {/* Actions */}
      <View style={s.cardActions}>
        {!address.isDefault && (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSetDefault(address.id);
            }}
            style={s.cardActionBtn}
          >
            <Ionicons name="star-outline" size={16} color="#8A8A9A" />
            <Text style={s.cardActionText}>Set Default</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onEdit(address);
          }}
          style={s.cardActionBtn}
        >
          <Ionicons name="create-outline" size={16} color={Palette.accent} />
          <Text style={[s.cardActionText, { color: Palette.accent }]}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onDelete(address.id);
          }}
          style={s.cardActionBtn}
        >
          <Ionicons name="trash-outline" size={16} color="#EF4444" />
          <Text style={[s.cardActionText, { color: '#EF4444' }]}>Remove</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ── Main Screen ──
export default function AddressScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAddress, setEditingAddress] = useState<SavedAddress | null>(null);
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [selectedLabel, setSelectedLabel] = useState<AddressLabel>('Home');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Load from storage & API ──
  useEffect(() => {
    (async () => {
      try {
        if (profile?.backend_id) {
          try {
            const res = await apiClient.get(`/users/${profile.backend_id}`);
            if (res.data?.data?.address) {
              const parsed = JSON.parse(res.data.data.address);
              setAddresses(parsed);
              return;
            }
          } catch (e) {
            console.log('Failed to fetch address from API, falling back to local storage', e);
          }
        }
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setAddresses(JSON.parse(raw));
      } catch {
      } finally {
        setLoading(false);
      }
    })();
  }, [profile?.backend_id]);

  // ── Persist ──
  const persist = async (updated: SavedAddress[]) => {
    setAddresses(updated);
    if (profile?.backend_id) {
       try {
         await apiClient.put(`/users/${profile.backend_id}`, { address: JSON.stringify(updated) });
       } catch (e) {
         console.warn('Failed to sync address to backend', e);
       }
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  // ── Handlers ──
  const resetForm = () => {
    setStreet('');
    setCity('');
    setProvince('');
    setZipCode('');
    setSelectedLabel('Home');
    setFormError('');
    setEditingAddress(null);
  };

  const openAdd = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEdit = (addr: SavedAddress) => {
    setEditingAddress(addr);
    setStreet(addr.street);
    setCity(addr.city);
    setProvince(addr.province);
    setZipCode(addr.zipCode);
    setSelectedLabel(addr.label);
    setFormError('');
    setModalVisible(true);
  };

  const handleSave = async () => {
    setFormError('');
    if (!street.trim()) return setFormError('Street address is required');
    if (!city.trim()) return setFormError('City is required');
    if (!province.trim()) return setFormError('Province is required');
    if (!zipCode.trim()) return setFormError('Zip code is required');

    setSaving(true);
    try {
      if (editingAddress) {
        // Update existing
        const updated = addresses.map((a) =>
          a.id === editingAddress.id
            ? {
                ...a,
                street: street.trim(),
                city: city.trim(),
                province: province.trim(),
                zipCode: zipCode.trim(),
                label: selectedLabel,
              }
            : a
        );
        await persist(updated);
        Toast.show('Address updated', 'success');
      } else {
        // Add new
        const isFirst = addresses.length === 0;
        const newAddr: SavedAddress = {
          id: Date.now().toString(),
          label: selectedLabel,
          street: street.trim(),
          city: city.trim(),
          province: province.trim(),
          zipCode: zipCode.trim(),
          isDefault: isFirst,
        };
        await persist([...addresses, newAddr]);
        Toast.show('Address saved', 'success');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModalVisible(false);
      resetForm();
    } catch {
      Toast.show('Failed to save address', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    const addr = addresses.find((a) => a.id === id);
    if (!addr) return;
    const remaining = addresses.filter((a) => a.id !== id);
    // If deleted was default, make first remaining default
    if (addr.isDefault && remaining.length > 0) {
      remaining[0].isDefault = true;
    }
    persist(remaining);
    Toast.show('Address removed', 'success');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleSetDefault = (id: string) => {
    const updated = addresses.map((a) => ({
      ...a,
      isDefault: a.id === id,
    }));
    persist(updated);
    Toast.show('Default address updated', 'success');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // ── Skeleton Loader ──
  const AddressSkeleton = () => (
    <SkeletonPulse style={s.addressCard}>
      <View style={s.addressRow}>
        <View style={[s.labelIcon, { backgroundColor: 'rgba(255,255,255,0.05)' }]} />
        <View style={s.addressInfo}>
          <View style={{ height: 18, width: 80, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 4, marginBottom: 8 }} />
          <View style={{ height: 14, width: '80%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 4, marginBottom: 4 }} />
          <View style={{ height: 14, width: '60%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 4 }} />
        </View>
      </View>
      <View style={s.cardActions}>
        <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
           <View style={{ height: 16, width: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 4 }} />
           <View style={{ height: 14, width: 40, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 4 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
           <View style={{ height: 16, width: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 4 }} />
           <View style={{ height: 14, width: 50, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 4 }} />
        </View>
      </View>
    </SkeletonPulse>
  );

  // ── Label Selector ──
  const LabelSelector = () => (
    <View style={s.labelSelector}>
      <Text style={s.fieldLabel}>LABEL</Text>
      <View style={s.labelOptions}>
        {(['Home', 'Work', 'Other'] as AddressLabel[]).map((label) => {
          const cfg = LABEL_CONFIG[label];
          const active = selectedLabel === label;
          return (
            <TouchableOpacity
              key={label}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedLabel(label);
              }}
              style={[
                s.labelOption,
                active && { borderColor: cfg.color, backgroundColor: cfg.bg },
              ]}
              activeOpacity={0.7}
            >
              <Ionicons
                name={cfg.icon}
                size={16}
                color={active ? cfg.color : '#6A6A7A'}
              />
              <Text
                style={[
                  s.labelOptionText,
                  active && { color: cfg.color, fontWeight: '700' },
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
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
        <Text style={s.headerTitle}>Address & Location</Text>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            openAdd();
          }}
          style={s.addHeaderBtn}
        >
          <Ionicons name="add" size={20} color={Palette.accent} />
        </TouchableOpacity>
      </View>

      {/* ── Content ── */}
      {loading ? (
        <ScrollView contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
          {[1, 2, 3].map((k) => (
            <AddressSkeleton key={k} />
          ))}
        </ScrollView>
      ) : addresses.length === 0 ? (
        <Animated.View entering={FadeIn.delay(200)} style={s.emptyContainer}>
          <View style={s.emptyIconWrap}>
            <Ionicons
              name="location-outline"
              size={48}
              color="rgba(255,107,53,0.3)"
            />
          </View>
          <Text style={s.emptyTitle}>No Saved Addresses</Text>
          <Text style={s.emptySubtitle}>
            Add your home, work, or pick-up address for a smoother booking experience.
          </Text>
          <TouchableOpacity
            onPress={openAdd}
            style={s.emptyBtn}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle" size={18} color={Palette.accent} />
            <Text style={s.emptyBtnText}>Add Address</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <ScrollView
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
        >
          {addresses.map((addr, i) => (
            <AddressCard
              key={addr.id}
              address={addr}
              index={i}
              onEdit={openEdit}
              onDelete={handleDelete}
              onSetDefault={handleSetDefault}
            />
          ))}
        </ScrollView>
      )}

      {/* ═══ Add / Edit Modal ═══ */}
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
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
          >
            <View style={s.modalContent}>
              <View style={s.modalHeader}>
                <View>
                  <Text style={s.modalTitle}>
                    {editingAddress ? 'Edit Address' : 'Add Address'}
                  </Text>
                  <Text style={s.modalSubtitle}>
                    {editingAddress
                      ? 'Update your saved location'
                      : 'Save a new pick-up location'}
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

              <LabelSelector />

              <View style={{ gap: 14, marginTop: 16 }}>
                <PremiumInput
                  label="STREET ADDRESS"
                  iconName="map-outline"
                  placeholder="e.g. 123 Rizal Ave, Brgy. San Jose"
                  value={street}
                  onChangeText={(t) => {
                    setStreet(t);
                    setFormError('');
                  }}
                />
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <PremiumInput
                      label="CITY / MUNICIPALITY"
                      iconName="business-outline"
                      placeholder="e.g. Taguig City"
                      value={city}
                      onChangeText={(t) => {
                        setCity(t);
                        setFormError('');
                      }}
                      autoCapitalize="words"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <PremiumInput
                      label="ZIP CODE"
                      iconName="keypad-outline"
                      placeholder="e.g. 1630"
                      value={zipCode}
                      onChangeText={(t) => {
                        setZipCode(t);
                        setFormError('');
                      }}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <PremiumInput
                  label="PROVINCE"
                  iconName="flag-outline"
                  placeholder="e.g. Metro Manila"
                  value={province}
                  onChangeText={(t) => {
                    setProvince(t);
                    setFormError('');
                  }}
                  autoCapitalize="words"
                />
              </View>

              <TouchableOpacity
                style={[s.actionBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator color="#111" />
                ) : (
                  <Text style={s.actionBtnText}>
                    {editingAddress ? 'Update Address' : 'Save Address'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
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

  // List
  listContent: { padding: 20, paddingBottom: 40 },

  // Address Card
  addressCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 16,
    marginBottom: 14,
  },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start' },
  labelIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  addressInfo: { flex: 1 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  labelText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  defaultBadge: {
    backgroundColor: 'rgba(255,107,53,0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.25)',
  },
  defaultText: {
    fontSize: 10,
    fontWeight: '700',
    color: Palette.accent,
    letterSpacing: 0.5,
  },
  streetText: {
    fontSize: 13,
    color: '#CCCCCC',
    lineHeight: 18,
    marginBottom: 2,
  },
  cityText: {
    fontSize: 12,
    color: '#8A8A9A',
  },

  // Card Actions
  cardActions: {
    flexDirection: 'row',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
    gap: 16,
  },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cardActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A8A9A',
  },

  // Loading & Empty
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
    marginBottom: 24,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,107,53,0.1)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.25)',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  emptyBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Palette.accent,
  },

  // Label Selector
  labelSelector: { marginBottom: 4 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#555',
    marginBottom: 10,
  },
  labelOptions: {
    flexDirection: 'row',
    gap: 10,
  },
  labelOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  labelOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6A6A7A',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
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
    marginTop: 20,
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
