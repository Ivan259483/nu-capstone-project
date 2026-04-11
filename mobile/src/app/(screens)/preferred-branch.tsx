/**
 * Preferred Branch & Staff Screen
 * Select your go-to AutoSPF+ branch and favorite technician.
 * Stored in AsyncStorage until backend preference endpoints are available.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Palette } from '@/constants/theme';
import { Toast } from '@/components/ui/PremiumToast';
import { apiClient } from '@/services/api/client';
import SkeletonPulse from '@/components/ui/SkeletonPulse';

const SURFACE = '#111114';
const BORDER = '#2A2A30';
const BRANCH_KEY = '@autospf_preferred_branch';
const STAFF_KEY = '@autospf_preferred_staff';

interface Branch {
  id: string;
  name: string;
  address: string;
  hours: string;
  phone: string;
}

interface Staff {
  id: string;
  name: string;
  role: string;
  rating: number;
  specialties: string[];
}

export default function PreferredBranchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalBranch, setOriginalBranch] = useState<string | null>(null);
  const [originalStaff, setOriginalStaff] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);

  // ── Load saved preferences ──
  useEffect(() => {
    (async () => {
      try {
        // Run lookups in parallel
        const [storeRes, userRes, meRes, staffPref] = await Promise.all([
          apiClient.get('/stores'),
          apiClient.get('/users?role=service_staff'), // We may get back everyone if role filter is weak, but backend filter should help
          apiClient.get('/customers/me'),
          AsyncStorage.getItem(STAFF_KEY) // Staff preference isn't on Customer model yet
        ]);

        const stores = storeRes.data?.data || [];
        setBranches(stores);

        // Map backend users to Staff format
        const users = userRes.data?.data || [];
        setStaffList(users.map((u: any) => ({
          id: u._id,
          name: u.name,
          role: u.role === 'service_staff' ? 'Technician' : 'Specialist',
          rating: 4.8,
          specialties: ['General Services']
        })));

        const preferredStore = meRes.data?.data?.preferredStore;
        if (preferredStore) {
           const storeId = typeof preferredStore === 'object' ? preferredStore._id : preferredStore;
           setSelectedBranch(storeId);
           setOriginalBranch(storeId);
        }

        if (staffPref) {
           setSelectedStaff(staffPref);
           setOriginalStaff(staffPref);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    setHasChanges(
      selectedBranch !== originalBranch || selectedStaff !== originalStaff
    );
  }, [selectedBranch, selectedStaff, originalBranch, originalStaff]);

  const handleSave = async () => {
    try {
      await Promise.all([
        apiClient.put('/customers/me', { preferredStore: selectedBranch || null }),
        selectedStaff 
          ? AsyncStorage.setItem(STAFF_KEY, selectedStaff)
          : AsyncStorage.removeItem(STAFF_KEY)
      ]);
      
      setOriginalBranch(selectedBranch);
      setOriginalStaff(selectedStaff);
      setHasChanges(false);
      
      Toast.show('Preferences updated', 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Toast.show('Failed to save preferences', 'error');
    }
  };

  // ── Skeletons ──
  const BranchSkeleton = () => (
    <SkeletonPulse style={[s.branchCard, { height: 110, marginBottom: 12 }]} />
  );
  
  const StaffSkeleton = () => (
    <SkeletonPulse style={[s.staffCard, { height: 90, marginBottom: 12 }]} />
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
        >
          <Ionicons name="arrow-back" size={18} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Preferred Branch & Staff</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══ BRANCH SECTION ═══ */}
        <Animated.View entering={FadeInDown.delay(100).springify().damping(16)}>
          <Text style={s.sectionTitle}>SELECT BRANCH</Text>
          <Text style={s.sectionSubtitle}>
            Choose your preferred AutoSPF+ location
          </Text>

          <View style={s.optionsContainer}>
            {loading ? (
               <>
                 <BranchSkeleton />
                 <BranchSkeleton />
               </>
            ) : branches.length === 0 ? (
               <Text style={{color: '#8A8A9A', textAlign: 'center', marginVertical: 20}}>No branches found</Text>
            ) : branches.map((branch, index) => {
              const isActive = selectedBranch === branch._id;
              return (
                <Animated.View
                  key={branch._id}
                  entering={FadeInUp.delay(150 + index * 60)
                    .springify()
                    .damping(16)}
                >
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedBranch(
                        selectedBranch === branch._id ? null : branch._id
                      );
                    }}
                    style={[s.branchCard, isActive && s.branchCardActive]}
                    activeOpacity={0.7}
                  >
                    <View style={s.branchHeader}>
                      <View
                        style={[
                          s.radioOuter,
                          isActive && s.radioOuterActive,
                        ]}
                      >
                        {isActive && <View style={s.radioInner} />}
                      </View>
                      <View style={s.branchInfo}>
                        <Text
                          style={[
                            s.branchName,
                            isActive && { color: Palette.accent },
                          ]}
                        >
                          {branch.name}
                        </Text>
                        <Text style={s.branchAddress}>{branch.address || 'Address pending'}</Text>
                      </View>
                    </View>
                    <View style={s.branchMeta}>
                      <View style={s.metaItem}>
                        <Ionicons
                          name="time-outline"
                          size={12}
                          color="#6A6A7A"
                        />
                        <Text style={s.metaText}>{branch.hours || 'Hours pending'}</Text>
                      </View>
                      <View style={s.metaItem}>
                        <Ionicons
                          name="call-outline"
                          size={12}
                          color="#6A6A7A"
                        />
                        <Text style={s.metaText}>{branch.phone || 'Phone pending'}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        </Animated.View>

        {/* ═══ STAFF SECTION ═══ */}
        <Animated.View
          entering={FadeInDown.delay(300).springify().damping(16)}
          style={{ marginTop: 32 }}
        >
          <Text style={s.sectionTitle}>PREFERRED TECHNICIAN</Text>
          <Text style={s.sectionSubtitle}>
            Choose your favorite staff member (optional)
          </Text>

          <View style={s.optionsContainer}>
            {loading ? (
               <>
                 <StaffSkeleton />
                 <StaffSkeleton />
               </>
            ) : staffList.length === 0 ? (
               <Text style={{color: '#8A8A9A', textAlign: 'center', marginVertical: 20}}>No staff available</Text>
            ) : staffList.map((staff, index) => {
              const isActive = selectedStaff === staff.id;
              return (
                <Animated.View
                  key={staff.id}
                  entering={FadeInUp.delay(350 + index * 60)
                    .springify()
                    .damping(16)}
                >
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedStaff(
                        selectedStaff === staff.id ? null : staff.id
                      );
                    }}
                    style={[s.staffCard, isActive && s.staffCardActive]}
                    activeOpacity={0.7}
                  >
                    {/* Avatar */}
                    <LinearGradient
                      colors={
                        isActive
                          ? ['rgba(255,107,53,0.3)', 'rgba(255,107,53,0.1)']
                          : ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)']
                      }
                      style={s.staffAvatar}
                    >
                      <Text
                        style={[
                          s.staffInitials,
                          isActive && { color: Palette.accent },
                        ]}
                      >
                        {staff.name
                          .split(' ')
                          .map((w: string) => w[0])
                          .join('')}
                      </Text>
                    </LinearGradient>

                    <View style={s.staffInfo}>
                      <Text
                        style={[
                          s.staffName,
                          isActive && { color: Palette.accent },
                        ]}
                      >
                        {staff.name}
                      </Text>
                      <Text style={s.staffRole}>{staff.role}</Text>
                      <View style={s.staffSpecialties}>
                        {staff.specialties.map((spec: string) => (
                          <View key={spec} style={s.specBadge}>
                            <Text style={s.specText}>{spec}</Text>
                          </View>
                        ))}
                      </View>
                    </View>

                    {/* Rating */}
                    <View style={s.ratingBox}>
                      <Ionicons name="star" size={12} color="#FBBF24" />
                      <Text style={s.ratingText}>{staff.rating}</Text>
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        </Animated.View>

        {/* ═══ SAVE BUTTON ═══ */}
        <Animated.View
          entering={FadeInUp.delay(500).springify()}
          style={{ marginTop: 32, marginBottom: 40 }}
        >
          <TouchableOpacity
            onPress={handleSave}
            disabled={!hasChanges}
            activeOpacity={0.8}
            style={[s.saveBtn, !hasChanges && { opacity: 0.4 }]}
          >
            <Text style={s.saveBtnText}>
              {hasChanges ? 'Save Preferences' : 'No Changes'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
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

  content: { padding: 24, paddingTop: 28 },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8A8A9A',
    letterSpacing: 2,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#5A5A6A',
    marginBottom: 16,
  },

  optionsContainer: { gap: 10 },

  // Branch Card
  branchCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 16,
  },
  branchCardActive: {
    borderColor: 'rgba(255,107,53,0.4)',
    backgroundColor: 'rgba(255,107,53,0.04)',
  },
  branchHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  radioOuterActive: {
    borderColor: Palette.accent,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Palette.accent,
  },
  branchInfo: { flex: 1 },
  branchName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 4,
  },
  branchAddress: {
    fontSize: 12,
    color: '#8A8A9A',
    lineHeight: 16,
  },
  branchMeta: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 11,
    color: '#6A6A7A',
    fontWeight: '500',
  },

  // Staff Card
  staffCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
  },
  staffCardActive: {
    borderColor: 'rgba(255,107,53,0.4)',
    backgroundColor: 'rgba(255,107,53,0.04)',
  },
  staffAvatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  staffInitials: {
    fontSize: 16,
    fontWeight: '800',
    color: '#6A6A7A',
  },
  staffInfo: { flex: 1 },
  staffName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 2,
  },
  staffRole: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6A6A7A',
    marginBottom: 6,
  },
  staffSpecialties: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  specBadge: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  specText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#5A5A6A',
    letterSpacing: 0.3,
  },
  ratingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FBBF24',
  },

  // Save
  saveBtn: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.accent,
    shadowColor: Palette.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: 0.5,
  },
});
