import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { User } from '@/types';
import { userStorage, initializeStorage } from '@/lib/storage';
import { UserService } from '@/lib/user-service';
import { auth } from '@/config/firebase';
import { CUSTOMER_ROLE, getSafeUserRole, migrateLegacyUserRole } from '@/lib/roles';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    onAuthStateChanged
} from 'firebase/auth';

// NOTE: Firestore is intentionally NOT used for role lookup.
// Role is sourced from the MongoDB backend API (GET /api/users?email=...)
// to avoid Firestore "client is offline" errors blocking authentication.
const BACKEND_URL = import.meta.env.MODE === 'development'
    ? '/api'
    : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');

/* ═══════════════════════════════════════════════════════
   SESSION CACHE — persist role + profile across refreshes
   to eliminate redundant API calls on warm restarts.
   ═══════════════════════════════════════════════════════ */
const SESSION_CACHE_KEY = 'autospf_session_cache';
const SESSION_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

interface SessionCache {
    user: User;
    token: string;
    timestamp: number;
}

function getSessionCache(): SessionCache | null {
    try {
        const raw = localStorage.getItem(SESSION_CACHE_KEY);
        if (!raw) return null;
        const parsed: SessionCache = JSON.parse(raw);
        if (Date.now() - parsed.timestamp > SESSION_CACHE_TTL) {
            localStorage.removeItem(SESSION_CACHE_KEY);
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

function setSessionCache(user: User, token: string): void {
    const cache: SessionCache = { user, token, timestamp: Date.now() };
    try { localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cache)); } catch { /* quota */ }
}

function clearSessionCache(): void {
    localStorage.removeItem(SESSION_CACHE_KEY);
}

/* ═══════════════════════════════════════════════════════ */

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
    signup: (email: string, password: string, name: string) => Promise<{ success: boolean; message?: string }>;
    resetPassword: (email: string) => Promise<{ success: boolean; message?: string }>;
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
    // Track whether login() already resolved the user to avoid double-fetch in onAuthStateChanged
    const loginResolvedRef = useRef(false);

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
        initializeStorage();
        const storedUser = userStorage.getCurrentUser();
        if (storedUser) {
            const normalizedStoredUser: User = {
                ...storedUser,
                role: getSafeUserRole(storedUser.role, CUSTOMER_ROLE),
            };
            // Restore avatar from its dedicated storage so the UI can render it immediately
            const savedAvatar = localStorage.getItem(`${AVATAR_STORAGE_PREFIX}${normalizedStoredUser.id}`);
            if (savedAvatar && !normalizedStoredUser.avatar) {
               normalizedStoredUser.avatar = savedAvatar.startsWith('data:') ? savedAvatar : `data:image/jpeg;base64,${savedAvatar}`;
            }
            const sanitized = sanitizeUser(normalizedStoredUser);
            userStorage.setCurrentUser(sanitized);
            setUser(normalizedStoredUser);
        }

        // Listen for Firebase Auth state changes.
        // Role is resolved from the cached backend login response (fastest),
        // or by calling the MongoDB backend API as fallback.
        // Firestore is intentionally skipped — it causes "client is offline" errors.
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                // ── Fast exit: login() already resolved user — skip redundant API calls ──
                if (loginResolvedRef.current) {
                    loginResolvedRef.current = false;
                    setIsLoading(false);
                    return;
                }

                console.log('🔥 [AuthContext] Firebase User detected:', firebaseUser.email);
                setIsLoading(true);
                try {
                    const existingStored = userStorage.getCurrentUser();
                    let resolvedRole: import('@/types').UserRole | '' = '';
                    let resolvedName: string = existingStored?.name || firebaseUser.displayName || 'User';

                    let foundBackendId: string | undefined = undefined;
                    let mongoPayload: any = {};

                    // ── Ultra-fast path: use session cache if UID matches ──
                    const cached = getSessionCache();
                    if (cached && cached.user.id === firebaseUser.uid) {
                        console.log(`⚡ [AuthContext] Session cache hit — instant restore`);
                        const sanitized = sanitizeUser(cached.user);
                        userStorage.setCurrentUser(sanitized);
                        setUser(cached.user);
                        if (cached.token && !localStorage.getItem('autospf_token')) {
                            localStorage.setItem('autospf_token', cached.token);
                        }
                        setIsLoading(false);

                        // Background refresh: silently update from backend
                        queueMicrotask(() => {
                            backgroundRefreshUser(firebaseUser.email || '', firebaseUser.uid, cached.user);
                        });
                        return;
                    }

                    // ── Fast path: use cached backend user from the login() call ──
                    const cachedBackendUser = localStorage.getItem('autospf_backend_user');
                    if (cachedBackendUser) {
                        try {
                            const parsed = JSON.parse(cachedBackendUser);
                            foundBackendId = parsed._id;
                            if (parsed.role) {
                                const migratedRole = migrateLegacyUserRole(parsed.role);
                                if (migratedRole) resolvedRole = migratedRole;
                            }
                            if (parsed.name) resolvedName = parsed.name;
                            console.log(`✅ [AuthContext] Role from cached backend login: ${resolvedRole}`);
                            // Clear the cache — it's single-use
                            localStorage.removeItem('autospf_backend_user');
                        } catch { /* ignore malformed cache */ }
                    }

                    // ── Primary path: fetch role from MongoDB backend API ──
                    if (!resolvedRole || !foundBackendId) {
                        try {
                            const resp = await fetch(
                                `${BACKEND_URL}/users?email=${encodeURIComponent(firebaseUser.email || '')}`,
                                { signal: AbortSignal.timeout(5000) }
                            );
                            if (resp.ok) {
                                const json = await resp.json();
                                const found = Array.isArray(json.data)
                                    ? json.data.find((u: any) =>
                                        u.email?.toLowerCase() === firebaseUser.email?.toLowerCase()
                                      )
                                    : json.data;
                                
                                if (found) {
                                    foundBackendId = found._id || found.id || foundBackendId;
                                    const migratedRole = migrateLegacyUserRole(found.role);
                                    if (migratedRole) resolvedRole = migratedRole;
                                    if (found.name) resolvedName = found.name;
                                    
                                    // Cache additional Mongo payloads
                                    mongoPayload = {
                                        avatar: found.avatar,
                                        createdAt: found.createdAt,
                                        isActive: found.isActive !== undefined ? found.isActive : true,
                                        lastActive: found.updatedAt || new Date().toISOString()
                                    };

                                    console.log(`✅ [AuthContext] Role from MongoDB API: ${resolvedRole}`);
                                }
                            }
                        } catch (backendErr) {
                            console.warn('⚠️ [AuthContext] Backend role lookup failed:', backendErr);
                        }
                    }

                    // ── Fallback Path ──
                    if (!resolvedRole) {
                         resolvedRole = (existingStored?.id === firebaseUser.uid && existingStored?.role)
                             ? getSafeUserRole(existingStored.role, CUSTOMER_ROLE)
                             : CUSTOMER_ROLE;
                    }

                    const finalRole: import('@/types').UserRole = resolvedRole as import('@/types').UserRole;
                    console.log(`🔐 [AuthContext] Final resolved role: ${finalRole}`);

                    // Combine into User data with both backend _id and frontend UID
                    let backendId = foundBackendId;
                    if (!backendId && existingStored?._id) {
                        backendId = existingStored._id;
                    }

                    const userData: User = {
                        id: firebaseUser.uid,
                        _id: backendId,
                        email: firebaseUser.email || '',
                        name: resolvedName,
                        role: finalRole,
                        createdAt: mongoPayload.createdAt || existingStored?.createdAt || new Date().toISOString(),
                        password: '',
                        isActive: mongoPayload.isActive ?? existingStored?.isActive ?? true,
                        lastActive: mongoPayload.lastActive || existingStored?.lastActive || new Date().toISOString(),
                        avatar: mongoPayload.avatar || existingStored?.avatar || undefined,
                    };
                    const sanitized = sanitizeUser(userData);
                    userStorage.setCurrentUser(sanitized);
                    setUser(userData);

                    // Persist session cache for next page load / refresh
                    const token = localStorage.getItem('autospf_token') || '';
                    setSessionCache(userData, token);

                    // Ensure Firebase token is also available as fallback
                    if (!localStorage.getItem('autospf_token')) {
                        const fbToken = await firebaseUser.getIdToken();
                        localStorage.setItem('autospf_token', fbToken);
                    }
                } catch (err) {
                    console.error('❌ [AuthContext] Auth state error:', err);
                    // Don't wipe existing user state on error
                } finally {
                    setIsLoading(false);
                }
            } else {
                console.log('ℹ️ [AuthContext] Firebase User signed out.');
                userStorage.setCurrentUser(null);
                setUser(null);
                localStorage.removeItem('autospf_token');
                localStorage.removeItem('autospf_backend_user');
                clearSessionCache();
                setIsLoading(false);
            }
        });

        return () => unsubscribe();
    }, [sanitizeUser]);

    /**
     * Background refresh: silently update user data from backend
     * without blocking the UI or navigation.
     */
    const backgroundRefreshUser = useCallback(async (email: string, uid: string, currentUser: User) => {
        try {
            const resp = await fetch(
                `${BACKEND_URL}/users?email=${encodeURIComponent(email)}`,
                { signal: AbortSignal.timeout(5000) }
            );
            if (!resp.ok) return;
            const json = await resp.json();
            const found = Array.isArray(json.data)
                ? json.data.find((u: any) => u.email?.toLowerCase() === email.toLowerCase())
                : json.data;
            if (!found) return;

            const migratedRole = migrateLegacyUserRole(found.role);
            const newRole = migratedRole || currentUser.role;
            const hasChanged = newRole !== currentUser.role
                || found.name !== currentUser.name
                || (found._id || found.id) !== currentUser._id;

            if (hasChanged) {
                const refreshedUser: User = {
                    ...currentUser,
                    _id: found._id || found.id || currentUser._id,
                    name: found.name || currentUser.name,
                    role: newRole as import('@/types').UserRole,
                    avatar: found.avatar || currentUser.avatar,
                    isActive: found.isActive ?? currentUser.isActive,
                    lastActive: found.updatedAt || currentUser.lastActive,
                };
                const sanitized = sanitizeUser(refreshedUser);
                userStorage.setCurrentUser(sanitized);
                setUser(refreshedUser);
                const token = localStorage.getItem('autospf_token') || '';
                setSessionCache(refreshedUser, token);
                console.log('🔄 [AuthContext] Background refresh applied');
            }
        } catch {
            // Silent fail — user is already using cached data
        }
    }, [sanitizeUser]);


    const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
        try {
            // ── PARALLEL: Fire Firebase + Backend auth simultaneously ──
            const [firebaseCred, backendResult] = await Promise.allSettled([
                signInWithEmailAndPassword(auth, email, password),
                fetch(`${BACKEND_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                    signal: AbortSignal.timeout(6000)
                }).then(async (resp) => {
                    if (resp.ok) {
                        return resp.json();
                    }
                    throw new Error(`Backend login: ${resp.status}`);
                })
            ]);

            // Firebase MUST succeed
            if (firebaseCred.status === 'rejected') {
                throw firebaseCred.reason;
            }

            const firebaseUser = firebaseCred.value.user;

            // ── Process backend result (non-blocking if it failed) ──
            let backendToken = '';
            let backendUser: any = null;

            if (backendResult.status === 'fulfilled') {
                const json = backendResult.value;
                if (json.data?.token) {
                    backendToken = json.data.token;
                    localStorage.setItem('autospf_token', backendToken);
                    console.log('✅ [AuthContext] Backend JWT stored successfully');
                }
                if (json.data?.user) {
                    backendUser = json.data.user;
                }
            } else {
                console.warn('⚠️ [AuthContext] Backend login failed — API calls may 401:', backendResult.reason);
            }

            // ── Build user immediately from backend response — no second API call needed ──
            if (backendUser) {
                const migratedRole = migrateLegacyUserRole(backendUser.role);
                const finalRole = migratedRole || CUSTOMER_ROLE;

                const userData: User = {
                    id: firebaseUser.uid,
                    _id: backendUser._id || backendUser.id,
                    email: firebaseUser.email || email,
                    name: backendUser.name || firebaseUser.displayName || 'User',
                    role: finalRole as import('@/types').UserRole,
                    createdAt: backendUser.createdAt || new Date().toISOString(),
                    password: '',
                    isActive: backendUser.isActive ?? true,
                    lastActive: backendUser.updatedAt || new Date().toISOString(),
                    avatar: backendUser.avatar || undefined,
                };
                const sanitized = sanitizeUser(userData);
                userStorage.setCurrentUser(sanitized);
                setUser(userData);
                setSessionCache(userData, backendToken);

                // Signal onAuthStateChanged to skip redundant work
                loginResolvedRef.current = true;
                setIsLoading(false);
            } else {
                // Backend failed — let onAuthStateChanged handle role resolution
                localStorage.setItem('autospf_backend_user', JSON.stringify({ email }));
            }

            return { success: true };
        } catch (error: any) {
            console.error('Login error:', error);
            // Translate Firebase Auth error codes to user-friendly messages
            const code = error?.code || '';
            let message = error.message || 'Invalid credentials';
            switch (code) {
                case 'auth/too-many-requests':
                    message = 'Too many login attempts. Please wait a few minutes and try again.';
                    break;
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                case 'auth/invalid-credential':
                    message = 'Invalid email or password. Please try again.';
                    break;
                case 'auth/invalid-email':
                    message = 'Please enter a valid email address.';
                    break;
                case 'auth/user-disabled':
                    message = 'This account has been disabled. Contact support.';
                    break;
                case 'auth/network-request-failed':
                    message = 'Network error. Check your internet connection and try again.';
                    break;
            }
            return { success: false, message };
        }
    }, [sanitizeUser]);

    const signup = useCallback(async (email: string, password: string, name: string): Promise<{ success: boolean; message?: string }> => {
        try {
            // Step 1: Create user in Firebase
            const credential = await createUserWithEmailAndPassword(auth, email, password);
            const firebaseUser = credential.user;
            
            // Step 2: Create user in MongoDB Backend
            // Try /register first. If OTP is required and it fails, fall back to
            // /social-login which creates the user without OTP verification.
            let backendSynced = false;
            try {
                const resp = await fetch(`${BACKEND_URL}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, name, role: 'customer' }),
                    signal: AbortSignal.timeout(8000)
                });
                if (resp.ok) {
                    const json = await resp.json();
                    if (json.data?.token) {
                        localStorage.setItem('autospf_token', json.data.token);
                    }
                    if (json.data?.user) {
                        localStorage.setItem('autospf_backend_user', JSON.stringify(json.data.user));
                    }
                    backendSynced = true;
                    console.log('✅ [AuthContext] Backend register synced');
                } else {
                    console.warn(`⚠️ [AuthContext] /register returned ${resp.status}, trying /social-login fallback`);
                }
            } catch (regErr) {
                console.warn('⚠️ [AuthContext] /register failed:', regErr);
            }

            // Fallback: use social-login to ensure the backend user record exists
            if (!backendSynced) {
                try {
                    const resp = await fetch(`${BACKEND_URL}/auth/social-login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email,
                            name,
                            provider: 'email',
                            providerId: firebaseUser.uid,
                        }),
                        signal: AbortSignal.timeout(8000)
                    });
                    if (resp.ok) {
                        const json = await resp.json();
                        if (json.data?.token) {
                            localStorage.setItem('autospf_token', json.data.token);
                        }
                        if (json.data?.user) {
                            localStorage.setItem('autospf_backend_user', JSON.stringify(json.data.user));
                        }
                        console.log('✅ [AuthContext] Backend social-login fallback synced');
                    } else {
                        console.warn('⚠️ [AuthContext] social-login fallback also failed');
                    }
                } catch (fallbackErr) {
                    console.warn('⚠️ [AuthContext] social-login fallback error:', fallbackErr);
                }
            }

            return { success: true };
        } catch (error: any) {
            console.error('Signup error:', error);
            const code = error?.code || '';
            let message = error.message || 'An error occurred during signup';
            switch (code) {
                case 'auth/too-many-requests':
                    message = 'Too many attempts. Please wait a few minutes and try again.';
                    break;
                case 'auth/email-already-in-use':
                    message = 'An account with this email already exists. Try logging in.';
                    break;
                case 'auth/weak-password':
                    message = 'Password is too weak. Use at least 6 characters.';
                    break;
                case 'auth/invalid-email':
                    message = 'Please enter a valid email address.';
                    break;
                case 'auth/network-request-failed':
                    message = 'Network error. Check your internet connection and try again.';
                    break;
            }
            return { success: false, message };
        }
    }, []);

    const resetPassword = useCallback(async (email: string): Promise<{ success: boolean; message?: string }> => {
        try {
            await sendPasswordResetEmail(auth, email);
            return { success: true };
        } catch (error: any) {
            return { success: false, message: error.message || 'An error occurred during password reset' };
        }
    }, []);

    const logout = useCallback(async () => {
        try {
            await signOut(auth);
            localStorage.removeItem('autospf_token');
            userStorage.setCurrentUser(null);
            setUser(null);
            clearSessionCache();
        } catch (error) {
            console.error('Logout error:', error);
        }
    }, []);

    const updateUser = useCallback(async (
        updatedUser: User,
        options?: { localOnly?: boolean }
    ): Promise<{ success: boolean; message?: string; offline?: boolean; reason?: 'timeout' | 'network' | 'error' }> => {
        const applyLocalUpdate = (userData: User) => {
            const sanitized = sanitizeUser(userData);
            userStorage.update(sanitized);
            userStorage.setCurrentUser(sanitized);
            setUser(userData); // Keep the exact userData for React state, avoiding missing avatar
        };

        if (options?.localOnly) {
            applyLocalUpdate(updatedUser);
            return { success: true, offline: true, reason: 'network' };
        }

        try {
            console.log('📦 [Frontend] Attempting API update with avatar length:', updatedUser.avatar?.length || 0);
            const response = await UserService.updateUser(updatedUser.id, {
                name: updatedUser.name,
                email: updatedUser.email,
                avatar: updatedUser.avatar
            });

            console.log('✅ [Frontend] Update User API Response Data:', response.data);

            if (response.success) {
                const updatedData = response.data || updatedUser;
                console.log('✨ [Frontend] Applying updated data format to state:', updatedData);
                applyLocalUpdate(updatedData);
                // Update session cache too
                const token = localStorage.getItem('autospf_token') || '';
                setSessionCache(updatedData, token);
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
    }, [sanitizeUser]);

    const value = useMemo(() => ({
        user,
        isLoading,
        login,
        signup,
        resetPassword,
        logout,
        updateUser,
        setAuthUser: setUser
    }), [user, isLoading, login, signup, resetPassword, logout, updateUser]);

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
