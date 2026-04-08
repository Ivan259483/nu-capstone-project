/**
 * Edit Profile Screen
 * Premium profile editing with avatar, name update, and backend sync
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp, FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';
import { authService } from '@/services/api/authService';
import { getApiErrorMessage } from '@/services/api/client';
import { getRoleLabel } from '@/services/api/roles';
import { Palette, BorderRadius } from '@/constants/theme';
import PremiumInput from '@/components/ui/PremiumInput';
import PremiumButton from '@/components/ui/PremiumButton';
import { Toast } from '@/components/ui/PremiumToast';

const SURFACE = '#111114';
const SURFACE_ALT = '#1A1A22';
const BORDER = '#2A2A30';

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile, refreshProfile } = useAuth();

  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Validation
  const [nameError, setNameError] = useState('');

  // Track if anything changed
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
    }
  }, [profile]);

  useEffect(() => {
    const originalName = profile?.full_name || '';
    setHasChanges(fullName.trim() !== originalName.trim());
  }, [fullName, profile]);

  const validateForm = (): boolean => {
    setNameError('');

    if (!fullName.trim()) {
      setNameError('Full name is required');
      return false;
    }

    if (fullName.trim().length < 2) {
      setNameError('Name must be at least 2 characters');
      return false;
    }

    if (!/^[a-zA-ZÀ-ÿ\s\-'.]+$/.test(fullName.trim())) {
      setNameError('Name contains invalid characters');
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    if (!user) {
      Toast.show('Authentication required. Please re-login.', 'error');
      return;
    }

    setLoading(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      await authService.updateUserBackendProfile(user, {
        name: fullName.trim(),
      });

      // Refresh the AuthContext profile
      await refreshProfile();

      setSuccess(true);
      setHasChanges(false);

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Toast.show('Profile updated successfully!', 'success');

      setTimeout(() => {
        router.back();
      }, 1200);
    } catch (err: any) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      const message = getApiErrorMessage(err);
      Toast.show(message || 'Failed to update profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDiscard = () => {
    if (!hasChanges) {
      router.back();
      return;
    }

    Alert.alert(
      'Discard Changes?',
      'You have unsaved changes. Are you sure you want to go back?',
      [
        { text: 'Keep Editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => router.back(),
        },
      ]
    );
  };

  const triggerHapticLight = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const initials = fullName
    ? fullName.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase()
    : 'U';

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            triggerHapticLight();
            handleDiscard();
          }}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={18} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar Area */}
          <Animated.View
            entering={FadeInDown.delay(100).springify().damping(16).stiffness(120)}
            style={styles.avatarArea}
          >
            <View style={styles.avatarContainer}>
              <LinearGradient
                colors={[Palette.accent, Palette.accentDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatar}
              >
                <Text style={styles.avatarInitials}>{initials}</Text>
              </LinearGradient>
              <View style={styles.avatarBadge}>
                <Ionicons name="camera" size={12} color="#fff" />
              </View>
            </View>
            <Text style={styles.avatarName}>{profile?.full_name || 'Customer'}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>
                {getRoleLabel(profile?.role)}
              </Text>
            </View>
          </Animated.View>

          {/* Divider */}
          <Animated.View
            entering={FadeIn.delay(150)}
            style={styles.divider}
          />

          {/* Form */}
          <View style={styles.formContainer}>
            <Animated.View entering={FadeInUp.delay(200).springify().damping(16).stiffness(120)}>
              <PremiumInput
                label="FULL NAME"
                iconName="person-outline"
                placeholder="Enter your full name"
                value={fullName}
                onChangeText={(t) => {
                  setFullName(t);
                  setNameError('');
                }}
                autoCapitalize="words"
                error={nameError}
              />
            </Animated.View>

            {/* Read-only email */}
            <Animated.View entering={FadeInUp.delay(300).springify().damping(16).stiffness(120)}>
              <View style={styles.readOnlyField}>
                <Text style={styles.readOnlyLabel}>EMAIL ADDRESS</Text>
                <View style={styles.readOnlyRow}>
                  <Ionicons name="mail-outline" size={18} color="#555" />
                  <Text style={styles.readOnlyValue}>{profile?.email || ''}</Text>
                  <View style={styles.lockedBadge}>
                    <Ionicons name="lock-closed" size={10} color="#666" />
                    <Text style={styles.lockedText}>Verified</Text>
                  </View>
                </View>
              </View>
            </Animated.View>

            {/* Read-only role */}
            <Animated.View entering={FadeInUp.delay(400).springify().damping(16).stiffness(120)}>
              <View style={styles.readOnlyField}>
                <Text style={styles.readOnlyLabel}>ACCOUNT TYPE</Text>
                <View style={styles.readOnlyRow}>
                  <Ionicons name="shield-outline" size={18} color="#555" />
                  <Text style={styles.readOnlyValue}>
                    {getRoleLabel(profile?.role)}
                  </Text>
                </View>
              </View>
            </Animated.View>

            {/* Save Button */}
            <Animated.View
              entering={FadeInUp.delay(500).springify().damping(15).stiffness(100)}
              style={{ marginTop: 20 }}
            >
              <PremiumButton
                title={
                  success
                    ? '✓ SAVED'
                    : loading
                    ? 'SAVING...'
                    : !hasChanges
                    ? 'NO CHANGES'
                    : 'SAVE CHANGES'
                }
                icon={success ? undefined : loading ? undefined : 'save-outline'}
                onPress={handleSave}
                disabled={loading || !hasChanges || success}
              />
            </Animated.View>

            {/* Info note */}
            <Animated.View
              entering={FadeInUp.delay(600).springify()}
              style={styles.infoRow}
            >
              <Ionicons name="information-circle" size={16} color="#444" />
              <Text style={styles.infoText}>
                Your email and account type are managed by the system and cannot be changed here. Contact support if you need to update them.
              </Text>
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
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
  content: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
  },

  // Avatar
  avatarArea: { alignItems: 'center', marginBottom: 32 },
  avatarContainer: { position: 'relative', marginBottom: 16 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#0A0A0A',
  },
  avatarName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  roleBadge: {
    backgroundColor: 'rgba(255,107,53,0.12)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.3)',
  },
  roleText: {
    fontSize: 10,
    fontWeight: '700',
    color: Palette.accent,
    letterSpacing: 1,
  },

  divider: {
    height: 1,
    backgroundColor: BORDER,
    marginBottom: 32,
  },

  formContainer: { width: '100%' },

  // Read-only fields
  readOnlyField: {
    marginBottom: 20,
  },
  readOnlyLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#555',
    marginBottom: 10,
  },
  readOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  readOnlyValue: {
    flex: 1,
    fontSize: 15,
    color: '#888',
    fontWeight: '500',
  },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  lockedText: {
    fontSize: 10,
    color: '#666',
    fontWeight: '600',
  },

  // Info
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 28,
    paddingHorizontal: 4,
  },
  infoText: {
    fontSize: 12,
    color: '#444',
    lineHeight: 18,
    flex: 1,
  },
});
