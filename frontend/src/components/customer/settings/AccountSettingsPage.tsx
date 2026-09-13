import { useState } from 'react';
import { Check, Clock3, LogOut, Loader2 } from 'lucide-react';
import type { User } from '@/types';
import { getProfileCompletion } from '@/lib/customer-account-settings';
import { regionalPreferenceAdapter } from '@/lib/account-preference-service';
import { useAccountPreferences } from '@/hooks/useAccountPreferences';
import { AccountAvatar } from './SettingsPrimitives';
import { ProfileInformation, type ProfileInformationProps } from './ProfileInformation';
import { SecuritySettings, type SecuritySettingsProps } from './SecuritySettings';
import { CommunicationPreferences, LanguageRegionSettings, type RegionalPreferenceState } from './PreferenceSettings';
import './account-settings.css';

interface AccountSettingsPageProps {
  user: User;
  savedImage: string;
  profile: ProfileInformationProps;
  security: SecuritySettingsProps;
  onSignOut: () => Promise<void>;
}

function AccountSummary({ user, image, regional }: { user: User; image: string; regional: RegionalPreferenceState }) {
  const completion = getProfileCompletion(user);
  const metadata = [
    { label: 'Account type', value: user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1).replace(/_/g, ' ') : '—' },
    { label: 'Region', value: regional.confirmed?.region, pending: regional.loading },
    { label: 'Language', value: regional.confirmed?.language, pending: regional.loading },
    { label: 'Time zone', value: regional.confirmed?.timezone, pending: regional.loading },
  ];
  return <aside className="account-summary" aria-labelledby="account-summary-title">
    <h2 id="account-summary-title" className="account-eyebrow">Account Summary</h2>
    <div className="account-summary-identity"><AccountAvatar name={user.name || user.email || ''} image={image} />
      <div><p className="account-summary-name">{user.name || 'Customer'}</p><p className="account-summary-email">{user.email || 'No email on file'}</p></div>
    </div>
    <div className="account-completion">
      <div className="account-strength-heading"><span>Profile completion</span><strong>{completion.percent}%</strong></div>
      <div className="account-progress" role="progressbar" aria-label="Profile completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion.percent}>
        <span style={{ width: `${completion.percent}%` }} />
      </div>
      {completion.missing.length ? <p className="account-helper">Missing: {completion.missing.join(', ')}</p>
        : <p className="account-completion-ready"><Check size={14} aria-hidden="true" />Your contact details are complete.</p>}
    </div>
    <dl className="account-metadata">
      {metadata.map(({ label, value, pending }) => <div key={label}><dt>{label}</dt><dd>{pending ? <span className="account-skeleton" aria-label="Loading" /> : value || (regional.error ? 'Unavailable' : 'Not set')}</dd></div>)}
    </dl>
  </aside>;
}

function SessionSettings({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <section className="account-session" aria-labelledby="account-session-title">
    <div><h2 id="account-session-title">Session</h2><p>Sign out of this account on this device.</p>{error && <p className="account-field-error" role="alert">{error}</p>}</div>
    <button type="button" className="account-button account-button-text account-button-danger" disabled={busy} onClick={async () => {
      if (busy) return;
      setBusy(true); setError('');
      try { await onSignOut(); } catch { setError('Could not sign out. Please try again.'); setBusy(false); }
    }}>{busy ? <Loader2 size={17} className="account-spin" aria-hidden="true" /> : <LogOut size={17} aria-hidden="true" />}{busy ? 'Signing out…' : 'Sign Out'}</button>
  </section>;
}

export function AccountSettingsPage({ user, savedImage, profile, security, onSignOut }: AccountSettingsPageProps) {
  const regional = useAccountPreferences(user.id, regionalPreferenceAdapter);
  const completion = getProfileCompletion(user);
  return <div className="account-settings">
    <header className="account-page-heading">
      <div><p className="account-eyebrow">Account</p><h1>Account Settings</h1><p className="account-page-description">Manage your personal details, security, communication preferences, and regional settings.</p></div>
      <div className="account-context">
        {completion.percent === 100 && <span><Check size={14} aria-hidden="true" />Profile ready</span>}
        {regional.confirmed?.timezone && <span><Clock3 size={14} aria-hidden="true" />{regional.confirmed.timezone}</span>}
      </div>
    </header>
    <div className="account-workspace">
      <AccountSummary user={user} image={savedImage} regional={regional} />
      <div className="account-main">
        <ProfileInformation {...profile} />
        <SecuritySettings {...security} />
        <CommunicationPreferences accountId={user.id} />
        <LanguageRegionSettings preferences={regional} />
        <SessionSettings onSignOut={onSignOut} />
      </div>
    </div>
  </div>;
}
