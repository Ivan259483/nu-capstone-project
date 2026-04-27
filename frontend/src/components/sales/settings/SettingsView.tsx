import React, { useState, useEffect } from 'react';
import {
  Settings, Clock, Store, Mail, Phone, MapPin,
  Globe, DollarSign, Calendar, Shield, Bell,
  Save, RefreshCw, CheckCircle2, AlertCircle, Lock,
  Sun, Moon, Smartphone,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────
interface StoreSettings {
  businessName: string;
  contactEmail: string;
  phoneNumber: string;
  address: string;
  currency: string;
  timezone: string;
  language: string;
  dateFormat: string;
  timeFormat: string;
  taxRate: number;
  membershipDiscount: number;
  serviceCapacity: number;
  operatingHours: Record<string, { open: string; close: string }>;
  notifications: {
    emailNewBookings: boolean;
    lowStockAlerts: boolean;
    dailySummary: boolean;
    maintenanceAlerts: boolean;
  };
}

const DEFAULT_SETTINGS: StoreSettings = {
  businessName: 'AutoSPF+',
  contactEmail: '',
  phoneNumber: '',
  address: '',
  currency: 'PHP',
  timezone: 'Asia/Manila',
  language: 'en',
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
  taxRate: 0,
  membershipDiscount: 10,
  serviceCapacity: 5,
  operatingHours: {
    monday: { open: '08:00', close: '18:00' },
    tuesday: { open: '08:00', close: '18:00' },
    wednesday: { open: '08:00', close: '18:00' },
    thursday: { open: '08:00', close: '18:00' },
    friday: { open: '08:00', close: '18:00' },
    saturday: { open: '09:00', close: '16:00' },
    sunday: { open: 'Closed', close: 'Closed' },
  },
  notifications: {
    emailNewBookings: true,
    lowStockAlerts: true,
    dailySummary: false,
    maintenanceAlerts: true,
  },
};

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// ── Section Card ──────────────────────────────────────────────────────────────
function SectionCard({ icon: Icon, title, description, children }: {
  icon: typeof Settings;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
          <Icon size={17} className="text-blue-600" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          <p className="text-[11px] text-slate-400">{description}</p>
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

// ── Input Field ───────────────────────────────────────────────────────────────
function InputField({ label, value, onChange, type = 'text', disabled = false, suffix }: {
  label: string;
  value: string | number;
  onChange: (val: string) => void;
  type?: string;
  disabled?: boolean;
  suffix?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all ${disabled ? 'bg-slate-50 cursor-not-allowed opacity-60' : 'bg-white'}`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>
        )}
      </div>
    </div>
  );
}

// ── Toggle Switch ─────────────────────────────────────────────────────────────
function Toggle({ label, checked, onChange, disabled = false }: {
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center justify-between py-2.5 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <span className="text-sm text-slate-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-slate-200'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
    </label>
  );
}

// ── Main Settings View ────────────────────────────────────────────────────────
export default function SettingsView() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Sales role can only view, not edit — unless they're also admin/office_admin
  const canEdit = ['administrator', 'office_admin'].includes(user?.role || '');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        // Try the authenticated settings endpoint first, fall back to public
        let response;
        try {
          response = await api.get('/settings');
        } catch {
          response = await api.get('/settings/public');
        }
        if (response.data?.success && response.data?.data) {
          setSettings(prev => ({ ...prev, ...response.data.data }));
        }
      } catch (err) {
        console.error('Failed to fetch settings:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const updateField = (path: string, value: any) => {
    if (!canEdit) return;
    setSettings(prev => {
      const next = { ...prev };
      const keys = path.split('.');
      let target: any = next;
      for (let i = 0; i < keys.length - 1; i++) {
        target[keys[i]] = { ...target[keys[i]] };
        target = target[keys[i]];
      }
      target[keys[keys.length - 1]] = value;
      return next;
    });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!canEdit) return;
    setIsSaving(true);
    try {
      const response = await api.post('/settings', settings);
      if (response.data?.success) {
        toast.success('Settings saved successfully');
        setHasChanges(false);
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-5 page-enter">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">Store configuration & preferences</p>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="h-5 w-40 bg-slate-100 rounded animate-pulse mb-4" />
              <div className="space-y-3">
                <div className="h-4 w-full bg-slate-50 rounded animate-pulse" />
                <div className="h-4 w-3/4 bg-slate-50 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">Store configuration & preferences</p>
        </div>
        <div className="flex items-center gap-2">
          {!canEdit && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
              <Lock size={13} className="text-amber-600" />
              <span className="text-[11px] font-semibold text-amber-700">View only</span>
            </div>
          )}
          {canEdit && hasChanges && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm"
            >
              {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              {isSaving ? 'Saving…' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      {/* Business Info */}
      <SectionCard icon={Store} title="Business Information" description="Store name, contact, and location">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InputField
            label="Business Name"
            value={settings.businessName}
            onChange={(v) => updateField('businessName', v)}
            disabled={!canEdit}
          />
          <InputField
            label="Contact Email"
            value={settings.contactEmail}
            onChange={(v) => updateField('contactEmail', v)}
            type="email"
            disabled={!canEdit}
          />
          <InputField
            label="Phone Number"
            value={settings.phoneNumber}
            onChange={(v) => updateField('phoneNumber', v)}
            disabled={!canEdit}
          />
          <InputField
            label="Address"
            value={settings.address}
            onChange={(v) => updateField('address', v)}
            disabled={!canEdit}
          />
        </div>
      </SectionCard>

      {/* Operating Hours */}
      <SectionCard icon={Clock} title="Operating Hours" description="Weekly schedule for the store">
        <div className="space-y-2">
          {DAYS.map((day) => {
            const hours = settings.operatingHours?.[day] || { open: 'Closed', close: 'Closed' };
            const isClosed = hours.open === 'Closed' || hours.close === 'Closed';
            return (
              <div key={day} className="flex items-center gap-3 py-2">
                <span className="text-sm font-medium text-slate-700 capitalize w-24">{day}</span>
                {isClosed ? (
                  <span className="text-sm text-red-400 font-medium">Closed</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={hours.open}
                      onChange={(e) => updateField(`operatingHours.${day}.open`, e.target.value)}
                      disabled={!canEdit}
                      className="px-2 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    <span className="text-xs text-slate-400">to</span>
                    <input
                      type="time"
                      value={hours.close}
                      onChange={(e) => updateField(`operatingHours.${day}.close`, e.target.value)}
                      disabled={!canEdit}
                      className="px-2 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Financial */}
      <SectionCard icon={DollarSign} title="Financial Settings" description="Tax rate, discounts, and currency">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <InputField
            label="Tax Rate"
            value={settings.taxRate}
            onChange={(v) => updateField('taxRate', parseFloat(v) || 0)}
            type="number"
            disabled={!canEdit}
            suffix="%"
          />
          <InputField
            label="Membership Discount"
            value={settings.membershipDiscount}
            onChange={(v) => updateField('membershipDiscount', parseFloat(v) || 0)}
            type="number"
            disabled={!canEdit}
            suffix="%"
          />
          <InputField
            label="Currency"
            value={settings.currency}
            onChange={(v) => updateField('currency', v)}
            disabled={!canEdit}
          />
        </div>
      </SectionCard>

      {/* Service Capacity */}
      <SectionCard icon={Calendar} title="Service Settings" description="Capacity and operational parameters">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InputField
            label="Service Capacity (vehicles/day)"
            value={settings.serviceCapacity}
            onChange={(v) => updateField('serviceCapacity', parseInt(v) || 0)}
            type="number"
            disabled={!canEdit}
          />
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date Format</label>
            <select
              value={settings.dateFormat}
              onChange={(e) => updateField('dateFormat', e.target.value)}
              disabled={!canEdit}
              className={`w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all ${!canEdit ? 'bg-slate-50 cursor-not-allowed opacity-60' : 'bg-white'}`}
            >
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </div>
        </div>
      </SectionCard>

      {/* Notifications */}
      <SectionCard icon={Bell} title="Notifications" description="Email and alert preferences">
        <div className="divide-y divide-slate-50">
          <Toggle
            label="Email on new bookings"
            checked={settings.notifications?.emailNewBookings ?? true}
            onChange={(v) => updateField('notifications.emailNewBookings', v)}
            disabled={!canEdit}
          />
          <Toggle
            label="Low stock alerts"
            checked={settings.notifications?.lowStockAlerts ?? true}
            onChange={(v) => updateField('notifications.lowStockAlerts', v)}
            disabled={!canEdit}
          />
          <Toggle
            label="Daily summary email"
            checked={settings.notifications?.dailySummary ?? false}
            onChange={(v) => updateField('notifications.dailySummary', v)}
            disabled={!canEdit}
          />
          <Toggle
            label="Maintenance alerts"
            checked={settings.notifications?.maintenanceAlerts ?? true}
            onChange={(v) => updateField('notifications.maintenanceAlerts', v)}
            disabled={!canEdit}
          />
        </div>
      </SectionCard>

      {/* Sticky Save Bar (visible when changes pending) */}
      {canEdit && hasChanges && (
        <div className="sticky bottom-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold shadow-lg shadow-blue-600/25 hover:bg-blue-700 disabled:opacity-50 transition-all"
          >
            {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            {isSaving ? 'Saving…' : 'Save All Changes'}
          </button>
        </div>
      )}
    </div>
  );
}
