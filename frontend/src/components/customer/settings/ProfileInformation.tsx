import { useRef, type ChangeEvent, type FormEvent } from 'react';
import { Camera, LockKeyhole, UserRound, Loader2, Check, Trash2, AlertCircle } from 'lucide-react';
import { AccountAvatar, FieldError, SettingsSection } from './SettingsPrimitives';

export interface ProfileDraft {
  fullName: string; email: string; phone: string; avatarPreview: string; avatarFile: File | null; avatarRemoved: boolean;
}
export interface ProfileInformationProps {
  profile: ProfileDraft;
  image: string;
  errors: Record<string, string>;
  saving: boolean;
  preparingPhoto: boolean;
  saved: boolean;
  onChange: (field: 'fullName' | 'phone', value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onPhotoChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: () => void;
}

export function ProfileInformation({ profile, image, errors, saving, preparingPhoto, saved, onChange, onSubmit, onPhotoChange, onRemovePhoto }: ProfileInformationProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = saving || preparingPhoto;
  return <SettingsSection id="account-profile-title" title="Profile Information" description="Your personal details, always within reach." icon={UserRound}>
    <form onSubmit={onSubmit} noValidate aria-busy={busy}>
      <div className="account-section-body account-profile-grid">
        <div className="account-photo-editor">
          <AccountAvatar name={profile.fullName} image={image} large />
          <input ref={inputRef} id="account-photo" type="file" accept="image/jpeg,image/png,image/heic,image/heif" hidden disabled={busy} onChange={onPhotoChange} />
          <div className="account-photo-actions">
            <button type="button" className="account-button account-button-secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
              {preparingPhoto ? <Loader2 size={15} className="account-spin" aria-hidden="true" /> : <Camera size={15} aria-hidden="true" />}
              {preparingPhoto ? 'Updating…' : 'Change Photo'}
            </button>
            {image && <button type="button" className="account-button account-button-text account-button-danger" disabled={busy} onClick={onRemovePhoto}>
              <Trash2 size={14} aria-hidden="true" />Remove
            </button>}
          </div>
          <p className="account-helper">Photos are optimized and saved automatically.</p>
          {profile.avatarRemoved && <p className="account-helper account-photo-pending" role="status">Select Save Changes to remove your photo.</p>}
        </div>
        <div className="account-profile-fields">
          <div className="account-field">
            <label htmlFor="settings-full-name">Full Name</label>
            <input id="settings-full-name" className="account-control" value={profile.fullName} autoComplete="name" disabled={busy}
              onChange={(event) => onChange('fullName', event.target.value)} aria-invalid={!!errors.fullName} aria-describedby={errors.fullName ? 'account-name-error' : undefined} />
            <FieldError id="account-name-error" message={errors.fullName} />
          </div>
          <div className="account-field">
            <label htmlFor="settings-phone">Phone Number</label>
            <input id="settings-phone" className="account-control" type="tel" value={profile.phone} autoComplete="tel" disabled={busy}
              onChange={(event) => onChange('phone', event.target.value)} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'account-phone-error' : 'account-phone-help'} />
            {errors.phone ? <FieldError id="account-phone-error" message={errors.phone} /> : <p id="account-phone-help" className="account-helper">Use +country code for international numbers, or 09 for Philippine mobile.</p>}
          </div>
          <div className="account-field">
            <label htmlFor="settings-email">Email Address <LockKeyhole size={13} aria-hidden="true" /></label>
            <input id="settings-email" className="account-control" type="email" value={profile.email} readOnly aria-readonly="true" autoComplete="email" aria-describedby="account-email-help" />
            <p id="account-email-help" className="account-helper">Email is managed through your sign-in account.</p>
          </div>
        </div>
      </div>
      <footer className="account-action-footer">
        <div className="account-inline-feedback" aria-live="polite" aria-atomic="true">
          {errors.form ? <span className="account-error"><AlertCircle size={16} aria-hidden="true" />{errors.form}</span>
            : saved ? <span className="account-success"><Check size={16} aria-hidden="true" />Profile updated successfully.</span>
              : <span>Keep your contact details up to date.</span>}
        </div>
        <button type="submit" className="account-button account-button-primary" disabled={busy}>
          {busy && <Loader2 size={16} className="account-spin" aria-hidden="true" />}{preparingPhoto ? 'Updating photo…' : saving ? 'Saving…' : 'Save Changes'}
        </button>
      </footer>
    </form>
  </SettingsSection>;
}
