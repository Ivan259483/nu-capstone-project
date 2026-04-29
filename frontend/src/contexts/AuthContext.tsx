// @refresh reset
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { User } from '@/types';
import { userStorage, initializeStorage } from '@/lib/storage';
import { UserService } from '@/lib/user-service';
import { auth } from '@/config/firebase';
import { CUSTOMER_ROLE, getSafeUserRole, migrateLegacyUserRole, ADMIN_DASHBOARD_ROLES, getDashboardPathForRole } from '@/lib/roles';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    onAuthStateChanged
} from 'firebase/auth';
import { getBaseApiUrl } from '@/lib/api';
import { getSharedSocket, refreshSocketAuth, destroySharedSocket } from '@/hooks/useRealtimeSync';

// NOTE: Firestore is intentionally NOT used for role lookup.
// Role is sourced from the MongoDB backend API (GET /api/users?email=...)
// to avoid Firestore "client is offline" errors blocking authentication.
const BACKEND_URL = getBaseApiUrl();

/* ═══════════════════════════════════════════════════════
   SESSION CACHE — persist role + profile across refreshes
   to eliminate redundant API calls on warm restarts.
   ═══════════════════════════════════════════════════════ */
const SESSION_CACHE_KEY = 'autospf_session_cache';
const SESSION_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const SESSION_CACHE_VERSION = 3; // Bump to invalidate stale caches (forced re-auth after role change hr→staff_quality_checker)

interface SessionCache {
    user: User;
    token: string;
    timestamp: number;
    version?: number;
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
        // Invalidate caches from older versions (stale/corrupted data)
        if ((parsed.version || 0) < SESSION_CACHE_VERSION) {
            localStorage.removeItem(SESSION_CACHE_KEY);
            return null;
        }
        // Ensure cached user has minimal required fields
        if (!parsed.user?.id || !parsed.user?.email) {
            localStorage.removeItem(SESSION_CACHE_KEY);
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

function setSessionCache(user: User, token: string): void {
    const cache: SessionCache = { user, token, timestamp: Date.now(), version: SESSION_CACHE_VERSION };
    try { localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cache)); } catch { /* quota */ }
}

function clearSessionCache(): void {
    localStorage.removeItem(SESSION_CACHE_KEY);
}

/* ═══════════════════════════════════════════════════════ */

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    /** True once Firebase's onAuthStateChanged has fired at least once and resolved. */
    isFirebaseAuthReady: boolean;
    login: (email: string, password: string) => Promise<{ success: boolean; role?: string; message?: string; requiresOTP?: boolean; userId?: string; maskedEmail?: string; requiresOtp?: boolean; requiresPasswordChange?: boolean; token?: string; data?: { requiresOtp?: boolean; requiresPasswordChange?: boolean; token?: string; email?: string; remainingAttempts?: number; loginAttempts?: number; maxAttempts?: number; locked?: boolean; lockUntilMs?: number; remainingMinutes?: number } }>;
    signup: (email: string, password: string, name: string) => Promise<{ success: boolean; message?: string }>;
    resetPassword: (email: string) => Promise<{ success: boolean; message?: string }>;
    logout: () => void;
    updateUser: (user: User, options?: { localOnly?: boolean }) => Promise<{ success: boolean; message?: string; offline?: boolean; reason?: 'timeout' | 'network' | 'error' }>;
    setAuthUser: (user: User | null) => void;
    markLoginInProgress: () => void;
    markLoginComplete: () => void;
    deleteAccount: (password: string) => Promise<{ success: boolean; message?: string }>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AVATAR_STORAGE_PREFIX = 'autospf_avatar_';
