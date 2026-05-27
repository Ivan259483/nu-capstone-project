import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { getRoleLabel, getSafeUserRole } from '@/lib/roles';
import AdminAccountSheetLayout from './AdminAccountSheetLayout';

interface Props {
  currentUser?: {
    _id?: string;
    id?: string;
    name?: string;
    email?: string;
    phone?: string;
    avatar?: string;
    role?: string;
  };
  onClose: () => void;
}

export default function AdminAccountProfileSheet({ currentUser, onClose }: Props) {
  const { user, updateUser } = useAuth();
  const source = user || currentUser;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const name = source?.name?.trim() || '';
    const parts = name.split(/\s+/).filter(Boolean);
    setFirstName(parts[0] || '');
    setLastName(parts.slice(1).join(' ') || '');
    setEmail(source?.email || '');
    setPhone(source?.phone || '');
  }, [source?.name, source?.email, source?.phone]);

  const displayName =
    `${firstName} ${lastName}`.trim() || source?.name || 'Signed in';
  const roleLabel = getRoleLabel(getSafeUserRole(source?.role));
  const initial = (displayName || email || '?').charAt(0).toUpperCase();

  const handleSave = async () => {
    const name = `${firstName} ${lastName}`.trim();
    if (!name) {
      toast.error('Name is required');
      return;
    }

    setIsSaving(true);
    try {
      const result = await updateUser({
        ...(source as any),
        id: source?.id || source?._id || '',
        _id: source?._id || source?.id,
        name,
        email: email.trim() || source?.email,
        phone: phone.trim() || undefined,
        avatar: source?.avatar,
        role: source?.role,
      } as any);

      if (result.success) {
        toast.success('Profile updated');
        onClose();
      } else {
        toast.error(result.message || 'Failed to update profile');
      }
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminAccountSheetLayout title="View profile" onClose={onClose}>
      <div className="ah-account-profile-header">
        <div className="ah-account-profile-avatar">{initial}</div>
        <div>
          <p className="ah-account-profile-name">{displayName}</p>
          <p className="ah-account-profile-meta">{source?.email || ''}</p>
          {roleLabel ? <p className="ah-account-profile-role">{roleLabel}</p> : null}
        </div>
      </div>

      <div className="ah-account-form">
        <label className="ah-account-label">
          First name
          <input
            className="ah-account-input"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
          />
        </label>
        <label className="ah-account-label">
          Last name
          <input
            className="ah-account-input"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
          />
        </label>
        <label className="ah-account-label">
          Email
          <input
            className="ah-account-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label className="ah-account-label">
          Phone
          <input
            className="ah-account-input"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            placeholder="09XX XXX XXXX"
          />
        </label>
      </div>

      <div className="ah-account-sheet-actions">
        <button type="button" className="ah-account-btn ah-account-btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="ah-account-btn ah-account-btn--primary"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </AdminAccountSheetLayout>
  );
}
