import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { User } from '@/types';
import { userStorage, initializeStorage } from '@/lib/storage';
import { UserService } from '@/lib/user-service';
import api from '@/lib/api';
import { auth } from '@/config/firebase';

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
    signup: (email: string, password: string, name: string) => Promise<{ success: boolean; message?: string }>;
    logout: () => void;
    updateUser: (user: User, options?: { localOnly?: boolean }) => Promise<{ success: boolean; message?: string; offline?: boolean; reason?: 'timeout' | 'network' | 'error' }>;
    setAuthUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AVATAR_STORAGE_PREFIX = 'autospf_avatar_';
const stripAvatarMetadata = (value: string) => value.replace(/^data:image\/\w+;base64,/, '');
const isLikelyBase64Image = (value: string) =>
    value.startsWith('data:image/') || (value.length > 200 && !value.startsWith('http'));

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const pendingAvatarRef = useRef<{ id: string; avatar: string } | null>(null);

    const sanitizeUser = useCallback((userData: User): User => {
        if (!userData) return userData;
        if (userData.avatar && typeof userData.avatar === 'string' && isLikelyBase64Image(userData.avatar)) {
            const rawAvatar = stripAvatarMetadata(userData.avatar);
            if (userData.id) {
                pendingAvatarRef.current = { id: userData.id, avatar: rawAvatar };
            }
            const { avatar, ...rest } = userData;
            return { ...rest } as User;
        }
        return userData;
    }, []);

    useEffect(() => {
        if (!pendingAvatarRef.current) return;
        const { id, avatar } = pendingAvatarRef.current;
        let idleId: number | null = null;
        if (typeof (window as any).requestIdleCallback === 'function') {
            idleId = (window as any).requestIdleCallback(() => {
                localStorage.setItem(`${AVATAR_STORAGE_PREFIX}${id}`, avatar);
                pendingAvatarRef.current = null;
            });
        } else {
            idleId = window.setTimeout(() => {
                localStorage.setItem(`${AVATAR_STORAGE_PREFIX}${id}`, avatar);
                pendingAvatarRef.current = null;
            }, 0);
        }
        return () => {
            if (idleId && typeof (window as any).cancelIdleCallback === 'function') {
                (window as any).cancelIdleCallback(idleId);
            } else if (idleId) {
                window.clearTimeout(idleId);
            }
        };
    }, [user]);

    useEffect(() => {
        const validateSession = async () => {
            console.log('🛡️ [AuthContext] Validating session...');

            const token = localStorage.getItem('autospf_token');

            if (!token) {
                console.log('ℹ️ [AuthContext] No token found. Session is not active.');
                return;
            }

            try {
                // The request interceptor will automatically add the token to the headers
                const response = await api.get('/auth/me');

                if (response.data.success && response.data.data) {
                    const userData = sanitizeUser(response.data.data);

                    console.log('✅ [AuthContext] Session validated. User:', userData.email);
                    userStorage.setCurrentUser(userData);
                    setUser(userData);
                } else {
                    console.warn('⚠️ [AuthContext] Validation returned success=false. Clearing session.');
                    localStorage.removeItem('autospf_token');
                    userStorage.setCurrentUser(null);
                    setUser(null);
                }
            } catch (error) {
                console.error('❌ [AuthContext] Session validation failed. The API interceptor will handle cleanup.');
                setUser(null);
            }
        };

        initializeStorage();
        const storedUser = userStorage.getCurrentUser();
        if (storedUser) {
            const sanitized = sanitizeUser(storedUser);
            userStorage.setCurrentUser(sanitized);
            setUser(sanitized);
        }
        // Listen for Firebase Auth changes
        const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
            if (firebaseUser) {
                console.log('🔥 [AuthContext] Firebase User detected:', firebaseUser.email);
                // We could optionally sync here if the token is missing but we have a firebase user
                // But generally, the Login page handles the initial exchange.
            } else {
                console.log('ℹ️ [AuthContext] Firebase User signed out.');
                // Optional: clear local session if firebase signs out
                // logout(); 
            }
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
        try {
            const response = await api.post('/auth/login', { email, password });
            const data = response.data;

            if (data.success) {
                localStorage.setItem('autospf_token', data.data.token);
                const userData = sanitizeUser(data.data.user);
                userStorage.setCurrentUser(userData);
                setUser(userData);
                return { success: true };
            }
            return { success: false, message: data.message || 'Invalid credentials' };
        } catch (error: any) {
            console.error('Login error:', error);

            // Extract message from server response if available
            const serverMessage = error.response?.data?.message;
            if (serverMessage) {
                return { success: false, message: serverMessage };
            }

            // Fallback for demo/offline
            const foundUser = userStorage.getByEmail(email);
            if (foundUser && foundUser.password === password) {
                // Generate a fake token for offline mode to pass the strict check
                localStorage.setItem('autospf_token', 'demo-token-' + Date.now());
                userStorage.setCurrentUser(foundUser);
                setUser(foundUser);
                return { success: true };
            }
            return { success: false, message: 'Login failed. Please check your connection.' };
        }
    }, []);

    const signup = useCallback(async (email: string, password: string, name: string): Promise<{ success: boolean; message?: string }> => {
        try {
            const response = await api.post('/auth/register', { email, password, name, role: 'customer' });
            return {
                success: response.data.success,
                message: response.data.message
            };
        } catch (error: any) {
            console.error('Signup error:', error);
            return {
                success: false,
                message: error.response?.data?.message || 'An error occurred during signup'
            };
        }
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('autospf_token');
        userStorage.setCurrentUser(null);
        setUser(null);
    }, []);

    const updateUser = useCallback(async (
        updatedUser: User,
        options?: { localOnly?: boolean }
    ): Promise<{ success: boolean; message?: string; offline?: boolean; reason?: 'timeout' | 'network' | 'error' }> => {
        const applyLocalUpdate = (userData: User) => {
            const sanitized = sanitizeUser(userData);
            userStorage.update(sanitized);
            userStorage.setCurrentUser(sanitized);
            setUser(sanitized);
        };

        if (options?.localOnly) {
            applyLocalUpdate(updatedUser);
            return { success: true, offline: true, reason: 'network' };
        }

        try {
            const response = await UserService.updateUser(updatedUser.id, {
                name: updatedUser.name,
                email: updatedUser.email,
                avatar: updatedUser.avatar
            });

            if (response.success) {
                const updatedData = response.data || updatedUser;
                applyLocalUpdate(updatedData);
                return { success: true };
            }
            return { success: false, message: response.message || 'Update failed' };
        } catch (error: any) {
            console.error('Update profile error:', error);
            const message = error?.message || '';
            const isTimeout = error?.code === 'ECONNABORTED' || /timeout/i.test(message);
            const isNetwork = !error?.response || /network/i.test(message);
            const reason: 'timeout' | 'network' | 'error' = isTimeout ? 'timeout' : isNetwork ? 'network' : 'error';
            applyLocalUpdate(updatedUser);
            return { success: true, offline: true, reason };
        }
    }, []);

    const value = useMemo(() => ({
        user,
        isLoading,
        login,
        signup,
        logout,
        updateUser,
        setAuthUser: setUser
    }), [user, isLoading, login, signup, logout, updateUser]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
