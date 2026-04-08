/**
 * Settings Screen — Premium Customer Hub
 * 
 * 6-section comprehensive profile & settings page:
 * Profile Header, Account, Documents, Notifications, Support, Version Footer.
 * 
 * Tesla/Porsche-inspired dark luxury aesthetic with glassmorphism cards,
 * orange accent system, and staggered spring entry animations.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { authService } from '@/services/api/authService';
import { useTheme } from '@/hooks/useThemeContext';
import { Palette, TabBarHeight } from '@/constants/theme';
import AnimatedHeader from '@/components/ui/AnimatedHeader';
import ChatOverlay from '@/components/ChatOverlay';
import PremiumInput from '@/components/ui/PremiumInput';
import { Toast } from '@/components/ui/PremiumToast';
import { Validation } from '@/utils/validation';

// ── Section Components ──
import ProfileHeader from '@/features/settings/components/ProfileHeader';
import AccountSection from '@/features/settings/components/AccountSection';
import DocumentsSection from '@/features/settings/components/DocumentsSection';
import NotificationsSection from '@/features/settings/components/NotificationsSection';
import SupportSection from '@/features/settings/components/SupportSection';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { profile, user, signOut, refreshProfile } = useAuth();
  const router = useRouter();

  // ── Avatar upload state ──
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);

  // ── Chatbot state ──
  const [chatOpen, setChatOpen] = useState(false);

  // ── Change password modal state ──
  const [modalVisible, setModalVisible] = useState(false);
  const [isChangingPw, setIsChangingPw] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');

  // ── Personal Info modal state ──
  const [personalInfoModalVisible, setPersonalInfoModalVisible] = useState(false);
  const [editName, setEditName] = useState(profile?.full_name || '');
  const [editPhone, setEditPhone] = useState(''); // Not natively stored in BackendUser but editable in UI visually
  const [isUpdatingInfo, setIsUpdatingInfo] = useState(false);
  const [infoError, setInfoError] = useState('');

  // ── Security & Login modal state ──
  const [securityModalVisible, setSecurityModalVisible] = useState(false);
  const [appLockEnabled, setAppLockEnabled] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);

  // Initialize Biometrics & Preferences
  React.useEffect(() => {
    (async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      setBiometricSupported(compatible);
      const locked = await AsyncStorage.getItem('@autospf_app_lock');
      if (locked === 'true') setAppLockEnabled(true);
    })();
  }, []);

  React.useEffect(() => {
    if (profile) {
      setEditName(profile.full_name || '');
    }
  }, [profile]);

  // ── Handlers ──
  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets[0]?.base64 && user) {
        setIsUpdatingAvatar(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const base64Avatar = `data:image/jpeg;base64,${result.assets[0].base64}`;
        await authService.updateUserBackendProfile(user, { avatar: base64Avatar });
        await refreshProfile();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update profile picture.');
    } finally {
      setIsUpdatingAvatar(false);
    }
  };

  const handleChangePassword = async () => {
    setPwError('');
    if (!currentPw || !newPw || !confirmPw) {
      setPwError('Please fill in all fields.');
      return;
    }
    if (newPw !== confirmPw) {
      setPwError('New passwords do not match.');
      return;
    }
    if (!Validation.isStrongPassword(newPw)) {
      setPwError('Must be 8+ chars, with upper, lower & numbers');
      return;
    }

    try {
      if (!user) throw new Error('No user logged in.');
      setIsChangingPw(true);
      await authService.reauthenticateAndUpdatePassword(user, currentPw, newPw);
      Toast.show('Password updated successfully.', 'success');
      setModalVisible(false);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (error: any) {
      Toast.show(error.message || 'Failed to update password.', 'error');
    } finally {
      setIsChangingPw(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await signOut();
          router.replace('/');
        },
      },
    ]);
  };

  const handleUpdatePersonalInfo = async () => {
    setInfoError('');
    if (!Validation.isValidName(editName)) {
      setInfoError('Full name must be at least 3 characters.');
      return;
    }
    if (editPhone && !Validation.isValidPhone(editPhone)) {
      setInfoError('Invalid Philippine phone number.');
      return;
    }

    try {
      if (!user) throw new Error('No user logged in.');
      setIsUpdatingInfo(true);
      await authService.updateUserBackendProfile(user, { name: editName });
      await refreshProfile();
      Toast.show('Personal info updated safely', 'success');
      setPersonalInfoModalVisible(false);
    } catch (e: any) {
      Toast.show(e.message || 'Failed to update info', 'error');
    } finally {
      setIsUpdatingInfo(false);
    }
  };

  const toggleAppLock = async () => {
    try {
      if (!appLockEnabled) {
        if (!biometricSupported) {
          Toast.show('Biometrics not supported on this device', 'error');
          return;
        }
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Authenticate to enable App Lock',
          cancelLabel: 'Cancel',
        });
        if (result.success) {
          await AsyncStorage.setItem('@autospf_app_lock', 'true');
          setAppLockEnabled(true);
          Toast.show('Biometric App Lock Enabled', 'success');
        }
      } else {
        await AsyncStorage.setItem('@autospf_app_lock', 'false');
        setAppLockEnabled(false);
        Toast.show('Biometric App Lock Disabled', 'success');
      }
    } catch {
      Toast.show('Failed to change security preferences', 'error');
    }
  };

  return (
    <View style={[s.screen, { backgroundColor: colors.background }]}>
      <AnimatedHeader />

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: TabBarHeight + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══ 1. Profile Header ═══ */}
        <ProfileHeader
          profile={profile}
          isUpdatingAvatar={isUpdatingAvatar}
          onPickImage={handlePickImage}
        />

        {/* ═══ 2. Account Section ═══ */}
        <View style={s.section}>
          <AccountSection
            onPersonalInfo={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setPersonalInfoModalVisible(true);
            }}
            onSecurity={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSecurityModalVisible(true);
            }}
            onChangePassword={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setModalVisible(true);
            }}
            onOTPStatus={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            onTrustedDevices={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            onLogout={handleLogout}
          />
        </View>



        {/* ═══ 3. Documents & Legal Records ═══ */}
        <View style={s.section}>
          <DocumentsSection />
        </View>

        {/* ═══ 4. Notifications ═══ */}
        <View style={s.section}>
          <NotificationsSection />
        </View>

        {/* ═══ 5. Support & AI Chatbot ═══ */}
        <View style={s.section}>
          <SupportSection onOpenChatbot={() => setChatOpen(true)} />
        </View>

        {/* ═══ 6. Version Footer ═══ */}
        <Animated.View entering={FadeInUp.delay(550).springify().damping(18)} style={s.footer}>
          <View style={s.footerDivider} />
          <Text style={s.footerBrand}>AutoSPF+</Text>
          <Text style={s.footerVersion}>Version 1.0.0 · Build 2026.04</Text>
          <Text style={s.footerCopy}>© 2026 AutoSPF+ Philippines. All rights reserved.</Text>
        </Animated.View>
      </ScrollView>

      {/* ═══ Change Password Modal ═══ */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>Change Password</Text>
                <Text style={s.modalSubtitle}>Update your account security</Text>
              </View>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={s.modalCloseBtn}
              >
                <Ionicons name="close" size={22} color="#A0A0AB" />
              </TouchableOpacity>
            </View>

            {pwError ? (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={14} color="#EF4444" />
                <Text style={s.errorText}>{pwError}</Text>
              </View>
            ) : null}

            <View style={{ gap: 16 }}>
              <PremiumInput
                label="CURRENT PASSWORD"
                iconName="lock-closed-outline"
                placeholder="Enter current password"
                value={currentPw}
                onChangeText={(t) => { setCurrentPw(t); setPwError(''); }}
                isPassword
              />

              <PremiumInput
                label="NEW PASSWORD"
                iconName="lock-closed-outline"
                placeholder="Enter new password"
                value={newPw}
                onChangeText={(t) => { setNewPw(t); setPwError(''); }}
                isPassword
              />

              <PremiumInput
                label="CONFIRM NEW PASSWORD"
                iconName="lock-closed-outline"
                placeholder="Confirm new password"
                value={confirmPw}
                onChangeText={(t) => { setConfirmPw(t); setPwError(''); }}
                isPassword
              />
            </View>

            <TouchableOpacity
              style={s.actionBtn}
              onPress={handleChangePassword}
              disabled={isChangingPw}
            >
              {isChangingPw ? (
                <ActivityIndicator color="#0D0D12" />
              ) : (
                <Text style={s.actionBtnText}>Update Password</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ═══ Personal Information Modal ═══ */}
      <Modal visible={personalInfoModalVisible} transparent animationType="slide" onRequestClose={() => setPersonalInfoModalVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>Personal Information</Text>
                <Text style={s.modalSubtitle}>Manage your bio details</Text>
              </View>
              <TouchableOpacity onPress={() => setPersonalInfoModalVisible(false)} style={s.modalCloseBtn}>
                <Ionicons name="close" size={22} color="#A0A0AB" />
              </TouchableOpacity>
            </View>

            {infoError ? (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={14} color="#EF4444" />
                <Text style={s.errorText}>{infoError}</Text>
              </View>
            ) : null}

            <View style={{ gap: 16 }}>
              <PremiumInput
                label="FULL NAME"
                iconName="person-outline"
                placeholder="Enter full name"
                value={editName}
                onChangeText={(t) => { setEditName(t); setInfoError(''); }}
              />

              <PremiumInput
                label="EMAIL ADDRESS"
                iconName="mail-outline"
                placeholder="Email address"
                value={profile?.email || ''}
                readOnly
              />
              <Text style={{ fontSize: 11, color: '#8A8A9A', marginTop: -8, marginLeft: 4 }}>Email is currently secured. Contact support to change.</Text>

              <PremiumInput
                label="PHONE NUMBER (OPTIONAL)"
                iconName="call-outline"
                placeholder="e.g. +639123456789"
                value={editPhone}
                onChangeText={(t) => { setEditPhone(t); setInfoError(''); }}
              />

              <TouchableOpacity style={s.actionBtn} onPress={handleUpdatePersonalInfo} disabled={isUpdatingInfo} activeOpacity={0.8}>
                {isUpdatingInfo ? <ActivityIndicator color="#0D0D12" /> : <Text style={s.actionBtnText}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══ Security Login Modal ═══ */}
      <Modal visible={securityModalVisible} transparent animationType="slide" onRequestClose={() => setSecurityModalVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>Security & Login</Text>
                <Text style={s.modalSubtitle}>Vault-level protection</Text>
              </View>
              <TouchableOpacity onPress={() => setSecurityModalVisible(false)} style={s.modalCloseBtn}>
                <Ionicons name="close" size={22} color="#A0A0AB" />
              </TouchableOpacity>
            </View>

            <View style={s.securityCard}>
              <View style={s.securityRow}>
                <View style={s.securityIconWrap}>
                  <Ionicons name="finger-print-outline" size={20} color={Palette.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.securityCardTitle}>Biometric App Lock</Text>
                  <Text style={s.securityCardSub}>Require Face ID / Touch ID when opening the app</Text>
                </View>
                <TouchableOpacity 
                  onPress={toggleAppLock}
                  style={[s.toggleWrap, appLockEnabled && s.toggleWrapActive]}
                >
                  <View style={[s.toggleThumb, appLockEnabled && s.toggleThumbActive]} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══ Chatbot Overlay ═══ */}
      <ChatOverlay visible={chatOpen} onClose={() => setChatOpen(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    padding: 24,
    paddingTop: 60,
  },
  section: {
    marginBottom: 28,
  },

  // ── Footer ──
  footer: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
    gap: 4,
  },
  footerDivider: {
    width: 40,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 16,
  },
  footerBrand: {
    fontSize: 16,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.12)',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  footerVersion: {
    fontSize: 11,
    color: '#4A4A58',
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  footerCopy: {
    fontSize: 10,
    color: '#3A3A48',
    fontWeight: '400',
    marginTop: 2,
  },

  // ── Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0D0D12',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
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
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  modalSubtitle: {
    color: '#6B6B78',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  modalCloseBtn: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
  },
  actionBtn: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.accent,
  },
  actionBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    color: '#8A8A9A',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 16,
    color: '#FFF',
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: Palette.accent,
    padding: 18,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: Palette.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    padding: 12,
    borderRadius: 14,
    marginBottom: 18,
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
  // Security Toggle Items
  securityCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 16,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  securityIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,107,53,0.1)',
    alignItems: 'center', justifyContent: 'center'
  },
  securityCardTitle: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  securityCardSub: { fontSize: 11, color: '#8A8A9A', marginTop: 2, lineHeight: 16 },
  toggleWrap: {
    width: 44, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center', paddingHorizontal: 2
  },
  toggleWrapActive: { backgroundColor: Palette.accent },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFF' },
  toggleThumbActive: { alignSelf: 'flex-end' },
});