const stripAvatarMetadata = (value: string) => value.replace(/^data:image\/\w+;base64,/, '');
const isLikelyBase64Image = (value: string) =>
    value.startsWith('data:image/') || (value.length > 200 && !value.startsWith('http'));

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    // True once Firebase's onAuthStateChanged has fired at least once.
    // Login.tsx uses this to avoid redirecting on stale localStorage data.
    const [isFirebaseAuthReady, setIsFirebaseAuthReady] = useState(false);
    const pendingAvatarRef = useRef<{ id: string; avatar: string } | null>(null);
    // Track whether login() already resolved the user to avoid double-fetch in onAuthStateChanged
    const loginResolvedRef = useRef(false);
    // Track whether login() is currently in progress — onAuthStateChanged must completely
    // defer to login() during this window to prevent stale role data from triggering redirects.
    const loginInProgressRef = useRef(false);

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
        // NOTE: We intentionally do NOT call setUser() here from localStorage.
        // Previously, pre-populating user before onAuthStateChanged caused a race:
        // onAuthStateChanged would hit the session cache and immediately drop isLoading
        // to false while user was already set — triggering a redirect on /login even
        // for users who explicitly navigated there to log in as someone else.
        // The stored user data is still used as a hint inside onAuthStateChanged below.

        // Listen for Firebase Auth state changes.
        // Role is resolved from the cached backend login response (fastest),
        // or by calling the MongoDB backend API as fallback.
        // Firestore is intentionally skipped — it causes "client is offline" errors.
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                // ── Fast exit: login() is in progress or already resolved user ──
                // login() will handle setUser() with the correct role from the backend.
                // We MUST NOT proceed here or we'll set stale role data and cause
                // admin users to be redirected to /customer/dashboard.
                console.log('🔍 [DEBUG-onAuthStateChanged] Entry:', {
                    email: firebaseUser.email,
                    loginInProgress: loginInProgressRef.current,
                    loginResolved: loginResolvedRef.current,
                    hasToken: !!localStorage.getItem('autospf_token'),
                });
                if (loginInProgressRef.current || loginResolvedRef.current) {
                    console.log('⏭️ [AuthContext] Skipping onAuthStateChanged — login() is handling auth');
                    if (loginResolvedRef.current) {
                        loginResolvedRef.current = false;
                    }
                    setIsLoading(false);
                    setIsFirebaseAuthReady(true);
                    return;
                }

                console.log('🔥 [AuthContext] Firebase User detected on reload:', firebaseUser.email);
                setIsLoading(true);
                try {
                    const existingStored = userStorage.getCurrentUser();

                    // ── Ultra-fast path: session cache hit ──
                    const cached = getSessionCache();
                    if (cached && cached.user.id === firebaseUser.uid) {
                        // Strictly reject suspended/inactive accounts even on cache hit
                        if (cached.user.isActive === false) {
                            console.warn('🔒 [AuthContext] Session cache hit but user is inactive — forcing logout.');
                            clearSessionCache();
                            localStorage.removeItem('autospf_token');
                            localStorage.removeItem('autospf_backend_user');
                            userStorage.setCurrentUser(null);
                            setUser(null);
                            await signOut(auth).catch(() => {});
                            setIsLoading(false);
                            setIsFirebaseAuthReady(true);
                            return;
                        }
                        console.log(`⚡ [AuthContext] Session cache hit — instant restore, role: ${cached.user.role}`);
                        const sanitized = sanitizeUser(cached.user);
                        userStorage.setCurrentUser(sanitized);
                        setUser(cached.user);
                        if (cached.token && !localStorage.getItem('autospf_token')) {
                            localStorage.setItem('autospf_token', cached.token);
                        }
                        setIsLoading(false);
                        setIsFirebaseAuthReady(true);
                        queueMicrotask(() => {
                            backgroundRefreshUser(firebaseUser.email || '', firebaseUser.uid, cached.user);
                        });
                        return;
                    }

                    // ── Full sync: attempt fresh backend JWT via social-login ──
                    // If this fails for ANY reason (4xx, network, CORS), we keep the
                    // Firebase session alive and fall back to stored data. Never sign out.
                    let resolvedRole: import('@/types').UserRole | '' = '';
                    let resolvedName: string = existingStored?.name || firebaseUser.displayName || 'User';
                    let foundBackendId: string | undefined = existingStored?._id;
                    let mongoPayload: any = {};
                    let backendSyncOk = false;

                    try {
                        // Force-refresh Firebase ID token to ensure it is not stale
                        await firebaseUser.getIdToken(true);

                        const syncResp = await fetch(`${BACKEND_URL}/auth/social-login`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                email: firebaseUser.email,
                                name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                                provider: 'google',
                                providerId: firebaseUser.uid,
                                photoURL: firebaseUser.photoURL || undefined,
                            }),
                            signal: AbortSignal.timeout(8000),
                        });

                        if (syncResp.ok) {
                            const syncJson = await syncResp.json();
                            const backendUser = syncJson.data?.user;
                            const backendToken = syncJson.data?.token;

                            // Block suspended/inactive accounts immediately
                            if (backendUser && backendUser.isActive === false) {
                                console.warn('🔒 [AuthContext] Backend sync returned inactive user — forcing logout.');
                                clearSessionCache();
                                localStorage.removeItem('autospf_token');
                                localStorage.removeItem('autospf_backend_user');
                                userStorage.setCurrentUser(null);
                                setUser(null);
                                await signOut(auth).catch(() => {});
                                setIsLoading(false);
                                setIsFirebaseAuthReady(true);
                                return;
                            }

                            if (backendToken) {
                                localStorage.setItem('autospf_token', backendToken);
                                console.log('✅ [onAuth] Fresh backend JWT saved');
                            }
                            if (backendUser) {
                                foundBackendId = backendUser._id || backendUser.id || foundBackendId;
                                const migratedRole = migrateLegacyUserRole(backendUser.role);
                                if (migratedRole) resolvedRole = migratedRole;
                                if (backendUser.name) resolvedName = backendUser.name;
                                mongoPayload = {
                                    avatar: backendUser.avatar,
                                    phone: backendUser.phone,
                                    createdAt: backendUser.createdAt,
                                    isActive: backendUser.isActive ?? true,
                                    lastActive: backendUser.updatedAt || new Date().toISOString(),
                                };
                                backendSyncOk = true;
                                console.log(`✅ [onAuth] Backend sync OK — role: ${resolvedRole}`);
                            }
                        } else {
                            // ── Backend returned 4xx/5xx ──
                            const errBody = await syncResp.json().catch(() => ({}));
                            // If specifically ACCOUNT_INACTIVE, force logout
                            if (syncResp.status === 403 && errBody?.code === 'ACCOUNT_INACTIVE') {
                                console.warn('🔒 [AuthContext] socialLogin returned ACCOUNT_INACTIVE — forcing logout.');
                                clearSessionCache();
                                localStorage.removeItem('autospf_token');
                                localStorage.removeItem('autospf_backend_user');
                                userStorage.setCurrentUser(null);
                                setUser(null);
                                await signOut(auth).catch(() => {});
                                setIsLoading(false);
                                setIsFirebaseAuthReady(true);
                                return;
                            }
                            const errText = JSON.stringify(errBody);
                            console.warn(`⚠️ [onAuth] Backend sync returned ${syncResp.status} — keeping Firebase session alive. Body: ${errText}`);
                        }
                    } catch (syncErr) {
                        // ── Network / timeout / CORS error — DO NOT sign out ──
                        console.warn('⚠️ [onAuth] Backend sync failed — keeping Firebase session alive:', syncErr);
                    }

                    // Fallback role if backend sync failed
                    if (!resolvedRole) {
                        resolvedRole = (existingStored?.id === firebaseUser.uid && existingStored?.role)
                            ? getSafeUserRole(existingStored.role, CUSTOMER_ROLE)
                            : CUSTOMER_ROLE;
                        console.warn(`⚠️ [onAuth] ${backendSyncOk ? 'No role in response' : 'Backend sync failed'} — fallback role: ${resolvedRole}`);
                    }

                    // ── Bug 2 fix: restore cached token if localStorage is empty ──
                    // After a backend sync failure, localStorage may be empty (no autospf_token).
                    // Check the session cache and restore the token so API calls go out with Bearer.
                    if (!localStorage.getItem('autospf_token') && cached?.token) {
                        localStorage.setItem('autospf_token', cached.token);
                        console.log('🔑 [onAuth] Restored cached token from session cache (fallback path)');
                    }

                    const finalRole: import('@/types').UserRole = resolvedRole as import('@/types').UserRole;
                    console.log(`🔐 [AuthContext] Final resolved role: ${finalRole}`);

                    const userData: User = {
                        id: firebaseUser.uid,
                        _id: foundBackendId,
                        email: firebaseUser.email || '',
                        name: resolvedName,
                        role: finalRole,
                        createdAt: mongoPayload.createdAt || existingStored?.createdAt || new Date().toISOString(),
                        password: '',
                        isActive: mongoPayload.isActive ?? existingStored?.isActive ?? true,
                        lastActive: mongoPayload.lastActive || existingStored?.lastActive || new Date().toISOString(),
                        avatar: mongoPayload.avatar || existingStored?.avatar || firebaseUser.photoURL || undefined,
                        phone: mongoPayload.phone || existingStored?.phone || undefined,
                    };
                    const sanitized = sanitizeUser(userData);
                    userStorage.setCurrentUser(sanitized);
                    setUser(userData);

                    // Persist session cache — next reload will hit the fast path instantly
                    const token = localStorage.getItem('autospf_token') || '';
                    setSessionCache(userData, token);

                } catch (err) {
                    // Unexpected error — do NOT wipe session, Firebase is still valid
                    console.error('❌ [AuthContext] Unexpected error in onAuthStateChanged:', err);
                } finally {
                    setIsLoading(false);
                    setIsFirebaseAuthReady(true);
                }
            } else {
                // Firebase reports no signed-in user.
                // Staff/admin accounts are backend-only — they authenticate via OTP and have
                // no Firebase Auth entry. Preserve their session if backend token exists.
                const backendToken = localStorage.getItem('autospf_token');
                const backendUserRaw = localStorage.getItem('autospf_backend_user');

                if (backendToken && backendUserRaw) {
                    console.log('ℹ️ [AuthContext] No Firebase session but backend token found — restoring backend-only user.');
                    try {
                        const parsed = JSON.parse(backendUserRaw);

                        // Block suspended/inactive backend-only accounts
                        if (parsed.isActive === false) {
                            console.warn('🔒 [AuthContext] Backend-only user is inactive — clearing session.');
                            userStorage.setCurrentUser(null);
                            setUser(null);
                            localStorage.removeItem('autospf_token');
                            localStorage.removeItem('autospf_backend_user');
                            clearSessionCache();
                            setIsLoading(false);
                            setIsFirebaseAuthReady(true);
                            return;
                        }

                        const restoredUser: User = {
                            id: parsed._id || parsed.id || '',
                            _id: parsed._id || parsed.id || '',
                            email: parsed.email || '',
                            name: parsed.name || '',
                            role: parsed.role || 'customer',
                            createdAt: parsed.createdAt || new Date().toISOString(),
                            password: '',
                            isActive: parsed.isActive ?? true,
                            lastActive: parsed.lastActive || new Date().toISOString(),
                            avatar: parsed.avatar || undefined,
                        };
                        const sanitized = sanitizeUser(restoredUser);
                        userStorage.setCurrentUser(sanitized);
                        setUser(restoredUser);
                        setSessionCache(restoredUser, backendToken);
                    } catch {
                        console.warn('⚠️ [AuthContext] Could not parse autospf_backend_user — clearing session.');
                        userStorage.setCurrentUser(null);
                        setUser(null);
                        localStorage.removeItem('autospf_token');
                        localStorage.removeItem('autospf_backend_user');
                        clearSessionCache();
                    }
                } else {
                    // Genuine sign-out — Firebase has no session AND no backend-only token
                    console.log('ℹ️ [AuthContext] Firebase signed out — clearing full session.');
                    userStorage.setCurrentUser(null);
                    setUser(null);
                    localStorage.removeItem('autospf_token');
                    localStorage.removeItem('autospf_backend_user');
                    clearSessionCache();
                }
                setIsLoading(false);
                setIsFirebaseAuthReady(true);
            }
        });

        return () => unsubscribe();
    }, [sanitizeUser]);

    /* ═══════════════════════════════════════════════════════
       REAL-TIME ROLE CHANGE LISTENER
       When an admin changes this user's role via AdminHub,
       the backend emits a 'user:role_changed' socket event.
       We update the local session and redirect automatically.
       Works on all pages, all dashboards, and survives reconnections.
       ═══════════════════════════════════════════════════════ */
    useEffect(() => {
        if (!user) return;

        let socket: ReturnType<typeof getSharedSocket> | null = null;
        try {
            socket = getSharedSocket();
        } catch {
            // Socket not ready yet — skip
            return;
        }

        // ── Room joining (runs immediately + on every reconnect) ──
        const joinUserRooms = () => {
            if (!socket) return;
            if (user.id) socket.emit('join_room', `user:${user.id}`);
            if (user._id && user._id !== user.id) socket.emit('join_room', `user:${user._id}`);
            console.log('🏠 [AuthContext] Joined user rooms:', { id: user.id, _id: user._id });
        };

        joinUserRooms();
        socket.on('connect', joinUserRooms);

        // ── Role change handler ──
        const handleRoleChanged = (payload: { newRole: string; previousRole: string; user?: any }) => {
            console.log('🔄 [AuthContext] Received user:role_changed event:', payload);

            const migratedNewRole = migrateLegacyUserRole(payload.newRole);
            if (!migratedNewRole || migratedNewRole === user.role) return;

            // Build updated user object
            const backendUser = payload.user;
            const updatedUser: User = {
                ...user,
                role: migratedNewRole as import('@/types').UserRole,
                ...(backendUser?.name ? { name: backendUser.name } : {}),
                ...(backendUser?.avatar ? { avatar: backendUser.avatar } : {}),
            };

            // Update all caches
            const sanitized = sanitizeUser(updatedUser);
            userStorage.setCurrentUser(sanitized);
            const token = localStorage.getItem('autospf_token') || '';
            setSessionCache(updatedUser, token);

            // Also update the backend-only user cache if it exists
            const backendUserRaw = localStorage.getItem('autospf_backend_user');
            if (backendUserRaw) {
                try {
                    const parsed = JSON.parse(backendUserRaw);
                    parsed.role = migratedNewRole;
                    localStorage.setItem('autospf_backend_user', JSON.stringify(parsed));
                } catch { /* ignore parse errors */ }
            }

            // Update React state — this triggers re-renders across the app
            setUser(updatedUser);

            // Redirect to the correct dashboard for the new role
            const newDashboardPath = getDashboardPathForRole(migratedNewRole);
            console.log(`🚀 [AuthContext] Role changed: ${payload.previousRole} → ${migratedNewRole}. Redirecting to ${newDashboardPath}`);
            window.location.href = newDashboardPath;
        };

        socket.on('user:role_changed', handleRoleChanged);

        return () => {
            socket?.off('connect', joinUserRooms);
            socket?.off('user:role_changed', handleRoleChanged);
        };
    }, [user, sanitizeUser]);

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

            // If the account was deactivated while the user is active, force logout immediately
            if (found.isActive === false) {
                console.warn('🔒 [AuthContext] Background refresh detected inactive account — forcing logout.');
                clearSessionCache();
                localStorage.removeItem('autospf_token');
                localStorage.removeItem('autospf_backend_user');
                userStorage.setCurrentUser(null);
                setUser(null);
                await signOut(auth).catch(() => {});
                window.location.href = '/login';
                return;
            }

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
                    phone: found.phone || currentUser.phone,
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


    const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; role?: string; message?: string; requiresOTP?: boolean; userId?: string; maskedEmail?: string; requiresOtp?: boolean; requiresPasswordChange?: boolean; token?: string; data?: { requiresOtp?: boolean; requiresPasswordChange?: boolean; token?: string; email?: string; remainingAttempts?: number; loginAttempts?: number; maxAttempts?: number; locked?: boolean; lockUntilMs?: number; remainingMinutes?: number } }> => {
        try {
            // ── CRITICAL: Signal that login() owns the auth flow ──
            // onAuthStateChanged MUST NOT resolve or redirect during this window.
            loginInProgressRef.current = true;
            loginResolvedRef.current = false;

            // Clear stale caches so no stale role data can leak through
            clearSessionCache();
            localStorage.removeItem('autospf_backend_user');
            userStorage.setCurrentUser(null);

            console.log('🚀 [DEBUG-login] Starting login for:', email);
            console.log('🚀 [DEBUG-login] BACKEND_URL is:', BACKEND_URL);

            // ── PARALLEL: Fire Firebase + Backend auth simultaneously ──
            const [firebaseCred, backendResult] = await Promise.allSettled([
                signInWithEmailAndPassword(auth, email, password),
                fetch(`${BACKEND_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                    signal: AbortSignal.timeout(15000)
                }).then(async (resp) => {
                    console.log('📡 [DEBUG-login] Raw backend response status:', resp.status, resp.statusText);
                    const text = await resp.text();
                    console.log('📡 [DEBUG-login] Raw backend response body:', text);
                    // Always parse body — never throw. Callers check .status to decide what to do.
                    try {
                        return { status: resp.status, ok: resp.ok, body: JSON.parse(text) };
                    } catch {
                        return { status: resp.status, ok: resp.ok, body: {} };
                    }
                })
            ]);

            console.log('📊 [DEBUG-login] Firebase result:', firebaseCred.status);
            console.log('📊 [DEBUG-login] Backend result:', backendResult.status);

            // ── Extract backend response body (always available now) ──
            const backendPayload = backendResult.status === 'fulfilled'
                ? (backendResult.value as any)
                : null;
            const backendStatus = backendPayload?.status ?? 0;
            let backendBody = backendPayload?.body ?? {};

            // ── Check backend 423 FIRST: account is locked — block regardless of Firebase ──
            if (backendStatus === 423) {
                loginInProgressRef.current = false;
                loginResolvedRef.current = false;
                if (firebaseCred.status === 'fulfilled') {
                    await signOut(auth);
                }
                return {
                    success: false,
                    message: backendBody.message || 'Account locked due to too many failed attempts.',
                    data: backendBody.data,
                };
            }

            // ── Check backend 403 ACCOUNT_INACTIVE: suspended/archived account ──
            if (backendStatus === 403 && backendBody?.code === 'ACCOUNT_INACTIVE') {
                loginInProgressRef.current = false;
                loginResolvedRef.current = false;
                if (firebaseCred.status === 'fulfilled') {
                    await signOut(auth);
                }
                clearSessionCache();
                localStorage.removeItem('autospf_token');
                localStorage.removeItem('autospf_backend_user');
                userStorage.setCurrentUser(null);
                setUser(null);
                return {
                    success: false,
                    message: backendBody.message || 'This account is disabled. Please try to contact the administrator.',
                };
            }

            // ── Firebase MUST succeed for normal login flow ──
            // EXCEPTION: If the backend returned a 2FA OTP challenge (requiresOTP),
            // we must honour it even if Firebase rejected — staff/admin accounts
            // created via the admin panel may not exist in Firebase Auth.
            if (firebaseCred.status === 'rejected') {
                // ── ACCOUNT_INACTIVE intercept (Firebase rejected, backend returned 403) ──
                if (backendStatus === 403 && backendBody?.code === 'ACCOUNT_INACTIVE') {
                    loginInProgressRef.current = false;
                    loginResolvedRef.current = false;
                    clearSessionCache();
                    localStorage.removeItem('autospf_token');
                    localStorage.removeItem('autospf_backend_user');
                    userStorage.setCurrentUser(null);
                    setUser(null);
                    return {
                        success: false,
                        message: backendBody.message || 'This account is disabled. Please try to contact the administrator.',
                    };
                }

                // ── 2FA intercept: backend succeeded with OTP challenge ──
                if (backendBody?.data?.requiresOTP) {
                    console.log('🔐 [DEBUG-login] Firebase rejected but backend returned OTP challenge — honouring 2FA');
                    loginInProgressRef.current = false;
                    loginResolvedRef.current = false;
                    clearSessionCache();
                    localStorage.removeItem('autospf_token');
                    localStorage.removeItem('autospf_backend_user');
                    userStorage.setCurrentUser(null);
                    setUser(null);
                    return {
                        success: true,
                        requiresOTP: true,
                        userId: backendBody.data.userId,
                        maskedEmail: backendBody.data.maskedEmail,
                    };
                }

                // ── Unverified account: backend returned requiresOtp ──
                if (backendBody?.success && backendBody?.data?.requiresOtp) {
                    loginInProgressRef.current = false;
                    loginResolvedRef.current = false;
                    clearSessionCache();
                    localStorage.removeItem('autospf_token');
                    localStorage.removeItem('autospf_backend_user');
                    userStorage.setCurrentUser(null);
                    setUser(null);
                    return {
                        success: true,
                        requiresOtp: true,
                        data: { requiresOtp: true, email: backendBody.data.email },
                    };
                }

                // ── Staff first login: backend returned requiresPasswordChange ──
                if (backendBody?.success && backendBody?.data?.requiresPasswordChange) {
                    loginInProgressRef.current = false;
                    loginResolvedRef.current = false;
                    clearSessionCache();
                    localStorage.removeItem('autospf_token');
                    localStorage.removeItem('autospf_backend_user');
                    userStorage.setCurrentUser(null);
                    setUser(null);
                    return {
                        success: true,
                        requiresPasswordChange: true,
                        data: { requiresPasswordChange: true, token: backendBody.data.token },
                    };
                }

                // ── Backend-only login: Firebase rejected but backend returned 200 with JWT ──
                // Staff/admin accounts created via admin panel may not exist in Firebase Auth.
                // If backend succeeded with a token + user, log them in via backend-only session.
                if (backendPayload?.ok && backendBody?.success && backendBody?.data?.token && backendBody?.data?.user) {
                    const bUser = backendBody.data.user;
                    const bToken = backendBody.data.token;

                    // Block suspended accounts
                    if (bUser.isActive === false) {
                        loginInProgressRef.current = false;
                        loginResolvedRef.current = false;
                        clearSessionCache();
                        localStorage.removeItem('autospf_token');
                        localStorage.removeItem('autospf_backend_user');
                        userStorage.setCurrentUser(null);
                        setUser(null);
                        return {
                            success: false,
                            message: 'This account is disabled. Please try to contact the administrator.',
                        };
                    }

                    console.log('✅ [DEBUG-login] Firebase rejected but backend OK — backend-only login for staff account');
                    localStorage.setItem('autospf_token', bToken);
                    localStorage.setItem('autospf_backend_user', JSON.stringify(bUser));

                    const migratedRole = migrateLegacyUserRole(bUser.role);
                    const finalRole = migratedRole || CUSTOMER_ROLE;
                    const userData: User = {
                        id: bUser._id || bUser.id || '',
                        _id: bUser._id || bUser.id || '',
                        email: bUser.email || '',
                        name: bUser.name || '',
                        role: finalRole as import('@/types').UserRole,
                        createdAt: bUser.createdAt || new Date().toISOString(),
                        password: '',
                        isActive: bUser.isActive ?? true,
                        lastActive: bUser.lastActive || new Date().toISOString(),
                        avatar: bUser.avatar || undefined,
                    };

                    const sanitized = sanitizeUser(userData);
                    userStorage.setCurrentUser(sanitized);
                    setSessionCache(userData, bToken);

                    loginResolvedRef.current = true;
                    loginInProgressRef.current = false;

                    setUser(userData);
                    setIsLoading(false);
                    return { success: true, role: finalRole };
                }

                loginInProgressRef.current = false;
                loginResolvedRef.current = false;
                // Surface backend remaining-attempts data even when Firebase rejects
                if (backendStatus === 401 && backendBody.data?.remainingAttempts !== undefined) {
                    return {
                        success: false,
                        message: backendBody.message || 'Invalid credentials.',
                        data: backendBody.data,
                    };
                }
                // Firebase-only errors (no backend data)
                const code = firebaseCred.reason?.code || '';
                let message = firebaseCred.reason?.message || 'Invalid credentials';
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

            const firebaseUser = firebaseCred.value.user;

            // ── Backend must be reachable and OK for full login ──
            if (!backendPayload?.ok) {
                console.warn('⚠️ [AuthContext] Backend login failed, attempting auto-sync via social-login...');

                // Firebase auth succeeded → user is real. Try social-login to auto-create MongoDB user.
                try {
                    const syncResp = await fetch(`${BACKEND_URL}/auth/social-login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: firebaseUser.email,
                            name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                            provider: 'firebase',
                            providerId: firebaseUser.uid,
                        }),
                        signal: AbortSignal.timeout(10000),
                    });
                    const syncJson = await syncResp.json().catch(() => ({}));

                    if (syncResp.ok && syncJson?.success) {
                        console.log('✅ [AuthContext] Auto-sync succeeded via social-login');
                        backendBody = syncJson;
                        // Fall through to process successful response below
                    } else {
                        console.error('❌ [AuthContext] Auto-sync also failed:', syncJson);
                        await signOut(auth);
                        loginInProgressRef.current = false;
                        loginResolvedRef.current = false;
                        return {
                            success: false,
                            message: syncJson?.message || backendBody?.message || 'Login failed. Please try again.',
                        };
                    }
                } catch (syncError) {
                    console.error('❌ [AuthContext] Auto-sync error:', syncError);
                    await signOut(auth);
                    loginInProgressRef.current = false;
                    loginResolvedRef.current = false;
                    return {
                        success: false,
                        message: 'Server is taking too long to respond. Please try again.',
                    };
                }
            }

            // ── Handle 2FA OTP challenge FIRST (non-customer roles) ──
            // Backend returned requiresOTP — do NOT store any JWT or call setUser().
            // Return challenge data to Login.tsx; stay signed out of Firebase.
            console.log('🔐 [DEBUG-login] Backend response — requiresOTP check:', {
                requiresOTP: backendBody?.data?.requiresOTP,
                userId: backendBody?.data?.userId,
                maskedEmail: backendBody?.data?.maskedEmail,
                fullData: backendBody?.data,
            });
            if (backendBody?.data?.requiresOTP) {
                loginInProgressRef.current = false;
                loginResolvedRef.current = false;
                // Firebase sign-in succeeded (needed for password check) but auth is
                // not complete yet — sign out immediately.
                if (firebaseCred.status === 'fulfilled') {
                    await signOut(auth).catch(() => {});
                }
                clearSessionCache();
                localStorage.removeItem('autospf_token');
                localStorage.removeItem('autospf_backend_user');
                userStorage.setCurrentUser(null);
                setUser(null);
                return {
                    success: true,
                    requiresOTP: true,
                    userId: backendBody.data.userId,
                    maskedEmail: backendBody.data.maskedEmail,
                };
            }

            // ── Unverified account: backend returned requiresOtp ──
            if (backendBody?.success && backendBody?.data?.requiresOtp) {
                loginInProgressRef.current = false;
                loginResolvedRef.current = false;
                if (firebaseCred.status === 'fulfilled') await signOut(auth).catch(() => {});
                clearSessionCache();
                localStorage.removeItem('autospf_token');
                localStorage.removeItem('autospf_backend_user');
                userStorage.setCurrentUser(null);
                setUser(null);
                return {
                    success: true,
                    requiresOtp: true,
                    data: { requiresOtp: true, email: backendBody.data.email },
                };
            }

            // ── Staff first login: backend returned requiresPasswordChange ──
            if (backendBody?.success && backendBody?.data?.requiresPasswordChange) {
                loginInProgressRef.current = false;
                loginResolvedRef.current = false;
                if (firebaseCred.status === 'fulfilled') await signOut(auth).catch(() => {});
                clearSessionCache();
                localStorage.removeItem('autospf_token');
                localStorage.removeItem('autospf_backend_user');
                userStorage.setCurrentUser(null);
                setUser(null);
                return {
                    success: true,
                    requiresPasswordChange: true,
                    data: { requiresPasswordChange: true, token: backendBody.data.token },
                };
            }

            // ── Process successful backend response ──
            let backendToken = '';
            let backendUser: any = null;

            console.log('📥 [DEBUG-login] Full backend JSON:', JSON.stringify(backendBody, null, 2));

            if (backendBody.data?.token) {
                backendToken = backendBody.data.token;
                localStorage.setItem('autospf_token', backendToken);
                const verify = localStorage.getItem('autospf_token');
                console.log('✅ [DEBUG-login] Token saved to localStorage:', !!verify, 'length:', verify?.length);
            } else {
                console.error('❌ [DEBUG-login] NO TOKEN in response!');
            }
            if (backendBody.data?.user) {
                backendUser = backendBody.data.user;
                console.log('🏷️ [DEBUG-login] Backend user object:', JSON.stringify(backendUser, null, 2));
            } else {
                console.error('❌ [DEBUG-login] NO USER in response!');
            }

            // ── Build user immediately from backend response ──
            let resolvedRole: string | undefined;
            if (backendUser) {
                // ── Safety net: block suspended/inactive accounts even if backend returned 200 ──
                if (backendUser.isActive === false) {
                    console.warn('🔒 [login] Backend user isActive=false — blocking login.');
                    loginInProgressRef.current = false;
                    loginResolvedRef.current = false;
                    await signOut(auth).catch(() => {});
                    clearSessionCache();
                    localStorage.removeItem('autospf_token');
                    localStorage.removeItem('autospf_backend_user');
                    userStorage.setCurrentUser(null);
                    setUser(null);
                    return {
                        success: false,
                        message: 'This account is disabled. Please try to contact the administrator.',
                    };
                }

                const rawRole = backendUser.role;
                const migratedRole = migrateLegacyUserRole(rawRole);
                const finalRole = migratedRole || CUSTOMER_ROLE;
                resolvedRole = finalRole;

                console.log('🔄 [DEBUG-login] Role pipeline:', {
                    rawFromBackend: rawRole,
                    typeofRaw: typeof rawRole,
                    afterMigration: migratedRole,
                    finalRole: finalRole,
                    isAdminDashboard: ADMIN_DASHBOARD_ROLES.includes(finalRole as any),
                    dashboardPath: getDashboardPathForRole(finalRole),
                });

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
                    phone: backendUser.phone || undefined,
                };
                console.log('👤 [DEBUG-login] Final userData being set:', JSON.stringify({ role: userData.role, email: userData.email, name: userData.name }, null, 2));

                const sanitized = sanitizeUser(userData);
                userStorage.setCurrentUser(sanitized);
                setSessionCache(userData, backendToken);

                // Signal BEFORE setUser so any re-entrant onAuthStateChanged sees it
                loginResolvedRef.current = true;
                loginInProgressRef.current = false;

                console.log(`✅ [DEBUG-login] About to call setUser() with role: ${finalRole}`);
                setUser(userData);
                setIsLoading(false);
                console.log(`✅ [DEBUG-login] setUser() called. loginResolvedRef=${loginResolvedRef.current}`);

                // Refresh the socket auth so the backend auto-joins this user's rooms
                refreshSocketAuth();
            } else {
                console.error('❌ [DEBUG-login] backendUser is null/undefined — this should not happen!');
            }

            // Return the resolved role so callers can redirect immediately
            // without waiting for async React state propagation (user/isLoading).
            return { success: true, role: resolvedRole };
        } catch (error: any) {
            console.error('Login error:', error);
            // Always release the lock on error
            loginInProgressRef.current = false;
            loginResolvedRef.current = false;

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
            destroySharedSocket();
            await signOut(auth);
            localStorage.removeItem('autospf_token');
            userStorage.setCurrentUser(null);
            setUser(null);
            clearSessionCache();
        } catch (error) {
            console.error('Logout error:', error);
        }
    }, []);

    const deleteAccount = useCallback(async (password: string): Promise<{ success: boolean; message?: string }> => {
        const token = localStorage.getItem('autospf_token');
        if (!token) {
            return { success: false, message: 'You are not logged in.' };
        }
        try {
            const response = await fetch(`${BACKEND_URL}/auth/account`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ password }),
            });

            const data = await response.json();

            if (!response.ok) {
                return { success: false, message: data.message || 'Failed to delete account.' };
            }

            // Clear everything locally
            try { await signOut(auth); } catch { /* ignore */ }
            localStorage.removeItem('autospf_token');
            userStorage.setCurrentUser(null);
            setUser(null);
            clearSessionCache();

            return { success: true, message: data.message || 'Your account has been permanently deleted.' };
        } catch (error: any) {
            console.error('[deleteAccount] error:', error);
            return { success: false, message: 'Network error. Please try again.' };
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
                avatar: updatedUser.avatar,
                phone: updatedUser.phone,
            });

            console.log('✅ [Frontend] Update User API Response Data:', response.data);

            if (response.success) {
                // Merge backend response with existing user state to preserve frontend-only fields
                // (e.g., id = Firebase UID, which the Mongoose document returns as _id)
                const backendData = response.data || {};
                const mergedData: User = {
                    ...updatedUser,
                    ...backendData,
                    id: updatedUser.id, // Always preserve the Firebase UID as `id`
                    _id: backendData._id || updatedUser._id,
                    phone: backendData.phone || updatedUser.phone,
                };
                console.log('✨ [Frontend] Applying merged data to state:', mergedData);
                applyLocalUpdate(mergedData);
                // Update session cache too
                const token = localStorage.getItem('autospf_token') || '';
                setSessionCache(mergedData, token);
                return { success: true };
            }
            return { success: false, message: response.message || 'Update failed' };
        } catch (error: any) {
            console.error('Update profile error:', error);
            const message = error?.message || '';
            const isTimeout = error?.code === 'ECONNABORTED' || /timeout/i.test(message);
            const isNetwork = !error?.response || /network/i.test(message);
            const reason: 'timeout' | 'network' | 'error' = isTimeout ? 'timeout' : isNetwork ? 'network' : 'error';
            // Apply local update as offline fallback but signal to caller it was not persisted
            applyLocalUpdate(updatedUser);
            return { success: true, offline: true, reason };
        }
    }, [sanitizeUser]);

    const value = useMemo(() => ({
        user,
        isLoading,
        isFirebaseAuthReady,
        login,
        signup,
        resetPassword,
        logout,
        updateUser,
        setAuthUser: (u: User | null) => {
            setUser(u);
            if (u) {
                // When externally setting a user (e.g. after Google login),
                // mark auth as ready so ProtectedRoute renders immediately
                // instead of showing the skeleton loader.
                setIsFirebaseAuthReady(true);
                setIsLoading(false);
                loginResolvedRef.current = true;
            }
        },
        markLoginInProgress: () => { loginInProgressRef.current = true; },
        markLoginComplete: () => { loginInProgressRef.current = false; },
        deleteAccount,
    }), [user, isLoading, isFirebaseAuthReady, login, signup, resetPassword, logout, updateUser, deleteAccount]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

// NOTE: useAuth is intentionally co-located with AuthProvider in this file.
// The // @refresh reset pragma above handles the Vite HMR incompatibility
// that arises from exporting both a component (AuthProvider) and a hook (useAuth).
export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
