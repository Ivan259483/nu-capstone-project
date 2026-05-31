import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Facebook, Instagram, Linkedin, LogOut, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { ensureBackendAuthToken } from '@/lib/api';
import { UserService } from '@/lib/user-service';
import { getRoleLabel, getSafeUserRole } from '@/lib/roles';
import AdminEditPersonalInfoModal, {
  type PersonalInfoDraft,
  type SocialLinks,
} from '../AdminEditPersonalInfoModal';
import AdminEditAddressModal, { type AddressDraft } from '../AdminEditAddressModal';
import AdminPasswordInput from '../AdminPasswordInput';

type ProfileStorage = AddressDraft & {
  bio?: string;
  social?: Partial<SocialLinks>;
};

interface Props {
  currentUser?: {
    _id?: string;
    id?: string;
    name?: string;
    email?: string;
    phone?: string;
    avatar?: string;
    role?: string;
    address?: string;
  };
  onNavigateHome: () => void;
  onSignOut: () => void | Promise<void>;
}

const EMPTY_ADDRESS: AddressDraft = {
  country: 'Philippines',
  cityState: '',
  postalCode: '',
  taxId: '',
};

const EMPTY_SOCIAL: SocialLinks = {
  facebook: '',
  x: '',
  linkedin: '',
  instagram: '',
};

function parseProfileStorage(raw?: string, fallbackBio = ''): ProfileStorage {
  if (!raw?.trim()) {
    return { ...EMPTY_ADDRESS, bio: fallbackBio, social: { ...EMPTY_SOCIAL } };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ProfileStorage>;
    if (parsed && typeof parsed === 'object') {
      return {
        country: parsed.country?.trim() || EMPTY_ADDRESS.country,
        cityState: parsed.cityState?.trim() || '',
        postalCode: parsed.postalCode?.trim() || '',
        taxId: parsed.taxId?.trim() || '',
        bio: parsed.bio?.trim() || fallbackBio,
        social: {
          facebook: parsed.social?.facebook?.trim() || '',
          x: parsed.social?.x?.trim() || '',
          linkedin: parsed.social?.linkedin?.trim() || '',
          instagram: parsed.social?.instagram?.trim() || '',
        },
      };
    }
  } catch {
    /* legacy plain-text address */
  }
  return {
    ...EMPTY_ADDRESS,
    cityState: raw.trim(),
    bio: fallbackBio,
    social: { ...EMPTY_SOCIAL },
  };
}

function serializeProfileStorage(fields: ProfileStorage): string {
  return JSON.stringify(fields);
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  };
}

function ProfileField({
  label,
  value,
  className = '',
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`ah-user-profile-field${className ? ` ${className}` : ''}`}>
      <span className="ah-user-profile-field-label">{label}</span>
      <div className="ah-user-profile-field-value">{value}</div>
    </div>
  );
}

function resolveProfileAvatar(_userId: string, avatar?: string | null) {
  if (!avatar) return null;
  if (avatar.startsWith('http') || avatar.startsWith('data:image/')) return avatar;
  return null;
}

