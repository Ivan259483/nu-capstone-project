import React, { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Camera, X } from 'lucide-react';
import { toast } from 'sonner';

export type SocialLinks = {
  facebook: string;
  x: string;
  linkedin: string;
  instagram: string;
};

export type PersonalInfoDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  bio: string;
  social: SocialLinks;
};

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

interface Props {
  open: boolean;
  displayName: string;
  avatar: string | null;
  draft: PersonalInfoDraft;
  onChange: (patch: Partial<PersonalInfoDraft>) => void;
  onSocialChange: (key: keyof SocialLinks, value: string) => void;
  onAvatarChange: (value: string | null) => void;
  onClose: () => void;
  onSave: () => void;
  isSaving?: boolean;
}

export default function AdminEditPersonalInfoModal({
  open,
  displayName,
  avatar,
  draft,
  onChange,
  onSocialChange,
  onAvatarChange,
  onClose,
  onSave,
  isSaving = false,
}: Props) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initial = (displayName || draft.email || '?').charAt(0).toUpperCase();

  const handleAvatarFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose a JPEG or PNG image.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error('Image must be 2 MB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        onAvatarChange(result);
      }
    };
    reader.readAsDataURL(file);
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="ah-profile-modal-root" role="presentation">
      <button
        type="button"
        className="ah-profile-modal-backdrop"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <form
        className="ah-profile-modal ah-profile-modal--personal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ah-edit-personal-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isSaving) onSave();
        }}
      >
        <div className="ah-profile-modal-header">
          <div>
            <h2 id="ah-edit-personal-title" className="ah-profile-modal-title">
              Edit Personal Information
            </h2>
            <p className="ah-profile-modal-subtitle">
              Update your details to keep your profile up-to-date.
            </p>
          </div>
          <button
            type="button"
            className="ah-profile-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="ah-profile-modal-body">
          <h3 className="ah-profile-modal-section-label">Change Profile Picture</h3>
          <div className="ah-profile-modal-photo-row">
            <div className="ah-profile-modal-photo-picker">
              {avatar ? (
                <img src={avatar} alt="" className="ah-profile-modal-photo-img" />
              ) : (
                <span className="ah-profile-modal-photo-fallback">{initial}</span>
              )}
              <button
                type="button"
                className="ah-profile-modal-photo-btn"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Upload profile photo"
              >
                <Camera size={16} strokeWidth={1.75} aria-hidden />
              </button>
              <input
                ref={fileInputRef}
                id={fileInputId}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  handleAvatarFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
            <p className="ah-profile-modal-photo-hint">
              Upload a square image (200×200 px) in JPEG or PNG format.
            </p>
          </div>

          <h3 className="ah-profile-modal-section-label ah-profile-modal-section-label--spaced">
            Personal Information
          </h3>
          <div className="ah-profile-modal-grid">
            <label className="ah-profile-modal-field">
              <span>First Name</span>
              <input
                value={draft.firstName}
                onChange={(e) => onChange({ firstName: e.target.value })}
                autoComplete="given-name"
              />
            </label>
            <label className="ah-profile-modal-field">
              <span>Last Name</span>
              <input
                value={draft.lastName}
                onChange={(e) => onChange({ lastName: e.target.value })}
                autoComplete="family-name"
              />
            </label>
            <label className="ah-profile-modal-field">
              <span>Email Address</span>
              <input
                type="email"
                value={draft.email}
                onChange={(e) => onChange({ email: e.target.value })}
                autoComplete="email"
              />
            </label>
            <label className="ah-profile-modal-field">
              <span>Phone</span>
              <input
                type="tel"
                value={draft.phone}
                onChange={(e) => onChange({ phone: e.target.value })}
                autoComplete="tel"
              />
            </label>
            <label className="ah-profile-modal-field ah-profile-modal-field--full">
              <span>Bio</span>
              <textarea
                rows={4}
                value={draft.bio}
                onChange={(e) => onChange({ bio: e.target.value })}
                placeholder="Team Manager"
              />
            </label>
          </div>

          <h3 className="ah-profile-modal-section-label ah-profile-modal-section-label--spaced">
            Social Links
          </h3>
          <div className="ah-profile-modal-grid">
            <label className="ah-profile-modal-field">
              <span>Facebook</span>
              <input
                type="url"
                value={draft.social.facebook}
                onChange={(e) => onSocialChange('facebook', e.target.value)}
                placeholder="https://www.facebook.com/"
                autoComplete="off"
              />
            </label>
            <label className="ah-profile-modal-field">
              <span>X.com</span>
              <input
                type="url"
                value={draft.social.x}
                onChange={(e) => onSocialChange('x', e.target.value)}
                placeholder="https://x.com/"
                autoComplete="off"
              />
            </label>
            <label className="ah-profile-modal-field">
              <span>Linkedin</span>
              <input
                type="url"
                value={draft.social.linkedin}
                onChange={(e) => onSocialChange('linkedin', e.target.value)}
                placeholder="https://linkedin.com/"
                autoComplete="off"
              />
            </label>
            <label className="ah-profile-modal-field">
              <span>Instagram</span>
              <input
                type="url"
                value={draft.social.instagram}
                onChange={(e) => onSocialChange('instagram', e.target.value)}
                placeholder="https://instagram.com/"
                autoComplete="off"
              />
            </label>
          </div>
        </div>

        <div className="ah-profile-modal-footer">
          <button
            type="button"
            className="ah-profile-modal-btn ah-profile-modal-btn--ghost"
            onClick={onClose}
            disabled={isSaving}
          >
            Close
          </button>
          <button
            type="submit"
            className="ah-profile-modal-btn ah-profile-modal-btn--primary"
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
