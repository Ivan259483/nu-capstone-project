import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Activity,
  Plus,
  Edit,
  Trash2,
  ShieldCheck,
  MoreVertical,
  Check,
  User as UserIcon,
  Users,
  Eye,
  EyeOff,
  Camera,
  X,
  Mail,
  Calendar,
  Lock,
  Briefcase,
  Wrench,
  ShoppingBag,
  ClipboardList,
  Shield
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';

import { UserService } from '@/lib/user-service';
import { createSecondaryUser } from '@/config/firebase';
import {
  ADMIN_DASHBOARD_ROLES,
  canManageUserRole,
  CUSTOMER_ROLE,
  FULL_ADMIN_ROLES,
  ROLE_DESCRIPTIONS,
  USER_ROLE_OPTIONS,
  SERVICE_STAFF_ROLE,
  getRoleLabel,
  getSafeUserRole,
  type UserRole,
} from '@/lib/roles';

interface User {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  status?: string;
  isActive?: boolean;
  avatar?: string;
  createdAt?: string;
  lastActive?: string;
  [key: string]: any;
}

interface UserManagementPanelProps {
  theme: string;
  users: User[];
  loadData: () => void;
  currentUserRole?: string;
}

export const UserManagementPanel: React.FC<UserManagementPanelProps> = ({ theme, users, loadData, currentUserRole }) => {
  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  
  // Sheet state
  const [selectedUserDetails, setSelectedUserDetails] = useState<User | null>(null);

  // Modal State
  const [showUserModal, setShowUserModal] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  
  // Form State
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState<UserRole>(CUSTOMER_ROLE);
  const [userPassword, setUserPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sendInvite, setSendInvite] = useState(false);
  const [userAvatarPreview, setUserAvatarPreview] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const userAvatarInputRef = useRef<HTMLInputElement>(null);

  // Computed data
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const term = searchTerm.toLowerCase();
      const normalizedRole = getSafeUserRole(u.role, CUSTOMER_ROLE);
      const matchesSearch = !term || 
        u.name?.toLowerCase().includes(term) || 
        u.email?.toLowerCase().includes(term) || 
        normalizedRole.toLowerCase().includes(term) ||
        getRoleLabel(normalizedRole).toLowerCase().includes(term);
        
      const matchesRole = roleFilter === 'all' || normalizedRole === roleFilter;
      
      const rawStatus = u.status ?? (u.isActive ? 'active' : 'pending');
      const normalizedStatus = rawStatus === 'active' ? 'active' : rawStatus === 'suspended' ? 'suspended' : 'pending';
      const matchesStatus = statusFilter === 'all' || normalizedStatus === statusFilter;
      
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  const stats = useMemo(() => {
    const total = users.length;
    let active = 0;
    let staff = 0;
    let locked = 0;

    users.forEach(u => {
      const role = getSafeUserRole(u.role, CUSTOMER_ROLE);
      if (role !== CUSTOMER_ROLE) staff++;
      
      const rawStatus = u.status ?? (u.isActive ? 'active' : 'pending');
      if (rawStatus === 'active') active++;
      if (rawStatus === 'suspended') locked++;
    });

    return { total, active, staff, locked };
  }, [users]);

  // Permission Logic
  const canManageUser = (targetRole: string | undefined) => {
    const currentRole = getSafeUserRole(currentUserRole, CUSTOMER_ROLE);
    const normalizedTargetRole = getSafeUserRole(targetRole, CUSTOMER_ROLE);
    return canManageUserRole(currentRole, normalizedTargetRole);
  };

  // Bulk actions logic
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      // Only select users that can be managed
      setSelectedUsers(filteredUsers.filter(u => canManageUser(u.role)).map(u => u.id));
    } else {
      setSelectedUsers([]);
    }
  };

  const handleSelectUser = (id: string, targetRole: string | undefined) => {
    if (!canManageUser(targetRole)) {
        toast.error('Insufficient permissions to manage this user role.');
        return;
    }
    setSelectedUsers(prev => prev.includes(id) ? prev.filter(uid => uid !== id) : [...prev, id]);
  };

  const resetUserForm = () => {
    setUserName('');
    setUserEmail('');
    setUserRole(CUSTOMER_ROLE);
    setUserPassword('');
    setConfirmPassword('');
    setUserAvatarPreview(null);
    setUserAvatar(null);
    setIsEditingUser(false);
    setEditingUserId(null);
  };

  const handleEditUser = (u: User) => {
    if (!canManageUser(u.role)) {
        toast.error('Insufficient permissions to edit this user role.');
        return;
    }
    setUserName(u.name || '');
    setUserEmail(u.email || '');
    setUserRole(getSafeUserRole(u.role, CUSTOMER_ROLE));
    setUserAvatarPreview(u.avatar || null);
    setIsEditingUser(true);
    setEditingUserId(u.id);
    setShowUserModal(true);
  };

  const handleUserAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUserAvatarPreview(reader.result as string);
        setUserAvatar(reader.result as string); // In a real app, you might upload this immediately and get a URL
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddUser = async () => {
    if (!canManageUser(userRole)) {
        toast.error('Insufficient permissions to create user with this role.');
        return;
    }
    
    if (!isEditingUser) {
        if (!userPassword || userPassword !== confirmPassword) {
            toast.error('Passwords do not match or are empty');
            return;
        }
    }
    
    const finalPassword = isEditingUser ? undefined : userPassword;
    
    const trimmedName = userName.trim();
    const trimmedEmail = userEmail.trim();
    
    if (!trimmedName || !trimmedEmail || !userRole) {
        toast.error('Please fill in all required fields');
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
        toast.error('Please enter a valid email address');
        return;
    }

    try {
        if (isEditingUser && editingUserId) {
            const response = await UserService.updateUser(editingUserId, {
                name: trimmedName,
                email: trimmedEmail,
                role: userRole
            });

            if (response?.success) {
                toast.success('User updated successfully!');
                loadData();
                setShowUserModal(false);
                resetUserForm();
            } else {
                toast.error(response?.message || 'Failed to update user');
            }
        } else {
            const payload = {
                name: trimmedName,
                email: trimmedEmail,
                password: finalPassword,
                role: userRole,
                avatar: userAvatar || undefined
            };

            const fbLoader = toast.loading('Registering credentials securely...');
            let fbUser;
            try {
                fbUser = await createSecondaryUser(trimmedEmail, finalPassword!, sendInvite);
                if (sendInvite) toast.success('Invitation sent to user', { id: fbLoader });
                else toast.success('Auth credentials created', { id: fbLoader });
            } catch (fbError: any) {
                if (fbError.code === 'auth/email-already-in-use' || fbError.code === 'auth/email-exists') {
                    toast.error('Authentication Error: Email already exists in Firebase.', { id: fbLoader });
                    return;
                } else if (fbError.code === 'auth/weak-password') {
                    toast.error('Authentication Error: Password is too weak.', { id: fbLoader });
                    return;
                } else {
                    toast.error(`Auth Error: ${fbError.message}`, { id: fbLoader });
                    return;
                }
            }

            if (fbUser?.uid) {
                (payload as any).firebaseUid = fbUser.uid;
            }

            const response = await UserService.createUser(payload);
            if (response?.success) {
                toast.success('User registered successfully');
                loadData();
                setShowUserModal(false);
                resetUserForm();
            } else {
                toast.error(response?.message || 'Failed to finish user setup');
            }
        }
    } catch (err: any) {
        console.error('Save User error:', err);
        toast.error('An error occurred during save.');
    }
  };

  const handleDeleteUser = async (id: string, name: string, role: string | undefined) => {
    if (!canManageUser(role)) {
        toast.error('Insufficient permissions to delete this user role.');
        return;
    }
    const confirmStr = prompt(`Type DELETE to confirm removal of user: ${name}`);
    if (confirmStr === 'DELETE') {
        const loadingToast = toast.loading('Deleting user...');
        try {
            let response = await UserService.deleteUser(id);
            if (response?.success) {
                toast.success('User deleted successfully', { id: loadingToast });
                setSelectedUsers(prev => prev.filter(uId => uId !== id));
                loadData();
            } else {
                toast.error(response?.message || 'Failed to delete user', { id: loadingToast });
            }
        } catch (error) {
            toast.error('Error deleting user', { id: loadingToast });
        }
    }
  };

  const handleBulkAction = async (action: 'activate' | 'suspend' | 'delete') => {
    if (selectedUsers.length === 0) return;
    
    if (action === 'delete') {
      const confirmStr = prompt(`Type DELETE to confirm removal of ${selectedUsers.length} users.`);
      if (confirmStr !== 'DELETE') return;
    }
    
    const loadingToast = toast.loading(`Processing bulk ${action}...`);
    try {
      // Since no bulk API is known, iterate over selection
      let successCount = 0;
      for (const id of selectedUsers) {
        let resp;
        if (action === 'delete') {
          resp = await UserService.deleteUser(id);
        } else {
          resp = await UserService.updateUser(id, { status: action === 'activate' ? 'active' : 'suspended' });
        }
        if (resp?.success) successCount++;
      }
      toast.success(`Successfully processed ${successCount} users`, { id: loadingToast });
      setSelectedUsers([]);
      loadData();
    } catch {
      toast.error('Error processing bulk action', { id: loadingToast });
    }
  };

  const pageVariants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4 } },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } }
  };

  return (
    <motion.div key="users" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="w-full">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-white tracking-tight">User Management</h2>
          <p className="text-sm text-zinc-500 mt-1">Manage system accounts, permissions, and security levels.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
            <DialogTrigger asChild>
              <Button
                onClick={() => { resetUserForm(); setShowUserModal(true); }}
                className="bg-white text-black hover:bg-zinc-200 h-9 font-medium px-4 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                New User
              </Button>
            </DialogTrigger>
            <DialogContent className={`${theme === 'light' ? 'bg-white' : 'bg-[#0f0f11] border-white/10'} backdrop-blur-2xl sm:max-w-md p-6 overflow-hidden rounded-2xl shadow-2xl`}>
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5 animate-pulse" style={{ animationDuration: '4s' }} />
                
                <DialogHeader className="relative z-10 mb-2">
                    <DialogTitle className={`text-xl font-semibold tracking-tight ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                        {isEditingUser ? 'Edit User' : 'Add New User'}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 relative z-10">
                    <div className="space-y-3">
                        <Label className={theme === 'light' ? 'text-gray-700 font-medium tracking-tight' : 'text-zinc-300 font-medium tracking-tight'}>Full Name</Label>
                        <Input 
                            value={userName} 
                            onChange={(e) => setUserName(e.target.value)} 
                            placeholder="e.g. Jane Doe"
                            className={`h-11 ${theme === 'light' ? 'bg-white border-gray-200' : 'bg-black/40 border-white/10 text-white placeholder:text-zinc-600 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50'}`} 
                        />
                    </div>
                    
                    <div className="space-y-3">
                        <Label className={theme === 'light' ? 'text-gray-700 font-medium tracking-tight' : 'text-zinc-300 font-medium tracking-tight'}>Email Address</Label>
                        <Input 
                            type="email" 
                            value={userEmail} 
                            onChange={(e) => setUserEmail(e.target.value)} 
                            placeholder="name@company.com"
                            className={`h-11 ${theme === 'light' ? 'bg-white border-gray-200' : 'bg-black/40 border-white/10 text-white placeholder:text-zinc-600 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50'}`} 
                        />
                        <p className="text-xs text-zinc-500 font-medium">We’ll send an invitation to verify the account</p>
                    </div>

                    <div className="space-y-3">
                        <Label className={theme === 'light' ? 'text-gray-700 font-medium tracking-tight' : 'text-zinc-300 font-medium tracking-tight'}>Access Role</Label>
                        <Select value={userRole} onValueChange={(value) => setUserRole(getSafeUserRole(value, CUSTOMER_ROLE))}>
                            <SelectTrigger className={`h-11 ${theme === 'light' ? 'bg-white border-gray-200' : 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50'}`}>
                                <SelectValue placeholder="Select a role" />
                            </SelectTrigger>
                            <SelectContent className={theme === 'light' ? 'bg-white' : 'bg-[#18181b] border-white/10'} position="popper">
                                {['Admin Roles', 'Operational Roles', 'Staff & Technicians', 'Customer Access'].map((group, index) => (
                                  <React.Fragment key={group}>
                                    {index > 0 && <SelectSeparator className={`${theme === 'light' ? 'bg-gray-100' : 'bg-white/5'}`} />}
                                    <SelectGroup>
                                      <SelectLabel className={`${theme === 'light' ? 'text-gray-500' : 'text-zinc-500'} text-xs uppercase tracking-wider font-semibold ${index > 0 ? 'pt-2' : ''}`}>
                                        {group}
                                      </SelectLabel>
                                      {USER_ROLE_OPTIONS.filter((option) => option.group === group).map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          <div className="flex items-center gap-2">{option.label}</div>
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  </React.Fragment>
                                ))}
                            </SelectContent>
                        </Select>
                        {userRole && (
                            <p className="text-[11px] text-zinc-400 font-medium">{ROLE_DESCRIPTIONS[userRole]}</p>
                        )}
                    </div>

                    {!isEditingUser && (
                        <div className="space-y-3 pt-2">
                            <div className="space-y-3">
                                <Label className={theme === 'light' ? 'text-gray-700 font-medium tracking-tight' : 'text-zinc-300 font-medium tracking-tight'}>Password</Label>
                                <Input 
                                    type="password" 
                                    value={userPassword} 
                                    onChange={(e) => setUserPassword(e.target.value)} 
                                    placeholder="••••••••"
                                    className={`h-11 ${theme === 'light' ? 'bg-white border-gray-200' : 'bg-black/40 border-white/10 text-white placeholder:text-zinc-600 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50'}`} 
                                />
                            </div>
                            <div className="space-y-3">
                                <Label className={theme === 'light' ? 'text-gray-700 font-medium tracking-tight' : 'text-zinc-300 font-medium tracking-tight'}>Confirm Password</Label>
                                <Input 
                                    type="password" 
                                    value={confirmPassword} 
                                    onChange={(e) => setConfirmPassword(e.target.value)} 
                                    placeholder="••••••••"
                                    className={`h-11 ${theme === 'light' ? 'bg-white border-gray-200' : 'bg-black/40 border-white/10 text-white placeholder:text-zinc-600 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50'}`} 
                                />
                            </div>
                        </div>
                    )}
                    <div className="pt-2 flex gap-3">
                        <Button 
                            variant="outline" 
                            onClick={() => setShowUserModal(false)} 
                            className={`flex-1 h-11 border-zinc-200 text-zinc-700 hover:bg-zinc-100 ${theme === 'dark' ? 'border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white bg-transparent' : ''}`}
                        >
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleAddUser} 
                            className={`flex-1 h-11 font-medium transition-colors border-0 ${
                                theme === 'light' 
                                    ? 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/20' 
                                    : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white shadow-lg shadow-orange-500/20'
                            }`}
                        >
                            {isEditingUser ? 'Save Changes' : 'Create Account'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Users', value: stats.total },
          { label: 'Active Status', value: stats.active },
          { label: 'Staff Accounts', value: stats.staff },
          { label: 'Suspended', value: stats.locked },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
          >
            <div className="bg-[#111113] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-colors">
              <p className="text-zinc-500 text-[11px] font-semibold tracking-wider uppercase mb-1.5">{stat.label}</p>
              <div className="h-8">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={stat.value}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="text-2xl font-semibold text-zinc-100 tracking-tight"
                  >
                    {stat.value}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Toolbar & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-full md:w-64">
            <Input
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#111113] border border-white/5 text-zinc-200 pl-9 h-9 text-sm focus:border-zinc-700 placeholder:text-zinc-600 rounded-lg"
            />
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
          <Select
            value={roleFilter}
            onValueChange={(value) => setRoleFilter(value === 'all' ? 'all' : getSafeUserRole(value, CUSTOMER_ROLE))}
          >
            <SelectTrigger className="w-[130px] bg-[#111113] border-white/5 text-zinc-300 h-9 rounded-lg">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent className="bg-[#111113] border-white/5 text-zinc-200">
              <SelectItem value="all">All Roles</SelectItem>
              {USER_ROLE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] bg-[#111113] border-white/5 text-zinc-300 h-9 rounded-lg">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-[#111113] border-white/5 text-zinc-200">
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>

          <AnimatePresence>
            {selectedUsers.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex items-center gap-2 bg-orange-500/10 px-4 py-2 rounded-lg border border-orange-500/20"
              >
                <span className="text-sm font-medium text-orange-400 mr-2">
                  {selectedUsers.length} selected
                </span>
                <Button size="sm" variant="ghost" onClick={() => handleBulkAction('activate')} className="h-8 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20">
                  Activate
                </Button>
                <div className="w-px h-4 bg-white/10" />
                <Button size="sm" variant="ghost" onClick={() => handleBulkAction('suspend')} className="h-8 text-amber-400 hover:text-amber-300 hover:bg-amber-500/20">
                  Suspend
                </Button>
                <div className="w-px h-4 bg-white/10" />
                <Button size="sm" variant="ghost" onClick={() => handleBulkAction('delete')} className="h-8 text-red-400 hover:text-red-300 hover:bg-red-500/20">
                  Delete
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
      </div>

      {/* Main Table */}
      <div className="bg-[#111113] border border-white/5 rounded-xl overflow-hidden">
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="border-b border-white/5 bg-white/[0.01]">
              <tr>
                <th className="px-4 py-3 w-[40%] text-[10px] font-semibold text-zinc-500 uppercase tracking-widest pl-5">
                  <div className="flex items-center gap-[12px]">
                    <div 
                      className={`w-4 h-4 rounded flex items-center justify-center cursor-pointer transition-colors ${selectedUsers.length === filteredUsers.length && filteredUsers.length > 0 ? 'bg-orange-500 border-none' : 'border border-zinc-600 bg-transparent'}`}
                      onClick={(e) => handleSelectAll({ target: { checked: selectedUsers.length !== filteredUsers.length } } as any)}
                    >
                      {selectedUsers.length === filteredUsers.length && filteredUsers.length > 0 && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span>User Details</span>
                  </div>
                </th>
                <th className="px-4 py-3 w-[15%] text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Security Level</th>
                <th className="px-4 py-3 w-[15%] text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Status</th>
                <th className="px-4 py-3 w-[20%] text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Date Created</th>
                <th className="px-4 py-3 w-[10%] text-[10px] font-semibold text-zinc-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
                {filteredUsers.length > 0 ? filteredUsers.map((u, i) => {
                  const initials = (u.name || 'User').split(' ').slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
                  const role = getSafeUserRole(u.role, CUSTOMER_ROLE);
                  const displayRole = getRoleLabel(role);
                  
                  const roleClass = FULL_ADMIN_ROLES.includes(role)
                    ? 'bg-[#1C1C1E] text-orange-400 border-white/5'
                    : ADMIN_DASHBOARD_ROLES.includes(role)
                    ? 'bg-[#1C1C1E] text-purple-400 border-white/5'
                    : role === SERVICE_STAFF_ROLE
                    ? 'bg-[#1C1C1E] text-cyan-400 border-white/5'
                    : 'bg-[#1C1C1E] text-zinc-400 border-white/5';
                  
                  const rawStatus = u.status ?? (u.isActive ? 'active' : 'pending');
                  const status = rawStatus === 'active' ? 'Active' : rawStatus === 'suspended' ? 'Suspended' : 'Pending';
                  const statusColor = status === 'Active' ? 'emerald' : status === 'Suspended' ? 'red' : 'zinc';
                  
                  const dateCreated = u.createdAt ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(u.createdAt)) : '—';
                  const isChecked = selectedUsers.includes(u.id);
                  const isManageable = canManageUser(u.role);

                  return (
                    <motion.tr 
                      key={u.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      onClick={() => setSelectedUserDetails(u)}
                      className={`group cursor-pointer h-[64px] min-h-[64px] transition-colors duration-150 ${isChecked ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'}`}
                    >
                      <td className="px-4 py-3 align-middle pl-5">
                        <div className="flex items-center gap-[12px]">
                            {isManageable ? (
                                <div 
                                className={`w-4 h-4 rounded flex items-center justify-center cursor-pointer transition-colors ${isChecked ? 'bg-orange-500 border-none' : 'border border-zinc-600 bg-transparent'}`}
                                onClick={(e) => { e.stopPropagation(); handleSelectUser(u.id, u.role); }}
                                >
                                {isChecked && <Check className="w-3 h-3 text-white" />}
                                </div>
                            ) : (
                                <div className="w-4 h-4" />
                            )}
                            {u.avatar ? (
                                <img src={u.avatar} alt={u.name} className="w-[40px] h-[40px] min-w-[40px] max-w-[40px] rounded-full object-cover border border-white/10" />
                            ) : (
                                <div className="w-[40px] h-[40px] min-w-[40px] max-w-[40px] rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-sm font-semibold text-zinc-300">
                                    {initials || 'U'}
                                </div>
                            )}
                            <div className="min-w-[220px] flex flex-col justify-center">
                                <div className="text-zinc-200 font-semibold leading-[1.2] text-sm group-hover:text-white transition-colors flex items-center gap-2">
                                  {u.name}
                                </div>
                                <div className="text-zinc-500 text-xs leading-[1.2] mt-0.5">{u.email}</div>
                            </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <Badge className={`border ${roleClass} text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-sm transition-colors duration-500`}>
                            {displayRole}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-${statusColor}-500/10 border border-${statusColor}-500/20 text-${statusColor}-400 text-[10px] font-medium tracking-wider uppercase transition-colors duration-500`}>
                            <span className={`w-1 h-1 rounded-full bg-${statusColor}-400 transition-colors duration-500`} />
                            {status}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex flex-col relative h-5">
                          <AnimatePresence mode="wait">
                            <motion.span 
                              key={dateCreated}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.3 }}
                              className="text-sm text-zinc-300 absolute inset-0"
                            >
                              {dateCreated}
                            </motion.span>
                          </AnimatePresence>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            {isManageable && (
                                <>
                                    <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); handleEditUser(u); }} className="h-8 w-8 rounded-md text-zinc-400 hover:text-white hover:bg-white/10">
                                        <Edit className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDeleteUser(u.id, u.name || 'User', u.role); }} className="h-8 w-8 rounded-md text-zinc-400 hover:text-red-400 hover:bg-red-500/10">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                </>
                            )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center justify-center text-zinc-500">
                        <Users className="w-8 h-8 mb-3 opacity-30" />
                        <p className="text-sm">No users found matching your criteria</p>
                        <Button 
                          variant="ghost" 
                          onClick={() => { setSearchTerm(''); setRoleFilter('all'); setStatusFilter('all'); }}
                          className="mt-3 text-zinc-400 hover:text-white hover:bg-white/5 h-8 text-xs"
                        >
                          Clear Filters
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      {/* Slide-out User Details Drawer */}
      <Sheet open={!!selectedUserDetails} onOpenChange={(open) => !open && setSelectedUserDetails(null)}>
        <SheetContent side="right" className="bg-[#121214] border-l border-white/5 shadow-2xl w-full sm:max-w-md p-0 overflow-y-auto">
          {selectedUserDetails && (
            <div className="flex flex-col h-full">
              {/* Cover & Avatar Header */}
              <div className="relative h-32 bg-gradient-to-r from-orange-600/20 to-orange-900/40 border-b border-white/5">
                <Button 
                  size="icon" 
                  variant="ghost" 
                  onClick={() => setSelectedUserDetails(null)}
                  className="absolute top-4 right-4 bg-black/20 hover:bg-black/40 text-white rounded-full z-10"
                >
                  <X className="w-4 h-4" />
                </Button>
                <div className="absolute -bottom-10 left-6">
                  {selectedUserDetails.avatar ? (
                    <img src={selectedUserDetails.avatar} alt="Profile" className="w-24 h-24 rounded-full object-cover border-4 border-[#121214] shadow-xl" />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-zinc-800 border-4 border-[#121214] flex items-center justify-center text-3xl font-bold text-zinc-200 shadow-xl">
                      {selectedUserDetails.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="px-6 pt-14 pb-6 flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-2xl font-bold text-white">{selectedUserDetails.name}</h3>
                  <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20">
                    {getRoleLabel(selectedUserDetails.role)}
                  </Badge>
                </div>
                <p className="text-zinc-400 flex items-center gap-2 text-sm mb-6">
                  <Mail className="w-4 h-4" />
                  {selectedUserDetails.email}
                </p>

                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                    <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold mb-1">Status</p>
                    <div className="text-zinc-200 font-medium">
                      {(selectedUserDetails.status || (selectedUserDetails.isActive ? 'active' : 'pending')).toUpperCase()}
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                    <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold mb-1">Joined</p>
                    <div className="text-zinc-200 font-medium flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-zinc-500" />
                      {selectedUserDetails.createdAt ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(selectedUserDetails.createdAt)) : 'Unknown'}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">Account Security</h4>
                  <div className="bg-white/5 border border-white/5 rounded-xl divide-y divide-white/5">
                    <div className="flex justify-between items-center p-4">
                      <span className="text-sm text-zinc-400">Last Active</span>
                      <span className="text-sm font-medium text-white">
                        {selectedUserDetails.lastActive ? formatDistanceToNow(new Date(selectedUserDetails.lastActive), { addSuffix: true }) : 'Never'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-4">
                      <span className="text-sm text-zinc-400">User ID</span>
                      <span className="text-xs font-mono text-zinc-500 bg-black/50 px-2 py-1 rounded">{selectedUserDetails.id}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Footer */}
              <div className="p-6 border-t border-white/5 bg-black/20 flex gap-3">
                <Button 
                  className="flex-1 bg-white/5 hover:bg-white/10 text-white border border-white/10"
                  onClick={() => {
                    setSelectedUserDetails(null);
                    handleEditUser(selectedUserDetails);
                  }}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Profile
                </Button>
                {getSafeUserRole(selectedUserDetails.role, CUSTOMER_ROLE) !== 'administrator' && (
                  <Button 
                    variant="destructive" 
                    className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20"
                    onClick={() => {
                      handleDeleteUser(selectedUserDetails.id, selectedUserDetails.name || 'User', selectedUserDetails.role);
                      setSelectedUserDetails(null);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

    </motion.div>
  );
};
