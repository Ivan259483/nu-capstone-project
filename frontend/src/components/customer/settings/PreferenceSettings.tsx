import { useState } from 'react';
import { Bell, CalendarCheck, ChevronDown, Clock3, CreditCard, Globe2, Mail, MapPin, Radio, Smartphone, CarFront, Languages } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useAccountPreferences } from '@/hooks/useAccountPreferences';
import { notificationPreferenceAdapter } from '@/lib/account-preference-service';
import { formatRegionalPreview, REGIONAL_OPTIONS, type RegionalPreferences } from '@/lib/customer-account-settings';
import { PreferenceSkeleton, SaveStatus, SettingsSection } from './SettingsPrimitives';

const COMMUNICATION_ROWS = [
  { key: 'pushEnabled', label: 'Push Notifications', description: 'Updates on devices connected to your account.', icon: Smartphone },
  { key: 'emailEnabled', label: 'Email Notifications', description: 'Account updates delivered to your inbox.', icon: Mail },
  { key: 'bookingConfirmation', label: 'Booking Updates', description: 'Confirmations, reminders, and schedule changes.', icon: CalendarCheck },
  { key: 'jobStatusUpdates', label: 'Live Service Status', description: 'Progress while your vehicle is in service.', icon: Radio },
  { key: 'paymentReminders', label: 'Payment Reminders', description: 'Payment updates, balances, and receipts.', icon: CreditCard },
  { key: 'vehicleReminders', label: 'Vehicle Reminders', description: 'Vehicle-related reminders when available.', icon: CarFront },
] as const;

export function CommunicationPreferences({ accountId }: { accountId: string }) {
  const preferences = useAccountPreferences(accountId, notificationPreferenceAdapter);
  return <SettingsSection id="account-communication-title" title="Communication Preferences" description="Choose which updates you want to receive." icon={Bell}>
    {preferences.loading ? <PreferenceSkeleton rows={6} /> : preferences.value && <div className="account-preference-list">
      {COMMUNICATION_ROWS.map(({ key, label, description, icon: Icon }, index) => <div className={`account-preference-row${index === 2 ? ' account-preference-category-start' : ''}`} key={key}>
        <Icon size={19} strokeWidth={1.6} className="account-row-icon" aria-hidden="true" />
        <div className="account-preference-copy"><label htmlFor={`account-pref-${key}`} id={`account-pref-${key}-label`}>{label}</label><p id={`account-pref-${key}-help`}>{description}</p></div>
        <Switch id={`account-pref-${key}`} className="account-switch" checked={preferences.value[key]}
          onCheckedChange={(value) => preferences.update({ [key]: value })}
          aria-labelledby={`account-pref-${key}-label`} aria-describedby={`account-pref-${key}-help`} />
      </div>)}
    </div>}
    <div className="account-preference-footer">
      <SaveStatus saving={preferences.saving} saved={preferences.saved} error={preferences.error} retry={!preferences.value && !preferences.loading ? preferences.retry : undefined} />
      {preferences.value && <p className="account-helper">Push follows your device permissions. Essential security emails and your in-app history remain available.</p>}
    </div>
  </SettingsSection>;
}

export type RegionalPreferenceState = ReturnType<typeof useAccountPreferences<RegionalPreferences>>;
const REGIONAL_FIELDS = [
  { key: 'language', label: 'Preferred Language', icon: Languages },
  { key: 'region', label: 'Country / Region', icon: MapPin },
  { key: 'timezone', label: 'Time Zone', icon: Clock3 },
  { key: 'dateFormat', label: 'Date Format', icon: CalendarCheck },
] as const;

export function LanguageRegionSettings({ preferences }: { preferences: RegionalPreferenceState }) {
  const [previewDate] = useState(() => new Date());
  const [browserTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const supportedBrowserTimezone = REGIONAL_OPTIONS.timezone.find((value) => value === browserTimezone);
  const preview = preferences.value ? formatRegionalPreview(preferences.value, previewDate) : null;
  return <SettingsSection id="account-region-title" title="Language & Region" description="Your preferred language, dates, and regional formats." icon={Globe2}>
    {preferences.loading ? <PreferenceSkeleton /> : preferences.value && <div className="account-section-body">
      <div className="account-regional-grid">
        {REGIONAL_FIELDS.map(({ key, label, icon: Icon }) => <div className="account-field" key={key}>
          <label htmlFor={`account-region-${key}`}>{label}</label>
          <div className="account-select-wrap">
            <Icon size={17} aria-hidden="true" />
            <select className="account-control" id={`account-region-${key}`} value={preferences.value[key] || ''}
              onChange={(event) => preferences.update({ [key]: event.target.value } as Partial<RegionalPreferences>)}>
              <option value="" disabled>Not set</option>
              {REGIONAL_OPTIONS[key].map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </div>
          {key === 'timezone' && !preferences.value.timezone && supportedBrowserTimezone && <p className="account-helper">Your browser uses {supportedBrowserTimezone}.</p>}
        </div>)}
      </div>
      <div className="account-format-preview">
        <span className="account-eyebrow">Format preview</span>
        <p>{preview || 'Choose a time zone and date format to see a preview.'}</p>
        <span className="account-helper">Preferences are saved to your account. This preview shows their format; portal-wide translation is not available yet.</span>
      </div>
    </div>}
    <div className="account-preference-footer"><SaveStatus saving={preferences.saving} saved={preferences.saved} error={preferences.error} retry={!preferences.value && !preferences.loading ? preferences.retry : undefined} /></div>
  </SettingsSection>;
}
