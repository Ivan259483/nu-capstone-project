import { getPasswordPolicyError, PASSWORD_SPECIAL_CHARACTER_RE } from './password-policy.ts';

export const REGIONAL_OPTIONS = {
  language: ['English', 'Filipino', 'Japanese', 'Korean'],
  region: ['Philippines', 'Singapore', 'United States', 'United Arab Emirates'],
  timezone: ['Asia/Manila', 'Asia/Singapore', 'UTC', 'America/Los_Angeles', 'Europe/London'],
  dateFormat: ['DD MMM YYYY', 'MMM DD, YYYY', 'YYYY-MM-DD'],
} as const;

export type RegionalPreferences = { [K in keyof typeof REGIONAL_OPTIONS]: (typeof REGIONAL_OPTIONS)[K][number] | null };
export type NotificationPreferences = {
  pushEnabled: boolean;
  emailEnabled: boolean;
  bookingConfirmation: boolean;
  jobStatusUpdates: boolean;
  paymentReminders: boolean;
  vehicleReminders: boolean;
};

export function getProfileCompletion(profile: { name?: string; email?: string; phone?: string }) {
  const fields = [{ label: 'Full name', value: profile.name }, { label: 'Email address', value: profile.email }, { label: 'Phone number', value: profile.phone }];
  const missing = fields.filter(({ value }) => !value?.trim()).map(({ label }) => label);
  return { percent: Math.round(((3 - missing.length) / 3) * 100), missing };
}

export function getPasswordRequirements(password: string) {
  return [
    { label: '8+ characters', met: password.length >= 8 },
    { label: 'Uppercase', met: /[A-Z]/.test(password) },
    { label: 'Lowercase', met: /[a-z]/.test(password) },
    { label: 'Number', met: /[0-9]/.test(password) },
    { label: 'Special', met: PASSWORD_SPECIAL_CHARACTER_RE.test(password) },
  ];
}

export function canUpdatePassword(passwords: { current: string; newPass: string; confirm: string }) {
  return Boolean(passwords.current && !getPasswordPolicyError(passwords.newPass)
    && passwords.newPass !== passwords.current && passwords.newPass === passwords.confirm);
}

/** Only the Settings preview uses these preferences; appointment timestamps remain server-owned. */
export function formatRegionalPreview(preferences: RegionalPreferences, date: Date) {
  if (!preferences.timezone || !preferences.dateFormat) return null;
  const locale = ({ English: 'en', Filipino: 'fil', Japanese: 'ja', Korean: 'ko' } as const)[preferences.language || 'English'];
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: preferences.timezone, year: 'numeric', month: preferences.dateFormat === 'YYYY-MM-DD' ? '2-digit' : 'short', day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '';
  const formattedDate = preferences.dateFormat === 'YYYY-MM-DD'
    ? `${part('year')}-${part('month')}-${part('day')}`
    : preferences.dateFormat === 'MMM DD, YYYY'
      ? `${part('month')} ${part('day')}, ${part('year')}`
      : `${part('day')} ${part('month')} ${part('year')}`;
  const time = new Intl.DateTimeFormat(locale, { timeZone: preferences.timezone, hour: '2-digit', minute: '2-digit' }).format(date);
  return `${formattedDate} · ${time}`;
}
