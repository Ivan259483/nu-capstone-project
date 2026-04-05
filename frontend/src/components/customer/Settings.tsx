import React, { useState } from 'react';
import {
    User,
    Lock,
    Mail,
    Phone,
    Save,
    LogOut,
    Shield,
    Camera,
    Palette,
    Car
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { toast } from 'sonner';

import type { Vehicle } from '@/types';

interface SettingsProps {
    onUpdateProfile: (data: { name: string; email: string; phone?: string }) => Promise<void>;
    onChangePassword: (current: string, newPass: string) => Promise<void>;
    vehicles: Vehicle[];
    onAddVehicle: () => void;
    onEditVehicle: (v: Vehicle) => void;
    onDeleteVehicle: (id: string) => Promise<void>;
}

export const Settings: React.FC<SettingsProps> = ({
    onUpdateProfile,
    onChangePassword,
    vehicles,
    onAddVehicle,
    onEditVehicle,
    onDeleteVehicle
}) => {
    const { user, logout } = useAuth();

    // Profile State
    const [name, setName] = useState(user?.name || '');
    const [email, setEmail] = useState(user?.email || '');
    const [phone, setPhone] = useState(user?.phone || '');
    const [isSavingProfile, setIsSavingProfile] = useState(false);

    // Password State
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isChangingPassword, setIsChangingPassword] = useState(false);

    const handleProfileSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSavingProfile(true);
        try {
            await onUpdateProfile({ name, email, phone });
            toast.success('Profile updated successfully');
        } catch (error) {
            toast.error('Failed to update profile');
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            toast.error('New passwords do not match');
            return;
        }
        setIsChangingPassword(true);
        try {
            await onChangePassword(currentPassword, newPassword);
            toast.success('Password changed successfully');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            toast.error(error.message || 'Failed to change password');
        } finally {
            setIsChangingPassword(false);
        }
    };

    return (
        <div className="min-h-screen">
            <div className="max-w-5xl mx-auto p-6 md:p-10 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* ── Page Header ── */}
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-gold">
                        Account Settings
                    </h1>
                    <p className="text-[var(--text-secondary)] text-sm">
                        Manage your profile, security, and appearance preferences.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

                    {/* ── Profile Sidebar ── */}
                    <div className="md:col-span-1 space-y-4">
                        <div className="glass border-white/5 relative overflow-hidden group shadow-lg p-6 flex flex-col items-center text-center space-y-4 rounded-2xl">
                            <div className="absolute inset-0 bg-gradient-to-br from-[var(--gold-primary)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            
                            <div className="relative group/avatar cursor-pointer z-10">
                                <Avatar className="w-24 h-24 ring-2 ring-[var(--gold-primary)]/30 ring-offset-2 ring-offset-black">
                                    <AvatarImage src={user?.avatar || user?.photoURL} />
                                    <AvatarFallback className="bg-gradient-to-br from-[var(--gold-primary)] to-amber-600 text-black text-2xl font-bold">
                                        {user?.name?.charAt(0) || 'U'}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity backdrop-blur-sm">
                                    <Camera className="w-5 h-5 text-[var(--gold-primary)]" />
                                </div>
                            </div>
                            <div className="z-10 relative">
                                <h2 className="text-lg font-bold tracking-tight text-white tracking-wide">
                                    {user?.name}
                                </h2>
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">{user?.email}</p>
                            </div>
                            <Badge className="bg-gold-500/10 text-[var(--gold-primary)] border border-[var(--gold-primary)]/20 capitalize text-xs px-3 z-10 relative backdrop-blur-md">
                                {user?.role} Account
                            </Badge>
                        </div>

                        <Button
                            variant="ghost"
                            className="w-full justify-start gap-2 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl border border-transparent hover:border-red-500/30 transition-all duration-300"
                            onClick={logout}
                        >
                            <LogOut className="w-4 h-4" />
                            Sign Out
                        </Button>
                    </div>

                    {/* ── Forms Column ── */}
                    <div className="md:col-span-2 space-y-6">

                        {/* Personal Information Card */}
                        <div className="glass border-white/5 rounded-2xl relative overflow-hidden group shadow-lg">
                            <div className="px-6 py-5 border-b border-white/5">
                                <div className="flex items-center gap-2.5 relative z-10">
                                    <div className="w-8 h-8 rounded-lg bg-[var(--gold-primary)]/10 flex items-center justify-center border border-[var(--gold-primary)]/20 shadow-[0_0_10px_rgba(251,191,36,0.1)]">
                                        <User className="w-4 h-4 text-[var(--gold-primary)]" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold tracking-tight text-white">
                                            Personal Information
                                        </h3>
                                        <p className="text-xs text-[var(--text-secondary)]">Update your contact details.</p>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 relative z-10">
                                <form onSubmit={handleProfileSubmit} className="space-y-5">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="name" className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                                            Full Name
                                        </Label>
                                        <div className="relative">
                                            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                                            <Input
                                                id="name"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                className="pl-10 rounded-xl bg-black/40 border-white/10 text-white placeholder-[var(--text-secondary)] focus:ring-2 focus:ring-[var(--gold-primary)]/50 focus:border-[var(--gold-primary)]/50 transition-all backdrop-blur-md"
                                                placeholder="John Doe"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                                            Email Address
                                        </Label>
                                        <div className="relative">
                                            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                                            <Input
                                                id="email"
                                                type="email"
                                                value={email}
                                                disabled
                                                className="pl-10 rounded-xl bg-white/5 border-white/5 text-white/40 cursor-not-allowed backdrop-blur-md"
                                            />
                                        </div>
                                        <p className="text-xs text-[var(--text-secondary)]/50">Email cannot be changed directly.</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="phone" className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                                            Phone Number
                                        </Label>
                                        <div className="relative">
                                            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                                            <Input
                                                id="phone"
                                                type="tel"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                className="pl-10 rounded-xl bg-black/40 border-white/10 text-white placeholder-[var(--text-secondary)] focus:ring-2 focus:ring-[var(--gold-primary)]/50 focus:border-[var(--gold-primary)]/50 transition-all backdrop-blur-md"
                                                placeholder="+63 900 000 0000"
                                            />
                                        </div>
                                    </div>
                                    <div className="pt-1">
                                        <Button
                                            type="submit"
                                            disabled={isSavingProfile}
                                            className="bg-gradient-gold hover:opacity-90 text-black border-none rounded-xl px-6 shadow-[0_0_15px_rgba(251,191,36,0.3)] transition-all duration-300 font-bold"
                                        >
                                            <Save className="w-4 h-4 mr-2" />
                                            {isSavingProfile ? 'Saving...' : 'Save Changes'}
                                        </Button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        {/* Security Card */}
                        <div className="glass border-white/5 rounded-2xl relative overflow-hidden group shadow-lg">
                            <div className="px-6 py-5 border-b border-white/5">
                                <div className="flex items-center gap-2.5 relative z-10">
                                    <div className="w-8 h-8 rounded-lg bg-[var(--gold-primary)]/10 flex items-center justify-center border border-[var(--gold-primary)]/20 shadow-[0_0_10px_rgba(251,191,36,0.1)]">
                                        <Shield className="w-4 h-4 text-[var(--gold-primary)]" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold tracking-tight text-white">Security</h3>
                                        <p className="text-xs text-[var(--text-secondary)]">Manage your password and account security.</p>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 relative z-10">
                                <form onSubmit={handlePasswordSubmit} className="space-y-5">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="current-password" className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                                            Current Password
                                        </Label>
                                        <div className="relative">
                                            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                                            <Input
                                                id="current-password"
                                                type="password"
                                                value={currentPassword}
                                                onChange={(e) => setCurrentPassword(e.target.value)}
                                                className="pl-10 rounded-xl bg-black/40 border-white/10 text-white placeholder-[var(--text-secondary)] focus:ring-2 focus:ring-[var(--gold-primary)]/50 focus:border-[var(--gold-primary)]/50 transition-all backdrop-blur-md"
                                                placeholder="••••••••"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="new-password" className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                                                New Password
                                            </Label>
                                            <Input
                                                id="new-password"
                                                type="password"
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                className="rounded-xl bg-black/40 border-white/10 text-white placeholder-[var(--text-secondary)] focus:ring-2 focus:ring-[var(--gold-primary)]/50 focus:border-[var(--gold-primary)]/50 transition-all backdrop-blur-md"
                                                placeholder="••••••••"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="confirm-password" className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                                                Confirm Password
                                            </Label>
                                            <Input
                                                id="confirm-password"
                                                type="password"
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                className="rounded-xl bg-black/40 border-white/10 text-white placeholder-[var(--text-secondary)] focus:ring-2 focus:ring-[var(--gold-primary)]/50 focus:border-[var(--gold-primary)]/50 transition-all backdrop-blur-md"
                                                placeholder="••••••••"
                                            />
                                        </div>
                                    </div>
                                    <div className="pt-1">
                                        <Button
                                            type="submit"
                                            disabled={isChangingPassword}
                                            variant="outline"
                                            className="rounded-xl bg-black/40 border-white/10 text-white hover:text-[var(--gold-primary)] hover:border-[var(--gold-primary)] hover:bg-gold-500/10 transition-colors backdrop-blur-md font-bold"
                                        >
                                            <Lock className="w-4 h-4 mr-2" />
                                            {isChangingPassword ? 'Updating...' : 'Update Password'}
                                        </Button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        {/* My Vehicles Card */}
                        <div className="glass border-white/5 rounded-2xl relative overflow-hidden group shadow-lg">
                            <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center relative z-10">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-[var(--gold-primary)]/10 flex items-center justify-center border border-[var(--gold-primary)]/20 shadow-[0_0_10px_rgba(251,191,36,0.1)]">
                                        <Car className="w-4 h-4 text-[var(--gold-primary)]" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold tracking-tight text-white">My Vehicles</h3>
                                        <p className="text-xs text-[var(--text-secondary)]">Manage cars associated with your account.</p>
                                    </div>
                                </div>
                                <Button
                                    onClick={onAddVehicle}
                                    size="sm"
                                    className="bg-gradient-gold hover:opacity-90 text-black border-none gap-2 shadow-[0_0_15px_rgba(251,191,36,0.3)] transition-all duration-300 font-bold"
                                >
                                    <Car className="w-4 h-4" />
                                    Add Vehicle
                                </Button>
                            </div>
                            <div className="p-6 relative z-10">
                                {vehicles.length === 0 ? (
                                    <div className="text-center py-8">
                                        <Car className="w-10 h-10 text-white/30 mx-auto mb-3" />
                                        <p className="text-sm text-[var(--text-secondary)]">You haven't added any vehicles yet.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {vehicles.map((vehicle) => (
                                            <div
                                                key={vehicle.id}
                                                className="flex items-center justify-between p-4 rounded-xl glass border-white/5 hover:border-[var(--gold-primary)]/30 transition-all duration-300"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-full bg-black/40 border border-white/10 flex items-center justify-center">
                                                        <Car className="w-5 h-5 text-[var(--gold-primary)]" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-semibold text-white tracking-wide">
                                                            {vehicle.year} {vehicle.make} {vehicle.model}
                                                        </h4>
                                                        <div className="flex gap-2 text-xs mt-1">
                                                            <Badge variant="outline" className="text-[var(--text-secondary)] border-[var(--gold-primary)]/30">{vehicle.plateNumber}</Badge>
                                                            <span className="text-[var(--text-secondary)] flex items-center">{vehicle.color}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onEditVehicle(vehicle)}
                                                        className="text-[var(--text-secondary)] hover:text-white hover:bg-white/10 backdrop-blur-md rounded-xl"
                                                    >
                                                        Edit
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onDeleteVehicle(vehicle.id)}
                                                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 backdrop-blur-md rounded-xl"
                                                    >
                                                        Delete
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Appearance Card */}
                        <div className="glass border-white/5 rounded-2xl relative overflow-hidden group shadow-lg">
                            <div className="px-6 py-5 border-b border-white/5 relative z-10">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-[var(--gold-primary)]/10 flex items-center justify-center border border-[var(--gold-primary)]/20 shadow-[0_0_10px_rgba(251,191,36,0.1)]">
                                        <Palette className="w-4 h-4 text-[var(--gold-primary)]" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold tracking-tight text-white">Appearance</h3>
                                        <p className="text-xs text-[var(--text-secondary)]">Customize your visual experience.</p>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 relative z-10">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-white">Dark Mode</p>
                                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                            Toggle between light and dark theme.
                                        </p>
                                    </div>
                                    <ThemeToggle />
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};
