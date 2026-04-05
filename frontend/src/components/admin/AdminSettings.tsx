import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import type { BusinessSettings } from '@/types';
import { Download, Database, Trash2, ShieldAlert, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface AdminSettingsProps {
    settings: BusinessSettings | null;
    isDarkMode: boolean;
    onSave: (updatedSettings: Partial<BusinessSettings>) => Promise<void>;
    onExportData?: () => void;
    onBackupDB?: () => void;
    onClearCache?: () => void;
    onResetSystem?: () => void;
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({ 
    settings, 
    isDarkMode, 
    onSave,
    onExportData,
    onBackupDB,
    onClearCache,
    onResetSystem
}) => {
    const [localSettings, setLocalSettings] = useState<Partial<BusinessSettings>>({});
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [resetInput, setResetInput] = useState('');

    useEffect(() => {
        if (settings) {
            setLocalSettings(settings);
            setIsDirty(false);
        }
    }, [settings]);

    const handleChange = (key: keyof BusinessSettings, value: any) => {
        setLocalSettings(prev => ({ ...prev, [key]: value }));
        setIsDirty(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onSave(localSettings);
            setIsDirty(false);
        } catch (error) {
            // Error is handled in AdminDashboard
        } finally {
            setIsSaving(false);
        }
    };

    const pageVariants = {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0, transition: { duration: 0.3 } },
        exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
    };

    if (!localSettings) return null;

    const inputClasses = `rounded-xl px-4 py-2.5 transition-all focus:ring-2 focus:ring-orange-500 focus:border-transparent ${
        isDarkMode
            ? 'bg-white/[0.05] border-white/10 text-white placeholder:text-zinc-500'
            : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400'
    }`;
    const cardClasses = `rounded-2xl border transition-colors duration-300 ${
        isDarkMode
            ? 'bg-white/[0.03] backdrop-blur-xl border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)]'
            : 'bg-white border-gray-200 shadow-sm'
    }`;

    return (
        <motion.div key="settings" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="h-[calc(100vh-140px)] flex flex-col pb-24 overflow-y-auto">
            <Tabs defaultValue="profile" className="w-full flex-1">
                <TabsList className={`w-full justify-start rounded-none border-b h-auto p-0 bg-transparent ${isDarkMode ? 'border-white/10' : 'border-gray-200'} mb-6 overflow-x-auto mx-auto max-w-4xl flex`}>
                    <TabsTrigger value="profile" className={`data-[state=active]:border-orange-500 data-[state=active]:text-orange-500 rounded-none border-b-2 border-transparent px-6 py-3 font-medium ${isDarkMode ? 'text-zinc-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}>Shop Profile</TabsTrigger>
                    <TabsTrigger value="config" className={`data-[state=active]:border-orange-500 data-[state=active]:text-orange-500 rounded-none border-b-2 border-transparent px-6 py-3 font-medium ${isDarkMode ? 'text-zinc-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}>System Config</TabsTrigger>
                    <TabsTrigger value="security" className={`data-[state=active]:border-orange-500 data-[state=active]:text-orange-500 rounded-none border-b-2 border-transparent px-6 py-3 font-medium ${isDarkMode ? 'text-zinc-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}>Security</TabsTrigger>
                    <TabsTrigger value="platform" className={`data-[state=active]:border-orange-500 data-[state=active]:text-orange-500 rounded-none border-b-2 border-transparent px-6 py-3 font-medium ${isDarkMode ? 'text-zinc-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}>Platform</TabsTrigger>
                </TabsList>

                {/* Tab 1: Shop Profile */}
                <TabsContent value="profile" className="space-y-6 max-w-4xl mx-auto w-full pb-8">
                    <div className={cardClasses}>
                        <div className="p-6 border-b border-white/5">
                            <h3 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Business Information</h3>
                            <p className={`text-sm ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>Update your business identity and registered details.</p>
                        </div>
                        <div className="p-6 grid gap-6 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label className={isDarkMode ? 'text-zinc-300' : 'text-gray-700'}>Business Name</Label>
                                <Input value={localSettings.businessName || ''} onChange={(e) => handleChange('businessName', e.target.value)} className={inputClasses} />
                            </div>
                            <div className="space-y-2">
                                <Label className={isDarkMode ? 'text-zinc-300' : 'text-gray-700'}>Business Registration No. (DTI/SEC)</Label>
                                <Input value={localSettings.businessRegistrationNo || ''} onChange={(e) => handleChange('businessRegistrationNo', e.target.value)} className={inputClasses} placeholder="e.g. DTI-1234567" />
                            </div>
                            <div className="space-y-2">
                                <Label className={isDarkMode ? 'text-zinc-300' : 'text-gray-700'}>Tax ID / VAT Number</Label>
                                <Input value={localSettings.taxId || ''} onChange={(e) => handleChange('taxId', e.target.value)} className={inputClasses} placeholder="e.g. 123-456-789-000" />
                            </div>
                            <div className="space-y-2">
                                <Label className={isDarkMode ? 'text-zinc-300' : 'text-gray-700'}>Contact Number</Label>
                                <Input value={localSettings.phoneNumber || ''} onChange={(e) => handleChange('phoneNumber', e.target.value)} className={inputClasses} />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label className={isDarkMode ? 'text-zinc-300' : 'text-gray-700'}>Business Address</Label>
                                <Input value={localSettings.address || ''} onChange={(e) => handleChange('address', e.target.value)} className={inputClasses} />
                            </div>
                            <div className="space-y-2">
                                <Label className={isDarkMode ? 'text-zinc-300' : 'text-gray-700'}>Country</Label>
                                <Select value={localSettings.country || 'PH'} onValueChange={(v) => handleChange('country', v)}>
                                    <SelectTrigger className={inputClasses}>
                                        <SelectValue placeholder="Select Country" />
                                    </SelectTrigger>
                                    <SelectContent className={`rounded-xl ${isDarkMode ? 'bg-[#0B0E14] border-white/10 text-white' : 'bg-white border-gray-200'}`}>
                                        <SelectItem value="PH">Philippines</SelectItem>
                                        <SelectItem value="US">United States</SelectItem>
                                        <SelectItem value="UK">United Kingdom</SelectItem>
                                        <SelectItem value="AU">Australia</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2 md:col-span-2 mt-4">
                                <Label className={isDarkMode ? 'text-zinc-300' : 'text-gray-700'}>Logo Upload</Label>
                                <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${isDarkMode ? 'border-white/20 hover:border-orange-500 bg-white/5' : 'border-gray-300 hover:border-orange-500 bg-gray-50'}`}>
                                    <Input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            const r = new FileReader();
                                            r.onloadend = () => {
                                                if (typeof r.result === 'string') handleChange('logoUrl', r.result);
                                            };
                                            r.readAsDataURL(file);
                                        }}
                                        className="hidden"
                                        id="logo-upload"
                                    />
                                    <Label htmlFor="logo-upload" className="cursor-pointer flex flex-col items-center gap-4">
                                        {localSettings.logoUrl ? (
                                            <img src={localSettings.logoUrl} alt="Logo preview" className="h-20 w-20 rounded-xl object-contain bg-white shrink-0 shadow-sm" />
                                        ) : (
                                            <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500">Logo</div>
                                        )}
                                        <div className="text-sm">
                                            <span className="text-orange-500 font-semibold hover:underline">Click to upload</span> or drag and drop<br />SVG, PNG, JPG or GIF (max. 800x400px)
                                        </div>
                                    </Label>
                                    {localSettings.logoUrl && (
                                        <Button variant="ghost" size="sm" className="mt-4 text-red-500 hover:text-red-600 hover:bg-red-500/10" onClick={() => handleChange('logoUrl', '')}>
                                            Remove Logo
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </TabsContent>

                {/* Tab 2: System Config */}
                <TabsContent value="config" className="space-y-6 max-w-4xl mx-auto w-full pb-8">
                    {/* Localization */}
                    <div className={cardClasses}>
                        <div className="p-6 border-b border-white/5">
                            <h3 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Localization & Theme</h3>
                        </div>
                        <div className="p-6 grid gap-6 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label className={isDarkMode ? 'text-zinc-300' : 'text-gray-700'}>Default Currency</Label>
                                <Select value={localSettings.currency || 'PHP'} onValueChange={(v) => handleChange('currency', v)}>
                                    <SelectTrigger className={inputClasses}><SelectValue /></SelectTrigger>
                                    <SelectContent className={`rounded-xl z-[90] ${isDarkMode ? 'bg-[#0B0E14] border-white/10 text-white' : 'bg-white border-gray-200'}`}>
                                        <SelectItem value="PHP">PHP (₱)</SelectItem>
                                        <SelectItem value="USD">USD ($)</SelectItem>
                                        <SelectItem value="EUR">EUR (€)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className={isDarkMode ? 'text-zinc-300' : 'text-gray-700'}>Timezone</Label>
                                <Select value={localSettings.timezone || 'Asia/Manila'} onValueChange={(v) => handleChange('timezone', v)}>
                                    <SelectTrigger className={inputClasses}><SelectValue /></SelectTrigger>
                                    <SelectContent className={`rounded-xl z-[90] ${isDarkMode ? 'bg-[#0B0E14] border-white/10 text-white' : 'bg-white border-gray-200'}`}>
                                        <SelectItem value="Asia/Manila">Asia/Manila (PHT)</SelectItem>
                                        <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                                        <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className={isDarkMode ? 'text-zinc-300' : 'text-gray-700'}>Date Format</Label>
                                <Select value={localSettings.dateFormat || 'MM/DD/YYYY'} onValueChange={(v) => handleChange('dateFormat', v)}>
                                    <SelectTrigger className={inputClasses}><SelectValue /></SelectTrigger>
                                    <SelectContent className={`rounded-xl z-[90] ${isDarkMode ? 'bg-[#0B0E14] border-white/10 text-white' : 'bg-white border-gray-200'}`}>
                                        <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (12/31/2026)</SelectItem>
                                        <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (31/12/2026)</SelectItem>
                                        <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (2026-12-31)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className={isDarkMode ? 'text-zinc-300' : 'text-gray-700'}>Time Format</Label>
                                <Select value={localSettings.timeFormat || '12h'} onValueChange={(v) => handleChange('timeFormat', v)}>
                                    <SelectTrigger className={inputClasses}><SelectValue /></SelectTrigger>
                                    <SelectContent className={`rounded-xl z-[90] ${isDarkMode ? 'bg-[#0B0E14] border-white/10 text-white' : 'bg-white border-gray-200'}`}>
                                        <SelectItem value="12h">12-hour (1:00 PM)</SelectItem>
                                        <SelectItem value="24h">24-hour (13:00)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className={isDarkMode ? 'text-zinc-300' : 'text-gray-700'}>Tax Rate (%)</Label>
                                <Input type="number" value={localSettings.taxRate || 0} onChange={(e) => handleChange('taxRate', parseFloat(e.target.value))} className={inputClasses} />
                            </div>
                            <div className="space-y-3 flex flex-col justify-center">
                                <Label className={isDarkMode ? 'text-zinc-300' : 'text-gray-700'}>Dark Mode</Label>
                                <div className="flex items-center gap-3">
                                    <ThemeToggle />
                                    <span className={`text-sm ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>Toggle system appearance</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Operations */}
                    <div className={cardClasses}>
                        <div className="p-6 border-b border-white/5">
                            <h3 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Operations</h3>
                        </div>
                        <div className="p-6 space-y-8">
                            <div className="space-y-4">
                                <div className="flex justify-between">
                                    <Label className={isDarkMode ? 'text-zinc-300' : 'text-gray-700'}>Membership Discount</Label>
                                    <span className="text-orange-500 font-bold">{localSettings.membershipDiscount || 0}%</span>
                                </div>
                                <Slider 
                                    value={[localSettings.membershipDiscount || 10]} max={100} step={1} 
                                    onValueChange={(v) => handleChange('membershipDiscount', v[0])} 
                                />
                                <p className="text-xs text-zinc-500">Percentage applied to members for all services.</p>
                            </div>
                            <div className="space-y-4">
                                <div className="flex justify-between">
                                    <Label className={isDarkMode ? 'text-zinc-300' : 'text-gray-700'}>Daily Service Capacity</Label>
                                    <span className="text-orange-500 font-bold">{localSettings.serviceCapacity || 0} Vehicles</span>
                                </div>
                                <Slider 
                                    value={[localSettings.serviceCapacity || 10]} max={50} step={1} 
                                    onValueChange={(v) => handleChange('serviceCapacity', v[0])} 
                                />
                            </div>
                            <div className="space-y-4">
                                <div className="flex justify-between">
                                    <Label className={isDarkMode ? 'text-zinc-300' : 'text-gray-700'}>Low Stock Warning Threshold</Label>
                                    <span className="text-orange-500 font-bold">{localSettings.inventoryThreshold || 0} Units</span>
                                </div>
                                <Slider 
                                    value={[localSettings.inventoryThreshold || 5]} max={100} step={1} 
                                    onValueChange={(v) => handleChange('inventoryThreshold', v[0])} 
                                />
                            </div>
                            <div className="space-y-4">
                                <div className="flex justify-between">
                                    <Label className={isDarkMode ? 'text-zinc-300' : 'text-gray-700'}>Audit Log Retention</Label>
                                    <span className="text-orange-500 font-bold">{localSettings.auditLogRetention || 30} Days</span>
                                </div>
                                <Slider 
                                    value={[localSettings.auditLogRetention || 30]} max={365} step={5} 
                                    onValueChange={(v) => handleChange('auditLogRetention', v[0])} 
                                />
                            </div>
                        </div>
                    </div>
                </TabsContent>

                {/* Tab 3: Security */}
                <TabsContent value="security" className="space-y-6 max-w-4xl mx-auto w-full pb-8">
                    <div className={cardClasses}>
                        <div className="p-6 border-b border-white/5">
                            <h3 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Access & Authentication</h3>
                        </div>
                        <div className="p-6 space-y-6 flex flex-col">
                            <div className="flex items-center justify-between border-b pb-4 border-white/5">
                                <div className="space-y-1">
                                    <Label className={`text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Two-Factor Authentication (2FA)</Label>
                                    <p className={`text-sm ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>Require admins and staff to enter a temporary code.</p>
                                </div>
                                <Switch checked={localSettings.twoFactorAuth || false} onCheckedChange={(v) => handleChange('twoFactorAuth', v)} />
                            </div>
                            <div className="flex items-center justify-between border-b pb-4 border-white/5">
                                <div className="space-y-1">
                                    <Label className={`text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Email Verification on Signup</Label>
                                    <p className={`text-sm ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>Require users to verify email before granting access.</p>
                                </div>
                                <Switch checked={localSettings.emailVerificationOnSignup || false} onCheckedChange={(v) => handleChange('emailVerificationOnSignup', v)} />
                            </div>
                            <div className="flex items-center justify-between border-b pb-4 border-white/5">
                                <div className="space-y-1">
                                    <Label className={`text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Login Attempt Limits</Label>
                                    <p className={`text-sm ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>Lock IP after 5 failed login attempts in 15 minutes.</p>
                                </div>
                                <Switch checked={localSettings.loginAttemptLimit || false} onCheckedChange={(v) => handleChange('loginAttemptLimit', v)} />
                            </div>
                            <div className="flex items-center justify-between pt-2">
                                <div className="space-y-1 w-1/2">
                                    <Label className={`text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Session Timeout</Label>
                                    <p className={`text-sm ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>Auto-logout inactive users.</p>
                                </div>
                                <Select value={localSettings.sessionTimeout || '120'} onValueChange={(v) => handleChange('sessionTimeout', v)}>
                                    <SelectTrigger className={`w-48 ${inputClasses}`}><SelectValue /></SelectTrigger>
                                    <SelectContent className={`rounded-xl z-[90] ${isDarkMode ? 'bg-[#0B0E14] border-white/10 text-white' : 'bg-white border-gray-200'}`}>
                                        <SelectItem value="15">15 Minutes</SelectItem>
                                        <SelectItem value="30">30 Minutes</SelectItem>
                                        <SelectItem value="60">1 Hour</SelectItem>
                                        <SelectItem value="120">2 Hours</SelectItem>
                                        <SelectItem value="never">Never</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    <div className={cardClasses}>
                        <div className="p-6 border-b border-white/5">
                            <h3 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Alerts</h3>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="flex items-center justify-between border-b pb-4 border-white/5">
                                <div className="space-y-1">
                                    <Label className={`text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Email Alerts</Label>
                                    <p className={`text-sm ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>Send critical alerts via email.</p>
                                </div>
                                <Switch checked={localSettings.emailAlerts || false} onCheckedChange={(v) => handleChange('emailAlerts', v)} />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <Label className={`text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>SMS Alerts</Label>
                                    <p className={`text-sm ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>Send critical security alerts via SMS.</p>
                                </div>
                                <Switch checked={localSettings.smsAlerts || false} onCheckedChange={(v) => handleChange('smsAlerts', v)} />
                            </div>
                        </div>
                    </div>
                </TabsContent>

                {/* Tab 4: Platform */}
                <TabsContent value="platform" className="space-y-6 max-w-4xl mx-auto w-full pb-8">
                    <div className={cardClasses}>
                        <div className="p-6 border-b border-white/5">
                            <h3 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Platform Operations</h3>
                        </div>
                        <div className="p-6 grid gap-4 grid-cols-1 md:grid-cols-2">
                            <div className={`p-5 rounded-xl border ${isDarkMode ? 'bg-white/[0.02] border-white/5' : 'bg-gray-50 border-gray-100'} flex flex-col justify-between`}>
                                <div className="mb-4">
                                    <Download className="w-5 h-5 text-orange-500 mb-2" />
                                    <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Export Data</h4>
                                    <p className={`text-xs mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>Export all customers, inventory, and bookings to a CSV file.</p>
                                </div>
                                <Button variant="outline" className={`w-full ${isDarkMode ? 'border-white/10 hover:bg-white/5 text-white' : ''}`} onClick={() => { if(onExportData) onExportData(); else toast.success('Export started.'); }}>Export Data</Button>
                            </div>
                            <div className={`p-5 rounded-xl border ${isDarkMode ? 'bg-white/[0.02] border-white/5' : 'bg-gray-50 border-gray-100'} flex flex-col justify-between`}>
                                <div className="mb-4">
                                    <Database className="w-5 h-5 text-orange-500 mb-2" />
                                    <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Backup Database</h4>
                                    <p className={`text-xs mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>Generate and download a full snapshot of the MongoDB database.</p>
                                </div>
                                <Button variant="outline" className={`w-full ${isDarkMode ? 'border-white/10 hover:bg-white/5 text-white' : ''}`} onClick={() => { if(onBackupDB) onBackupDB(); else toast.success('Backup initiated.'); }}>Backup Now</Button>
                            </div>
                            <div className={`p-5 rounded-xl border ${isDarkMode ? 'bg-white/[0.02] border-white/5' : 'bg-gray-50 border-gray-100'} flex flex-col justify-between`}>
                                <div className="mb-4">
                                    <ShieldAlert className="w-5 h-5 text-orange-500 mb-2" />
                                    <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Clear Cache</h4>
                                    <p className={`text-xs mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>Clear system application caches and temporary data.</p>
                                </div>
                                <Button variant="outline" className={`w-full ${isDarkMode ? 'border-white/10 hover:bg-white/5 text-white' : ''}`} onClick={() => { if(onClearCache) onClearCache(); else toast.success('Cache cleared.'); }}>Clear Cache</Button>
                            </div>
                            <div className={`p-5 rounded-xl border ${isDarkMode ? 'bg-white/[0.02] border-white/5' : 'bg-gray-50 border-gray-100'} flex flex-col justify-between`}>
                                <div className="mb-4">
                                    <ShieldAlert className="w-5 h-5 text-orange-500 mb-2" />
                                    <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Audit Logs</h4>
                                    <p className={`text-xs mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>View the immutable activity stream for all platform actions.</p>
                                </div>
                                <Button variant="outline" className={`w-full ${isDarkMode ? 'border-white/10 hover:bg-white/5 text-white' : ''}`} onClick={() => toast.success('Opening audit logs...')}>View Logs</Button>
                            </div>
                        </div>
                        <div className={`rounded-b-2xl border-t ${isDarkMode ? 'bg-red-500/5 border-red-500/20' : 'bg-red-50 border-red-200'}`}>
                            <div className="p-6 border-b border-red-500/10 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-red-500" />
                                <h3 className="text-lg font-semibold text-red-500">Danger Zone</h3>
                            </div>
                            <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div>
                                    <p className={`text-sm mb-2 font-medium ${isDarkMode ? 'text-zinc-300' : 'text-gray-700'}`}>
                                        Reset System Configuration
                                    </p>
                                    <p className={`text-xs max-w-sm ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>
                                        Completely reset the platform settings to default. Erases all custom configuration.
                                        Type <strong>RESET</strong> below to confirm.
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Input 
                                        className={`w-36 ${isDarkMode ? 'bg-black/20 border-red-500/20 text-white placeholder:text-zinc-500' : 'bg-white border-red-200'}`} 
                                        placeholder="Type RESET"
                                        value={resetInput}
                                        onChange={(e) => setResetInput(e.target.value)}
                                    />
                                    <Button 
                                        disabled={resetInput !== 'RESET'} 
                                        className="bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20"
                                        onClick={() => {
                                            if(onResetSystem) {
                                                onResetSystem();
                                            } else {
                                                toast.error("System reset triggered!");
                                            }
                                            setResetInput('');
                                        }}
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" /> Reset
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>

            {/* Footer Unsaved Changes Indicator */}
            {isDirty && (
                <div className={`fixed bottom-0 md:left-[240px] left-0 right-0 z-50 py-4 px-6 md:px-12 border-t shadow-[0_-10px_40px_rgba(0,0,0,0.2)] flex flex-col sm:flex-row items-center gap-4 justify-between transition-all duration-300 ${isDarkMode ? 'bg-[#0B0E14]/90 backdrop-blur-xl border-white/10' : 'bg-white/95 backdrop-blur-xl border-gray-200'}`}>
                    <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse ring-4 ring-orange-500/20"></div>
                        <span className={`text-sm font-medium ${isDarkMode ? 'text-zinc-300' : 'text-gray-700'}`}>You have unsaved configuration changes</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" className={isDarkMode ? 'text-zinc-400 hover:text-white hover:bg-white/5' : ''} onClick={() => { setLocalSettings(settings); setIsDirty(false); }}>Discard</Button>
                        <Button onClick={handleSave} disabled={isSaving} className="bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20">
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </div>
                </div>
            )}
        </motion.div>
    );
};
