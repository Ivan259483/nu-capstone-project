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
                    <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                        Account Settings
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">
                        Manage your profile, security, and appearance preferences.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

                    {/* ── Profile Sidebar ── */}
                    <div className="md:col-span-1 space-y-4">
                        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-700/50
                                        bg-white/80 dark:bg-slate-900/80 backdrop-blur-md
                                        shadow-sm dark:shadow-2xl dark:shadow-black/50 p-6
                                        flex flex-col items-center text-center space-y-4">
                            <div className="relative group cursor-pointer">
                                <Avatar className="w-24 h-24 ring-2 ring-slate-200 dark:ring-slate-700 ring-offset-2 ring-offset-transparent">
                                    <AvatarImage src={user?.avatar || user?.photoURL} />
                                    <AvatarFallback className="bg-gradient-to-br from-orange-500 to-amber-600 text-white text-2xl font-bold">
                                        {user?.name?.charAt(0) || 'U'}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Camera className="w-5 h-5 text-white" />
                                </div>
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                                    {user?.name}
                                </h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{user?.email}</p>
                            </div>
                            <Badge className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 capitalize text-xs px-3">
                                {user?.role} Account
                            </Badge>
                        </div>

                        <Button
                            variant="ghost"
                            className="w-full justify-start gap-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl border border-transparent hover:border-red-200 dark:hover:border-red-900/50 transition-all"
                            onClick={logout}
                        >
                            <LogOut className="w-4 h-4" />
                            Sign Out
                        </Button>
                    </div>

                    {/* ── Forms Column ── */}
                    <div className="md:col-span-2 space-y-6">

                        {/* Personal Information Card */}
                        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-700/50
                                        bg-white/80 dark:bg-slate-900/80 backdrop-blur-md
                                        shadow-sm dark:shadow-2xl dark:shadow-black/50 overflow-hidden">
                            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                                        <User className="w-4 h-4 text-indigo-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
                                            Personal Information
                                        </h3>
                                        <p className="text-xs text-slate-400 dark:text-slate-500">Update your contact details.</p>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6">
                                <form onSubmit={handleProfileSubmit} className="space-y-5">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="name" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                            Full Name
                                        </Label>
                                        <div className="relative">
                                            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <Input
                                                id="name"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                className="pl-10 rounded-xl border-slate-200 dark:bg-slate-800/50 dark:border-slate-700
                                                           focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50
                                                           dark:text-white dark:placeholder:text-slate-500"
                                                placeholder="John Doe"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                            Email Address
                                        </Label>
                                        <div className="relative">
                                            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <Input
                                                id="email"
                                                type="email"
                                                value={email}
                                                disabled
                                                className="pl-10 rounded-xl bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700/50
                                                           text-slate-400 dark:text-slate-500 cursor-not-allowed"
                                            />
                                        </div>
                                        <p className="text-xs text-slate-400 dark:text-slate-500">Email cannot be changed directly.</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="phone" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                            Phone Number
                                        </Label>
                                        <div className="relative">
                                            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <Input
                                                id="phone"
                                                type="tel"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                className="pl-10 rounded-xl border-slate-200 dark:bg-slate-800/50 dark:border-slate-700
                                                           focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50
                                                           dark:text-white dark:placeholder:text-slate-500"
                                                placeholder="+63 900 000 0000"
                                            />
                                        </div>
                                    </div>
                                    <div className="pt-1">
                                        <Button
                                            type="submit"
                                            disabled={isSavingProfile}
                                            className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700
                                                       text-white rounded-xl px-6 shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30
                                                       transition-all duration-200 font-medium"
                                        >
                                            <Save className="w-4 h-4 mr-2" />
                                            {isSavingProfile ? 'Saving...' : 'Save Changes'}
                                        </Button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        {/* Security Card */}
                        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-700/50
                                        bg-white/80 dark:bg-slate-900/80 backdrop-blur-md
                                        shadow-sm dark:shadow-2xl dark:shadow-black/50 overflow-hidden">
                            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                        <Shield className="w-4 h-4 text-emerald-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">Security</h3>
                                        <p className="text-xs text-slate-400 dark:text-slate-500">Manage your password and account security.</p>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6">
                                <form onSubmit={handlePasswordSubmit} className="space-y-5">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="current-password" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                            Current Password
                                        </Label>
                                        <div className="relative">
                                            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <Input
                                                id="current-password"
                                                type="password"
                                                value={currentPassword}
                                                onChange={(e) => setCurrentPassword(e.target.value)}
                                                className="pl-10 rounded-xl border-slate-200 dark:bg-slate-800/50 dark:border-slate-700
                                                           focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50
                                                           dark:text-white dark:placeholder:text-slate-500"
                                                placeholder="••••••••"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="new-password" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                New Password
                                            </Label>
                                            <Input
                                                id="new-password"
                                                type="password"
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                className="rounded-xl border-slate-200 dark:bg-slate-800/50 dark:border-slate-700
                                                           focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50
                                                           dark:text-white dark:placeholder:text-slate-500"
                                                placeholder="••••••••"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="confirm-password" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                Confirm Password
                                            </Label>
                                            <Input
                                                id="confirm-password"
                                                type="password"
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                className="rounded-xl border-slate-200 dark:bg-slate-800/50 dark:border-slate-700
                                                           focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50
                                                           dark:text-white dark:placeholder:text-slate-500"
                                                placeholder="••••••••"
                                            />
                                        </div>
                                    </div>
                                    <div className="pt-1">
                                        <Button
                                            type="submit"
                                            disabled={isChangingPassword}
                                            variant="outline"
                                            className="rounded-xl border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300
                                                       hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600
                                                       transition-all duration-200 font-medium"
                                        >
                                            <Lock className="w-4 h-4 mr-2" />
                                            {isChangingPassword ? 'Updating...' : 'Update Password'}
                                        </Button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        {/* My Vehicles Card */}
                        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-700/50
                                        bg-white/80 dark:bg-slate-900/80 backdrop-blur-md
                                        shadow-sm dark:shadow-2xl dark:shadow-black/50 overflow-hidden">
                            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                                        <Car className="w-4 h-4 text-indigo-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">My Vehicles</h3>
                                        <p className="text-xs text-slate-400 dark:text-slate-500">Manage cars associated with your account.</p>
                                    </div>
                                </div>
                                <Button
                                    onClick={onAddVehicle}
                                    size="sm"
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                                >
                                    <Car className="w-4 h-4" />
                                    Add Vehicle
                                </Button>
                            </div>
                            <div className="p-6">
                                {vehicles.length === 0 ? (
                                    <div className="text-center py-8">
                                        <Car className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
                                        <p className="text-sm text-slate-500 dark:text-slate-400">You haven't added any vehicles yet.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {vehicles.map((vehicle) => (
                                            <div
                                                key={vehicle.id}
                                                className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/30"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                                                        <Car className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                                                            {vehicle.year} {vehicle.make} {vehicle.model}
                                                        </h4>
                                                        <div className="flex gap-2 text-xs mt-1">
                                                            <Badge variant="outline" className="text-slate-500 dark:border-slate-700">{vehicle.plateNumber}</Badge>
                                                            <span className="text-slate-400 flex items-center">{vehicle.color}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onEditVehicle(vehicle)}
                                                        className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                                                    >
                                                        Edit
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onDeleteVehicle(vehicle.id)}
                                                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
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
                        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-700/50
                                        bg-white/80 dark:bg-slate-900/80 backdrop-blur-md
                                        shadow-sm dark:shadow-2xl dark:shadow-black/50 overflow-hidden">
                            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                        <Palette className="w-4 h-4 text-purple-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">Appearance</h3>
                                        <p className="text-xs text-slate-400 dark:text-slate-500">Customize your visual experience.</p>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Dark Mode</p>
                                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
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
