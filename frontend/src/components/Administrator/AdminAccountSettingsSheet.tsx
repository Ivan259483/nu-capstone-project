import React, { useState } from 'react';
import { toast } from 'sonner';
import { UserService } from '@/lib/user-service';
import { getRoleLabel, getSafeUserRole } from '@/lib/roles';
import AdminAccountSheetLayout from './AdminAccountSheetLayout';
import AdminPasswordInput from './AdminPasswordInput';

interface Props {
  currentUser?: {
    name?: string;
    email?: string;
    role?: string;
  };
  onClose: () => void;
}

export default function AdminAccountSettingsSheet({ currentUser, onClose }: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const roleLabel = getRoleLabel(getSafeUserRole(currentUser?.role));

  const handleChangePassword = async () => {
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

    setIsSaving(true);
    try {
      const res = await UserService.changePassword(currentPassword, newPassword);
      if (res?.success) {
        toast.success('Password updated');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast.error(res?.message || 'Failed to update password');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to update password');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminAccountSheetLayout title="Account settings" onClose={onClose}>
      <section className="ah-account-settings-section">
        <h4 className="ah-account-settings-heading">Account info</h4>
        <dl className="ah-account-info-list">
          <div>
            <dt>Name</dt>
            <dd>{currentUser?.name || '—'}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{currentUser?.email || '—'}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{roleLabel || '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="ah-account-settings-section">
        <h4 className="ah-account-settings-heading">Change password</h4>
        <div className="ah-account-form">
          <label className="ah-account-label">
            Current password
            <AdminPasswordInput
              inputClassName="ah-account-input"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
            />
          </label>
          <label className="ah-account-label">
            New password
            <AdminPasswordInput
              inputClassName="ah-account-input"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
            />
          </label>
          <label className="ah-account-label">
            Confirm new password
            <AdminPasswordInput
              inputClassName="ah-account-input"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
            />
          </label>
        </div>
      </section>

      <div className="ah-account-sheet-actions">
        <button type="button" className="ah-account-btn ah-account-btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="ah-account-btn ah-account-btn--primary"
          onClick={handleChangePassword}
          disabled={isSaving}
        >
          {isSaving ? 'Updating…' : 'Update password'}
        </button>
      </div>
    </AdminAccountSheetLayout>
  );
}
