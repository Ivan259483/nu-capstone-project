import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
    User, Settings, Wrench, Shield, Sun, Moon, Volume2, Bell, Monitor, Camera,
    ChevronDown, Lock, LogOut, Droplets, Gauge, Beaker, AlertTriangle, CheckCircle, Eye, EyeOff
} from 'lucide-react';
import { btnHover, btnTap, pageVariants } from './SharedAnimations';
import { toast } from 'sonner';
import { UserService } from '@/lib/user-service';

interface SettingsTabProps {
    user: any;
    roleLabel: string;
    notifSound: boolean;
    handleToggleNotifSound: () => void;
    sidebarCollapsed: boolean;
    toggleSidebar: () => void;
}

type SettingsSection = 'profile' | 'preferences' | 'detailing' | 'security';

const sectionNav: { id: SettingsSection; label: string; icon: any }[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'preferences', label: 'Preferences', icon: Settings },
    { id: 'detailing', label: 'Detailing', icon: Wrench },
    { id: 'security', label: 'Security', icon: Shield },
];

// Inline style system
const S = {
    label: { fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 700 as const, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#74777d', marginBottom: 6 },
    input: { width: '100%', padding: '10px 14px', background: '#f7f9fb', border: '1px solid #e0e3e5', borderRadius: 10, fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500 as const, color: '#191c1e', outline: 'none' },
    card: { background: '#fff', borderRadius: 16, padding: '28px 32px', boxShadow: '0 1px 4px rgba(6,39,75,0.05)', marginBottom: 24 },
    sectionTitle: { fontFamily: "'Manrope', sans-serif", fontSize: 20, fontWeight: 800 as const, color: '#06274b', margin: 0, display: 'flex', alignItems: 'center', gap: 10 },
    desc: { fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#74777d', margin: 0, lineHeight: 1.5 },
    row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid #f2f4f6' },
    badge: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 9999, fontSize: 10, fontWeight: 700 as const, fontFamily: "'Inter', sans-serif", textTransform: 'uppercase' as const, letterSpacing: '0.06em' },
};

export function SettingsTab({
    user,
    roleLabel,
    notifSound,
    handleToggleNotifSound,
    sidebarCollapsed,
    toggleSidebar
}: SettingsTabProps) {
    const [activeSection, setActiveSection] = useState<SettingsSection>('profile');
    const profileInputRef = useRef<HTMLInputElement>(null);

    // Profile state
    const [fullName, setFullName] = useState(user?.name || '');
    const [title, setTitle] = useState('Detail Specialist');
    const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
    const [email, setEmail] = useState(user?.email || '');

    // Preferences state
    const [theme, setTheme] = useState<'light' | 'dark'>('light');
    const [defaultView, setDefaultView] = useState('Dashboard');

    // Detailing state
    const [measureUnit, setMeasureUnit] = useState<'oz' | 'ml'>('oz');
    const [buffingSpeed, setBuffingSpeed] = useState('Medium (1500 - 2000)');
    const [sealantChoice, setSealantChoice] = useState('Carnauba Gold Paste');
    const [autoWater, setAutoWater] = useState(true);
    const [stageAlerts, setStageAlerts] = useState(true);
    const [lowChemAlerts, setLowChemAlerts] = useState(true);

    // Security state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [twoFA, setTwoFA] = useState(false);
    const [changingPassword, setChangingPassword] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Dirty tracking
    const [isDirty, setIsDirty] = useState(false);

    // Load profile photo from localStorage
    useEffect(() => {
        const savedPhoto = localStorage.getItem('detailer_profile_photo');
        if (savedPhoto) setProfilePhoto(savedPhoto);
    }, []);

    const handleProfilePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 250;
                const MAX_HEIGHT = 250;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    try {
                        setProfilePhoto(dataUrl);
                        if (!isDirty) setIsDirty(true);
                    } catch (err) {
                        console.error(err);
                        toast.error('Failed to preview image.');
                    }
                }
            };
            if (event.target?.result) {
                img.src = event.target.result as string;
            }
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    useEffect(() => {
        // Read from the detailer-scoped key (never affects the public site)
        const detailerTheme = localStorage.getItem('autospf_detailer_theme');
        if (detailerTheme === 'light' || detailerTheme === 'dark') setTheme(detailerTheme);

        // Load persisted detailing settings
        try {
            const saved = localStorage.getItem('detailer_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                // Only use detailer_settings.theme if detailer key is absent
                if (!detailerTheme && parsed.theme) setTheme(parsed.theme);
                if (parsed.defaultView) setDefaultView(parsed.defaultView);
                if (parsed.measureUnit) setMeasureUnit(parsed.measureUnit);
                if (parsed.buffingSpeed) setBuffingSpeed(parsed.buffingSpeed);
                if (parsed.sealantChoice) setSealantChoice(parsed.sealantChoice);
                if (parsed.autoWater !== undefined) setAutoWater(parsed.autoWater);
                if (parsed.stageAlerts !== undefined) setStageAlerts(parsed.stageAlerts);
                if (parsed.lowChemAlerts !== undefined) setLowChemAlerts(parsed.lowChemAlerts);
                if (parsed.title) setTitle(parsed.title);
            }
        } catch { /* ignore */ }
    }, []);

    const handleSave = () => {
        localStorage.setItem('detailer_settings', JSON.stringify({
            theme, defaultView, measureUnit, buffingSpeed, sealantChoice, autoWater, stageAlerts, lowChemAlerts, title
        }));

        // Write to the DETAILER-SCOPED key only — never touch autospf_global_theme
        // or document.documentElement, which would affect the public marketing site.
        localStorage.setItem('autospf_detailer_theme', theme);
        window.dispatchEvent(new Event('autospf-detailer-theme-change'));

        if (profilePhoto) {
            try {
                localStorage.setItem('detailer_profile_photo', profilePhoto);
                window.dispatchEvent(new Event('profile-photo-updated'));
            } catch (err) {
                console.error(err);
                toast.error('Photo exceeded storage cap while saving. Try clearing cache.');
                return;
            }
        }

        setIsDirty(false);
        toast.success('Settings saved successfully.');
    };

    const handleDiscard = () => {
        setIsDirty(false);
        try {
            const savedPhoto = localStorage.getItem('detailer_profile_photo');
            if (savedPhoto) setProfilePhoto(savedPhoto);

            const savedSettings = localStorage.getItem('detailer_settings');
            if (savedSettings) {
                const parsed = JSON.parse(savedSettings);
                if (parsed.theme) setTheme(parsed.theme);
                if (parsed.defaultView) setDefaultView(parsed.defaultView);
                if (parsed.measureUnit) setMeasureUnit(parsed.measureUnit);
                if (parsed.buffingSpeed) setBuffingSpeed(parsed.buffingSpeed);
                if (parsed.sealantChoice) setSealantChoice(parsed.sealantChoice);
                if (parsed.autoWater !== undefined) setAutoWater(parsed.autoWater);
                if (parsed.stageAlerts !== undefined) setStageAlerts(parsed.stageAlerts);
                if (parsed.lowChemAlerts !== undefined) setLowChemAlerts(parsed.lowChemAlerts);
                if (parsed.title) setTitle(parsed.title);
            }
        } catch { /* ignore */ }

        toast('Changes discarded.');
    };

    const handleChangePassword = async () => {
        if (!currentPassword || !newPassword) {
            toast.error('Please fill in both fields.');
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error('Passwords do not match.');
            return;
        }
        if (newPassword.length < 6) {
            toast.error('Password must be at least 6 characters.');
            return;
        }
        setChangingPassword(true);
        try {
            await UserService.changePassword(currentPassword, newPassword);
            toast.success('Password changed successfully!');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            console.error('Change password error:', err.response?.data || err);
            toast.error(err?.response?.data?.message || err?.message || 'Failed to change password.');
        } finally {
            setChangingPassword(false);
        }
    };

    const markDirty = () => { if (!isDirty) setIsDirty(true); };

    // Apply theme immediately when toggled (before Save)
    // Uses the detailer-scoped key — does NOT touch document.documentElement
    const applyThemeNow = (t: 'light' | 'dark') => {
        setTheme(t);
        markDirty();
        localStorage.setItem('autospf_detailer_theme', t);
        window.dispatchEvent(new Event('autospf-detailer-theme-change'));
    };

    // Toggle component
    const Toggle = ({ active, onToggle }: { active: boolean; onToggle: () => void }) => (
        <button onClick={onToggle} style={{
            width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
            background: active ? 'linear-gradient(135deg, #06274b, #213d62)' : '#d1d5db',
            position: 'relative', transition: 'background 0.2s ease', flexShrink: 0
        }}>
            <span style={{
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 3, left: active ? 23 : 3,
                transition: 'left 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
            }} />
        </button>
    );

    // Select dropdown component
    const SelectField = ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) => (
        <div style={{ position: 'relative' }}>
            <select value={value} onChange={e => { onChange(e.target.value); markDirty(); }} style={{
                ...S.input, appearance: 'none', paddingRight: 36, cursor: 'pointer', background: '#f7f9fb'
            }}>
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <ChevronDown style={{ width: 14, height: 14, color: '#74777d', position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        </div>
    );

    return (
        <motion.div key="settings" variants={pageVariants} initial="initial" animate="animate" exit="exit">
            {/* Page Header */}
            <div style={{ marginBottom: 32 }}>
                <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: '2rem', fontWeight: 800, color: '#06274b', margin: 0, letterSpacing: '-0.5px' }}>
                    Account Settings
                </h1>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: '#74777d', margin: '4px 0 0' }}>
                    Manage your technician profile and application preferences.
                </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 32, alignItems: 'flex-start' }}>
                {/* LEFT — Section Navigation */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'sticky', top: 24 }}>
                    {sectionNav.map(nav => {
                        const Icon = nav.icon;
                        const isActive = activeSection === nav.id;
                        return (
                            <motion.button
                                key={nav.id}
                                whileHover={{ x: 2 }}
                                onClick={() => setActiveSection(nav.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                                    background: isActive ? '#06274b' : 'transparent',
                                    color: isActive ? '#fff' : '#43474c',
                                    border: 'none', borderRadius: 10, cursor: 'pointer',
                                    fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: isActive ? 700 : 500,
                                    transition: 'all 0.15s ease', textAlign: 'left'
                                }}
                            >
                                <Icon style={{ width: 16, height: 16 }} />
                                {nav.label}
                            </motion.button>
                        );
                    })}
                </div>

                {/* RIGHT — Section Content */}
                <div>
                    {/* ─── PROFILE ─── */}
                    {activeSection === 'profile' && (
                        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                            <div style={S.card}>
                                <h2 style={S.sectionTitle}>
                                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(6,39,75,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <User style={{ width: 14, height: 14, color: '#06274b' }} />
                                    </div>
                                    Profile Information
                                </h2>

                                <input ref={profileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleProfilePhotoChange} />
                                <div style={{ display: 'flex', gap: 24, marginTop: 24, alignItems: 'flex-start' }}>
                                    {/* Avatar — Clickable to upload */}
                                    <div
                                        onClick={() => profileInputRef.current?.click()}
                                        style={{
                                            width: 80, height: 80, borderRadius: 12,
                                            ...(profilePhoto 
                                                ? { backgroundImage: `url("${profilePhoto}")`, backgroundPosition: 'center', backgroundSize: 'cover', backgroundRepeat: 'no-repeat' } 
                                                : { background: 'linear-gradient(135deg, #06274b, #213d62)' }),
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                                            fontFamily: "'Manrope', sans-serif", fontSize: 28, fontWeight: 800, flexShrink: 0,
                                            cursor: 'pointer', position: 'relative', overflow: 'hidden'
                                        }}
                                    >
                                        {!profilePhoto && (user?.name || 'S').charAt(0).toUpperCase()}
                                        {/* Hover overlay */}
                                        <div style={{
                                            position: 'absolute', inset: 0, background: 'rgba(6,39,75,0.5)', opacity: 0,
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                            transition: 'opacity 0.2s ease', borderRadius: 12, gap: 2
                                        }}
                                            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                                            onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                                        >
                                            <Camera style={{ width: 18, height: 18, color: '#fff' }} />
                                            <span style={{ fontSize: 8, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Change</span>
                                        </div>
                                    </div>

                                    {/* Form Fields */}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                                            <div>
                                                <p style={S.label}>Full Name</p>
                                                <input value={fullName} readOnly style={{ ...S.input, color: '#74777d', cursor: 'not-allowed', background: '#f7f9fb' }} />
                                            </div>
                                            <div>
                                                <p style={S.label}>Title</p>
                                                <input value={title} readOnly style={{ ...S.input, color: '#74777d', cursor: 'not-allowed', background: '#f7f9fb' }} />
                                            </div>
                                        </div>

                                        <div style={{ marginBottom: 16 }}>
                                            <p style={S.label}>Certifications</p>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                <span style={{ ...S.badge, background: '#06274b', color: '#fff' }}>
                                                    <CheckCircle style={{ width: 10, height: 10 }} /> {roleLabel}
                                                </span>
                                                <span style={{ ...S.badge, background: 'rgba(6,39,75,0.08)', color: '#06274b' }}>
                                                    <Shield style={{ width: 10, height: 10 }} /> Certified Detailer
                                                </span>
                                            </div>
                                        </div>

                                        <div>
                                            <p style={S.label}>Email Address</p>
                                            <input value={email} readOnly style={{ ...S.input, color: '#74777d', cursor: 'not-allowed' }} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ─── PREFERENCES ─── */}
                    {activeSection === 'preferences' && (
                        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                            <div style={S.card}>
                                <h2 style={{ ...S.sectionTitle, marginBottom: 8 }}>App Preferences</h2>

                                {/* Visual Mode */}
                                <div style={S.row}>
                                    <div>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, color: '#191c1e', margin: 0 }}>Visual Mode</p>
                                        <p style={S.desc}>Switch between light and dark interface themes.</p>
                                    </div>
                                    <div style={{ display: 'flex', background: '#f2f4f6', borderRadius: 10, overflow: 'hidden' }}>
                                        <button onClick={() => applyThemeNow('light')} style={{
                                            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: 'none', cursor: 'pointer',
                                            fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600,
                                            background: theme === 'light' ? '#06274b' : 'transparent',
                                            color: theme === 'light' ? '#fff' : '#43474c',
                                            borderRadius: theme === 'light' ? 8 : 0, transition: 'all 0.15s'
                                        }}>
                                            <Sun style={{ width: 14, height: 14 }} /> Light
                                        </button>
                                        <button onClick={() => applyThemeNow('dark')} style={{
                                            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: 'none', cursor: 'pointer',
                                            fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600,
                                            background: theme === 'dark' ? '#06274b' : 'transparent',
                                            color: theme === 'dark' ? '#fff' : '#43474c',
                                            borderRadius: theme === 'dark' ? 8 : 0, transition: 'all 0.15s'
                                        }}>
                                            <Moon style={{ width: 14, height: 14 }} /> Dark
                                        </button>
                                    </div>
                                </div>

                                {/* Default View */}
                                <div style={S.row}>
                                    <div>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, color: '#191c1e', margin: 0 }}>Default View</p>
                                        <p style={S.desc}>Select the screen you see upon login.</p>
                                    </div>
                                    <div style={{ width: 180 }}>
                                        <SelectField value={defaultView} onChange={(v) => { setDefaultView(v); markDirty(); }} options={['Dashboard', 'Queue', 'Inventory', 'History']} />
                                    </div>
                                </div>

                                {/* Notification Sounds */}
                                <div style={{ ...S.row, borderBottom: 'none' }}>
                                    <div>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, color: '#191c1e', margin: 0 }}>Notification Sounds</p>
                                        <p style={S.desc}>Play audio alerts for new job assignments.</p>
                                    </div>
                                    <Toggle active={notifSound} onToggle={handleToggleNotifSound} />
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ─── DETAILING WORKFLOW ─── */}
                    {activeSection === 'detailing' && (
                        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                            <div style={S.card}>
                                <h2 style={{ ...S.sectionTitle, marginBottom: 24 }}>
                                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(6,39,75,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Wrench style={{ width: 14, height: 14, color: '#06274b' }} />
                                    </div>
                                    Detailing Workflow & Defaults
                                </h2>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
                                    {/* Left Column */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                        {/* Measurement System */}
                                        <div>
                                            <p style={S.label}>Default Measurement System</p>
                                            <div style={{ display: 'flex', background: '#f2f4f6', borderRadius: 10, overflow: 'hidden' }}>
                                                <button onClick={() => { setMeasureUnit('oz'); markDirty(); }} style={{
                                                    flex: 1, padding: '10px 16px', border: 'none', cursor: 'pointer',
                                                    fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700,
                                                    background: measureUnit === 'oz' ? '#06274b' : 'transparent',
                                                    color: measureUnit === 'oz' ? '#fff' : '#43474c',
                                                    borderRadius: measureUnit === 'oz' ? 8 : 0, transition: 'all 0.15s'
                                                }}>
                                                    Ounces (oz)
                                                </button>
                                                <button onClick={() => { setMeasureUnit('ml'); markDirty(); }} style={{
                                                    flex: 1, padding: '10px 16px', border: 'none', cursor: 'pointer',
                                                    fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700,
                                                    background: measureUnit === 'ml' ? '#06274b' : 'transparent',
                                                    color: measureUnit === 'ml' ? '#fff' : '#43474c',
                                                    borderRadius: measureUnit === 'ml' ? 8 : 0, transition: 'all 0.15s'
                                                }}>
                                                    Milliliters (ml)
                                                </button>
                                            </div>
                                        </div>

                                        {/* Buffing Speed */}
                                        <div>
                                            <p style={S.label}>Buffing Speed Preference (RPM)</p>
                                            <SelectField value={buffingSpeed} onChange={setBuffingSpeed} options={[
                                                'Low (800 - 1200)',
                                                'Medium (1500 - 2000)',
                                                'High (2500 - 3500)',
                                                'Variable'
                                            ]} />
                                        </div>

                                        {/* Primary Sealant */}
                                        <div>
                                            <p style={S.label}>Primary Sealant Choice</p>
                                            <SelectField value={sealantChoice} onChange={setSealantChoice} options={[
                                                'Carnauba Gold Paste',
                                                'Ceramic Pro 9H',
                                                'Graphene Coating',
                                                'Polymer Sealant',
                                                'Hybrid Wax'
                                            ]} />
                                        </div>
                                    </div>

                                    {/* Right Column — Automation */}
                                    <div>
                                        <p style={S.label}>Automation & Monitoring</p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 4 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <Droplets style={{ width: 16, height: 16, color: '#06274b' }} />
                                                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: '#191c1e' }}>Auto-log water usage</span>
                                                </div>
                                                <Toggle active={autoWater} onToggle={() => { setAutoWater(!autoWater); markDirty(); }} />
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <Bell style={{ width: 16, height: 16, color: '#06274b' }} />
                                                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: '#191c1e' }}>Stage completion alerts</span>
                                                </div>
                                                <Toggle active={stageAlerts} onToggle={() => { setStageAlerts(!stageAlerts); markDirty(); }} />
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <AlertTriangle style={{ width: 16, height: 16, color: '#06274b' }} />
                                                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: '#191c1e' }}>Low chemical notifications</span>
                                                </div>
                                                <Toggle active={lowChemAlerts} onToggle={() => { setLowChemAlerts(!lowChemAlerts); markDirty(); }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ─── SECURITY & PRIVACY ─── */}
                    {activeSection === 'security' && (
                        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                            <div style={S.card}>
                                <h2 style={{ ...S.sectionTitle, marginBottom: 24 }}>
                                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(6,39,75,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Shield style={{ width: 14, height: 14, color: '#06274b' }} />
                                    </div>
                                    Security & Privacy
                                </h2>

                                {/* Change Password */}
                                <div style={{ ...S.row, flexDirection: 'column', alignItems: 'stretch' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <div>
                                            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, color: '#191c1e', margin: 0 }}>Account Password</p>
                                            <p style={S.desc}>Update your password to keep your account secure.</p>
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, alignItems: 'flex-end' }}>
                                        <div style={{ position: 'relative' }}>
                                            <p style={S.label}>Current Password</p>
                                            <input type={showPassword ? "text" : "password"} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="••••••••" style={{ ...S.input, paddingRight: 36 }} />
                                            <button onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: 32, background: 'none', border: 'none', cursor: 'pointer', color: '#74777d' }}>
                                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                        <div style={{ position: 'relative' }}>
                                            <p style={S.label}>New Password</p>
                                            <input type={showPassword ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••" style={{ ...S.input, paddingRight: 36 }} />
                                            <button onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: 32, background: 'none', border: 'none', cursor: 'pointer', color: '#74777d' }}>
                                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                        <div style={{ position: 'relative' }}>
                                            <p style={S.label}>Confirm</p>
                                            <input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" style={{ ...S.input, paddingRight: 36 }} />
                                            <button onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: 32, background: 'none', border: 'none', cursor: 'pointer', color: '#74777d' }}>
                                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                        <motion.button
                                            whileHover={btnHover} whileTap={btnTap}
                                            onClick={handleChangePassword}
                                            disabled={changingPassword}
                                            style={{
                                                padding: '10px 20px', background: '#06274b', color: '#fff', border: 'none',
                                                borderRadius: 10, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700,
                                                cursor: changingPassword ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0
                                            }}
                                        >
                                            {changingPassword ? 'Saving...' : 'Change Password'}
                                        </motion.button>
                                    </div>
                                </div>

                                {/* 2FA */}
                                <div style={S.row}>
                                    <div>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, color: '#191c1e', margin: 0 }}>Two-Factor Authentication (2FA)</p>
                                        <p style={S.desc}>Secure your account with an additional verification step.</p>
                                    </div>
                                    <Toggle active={twoFA} onToggle={() => { setTwoFA(!twoFA); toast.info(twoFA ? '2FA disabled' : '2FA enabled'); }} />
                                </div>

                                {/* Session */}
                                <div style={{ ...S.row, borderBottom: 'none' }}>
                                    <div>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, color: '#191c1e', margin: 0 }}>Session Management</p>
                                        <p style={S.desc}>Last login: {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                                    </div>
                                    <button onClick={() => toast.info('All other sessions have been logged out.')} style={{
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700, color: '#ba1a1a',
                                        textDecoration: 'underline', textUnderlineOffset: 4
                                    }}>
                                        Log out from all devices
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ─── SAVE / DISCARD BAR ─── */}
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 8 }}
                    >
                        <motion.button
                            whileHover={btnHover} whileTap={btnTap}
                            onClick={handleDiscard}
                            style={{
                                padding: '12px 28px', background: 'transparent', border: '1px solid #d1d5db',
                                borderRadius: 12, fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                                color: '#43474c', cursor: 'pointer'
                            }}
                        >
                            Discard Changes
                        </motion.button>
                        <motion.button
                            whileHover={btnHover} whileTap={btnTap}
                            onClick={handleSave}
                            style={{
                                padding: '12px 32px',
                                background: 'linear-gradient(135deg, #06274b, #213d62)',
                                border: 'none', borderRadius: 12,
                                fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700,
                                color: '#fff', cursor: 'pointer',
                                boxShadow: '0 4px 16px rgba(6,39,75,0.15)'
                            }}
                        >
                            Save Changes
                        </motion.button>
                    </motion.div>
                </div>
            </div>
        </motion.div>
    );
}
