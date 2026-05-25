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
import { invalidate, invalidateAll } from '@/lib/queryCache';
import { getSharedSocket, refreshSocketAuth, destroySharedSocket } from '@/hooks/useRealtimeSync';
import { formatContactNoInputFromProfile, normalizePhilippineMobileInput } from '@/lib/phone';

/** Resolved per call so Vite env / port changes apply after restart without stale module constant. */
const apiUrl = () => getBaseApiUrl();
const apiHealthUrl = () => `${apiUrl().replace(/\/$/, '')}/health`;

async function isBackendReachable(): Promise<boolean> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    let timeoutId: number | undefined;

    try {
        const healthCheck = fetch(apiHealthUrl(), {
            method: 'GET',
            signal: controller?.signal,
        })
            .then((resp) => resp.status > 0 && resp.status < 500)
            .catch(() => false);

        const timeout = new Promise<boolean>((resolve) => {
            timeoutId = window.setTimeout(() => {
                controller?.abort();
                resolve(false);
            }, 5000);
        });

        return await Promise.race([healthCheck, timeout]);
    } finally {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    }
}

// NOTE: Firestore is intentionally NOT used for role lookup.
// Role is sourced from the MongoDB backend API (GET /api/users?email=...)
// to avoid Firestore "client is offline" errors blocking authentication.

/* ═══════════════════════════════════════════════════════
   SESSION CACHE — persist role + profile across refreshes
   to eliminate redundant API calls on warm restarts.
   ═══════════════════════════════════════════════════════ */
const SESSION_CACHE_KEY = 'autospf_session_cache';
const SESSION_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const SESSION_CACHE_VERSION = 5; // Bump: clear stale Firebase/JWT sessions when switching accounts (QC vs admin)

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

/** Wipe JWT + backend profile caches (shared by logout and account switch on /login). */
function clearAuthStorage(): void {
    clearSessionCache();
    localStorage.removeItem('autospf_token');
    localStorage.removeItem('autospf_backend_user');
}

