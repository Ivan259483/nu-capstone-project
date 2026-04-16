/**
 * Settings & Profile Module
 * Profile management, preferences, notifications toggle, logout
 * AutoGloss Premium Automotive Aesthetic
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  Switch,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';
import { getRoleLabel } from '@/services/api/roles';
import { useTheme } from '@/hooks/useThemeContext';

// ─── Design Tokens ───────────────────────────────────────────────────────────
const ACCENT = '#FF6B35';
const ACCENT_DARK = '#CC5214';
const BLACK = '#0A0A0A';
const SURFACE = '#111114';
const SURFACE_ALT = '#1A1A22';
const BORDER = '#2A2A30';

// ─── Menu Item Component ─────────────────────────────────────────────────────

function MenuItem({
  icon,
  label,
  sub,
  onPress,
  color,
  rightElement,
  danger,
}: {
  icon: string;
  label: string;
  sub?: string;
  onPress?: () => void;
  color?: string;
  rightElement?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={m.row}
      activeOpacity={0.8}
      onPress={onPress}
      disabled={!onPress}
    >
      <View
        style={[
          m.iconWrap,
          { backgroundColor: danger ? 'rgba(239,68,68,0.12)' : color ? `${color}18` : 'rgba(255,107,53,0.12)' },
        ]}
      >
        <Ionicons
          name={icon as any}
          size={18}
          color={danger ? '#EF4444' : color || ACCENT}
        />
      </View>
      <View style={m.textWrap}>
        <Text style={[m.label, danger && { color: '#EF4444' }]}>{label}</Text>
        {sub && <Text style={m.sub}>{sub}</Text>}
      </View>
      {rightElement || (onPress && <Ionicons name="chevron-forward" size={16} color="#444" />)}
    </TouchableOpacity>
  );
}

const m = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  label: { fontSize: 14, fontWeight: '600', color: '#fff' },
  sub: { fontSize: 11, color: '#666', marginTop: 1 },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, signOut, deleteAccount } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const [pushNotifs, setPushNotifs] = useState(true);
  const [emailNotifs, setEmailNotifs] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // ── Delete Account State ────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of AutoGloss?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            try {
              await signOut();
            } catch (error) {
              setLoggingOut(false);
              Alert.alert('Error', 'Failed to sign out. Please try again.');
            }
          },
        },
      ]
    );
  };

  // ── Delete Account ──────────────────────────────────────────────────
  const openDeleteFlow = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Delete Account?',
      'This action is permanent and cannot be undone. All account data, history, and associated records will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            setDeletePassword('');
            setDeleteError('');
            setShowDeleteModal(true);
          },
        },
      ]
    );
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword.trim()) {
      setDeleteError('Please enter your password to confirm.');
      return;
    }
    setIsDeleting(true);
    setDeleteError('');
    try {
      const result = await deleteAccount(deletePassword);
      setIsDeleting(false);
      if (result.success) {
        setShowDeleteModal(false);
        Alert.alert('Account Deleted', 'Your account has been permanently deleted.', [
          { text: 'OK', onPress: () => signOut() },
        ]);
      } else {
        setDeleteError(result.message || 'Deletion failed. Please try again.');
      }
    } catch {
      setIsDeleting(false);
      setDeleteError('Network error. Please try again.');
    }
  };

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase()
    : 'AG';

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={18} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Profile Card ─── */}
        <Animated.View entering={FadeInDown.delay(100).duration(200)}>
          <View style={s.profileCard}>
            <LinearGradient
              colors={[ACCENT, ACCENT_DARK]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.profileAvatar}
            >
              <Text style={s.profileInitials}>{initials}</Text>
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={s.profileName}>{profile?.full_name || 'Customer'}</Text>
              <Text style={s.profileEmail}>{profile?.email || ''}</Text>
              <View style={s.profileRoleBadge}>
                <Text style={s.profileRoleText}>
                  {getRoleLabel(profile?.role)}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={s.editBtn} onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(screens)/edit-profile' as any);
            }}>
              <Ionicons name="create-outline" size={16} color={ACCENT} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ─── Account ─── */}
        <Animated.View entering={FadeInDown.delay(150).duration(200)}>
          <Text style={s.sectionLabel}>ACCOUNT</Text>
          <View style={s.card}>
            <MenuItem
              icon="person-outline"
              label="Personal Information"
              sub="Name, phone number, address"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(screens)/edit-profile' as any);
              }}
            />
            <View style={s.divider} />
            <MenuItem
              icon="lock-closed-outline"
              label="Change Password"
              sub="Update your secure credentials"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(screens)/change-password' as any);
              }}
            />
            <View style={s.divider} />
            <MenuItem
              icon="car-sport-outline"
              label="My Vehicles"
              sub="Manage your registered vehicles"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(customer)/book');
              }}
            />
          </View>
        </Animated.View>

        {/* ─── Notifications ─── */}
        <Animated.View entering={FadeInDown.delay(200).duration(200)}>
          <Text style={s.sectionLabel}>NOTIFICATIONS</Text>
          <View style={s.card}>
            <MenuItem
              icon="notifications-outline"
              label="Push Notifications"
              sub="Service alerts, status updates"
              rightElement={
                <Switch
                  value={pushNotifs}
                  onValueChange={(val) => {
                    setPushNotifs(val);
                    Haptics.selectionAsync();
                  }}
                  trackColor={{ false: '#333', true: 'rgba(255,107,53,0.4)' }}
                  thumbColor={pushNotifs ? ACCENT : '#666'}
                  ios_backgroundColor="#333"
                />
              }
            />
            <View style={s.divider} />
            <MenuItem
              icon="mail-outline"
              label="Email Notifications"
              sub="Receipts, promotions, newsletters"
              rightElement={
                <Switch
                  value={emailNotifs}
                  onValueChange={(val) => {
                    setEmailNotifs(val);
                    Haptics.selectionAsync();
                  }}
                  trackColor={{ false: '#333', true: 'rgba(255,107,53,0.4)' }}
                  thumbColor={emailNotifs ? ACCENT : '#666'}
                  ios_backgroundColor="#333"
                />
              }
            />
            <View style={s.divider} />
            <MenuItem
              icon="chatbox-ellipses-outline"
              label="Notification Center"
              sub="View all recent alerts"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(screens)/notifications');
              }}
            />
          </View>
        </Animated.View>

        {/* ─── Appearance ─── */}
        <Animated.View entering={FadeInDown.delay(250).duration(200)}>
          <Text style={s.sectionLabel}>APPEARANCE</Text>
          <View style={s.card}>
            <MenuItem
              icon={isDark ? 'moon-outline' : 'sunny-outline'}
              label="Dark Mode"
              sub={isDark ? 'Currently using dark theme' : 'Currently using light theme'}
              color="#8B5CF6"
              rightElement={
                <Switch
                  value={isDark}
                  onValueChange={() => {
                    toggleTheme();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }}
                  trackColor={{ false: '#333', true: 'rgba(139,92,246,0.4)' }}
                  thumbColor={isDark ? '#8B5CF6' : '#666'}
                  ios_backgroundColor="#333"
                />
              }
            />
          </View>
        </Animated.View>

        {/* ─── Documents & Legal ─── */}
        <Animated.View entering={FadeInDown.delay(300).duration(200)}>
          <Text style={s.sectionLabel}>DOCUMENTS & LEGAL</Text>
          <View style={s.card}>
            <MenuItem
              icon="document-text-outline"
              label="My Waivers"
              sub="View signed service agreements"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(screens)/documents');
              }}
            />
            <View style={s.divider} />
            <MenuItem
              icon="receipt-outline"
              label="Payment History"
              sub="Receipts and transactions"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(screens)/payments');
              }}
            />
            <View style={s.divider} />
            <MenuItem
              icon="calendar-outline"
              label="My Appointments"
              sub="Upcoming and past bookings"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(screens)/appointments');
              }}
            />
          </View>
        </Animated.View>

        {/* ─── Support ─── */}
        <Animated.View entering={FadeInDown.delay(350).duration(200)}>
          <Text style={s.sectionLabel}>SUPPORT</Text>
          <View style={s.card}>
            <MenuItem
              icon="help-circle-outline"
              label="Help & FAQ"
              sub="Common questions and guides"
              color="#06B6D4"
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            />
            <View style={s.divider} />
            <MenuItem
              icon="chatbubbles-outline"
              label="Contact Support"
              sub="Chat with our team"
              color="#06B6D4"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/');
              }}
            />
          </View>
        </Animated.View>

        {/* ─── Danger Zone ─── */}
        <Animated.View entering={FadeInDown.delay(380).duration(200)}>
          <Text style={s.sectionLabel}>DANGER ZONE</Text>
          <View style={s.dangerCard}>
            <View style={s.dangerHeader}>
              <View style={s.dangerIconWrap}>
                <Ionicons name="warning-outline" size={18} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.dangerTitle}>Delete Account</Text>
                <Text style={s.dangerSub}>
                  Permanently removes your account and all data.
                </Text>
              </View>
            </View>
            <Text style={s.dangerBody}>
              This action is{' '}
              <Text style={{ color: '#EF4444', fontWeight: '700' }}>permanent and cannot be undone</Text>.
              All personal data, service history, vehicles, and records will be erased.
            </Text>
            <TouchableOpacity
              style={s.dangerBtn}
              activeOpacity={0.8}
              onPress={openDeleteFlow}
            >
              <Ionicons name="trash-outline" size={16} color="#EF4444" />
              <Text style={s.dangerBtnText}>Delete My Account</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ─── Sign Out ─── */}
        <Animated.View entering={FadeInDown.delay(400).duration(200)}>
          <TouchableOpacity
            style={s.logoutBtn}
            activeOpacity={0.85}
            onPress={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={18} color="#EF4444" />
                <Text style={s.logoutText}>Sign Out</Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* App info */}
        <Animated.View entering={FadeInDown.delay(450).duration(200)} style={s.appInfo}>
          <Text style={s.appName}>AutoGloss</Text>
          <Text style={s.appVersion}>AI-Driven Smart Detailing · v1.0.0</Text>
        </Animated.View>
      </ScrollView>

      {/* ─── Delete Account Password Modal ────────────────────────────── */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="slide"
        onRequestClose={() => { if (!isDeleting) setShowDeleteModal(false); }}
      >
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={s.modalSheet}>
            {/* Handle bar */}
            <View style={s.modalHandle} />

            {/* Icon + Title */}
            <View style={s.modalTitleRow}>
              <View style={s.modalIconWrap}>
                <Ionicons name="warning" size={20} color="#EF4444" />
              </View>
              <Text style={s.modalTitle}>Confirm Deletion</Text>
            </View>

            <Text style={s.modalBody}>
              Enter your password to permanently delete your account. This cannot be reversed.
            </Text>

            {/* Password Input */}
            <View style={s.modalInputWrapper}>
              <Ionicons name="lock-closed-outline" size={16} color="rgba(239,68,68,0.5)" style={{ marginRight: 8 }} />
              <TextInput
                style={s.modalInput}
                placeholder="Enter your password"
                placeholderTextColor="rgba(239,68,68,0.35)"
                secureTextEntry
                value={deletePassword}
                onChangeText={(t) => { setDeletePassword(t); setDeleteError(''); }}
                editable={!isDeleting}
                autoFocus
              />
            </View>

            {/* Error message */}
            {!!deleteError && (
              <View style={s.errorRow}>
                <Ionicons name="alert-circle-outline" size={13} color="#EF4444" />
                <Text style={s.errorText}>{deleteError}</Text>
              </View>
            )}

            {/* Buttons */}
            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.modalCancelBtn}
                activeOpacity={0.8}
                onPress={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.modalDeleteBtn, (isDeleting || !deletePassword) && { opacity: 0.5 }]}
                activeOpacity={0.85}
                onPress={handleDeleteAccount}
                disabled={isDeleting || !deletePassword}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={15} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={s.modalDeleteText}>Delete Permanently</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BLACK },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 40, gap: 20 },

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

  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#555',
    marginBottom: -8,
  },

  // Profile card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: SURFACE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitials: { fontSize: 20, fontWeight: '800', color: '#fff' },
  profileName: { fontSize: 17, fontWeight: '700', color: '#fff' },
  profileEmail: { fontSize: 12, color: '#888', marginTop: 1 },
  profileRoleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,107,53,0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.3)',
    marginTop: 6,
  },
  profileRoleText: { fontSize: 9, fontWeight: '700', color: ACCENT, letterSpacing: 1 },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE_ALT,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Card group
  card: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  divider: { height: 1, backgroundColor: '#1E1E26' },

  // Logout
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(239,68,68,0.25)',
    paddingVertical: 14,
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: '#EF4444' },

  // App info
  appInfo: { alignItems: 'center', gap: 4, paddingVertical: 10 },
  appName: { fontSize: 14, fontWeight: '800', color: '#444', letterSpacing: 1 },
  appVersion: { fontSize: 11, color: '#333' },

  // ─── Danger Zone ────────────────────────────────────────────────────
  dangerCard: {
    backgroundColor: 'rgba(239,68,68,0.05)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(239,68,68,0.22)',
    padding: 16,
    gap: 12,
  },
  dangerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dangerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: 'rgba(239,68,68,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
  },
  dangerSub: {
    fontSize: 11,
    color: 'rgba(239,68,68,0.6)',
    marginTop: 1,
  },
  dangerBody: {
    fontSize: 12,
    color: 'rgba(239,68,68,0.65)',
    lineHeight: 18,
  },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(239,68,68,0.3)',
    paddingVertical: 12,
  },
  dangerBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
  },

  // ─── Delete Account Modal ────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#111114',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    padding: 24,
    gap: 16,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: 'rgba(239,68,68,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  modalBody: {
    fontSize: 13,
    color: '#888',
    lineHeight: 19,
  },
  modalInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.06)',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(239,68,68,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  modalInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  modalDeleteBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDeleteText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