function normalizeExternalUrl(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function buildPersonalDraft(
  source: Props['currentUser'],
  roleLabel: string,
  storage: ProfileStorage,
): PersonalInfoDraft {
  const { firstName, lastName } = splitName(source?.name || '');
  return {
    firstName,
    lastName,
    email: source?.email || '',
    phone: source?.phone || '',
    bio: storage.bio || roleLabel || '',
    social: { ...EMPTY_SOCIAL, ...storage.social },
  };
}

export default function AdminUserProfilePage({
  currentUser,
  onNavigateHome,
  onSignOut,
}: Props) {
  const { user, updateUser, deleteAccount } = useAuth();
  const source = user || currentUser;

  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [profileStorage, setProfileStorage] = useState<ProfileStorage>({
    ...EMPTY_ADDRESS,
    bio: '',
    social: { ...EMPTY_SOCIAL },
  });
  const [personalDraft, setPersonalDraft] = useState<PersonalInfoDraft>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    bio: '',
    social: { ...EMPTY_SOCIAL },
  });
  const [avatarDraft, setAvatarDraft] = useState<string | null>(null);
  const [addressDraft, setAddressDraft] = useState<AddressDraft>(EMPTY_ADDRESS);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const roleLabel = getRoleLabel(getSafeUserRole(source?.role));
  const profileUserId = String(source?.id || source?._id || '');
  const lastSavedAddressRef = useRef<string | null>(null);

  useEffect(() => {
    lastSavedAddressRef.current = null;
    setProfileStorage(parseProfileStorage(source?.address, roleLabel));
  }, [profileUserId]);

  useEffect(() => {
    const serialized = source?.address ?? '';
    if (serialized && serialized === lastSavedAddressRef.current) return;
    setProfileStorage(parseProfileStorage(source?.address, roleLabel));
  }, [source?.address, roleLabel]);

  const displayName = source?.name?.trim() || 'Signed in';
  const heroAvatar = useMemo(
    () => resolveProfileAvatar(profileUserId, avatarDraft ?? source?.avatar),
    [avatarDraft, profileUserId, source?.avatar],
  );
  const locationLabel =
    [profileStorage.cityState, profileStorage.country].filter(Boolean).join(', ') ||
    'Add your location';
  const initial = (displayName || source?.email || '?').charAt(0).toUpperCase();

  const profileReadOnly = useMemo(() => {
    const { firstName, lastName } = splitName(source?.name || '');
    return {
      firstName: firstName || '—',
      lastName: lastName || '—',
      email: source?.email || '—',
      phone: source?.phone || '—',
      bio: profileStorage.bio || roleLabel || '—',
    };
  }, [profileStorage.bio, roleLabel, source?.email, source?.name, source?.phone]);

  const socialDisplay = useMemo(() => {
    return [
      {
        key: 'facebook',
        label: 'Facebook',
        value: normalizeExternalUrl(profileStorage.social?.facebook),
        icon: <Facebook size={22} strokeWidth={2.25} aria-hidden />,
      },
      {
        key: 'x',
        label: 'X',
        value: normalizeExternalUrl(profileStorage.social?.x),
        icon: <span className="ah-user-profile-social-x" aria-hidden>X</span>,
      },
      {
        key: 'linkedin',
        label: 'LinkedIn',
        value: normalizeExternalUrl(profileStorage.social?.linkedin),
        icon: <Linkedin size={22} strokeWidth={2.15} aria-hidden />,
      },
      {
        key: 'instagram',
        label: 'Instagram',
        value: normalizeExternalUrl(profileStorage.social?.instagram),
        icon: <Instagram size={22} strokeWidth={2.15} aria-hidden />,
      },
    ];
  }, [profileStorage.social]);

  const openProfileModal = () => {
    setPersonalDraft(buildPersonalDraft(source, roleLabel, profileStorage));
    setAvatarDraft(source?.avatar || null);
    setProfileModalOpen(true);
  };

  const closeProfileModal = () => {
    setProfileModalOpen(false);
    setAvatarDraft(null);
  };

  const openAddressModal = () => {
    setAddressDraft({
      country: profileStorage.country,
      cityState: profileStorage.cityState,
      postalCode: profileStorage.postalCode,
      taxId: profileStorage.taxId,
    });
    setAddressModalOpen(true);
  };

  const closeAddressModal = () => {
    setAddressModalOpen(false);
  };

  const persistProfilePatch = async (
    patch: {
      name?: string;
      email?: string;
      phone?: string;
      avatar?: string | null;
      address?: string;
    },
    nextStorage: ProfileStorage,
  ) => {
    if (!profileUserId) {
      toast.error('You must be signed in to update your profile.');
      return false;
    }

    await ensureBackendAuthToken();

    const payload: {
      name?: string;
      email?: string;
      phone?: string;
      avatar?: string;
      address?: string;
    } = {};

    if (patch.name) payload.name = patch.name;
    if (patch.email) payload.email = patch.email;
    if (typeof patch.phone === 'string') payload.phone = patch.phone;
    if (typeof patch.address === 'string') payload.address = patch.address;
    if (patch.avatar && !patch.avatar.startsWith('data:image/')) {
      payload.avatar = patch.avatar;
    } else if (patch.avatar?.startsWith('data:image/') && patch.avatar.length < 1_500_000) {
      payload.avatar = patch.avatar;
    } else if (patch.avatar?.startsWith('data:image/')) {
      toast.warning('Profile photo is too large. Other details were saved without the new image.');
    }

    const response = await UserService.patchMyProfile(payload);
    if (!response.success) {
      toast.error(response.message || 'Failed to update profile');
      return false;
    }

    const data = (response.data || {}) as Record<string, unknown>;
    const serializedAddress =
      typeof data.address === 'string' ? data.address : patch.address ?? serializeProfileStorage(nextStorage);

    lastSavedAddressRef.current = serializedAddress;
    setProfileStorage(nextStorage);

    const syncResult = await updateUser({
      ...(source as any),
      id: profileUserId,
      _id: profileUserId,
      name: String(data.name || patch.name || source?.name || ''),
      email: String(data.email || patch.email || source?.email || ''),
      phone: typeof data.phone === 'string' ? data.phone : patch.phone || source?.phone,
      avatar:
        typeof data.avatar === 'string' && data.avatar
          ? data.avatar
          : patch.avatar ?? source?.avatar,
      role: source?.role,
      address: serializedAddress,
    } as any);

    if (!syncResult.success && !syncResult.offline) {
      toast.error(syncResult.message || 'Profile saved on server but failed to refresh locally.');
      return false;
    }

    return { ok: true, offline: Boolean(syncResult.offline) };
  };

  const saveProfile = async () => {
    const name = `${personalDraft.firstName} ${personalDraft.lastName}`.trim();
    if (!name) {
      toast.error('Name is required');
      return;
    }

    const email = personalDraft.email.trim() || source?.email || '';
    if (!email) {
      toast.error('Email is required');
      return;
    }

    const nextStorage: ProfileStorage = {
      ...profileStorage,
      bio: personalDraft.bio.trim(),
      social: { ...personalDraft.social },
    };
    const serializedAddress = serializeProfileStorage(nextStorage);

    setIsSavingProfile(true);
    try {
      const result = await persistProfilePatch(
        {
          name,
          email,
          phone: personalDraft.phone.trim(),
          avatar: avatarDraft ?? source?.avatar ?? null,
          address: serializedAddress,
        },
        nextStorage,
      );

      if (result?.ok) {
        toast.success(result.offline ? 'Profile saved locally (server unreachable).' : 'Profile updated');
        closeProfileModal();
      }
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (error as Error)?.message ||
        'Failed to update profile';
      toast.error(message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const saveAddress = async () => {
    const nextStorage: ProfileStorage = {
      ...profileStorage,
      ...addressDraft,
    };
    const serializedAddress = serializeProfileStorage(nextStorage);

    setIsSavingAddress(true);
    try {
      const result = await persistProfilePatch(
        {
          name: source?.name || displayName,
          email: source?.email || '',
          phone: source?.phone || '',
          avatar: source?.avatar ?? null,
          address: serializedAddress,
        },
        nextStorage,
      );

      if (result?.ok) {
        toast.success(result.offline ? 'Address saved locally (server unreachable).' : 'Address updated');
        closeAddressModal();
      }
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (error as Error)?.message ||
        'Failed to update address';
      toast.error(message);
    } finally {
      setIsSavingAddress(false);
    }
  };

  const savePassword = async () => {
    if (!currentPassword) {
      toast.error('Current password is required');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setIsSavingPassword(true);
    try {
      const res = await UserService.changePassword(currentPassword, newPassword);
      if (res?.success) {
        toast.success('Password updated');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPasswordOpen(false);
      } else {
        toast.error(res?.message || 'Failed to update password');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to update password');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      toast.error('Enter your password to confirm');
      return;
    }
    setIsDeleting(true);
    try {
      const res = await deleteAccount(deletePassword);
      if (res.success) {
        toast.success('Account deleted');
        await onSignOut();
      } else {
        toast.error(res.message || 'Could not delete account');
      }
    } catch {
      toast.error('Could not delete account');
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePersonalDraftChange = useCallback((patch: Partial<PersonalInfoDraft>) => {
    setPersonalDraft((current) => ({ ...current, ...patch }));
  }, []);

  const handleSocialChange = useCallback((key: keyof SocialLinks, value: string) => {
    setPersonalDraft((current) => ({
      ...current,
      social: { ...current.social, [key]: value },
    }));
  }, []);

  return (
    <div className="ah-user-profile-page">
      <div className="ah-user-profile-page-head">
        <h1 className="ah-user-profile-page-title">User Profile</h1>
        <nav className="ah-user-profile-breadcrumb" aria-label="Breadcrumb">
          <button type="button" onClick={onNavigateHome}>
            Home
          </button>
          <ChevronRight size={14} aria-hidden />
          <span aria-current="page">User Profile</span>
        </nav>
      </div>

      <div className="ah-user-profile-stack">
        <section className="ah-user-profile-card">
          <h2 className="ah-user-profile-card-title">My Profile</h2>
          <div className="ah-user-profile-card-top">
              <div className="ah-user-profile-hero">
                <div className="ah-user-profile-hero-avatar">
                  {heroAvatar ? (
                    <img src={heroAvatar} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    initial
                  )}
                </div>
                <div>
                  <h3 className="ah-user-profile-hero-name">{displayName}</h3>
                  <p className="ah-user-profile-hero-meta">
                    {roleLabel || 'Team member'}
                    <span className="ah-user-profile-hero-dot" aria-hidden>
                      |
                    </span>
                    {locationLabel}
                  </p>
                </div>
              </div>
              <button type="button" className="ah-user-profile-edit-btn" onClick={openProfileModal}>
                <Pencil size={18} strokeWidth={1.8} aria-hidden />
                Edit
              </button>
            </div>

            <div className="ah-user-profile-fields ah-user-profile-fields--personal">
              <ProfileField label="First Name" value={profileReadOnly.firstName} />
              <ProfileField label="Last Name" value={profileReadOnly.lastName} />
              <ProfileField label="Email address" value={profileReadOnly.email} />
              <ProfileField label="Phone" value={profileReadOnly.phone} />
              <ProfileField label="Bio" value={profileReadOnly.bio} />
              <ProfileField
                label="Social Links"
                value={
                  <div className="ah-user-profile-social-icons">
                    {socialDisplay.map((item) =>
                      item.value ? (
                        <a
                          key={item.key}
                          className="ah-user-profile-social-icon"
                          href={item.value}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={item.label}
                          title={item.label}
                        >
                          {item.icon}
                        </a>
                      ) : (
                        <span
                          key={item.key}
                          className="ah-user-profile-social-icon is-empty"
                          aria-label={`${item.label} not added`}
                          title={`${item.label} not added`}
                        >
                          {item.icon}
                        </span>
                      ),
                    )}
                  </div>
                }
              />
            </div>
        </section>

        <section className="ah-user-profile-card">
          <div className="ah-user-profile-card-top ah-user-profile-card-top--compact">
            <h3 className="ah-user-profile-section-title">Address</h3>
            <button type="button" className="ah-user-profile-edit-btn" onClick={openAddressModal}>
              <Pencil size={16} strokeWidth={1.75} aria-hidden />
              Edit
            </button>
          </div>

          <div className="ah-user-profile-fields ah-user-profile-fields--address">
            <ProfileField label="Country" value={profileStorage.country || '—'} />
            <ProfileField label="City/State" value={profileStorage.cityState || '—'} />
            <ProfileField label="Postal Code" value={profileStorage.postalCode || '—'} />
            <ProfileField label="TAX ID" value={profileStorage.taxId || '—'} />
          </div>
        </section>

        <section className="ah-user-profile-card">
          <h3 className="ah-user-profile-section-title ah-user-profile-section-title--spaced">Security</h3>

          <div className="ah-user-profile-row">
            <div>
              <p className="ah-user-profile-row-title">Change Password</p>
              <p className="ah-user-profile-row-desc">
                Update your password to keep your admin account secure.
              </p>
            </div>
            <button
              type="button"
              className="ah-user-profile-edit-btn"
              onClick={() => setPasswordOpen((open) => !open)}
            >
              <Pencil size={16} strokeWidth={1.75} aria-hidden />
              Change Password
            </button>
          </div>

          {passwordOpen ? (
            <div className="ah-user-profile-password-panel">
              <label className="ah-user-profile-input-wrap ah-user-profile-input-wrap--wide">
                <span>Current password</span>
                <AdminPasswordInput
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  autoComplete="current-password"
                />
              </label>
              <label className="ah-user-profile-input-wrap">
                <span>New password</span>
                <AdminPasswordInput
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                />
              </label>
              <label className="ah-user-profile-input-wrap">
                <span>Confirm password</span>
                <AdminPasswordInput
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                />
              </label>
              <div className="ah-user-profile-form-actions">
                <button
                  type="button"
                  className="ah-user-profile-btn ah-user-profile-btn--ghost"
                  onClick={() => {
                    setPasswordOpen(false);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ah-user-profile-btn ah-user-profile-btn--primary"
                  onClick={() => void savePassword()}
                  disabled={isSavingPassword}
                >
                  {isSavingPassword ? 'Updating…' : 'Update password'}
                </button>
              </div>
            </div>
          ) : null}

          <div className="ah-user-profile-divider" />

          <div className="ah-user-profile-row">
            <div>
              <p className="ah-user-profile-row-title">Two-factor authentication (2FA)</p>
              <p className="ah-user-profile-row-desc">
                Keep your account secure by enabling 2FA via your authenticator app.
              </p>
            </div>
            <button
              type="button"
              className={`ah-user-profile-toggle${twoFactorEnabled ? ' is-on' : ''}`}
              role="switch"
              aria-checked={twoFactorEnabled}
              onClick={() => {
                toast.message('Two-factor authentication is coming soon.');
                setTwoFactorEnabled(false);
              }}
            >
              <span className="ah-user-profile-toggle-thumb" />
            </button>
          </div>
        </section>

        <section className="ah-user-profile-card">
          <h3 className="ah-user-profile-section-title ah-user-profile-section-title--spaced">Danger Zone</h3>

          <div className="ah-user-profile-row">
            <div>
              <p className="ah-user-profile-row-title">Logout all devices</p>
              <p className="ah-user-profile-row-desc">Sign out from every active session on this account.</p>
            </div>
            <button
              type="button"
              className="ah-user-profile-edit-btn"
              onClick={() => void onSignOut()}
            >
              <LogOut size={16} strokeWidth={1.75} aria-hidden />
              Log out
            </button>
          </div>

          <div className="ah-user-profile-divider" />

          <div className="ah-user-profile-row">
            <div>
              <p className="ah-user-profile-row-title">Delete account</p>
              <p className="ah-user-profile-row-desc">
                Permanently remove your account and sign out. This cannot be undone.
              </p>
            </div>
            <button
              type="button"
              className="ah-user-profile-edit-btn ah-user-profile-edit-btn--danger"
              onClick={() => setDeleteOpen((open) => !open)}
            >
              <Trash2 size={16} strokeWidth={1.75} aria-hidden />
              Delete account
            </button>
          </div>

          {deleteOpen ? (
            <div className="ah-user-profile-danger-panel">
              <label className="ah-user-profile-input-wrap ah-user-profile-input-wrap--wide">
                <span>Confirm with your password</span>
                <AdminPasswordInput
                  value={deletePassword}
                  onChange={setDeletePassword}
                  autoComplete="current-password"
                />
              </label>
              <div className="ah-user-profile-form-actions">
                <button
                  type="button"
                  className="ah-user-profile-btn ah-user-profile-btn--ghost"
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeletePassword('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ah-user-profile-btn ah-user-profile-btn--danger"
                  onClick={() => void handleDeleteAccount()}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting…' : 'Delete my account'}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <AdminEditPersonalInfoModal
        open={profileModalOpen}
        displayName={displayName}
        avatar={avatarDraft}
        draft={personalDraft}
        onChange={handlePersonalDraftChange}
        onSocialChange={handleSocialChange}
        onAvatarChange={setAvatarDraft}
        onClose={closeProfileModal}
        onSave={() => void saveProfile()}
        isSaving={isSavingProfile}
      />

      <AdminEditAddressModal
        open={addressModalOpen}
        draft={addressDraft}
        onChange={(patch) => setAddressDraft((current) => ({ ...current, ...patch }))}
        onClose={closeAddressModal}
        onSave={() => void saveAddress()}
        isSaving={isSavingAddress}
      />
    </div>
  );
}