async function fetchAuthMe(
    token: string,
    signal?: AbortSignal,
): Promise<Record<string, unknown> | null> {
    try {
        const resp = await fetch(`${apiUrl()}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: signal ?? AbortSignal.timeout(8000),
        });
        if (!resp.ok) return null;
        const json = await resp.json();
        const me = json.data as Record<string, unknown> | undefined;
        return me && typeof me === 'object' ? me : null;
    } catch {
        return null;
    }
}

function buildUserFromAuthMe(
    me: Record<string, unknown>,
    firebaseUser?: { uid: string; email?: string | null; displayName?: string | null; photoURL?: string | null },
): User {
    const migratedRole = migrateLegacyUserRole(me.role as string);
    const mongoId = String(me.id || me._id || '');
    const meEmail = String(me.email || '').toLowerCase();
    const fbEmail = String(firebaseUser?.email || '').toLowerCase();
    const firebaseMatchesJwt = Boolean(firebaseUser && meEmail && fbEmail && meEmail === fbEmail);

    return {
        id: firebaseMatchesJwt ? firebaseUser!.uid : mongoId,
        _id: mongoId,
        email: String(me.email || ''),
        name: String(me.name || firebaseUser?.displayName || 'User'),
        role: (migratedRole || getSafeUserRole(me.role as string, CUSTOMER_ROLE)) as User['role'],
        createdAt: (me.createdAt as string | undefined) || new Date().toISOString(),
        password: '',
        isActive: typeof me.isActive === 'boolean' ? me.isActive : true,
        lastActive: (me.updatedAt as string | undefined) || new Date().toISOString(),
        avatar: (me.avatar as string | undefined) || firebaseUser?.photoURL || undefined,
        phone: formatContactNoInputFromProfile(me.phone as string | undefined) || undefined,
    };
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
    updateUser: (user: User, options?: { localOnly?: boolean }) => Promise<{ success: boolean; message?: string; offline?: boolean; reason?: 'timeout' | 'network' | 'error'; phone?: string }>;
    setAuthUser: (user: User | null) => void;
    markLoginInProgress: () => void;
    markLoginComplete: () => void;
    /** Clear stale Firebase/JWT before signing in as a different user (e.g. QC after admin). */
    prepareForLogin: () => Promise<void>;
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
                    const fbEmail = String(firebaseUser.email || '').toLowerCase();

                    const storedToken = localStorage.getItem('autospf_token');
                    const validToken =
                        storedToken && storedToken !== 'undefined' && storedToken !== 'null'
                            ? storedToken
                            : null;

                    // ── JWT is source of truth (fixes QC login while another Firebase user is still signed in) ──
                    if (validToken) {
                        const me = await fetchAuthMe(validToken);
                        if (me) {
                            const meEmail = String(me.email || '').toLowerCase();
                            if (me.isActive === false) {
                                console.warn('🔒 [AuthContext] JWT user inactive — forcing logout.');
                                clearAuthStorage();
                                userStorage.setCurrentUser(null);
                                setUser(null);
                                await signOut(auth).catch(() => {});
                                setIsLoading(false);
                                setIsFirebaseAuthReady(true);
                                return;
                            }

                            let jwtUser = buildUserFromAuthMe(me, firebaseUser);
                            if (meEmail && fbEmail && meEmail !== fbEmail) {
                                console.warn(
                                    `⚠️ [AuthContext] Firebase (${fbEmail}) ≠ JWT (${meEmail}) — using JWT and signing out Firebase.`,
                                );
                                await signOut(auth).catch(() => {});
                                jwtUser = buildUserFromAuthMe(me);
                            }

                            const sanitizedJwt = sanitizeUser(jwtUser);
                            userStorage.setCurrentUser(sanitizedJwt);
                            setUser(jwtUser);
                            localStorage.setItem('autospf_backend_user', JSON.stringify({
                                ...me,
                                role: jwtUser.role,
                            }));
                            setSessionCache(jwtUser, validToken);
                            console.log(`✅ [AuthContext] Restored session from JWT /auth/me — role: ${jwtUser.role}`);
                            setIsLoading(false);
                            setIsFirebaseAuthReady(true);
                            return;
                        }
                    }

                    // ── Ultra-fast path: session cache hit — merge GET /auth/me so sidebar role matches MongoDB (JWT role goes stale) ──
                    const cached = getSessionCache();
                    const cachedEmail = String(cached?.user.email || '').toLowerCase();
                    const cacheEmailMatchesFirebase =
                        Boolean(cachedEmail && fbEmail && cachedEmail === fbEmail);
                    const cacheUidMatchesFirebase = cached?.user.id === firebaseUser.uid;
                    if (cached && (cacheUidMatchesFirebase || cacheEmailMatchesFirebase)) {
                        // Strictly reject suspended/inactive accounts even on cache hit
                        if (cached.user.isActive === false) {
                            console.warn('🔒 [AuthContext] Session cache hit but user is inactive — forcing logout.');
                            clearAuthStorage();
                            userStorage.setCurrentUser(null);
                            setUser(null);
                            await signOut(auth).catch(() => {});
                            setIsLoading(false);
                            setIsFirebaseAuthReady(true);
                            return;
                        }
                        const restoredToken =
                            (cached.token && cached.token !== 'undefined' && cached.token !== 'null'
                                ? cached.token
                                : null) || localStorage.getItem('autospf_token');
                        let mergedUser: User = {
                            ...cached.user,
                            role: getSafeUserRole(cached.user.role, CUSTOMER_ROLE),
                        };
                        if (
                            restoredToken &&
                            restoredToken !== 'undefined' &&
                            restoredToken !== 'null'
                        ) {
                            try {
                                const meResp = await fetch(`${apiUrl()}/auth/me`, {
                                    headers: { Authorization: `Bearer ${restoredToken}` },
                                    signal: AbortSignal.timeout(8000),
                                });
                                if (meResp.ok) {
                                    const meJson = await meResp.json();
                                    const me = meJson.data as Record<string, unknown> | undefined;
                                    if (me && typeof me === 'object') {
                                        const migratedRole = migrateLegacyUserRole(me.role as string);
                                        mergedUser = {
                                            ...mergedUser,
                                            id: firebaseUser.uid,
                                            _id: (me.id || me._id || mergedUser._id) as string,
                                            email: String(me.email || mergedUser.email || ''),
                                            name: String(me.name || mergedUser.name || 'User'),
                                            role: (migratedRole ||
                                                getSafeUserRole(me.role as string, CUSTOMER_ROLE)) as User['role'],
                                            avatar: (me.avatar as string | undefined) ?? mergedUser.avatar,
                                            phone: formatContactNoInputFromProfile(me.phone as string | undefined)
                                                || mergedUser.phone,
                                            isActive:
                                                typeof me.isActive === 'boolean'
                                                    ? me.isActive
                                                    : mergedUser.isActive,
                                            lastActive:
                                                (me.updatedAt as string | undefined) || mergedUser.lastActive,
                                        };
                                        console.log(
                                            `⚡ [AuthContext] Session cache + /auth/me merge — role: ${mergedUser.role}`,
                                        );
                                    }
                                }
                            } catch {
                                /* offline — keep cached role */
                            }
                        }
                        const sanitized = sanitizeUser(mergedUser);
                        userStorage.setCurrentUser(sanitized);
                        setUser(mergedUser);
                        if (restoredToken && !localStorage.getItem('autospf_token')) {
                            localStorage.setItem('autospf_token', restoredToken);
                        }
                        setSessionCache(mergedUser, restoredToken || cached.token);
                        try {
                            invalidate('/bookings');
                        } catch {
                            /* ignore */
                        }
                        setIsLoading(false);
                        setIsFirebaseAuthReady(true);
                        queueMicrotask(() => {
                            backgroundRefreshUser(
                                firebaseUser.email || '',
                                firebaseUser.uid,
                                mergedUser,
                            );
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

                        const syncResp = await fetch(`${apiUrl()}/auth/social-login`, {
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
                                clearAuthStorage();
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
                                clearAuthStorage();
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

                if (backendToken && backendToken !== 'undefined' && backendToken !== 'null') {
                    console.log('ℹ️ [AuthContext] No Firebase session — restoring from JWT /auth/me.');
                    const me = await fetchAuthMe(backendToken);
                    if (me) {
                        if (me.isActive === false) {
                            console.warn('🔒 [AuthContext] Backend-only user inactive — clearing session.');
                            clearAuthStorage();
                            userStorage.setCurrentUser(null);
                            setUser(null);
                        } else {
                            const restoredUser = buildUserFromAuthMe(me);
                            const sanitized = sanitizeUser(restoredUser);
                            userStorage.setCurrentUser(sanitized);
                            setUser(restoredUser);
                            localStorage.setItem(
                                'autospf_backend_user',
                                JSON.stringify({ ...me, role: restoredUser.role }),
                            );
                            setSessionCache(restoredUser, backendToken);
                        }
                    } else {
                        console.warn('⚠️ [AuthContext] Invalid backend JWT — clearing session.');
                        clearAuthStorage();
                        userStorage.setCurrentUser(null);
                        setUser(null);
                    }
                } else {
                    console.log('ℹ️ [AuthContext] Firebase signed out — clearing full session.');
                    clearAuthStorage();
                    userStorage.setCurrentUser(null);
                    setUser(null);
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
            const token = localStorage.getItem('autospf_token');
            let found: any = null;

            // Prefer authenticated /auth/me — returns the session user with decrypted phone (same as dashboard needs).
            if (token && token !== 'undefined' && token !== 'null') {
                const meResp = await fetch(`${apiUrl()}/auth/me`, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: AbortSignal.timeout(5000),
                });
                if (meResp.ok) {
                    const meJson = await meResp.json();
                    found = meJson.data;
                }
            }

            // Fallback: unauthenticated directory lookup (may omit fields or fail cross-origin on some setups).
            if (!found) {
                const resp = await fetch(
                    `${apiUrl()}/users?email=${encodeURIComponent(email)}`,
                    { signal: AbortSignal.timeout(5000) }
                );
                if (!resp.ok) return;
                const json = await resp.json();
                found = Array.isArray(json.data)
                    ? json.data.find((u: any) => u.email?.toLowerCase() === email.toLowerCase())
                    : json.data;
            }

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
            const foundPhone = formatContactNoInputFromProfile(found.phone);
            const currentPhone = formatContactNoInputFromProfile(currentUser.phone);
            const nextPhone = foundPhone || currentPhone;
            const phoneChanged = nextPhone !== currentPhone;
            const hasChanged = newRole !== currentUser.role
                || found.name !== currentUser.name
                || (found._id || found.id) !== currentUser._id
                || phoneChanged;

            if (hasChanged) {
                const refreshedUser: User = {
                    ...currentUser,
                    _id: found._id || found.id || currentUser._id,
                    name: found.name || currentUser.name,
                    role: newRole as import('@/types').UserRole,
                    avatar: found.avatar || currentUser.avatar,
                    phone: nextPhone || undefined,
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

    /** If JWT exists but React user has no phone (stale session/cache), pull /auth/me once and merge. */
    useEffect(() => {
        const token = localStorage.getItem('autospf_token');
        if (!user || !token || token === 'undefined' || token === 'null') return;

        const phoneTrim = String(user.phone ?? '').trim();
        if (phoneTrim) return;

        let cancelled = false;

        void (async () => {
            try {
                const resp = await fetch(`${apiUrl()}/auth/me`, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: AbortSignal.timeout(8000),
                });
                if (!resp.ok || cancelled) return;
                const json = await resp.json();
                const me = json.data;
                if (!me || cancelled) return;
                const hydratedPhone = formatContactNoInputFromProfile(
                    typeof me.phone === 'string' ? me.phone : me.phone != null ? String(me.phone) : '',
                );
                if (!hydratedPhone) return;

                setUser((prev) => {
                    if (!prev || cancelled) return prev;
                    if (formatContactNoInputFromProfile(prev.phone)) return prev;

                    const merged: User = {
                        ...prev,
                        phone: hydratedPhone,
                        _id: me.id || me._id || prev._id,
                    };
                    const sanitized = sanitizeUser(merged);
                    userStorage.setCurrentUser(sanitized);
                    setSessionCache(merged, token);
                    try {
                        const backendRaw = localStorage.getItem('autospf_backend_user');
                        if (backendRaw) {
                            const bu = JSON.parse(backendRaw);
                            bu.phone = merged.phone;
                            if (me.id || me._id) bu._id = me.id || me._id;
                            localStorage.setItem('autospf_backend_user', JSON.stringify(bu));
                        }
                    } catch {
                        /* ignore */
                    }
                    if (import.meta.env.DEV) {
                        console.log('[Auth] Hydrated user.phone from GET /auth/me for booking/profile UI');
                    }
                    return merged;
                });
            } catch {
                /* silent */
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [user?.id, user?.phone, sanitizeUser]);


    const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; role?: string; message?: string; requiresOTP?: boolean; userId?: string; maskedEmail?: string; requiresOtp?: boolean; requiresPasswordChange?: boolean; token?: string; data?: { requiresOtp?: boolean; requiresPasswordChange?: boolean; token?: string; email?: string; remainingAttempts?: number; loginAttempts?: number; maxAttempts?: number; locked?: boolean; lockUntilMs?: number; remainingMinutes?: number } }> => {
        try {
            // ── CRITICAL: Signal that login() owns the auth flow ──
            // onAuthStateChanged MUST NOT resolve or redirect during this window.
            loginInProgressRef.current = true;
            loginResolvedRef.current = false;

            // Clear stale caches + Firebase so a previous admin session cannot hijack QC login
            clearAuthStorage();
            userStorage.setCurrentUser(null);
            setUser(null);
            await signOut(auth).catch(() => {});

            console.log('🚀 [DEBUG-login] Starting login for:', email);
            console.log('🚀 [DEBUG-login] apiUrl() is:', apiUrl());

            const backendReachable = await isBackendReachable();
            if (!backendReachable) {
                loginInProgressRef.current = false;
                loginResolvedRef.current = false;
                return {
                    success: false,
                    message: `Backend is not reachable. Start the backend and try again. API base: ${apiUrl()}`,
                };
            }

            // ── Backend first: password is verified server-side (Mongo + bcrypt). ──
            // Finishing here when possible avoids requiring a matching Firebase Auth user
            // (common when accounts exist in Mongo but were never synced to Firebase).
            let backendPayload: { status: number; ok: boolean; body: any } | null = null;
            try {
                const resp = await fetch(`${apiUrl()}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                    signal: AbortSignal.timeout(15000),
                });
                console.log('📡 [DEBUG-login] Raw backend response status:', resp.status, resp.statusText);
                const text = await resp.text();
                console.log('📡 [DEBUG-login] Raw backend response body:', text);
                let body: any = {};
                try {
                    body = JSON.parse(text);
                } catch {
                    body = {};
                }
                backendPayload = { status: resp.status, ok: resp.ok, body };
            } catch (be) {
                console.warn('📡 [DEBUG-login] Backend login request failed:', be);
                backendPayload = null;
            }

            const backendStatus = backendPayload?.status ?? 0;
            let backendBody = backendPayload?.body ?? {};

            const finalizeBackendJwtSession = (bUser: any, bToken: string, firebaseUid?: string) => {
                if (bUser.isActive === false) {
                    loginInProgressRef.current = false;
                    loginResolvedRef.current = false;
                    clearSessionCache();
                    localStorage.removeItem('autospf_token');
                    localStorage.removeItem('autospf_backend_user');
                    userStorage.setCurrentUser(null);
                    setUser(null);
                    return {
                        success: false as const,
                        message: 'This account is disabled. Please try to contact the administrator.',
                    };
                }

                const migratedRole = migrateLegacyUserRole(bUser.role);
                const finalRole = migratedRole || CUSTOMER_ROLE;
                const normalizedBackendUser = { ...bUser, role: finalRole };
                console.log('✅ [DEBUG-login] Backend JWT session — Firebase optional / backend-first');
                localStorage.setItem('autospf_token', bToken);
                localStorage.setItem('autospf_backend_user', JSON.stringify(normalizedBackendUser));

                const mongoId = String(normalizedBackendUser._id || normalizedBackendUser.id || '');
                const userData: User = {
                    id: firebaseUid || mongoId,
                    _id: mongoId,
                    email: normalizedBackendUser.email || email,
                    name: normalizedBackendUser.name || '',
                    role: finalRole as import('@/types').UserRole,
                    createdAt: normalizedBackendUser.createdAt || new Date().toISOString(),
                    password: '',
                    isActive: normalizedBackendUser.isActive ?? true,
                    lastActive: normalizedBackendUser.lastActive || new Date().toISOString(),
                    avatar: normalizedBackendUser.avatar || undefined,
                    phone: normalizedBackendUser.phone || undefined,
                };

                const sanitized = sanitizeUser(userData);
                userStorage.setCurrentUser(sanitized);
                setSessionCache(userData, bToken);

                loginResolvedRef.current = true;
                loginInProgressRef.current = false;

                setUser(userData);
                setIsLoading(false);
                refreshSocketAuth();
                try {
                    invalidate('/bookings');
                } catch {
                    /* ignore */
                }
                return { success: true as const, role: finalRole };
            };

            // ── Check backend 423 FIRST: account is locked ──
            if (backendStatus === 423) {
                loginInProgressRef.current = false;
                loginResolvedRef.current = false;
                await signOut(auth).catch(() => {});
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
                await signOut(auth).catch(() => {});
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

            // ── Other 403 (e.g. soft-deleted user) ──
            if (backendStatus === 403) {
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
                    message: backendBody.message || 'Access denied.',
                };
            }

            // ── Backend-first outcomes (no Firebase required) ──
            if (backendBody?.data?.requiresOTP) {
                console.log('🔐 [DEBUG-login] Backend returned staff 2FA OTP challenge — honouring before Firebase');
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

            if (
                backendPayload?.ok &&
                backendBody?.success &&
                backendBody?.data?.token &&
                backendBody?.data?.user &&
                !backendBody?.data?.requiresPasswordChange
            ) {
                const done = finalizeBackendJwtSession(backendBody.data.user, backendBody.data.token);
                if (!done.success) return done;
                return { success: true, role: done.role };
            }

            // ── Backend returned 5xx (e.g. login handler threw) — do not mask as Firebase "invalid" ──
            if (backendPayload && backendStatus >= 500) {
                loginInProgressRef.current = false;
                loginResolvedRef.current = false;
                const fromJson =
                    (typeof backendBody?.error === 'string' && backendBody.error.trim() && backendBody.error) ||
                    (typeof backendBody?.message === 'string' && backendBody.message.trim() && backendBody.message) ||
                    '';
                const detail =
                    fromJson ||
                    `Server error (${backendStatus}). The API returned no JSON body. Check the backend terminal for stack traces. API base: ${apiUrl()}`;
                return { success: false, message: detail };
            }

            // ── Firebase email/password (Mongo-only accounts skip straight to JWT above) ──
            let firebaseUser: import('firebase/auth').User | null = null;
            let firebaseErr: any = null;
            try {
                const cred = await signInWithEmailAndPassword(auth, email, password);
                firebaseUser = cred.user;
            } catch (e) {
                firebaseErr = e;
            }

            if (!firebaseUser) {
                loginInProgressRef.current = false;
                loginResolvedRef.current = false;

                if (!backendPayload) {
                    // Fetch failed (connection refused, timeout, DNS, etc.) — do not blame Firebase/password.
                    return {
                        success: false,
                        message: `Backend is not reachable. Start the backend and try again. API base: ${apiUrl()}`,
                    };
                }

                if (backendStatus === 401 && backendBody?.data?.remainingAttempts !== undefined) {
                    return {
                        success: false,
                        message: backendBody.message || 'Invalid credentials.',
                        data: backendBody.data,
                    };
                }

                if (backendStatus === 401 && typeof backendBody?.message === 'string' && backendBody.message.trim()) {
                    return { success: false, message: backendBody.message };
                }

                const code = firebaseErr?.code || '';
                let message = firebaseErr?.message || 'Invalid credentials';
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

            // ── Backend must be reachable and OK for full login ──
            if (!backendPayload?.ok) {
                console.warn('⚠️ [AuthContext] Backend login failed, attempting auto-sync via social-login...');

                // Firebase auth succeeded → user is real. Try social-login to auto-create MongoDB user.
                try {
                    const syncResp = await fetch(`${apiUrl()}/auth/social-login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: firebaseUser.email,
                            name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                            provider: 'firebase',
                            providerId: firebaseUser.uid,
                        }),
                        signal: AbortSignal.timeout(30_000),
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
                if (firebaseUser) {
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
                if (firebaseUser) await signOut(auth).catch(() => {});
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
                if (firebaseUser) await signOut(auth).catch(() => {});
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
                try {
                    invalidate('/bookings');
                } catch {
                    /* ignore */
                }
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
                const resp = await fetch(`${apiUrl()}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, name, role: 'customer', firebaseUid: firebaseUser.uid }),
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
                    const resp = await fetch(`${apiUrl()}/auth/social-login`, {
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

    const prepareForLogin = useCallback(async () => {
        loginInProgressRef.current = true;
        loginResolvedRef.current = false;
        clearAuthStorage();
        userStorage.setCurrentUser(null);
        setUser(null);
        await signOut(auth).catch(() => {});
        loginInProgressRef.current = false;
    }, []);

    const logout = useCallback(async () => {
        try {
            destroySharedSocket();
            await signOut(auth);
            clearAuthStorage();
            userStorage.setCurrentUser(null);
            setUser(null);
            try {
                invalidateAll();
            } catch {
                /* ignore */
            }
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
            const response = await fetch(`${apiUrl()}/auth/account`, {
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
    ): Promise<{ success: boolean; message?: string; offline?: boolean; reason?: 'timeout' | 'network' | 'error'; phone?: string }> => {
        const normalizedPhone = formatContactNoInputFromProfile(updatedUser.phone)
            || normalizePhilippineMobileInput(updatedUser.phone || '');

        const applyLocalUpdate = (userData: User) => {
            const withPhone: User = {
                ...userData,
                phone: formatContactNoInputFromProfile(userData.phone) || normalizedPhone || userData.phone,
            };
            const sanitized = sanitizeUser(withPhone);
            userStorage.update(sanitized);
            userStorage.setCurrentUser(sanitized);
            setUser(withPhone);
            try {
                const backendRaw = localStorage.getItem('autospf_backend_user');
                if (backendRaw) {
                    const bu = JSON.parse(backendRaw);
                    bu.phone = withPhone.phone;
                    if (withPhone._id) bu._id = withPhone._id;
                    localStorage.setItem('autospf_backend_user', JSON.stringify(bu));
                }
            } catch {
                /* ignore */
            }
        };

        if (options?.localOnly) {
            applyLocalUpdate({ ...updatedUser, phone: normalizedPhone || updatedUser.phone });
            return { success: true, offline: true, reason: 'network', phone: normalizedPhone || undefined };
        }

        try {
            const response = await UserService.patchMyProfile({
                name: updatedUser.name,
                email: updatedUser.email,
                avatar: updatedUser.avatar,
                phone: normalizedPhone || updatedUser.phone,
            });

            if (response.success) {
                const backendData = (response.data || {}) as Record<string, unknown>;
                const apiPhone = formatContactNoInputFromProfile(
                    typeof backendData.phone === 'string' ? backendData.phone : undefined,
                ) || normalizedPhone;

                const mergedData: User = {
                    ...updatedUser,
                    ...backendData,
                    id: updatedUser.id,
                    _id: (backendData._id as string | undefined) || (backendData.id as string | undefined) || updatedUser._id,
                    name: (backendData.name as string | undefined) || updatedUser.name,
                    phone: apiPhone || undefined,
                };
                applyLocalUpdate(mergedData);
                const token = localStorage.getItem('autospf_token') || '';
                setSessionCache(mergedData, token);
                return { success: true, phone: apiPhone || undefined };
            }
            return { success: false, message: response.message || 'Update failed' };
        } catch (error: any) {
            console.error('Update profile error:', error);
            const message = error?.message || '';
            const isTimeout = error?.code === 'ECONNABORTED' || /timeout/i.test(message);
            const isNetwork = !error?.response || /network/i.test(message);
            const reason: 'timeout' | 'network' | 'error' = isTimeout ? 'timeout' : isNetwork ? 'network' : 'error';
            applyLocalUpdate({ ...updatedUser, phone: normalizedPhone || updatedUser.phone });
            return { success: true, offline: true, reason, phone: normalizedPhone || undefined };
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
                const token = localStorage.getItem('autospf_token') || '';
                if (token && token !== 'undefined' && token !== 'null') {
                    setSessionCache(u, token);
                    try {
                        localStorage.setItem(
                            'autospf_backend_user',
                            JSON.stringify({ ...u, _id: u._id || u.id, role: u.role }),
                        );
                    } catch {
                        /* quota */
                    }
                }
                setIsFirebaseAuthReady(true);
                setIsLoading(false);
                loginResolvedRef.current = true;
            }
        },
        markLoginInProgress: () => { loginInProgressRef.current = true; },
        markLoginComplete: () => { loginInProgressRef.current = false; },
        prepareForLogin,
        deleteAccount,
    }), [user, isLoading, isFirebaseAuthReady, login, signup, resetPassword, logout, updateUser, deleteAccount, prepareForLogin]);

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
