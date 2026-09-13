import { useState, type FormEvent } from 'react';
import { Check, Circle, Eye, EyeOff, Loader2, ShieldCheck, AlertCircle } from 'lucide-react';
import { canUpdatePassword, getPasswordRequirements } from '@/lib/customer-account-settings';
import { FieldError, SettingsSection } from './SettingsPrimitives';

type PasswordFields = { current: string; newPass: string; confirm: string };
export interface SecuritySettingsProps {
  passwords: PasswordFields;
  errors: Record<string, string>;
  saving: boolean;
  onChange: (field: keyof PasswordFields, value: string) => void;
  onSubmit: (event: FormEvent) => void;
}

export function PasswordStrengthMeter({ password }: { password: string }) {
  const requirements = getPasswordRequirements(password);
  const score = requirements.filter(({ met }) => met).length;
  return <div className="account-strength">
    <div className="account-strength-heading"><span>Password strength</span><span>{score} / 5 requirements</span></div>
    <div className="account-progress" role="progressbar" aria-label="Password requirements met" aria-valuemin={0} aria-valuemax={5} aria-valuenow={score}>
      <span style={{ width: `${score * 20}%` }} />
    </div>
    <ul className="account-password-rules">
      {requirements.map(({ label, met }) => <li key={label} className={met ? 'is-met' : ''}>
        {met ? <Check size={14} aria-hidden="true" /> : <Circle size={12} aria-hidden="true" />}
        <span className="sr-only">{met ? 'Met: ' : 'Not met: '}</span>{label}
      </li>)}
    </ul>
  </div>;
}

export function SecuritySettings({ passwords, errors, saving, onChange, onSubmit }: SecuritySettingsProps) {
  const [visible, setVisible] = useState({ current: false, newPass: false, confirm: false });
  const fields = [{ key: 'current', label: 'Current Password' }, { key: 'newPass', label: 'New Password' }, { key: 'confirm', label: 'Confirm Password' }] as const;
  const ready = canUpdatePassword(passwords);
  const help = !passwords.newPass ? 'Enter a new password to continue.'
    : passwords.newPass === passwords.current ? 'Choose a password different from your current password.'
      : getPasswordRequirements(passwords.newPass).some(({ met }) => !met) ? 'Meet all five requirements to continue.'
        : !passwords.current ? 'Enter your current password.'
          : passwords.newPass !== passwords.confirm ? 'Confirm your new password to continue.' : 'Your new password is ready to save.';
  return <SettingsSection id="account-security-title" title="Security" description="Update your password and keep your account protected." icon={ShieldCheck}>
    <form onSubmit={onSubmit} noValidate aria-busy={saving}>
      <div className="account-section-body">
        <div className="account-password-grid">
          {fields.map(({ key, label }) => <div className="account-field" key={key}>
            <label htmlFor={`account-password-${key}`}>{label}</label>
            <div className="account-password-input">
              <input id={`account-password-${key}`} className="account-control" type={visible[key] ? 'text' : 'password'} value={passwords[key]} disabled={saving}
                onChange={(event) => onChange(key, event.target.value)} autoComplete={key === 'current' ? 'current-password' : 'new-password'}
                aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `account-password-${key}-error` : undefined} />
              <button type="button" disabled={saving} aria-label={`${visible[key] ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible[key]}
                onClick={() => setVisible((state) => ({ ...state, [key]: !state[key] }))}>
                {visible[key] ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
              </button>
            </div>
            <FieldError id={`account-password-${key}-error`} message={errors[key]} />
          </div>)}
        </div>
        <PasswordStrengthMeter password={passwords.newPass} />
        {errors.form && <p className="account-error account-security-error" role="alert"><AlertCircle size={16} aria-hidden="true" />{errors.form}</p>}
      </div>
      <footer className="account-action-footer">
        <p className="account-helper" id="account-password-guidance">{help}</p>
        <button type="submit" className="account-button account-button-primary" disabled={saving || !ready} aria-describedby="account-password-guidance">
          {saving && <Loader2 size={16} className="account-spin" aria-hidden="true" />}{saving ? 'Updating…' : 'Update Password'}
        </button>
      </footer>
    </form>
  </SettingsSection>;
}
