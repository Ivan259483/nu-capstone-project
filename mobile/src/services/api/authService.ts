import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCredential,
  signOut as firebaseSignOut,
  updateProfile,
  updatePassword,
  sendPasswordResetEmail as firebaseSendPasswordReset,
  reauthenticateWithCredential,
  EmailAuthProvider,
  GoogleAuthProvider,
} from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { chatbotService } from '@/services/api/chatbotService';
import { auth } from '@/config/firebase';
import { API_BASE_URL } from '@/config/env';
import { apiClient, getApiErrorMessage } from '@/services/api/client';
import type { ApiEnvelope, BackendUser } from '@/services/api/types';
import { CUSTOMER_ROLE, isCustomerRole, normalizeToCanonical } from '@/services/api/roles';
import { authStorage } from '@/services/storage/authStorage';
import type { PendingLoginOtp } from '@/services/storage/authStorage';
import { ProfilePhotoUploadError } from '@/features/settings/profile-photo';

type ProfilePhotoUpload = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
};

type ProfilePhotoEnvelope = ApiEnvelope<any> & { code?: string };

export const MOBILE_CUSTOMER_ONLY_MESSAGE =
  'This account is not authorized to access the Customer Mobile App. Please use the appropriate web portal for your account role.';

const mobileAccessError = (): Error & { code: string } => {
  const error = new Error(MOBILE_CUSTOMER_ONLY_MESSAGE) as Error & { code: string };
  error.code = 'MOBILE_CUSTOMER_ONLY';
  return error;
};

/**
 * Converts Firebase Auth error codes into user-friendly messages.
 */
const getFirebaseAuthErrorMessage = (error: any): string => {
  const code = error?.code || '';
  switch (code) {
    case 'auth/too-many-requests':
      return 'Too many login attempts. Please wait a few minutes and try again.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password. Please try again.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact support.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 6 characters.';
    case 'auth/network-request-failed':
      return 'Network error. Check your internet connection and try again.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled. Contact support.';
    default:
      // If it has a Firebase code we don't handle, show a cleaner message
      if (code.startsWith('auth/')) {
        return `Authentication error: ${code.replace('auth/', '').replace(/-/g, ' ')}`;
      }
      return error?.message || 'Something went wrong. Please try again.';
  }
};

const safeNameFromEmail = (email: string): string => {
  return email.split('@')[0] || 'Customer';
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();
const normalizeOtp = (otp: string): string => otp.replace(/\D/g, '').slice(0, 6);
const parseServerTime = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const PROFILE_PHOTO_PATH = /^\/api\/users\/profile\/photo\/[a-f0-9]{24}\/?$/i;

const resolveBackendMediaUrl = (rawValue: unknown): string | undefined => {
  if (typeof rawValue !== 'string' || !rawValue.trim()) return undefined;
  const value = rawValue.trim();

  try {
    const mediaUrl = new URL(value, 'https://relative.invalid');
    if (!PROFILE_PHOTO_PATH.test(mediaUrl.pathname)) return value;
    return `${new URL(API_BASE_URL).origin}${mediaUrl.pathname}`;
  } catch {
    return value;
  }
};

const normalizeBackendUser = (raw: any, firebaseUid?: string): BackendUser => {
  const mongoId = raw?._id || raw?.id || '';
  const role = normalizeToCanonical(raw?.role);

  // Auth responses and cached profiles are authorization inputs. Never turn a
  // missing, unknown, or staff role into Customer through a fallback value.
  if (role !== CUSTOMER_ROLE) throw mobileAccessError();

  return {
    id: mongoId || firebaseUid || '',
    _id: mongoId || undefined,
    firebaseUid: raw?.firebaseUid || firebaseUid,
    name: raw?.name || safeNameFromEmail(raw?.email || ''),
    email: raw?.email || '',
    role,
    avatar: resolveBackendMediaUrl(raw?.avatar),
    phone: raw?.phone,
    createdAt: raw?.createdAt,
    updatedAt: raw?.updatedAt,
    isActive: raw?.isActive,
  };
};

const getAuthPayload = (response: any, firebaseUid?: string): { token: string; user: BackendUser } => {
  const payload = response?.data?.data;
  const token = payload?.token;
  const user = payload?.user;

  if (!token || !user) {
    throw new Error('Backend auth response is missing token or user data.');
  }

  return {
    token,
    user: normalizeBackendUser(user, firebaseUid),
  };
};

const persistSession = async (token: string, user: BackendUser): Promise<void> => {
  if (!token || !isCustomerRole(user?.role)) throw mobileAccessError();
  await Promise.all([
    authStorage.setToken(token),
    authStorage.setUser(user),
  ]);
};

const clearLocalSession = async (): Promise<void> => {
  let criticalError: unknown;

  // Delete the JWT before Firebase emits its signed-out event. Otherwise the
  // auth listener can observe the old cached token and restore the session
  // while logout is still in progress.
  try {
    await authStorage.clearAll();
  } catch (error) {
    criticalError = error;
  }

  try {
    await firebaseSignOut(auth);
  } catch (error) {
    criticalError ??= error;
  }

  // Chat session cleanup is account-bound, but a storage failure here must not
  // undo an otherwise successful authentication logout.
  try {
    await chatbotService.clearSession();
  } catch (error) {
    if (__DEV__) console.warn('[Auth] Chat session cleanup failed during sign-out.', error);
  }

  if (criticalError) throw criticalError;
};

const restoreStoredSession = async (): Promise<{ token: string; user: BackendUser }> => {
  const token = await authStorage.getToken();
  if (!token) throw new Error('No stored session is available.');

  // The backend authenticate middleware reloads the current MongoDB account,
  // validates its status and live role, and requires a Mobile-bound JWT.
  const response = await apiClient.get('/auth/me');
  const user = normalizeBackendUser(response.data?.data);
  await persistSession(token, user);
  return { token, user };
};

const socialLogin = async (firebaseUser: FirebaseUser): Promise<{ token: string; user: BackendUser }> => {
  const email = firebaseUser.email || '';
  if (!email) {
    throw new Error('Firebase user email is missing.');
  }

  const isEmailPassword = firebaseUser.providerData?.some(p => p.providerId === 'password');
  const idToken = await firebaseUser.getIdToken(true);
  const payload = {
    idToken,
    email,
    name: firebaseUser.displayName || safeNameFromEmail(email),
    provider: isEmailPassword ? 'password' : 'firebase',
    providerId: firebaseUser.uid,
    photoURL: firebaseUser.photoURL,
  };

  if (__DEV__) {
    console.log('[Auth] socialLogin → POST /auth/social-login', { email, uid: firebaseUser.uid });
  }

  const response = await apiClient.post('/auth/social-login', payload);

  if (__DEV__) {
    console.log('[Auth] socialLogin response status:', response.status, '| success:', response.data?.success);
  }

  return getAuthPayload(response, firebaseUser.uid);
};

const syncUserWithMongo = async (
  firebaseUser: FirebaseUser,
  fallbackUser?: BackendUser
): Promise<BackendUser> => {
  const email = firebaseUser.email || fallbackUser?.email;
  if (!email) {
    throw new Error('Cannot sync user without an email address.');
  }

  const response = await apiClient.put<ApiEnvelope<any>>(`/users/${firebaseUser.uid}`, {
    name: fallbackUser?.name || firebaseUser.displayName || safeNameFromEmail(email),
    email,
    avatar: firebaseUser.photoURL || fallbackUser?.avatar,
  });

  if (!response.data.success) {
    throw new Error(response.data.message || 'Failed to sync user profile.');
  }

  return normalizeBackendUser(response.data.data, firebaseUser.uid);
};

const exchangeTokenForLogin = async (
  firebaseUser: FirebaseUser,
  email: string,
  password: string
): Promise<{ token: string; user: BackendUser }> => {
  const isEmailPassword = firebaseUser.providerData?.some(p => p.providerId === 'password');
  const idToken = await firebaseUser.getIdToken(true);
  const response = await apiClient.post('/auth/social-login', {
    idToken,
    email,
    name: firebaseUser.displayName || safeNameFromEmail(email),
    provider: isEmailPassword ? 'password' : 'firebase',
    providerId: firebaseUser.uid,
    photoURL: firebaseUser.photoURL,
  });

  return getAuthPayload(response, firebaseUser.uid);
};

const exchangeTokenForRegistration = async (
  firebaseUser: FirebaseUser,
  name: string,
  email: string,
  password: string
): Promise<{ token: string; user: BackendUser }> => {
  // Used only for Google/Apple OAuth paths where we have a real Firebase user.
  // Email/password registration now uses loginEmailDirect instead.
  try {
    await apiClient.post('/auth/register', {
      name,
      email,
      password,
      firebaseUid: firebaseUser.uid,
    });
  } catch (regErr: any) {
    const status = regErr?.response?.status;
    if (status !== 409) throw regErr;
    console.warn('[Auth] /auth/register returned 409 (user exists) — continuing with social-login');
  }

  if (__DEV__) console.log('[Auth] Registration complete → obtaining JWT via social-login');
  return socialLogin(firebaseUser);
};

/**
 * Direct email/password login — calls POST /api/auth/login.
 * Used for OTP-registered users who have no Firebase account.
 * Handles both response shapes: { token, user } and { data: { token, user } }.
 */
const loginEmailDirect = async (
  email: string,
  password: string
): Promise<{ token: string; user: BackendUser }> => {
  const normalizedEmail = normalizeEmail(email);
  const response = await apiClient.post('/auth/login', { email: normalizedEmail, password });
  const d = response?.data;

  if (d?.success && d?.data?.requiresOtp) {
    const err = new Error(
      d?.message || 'Please verify your email. Use the code we sent you, then sign in again.'
    ) as Error & { code: string; verifyEmail?: string };
    err.code = 'REQUIRES_EMAIL_OTP';
    err.verifyEmail = d?.data?.email || normalizedEmail;
    throw err;
  }

  if (d?.success && d?.data?.requiresOTP) {
    const err = new Error(
      d?.message || 'Enter the verification code sent to your email to finish signing in.'
    ) as Error & {
      code: string;
      userId?: string;
      maskedEmail?: string;
      challengeToken?: string;
    };
    err.code = 'REQUIRES_LOGIN_OTP';
    err.userId = d?.data?.userId;
    err.maskedEmail = d?.data?.maskedEmail;
    err.challengeToken = d?.data?.challengeToken;
    const now = Date.now();
    (err as any).codeExpiresAt = parseServerTime(
      d?.data?.codeExpiresAt,
      now + Number(d?.data?.expiresIn || 300) * 1000,
    );
    (err as any).challengeExpiresAt = parseServerTime(
      d?.data?.challengeExpiresAt,
      now + 15 * 60 * 1000,
    );
    (err as any).resendAvailableAt = parseServerTime(
      d?.data?.resendAvailableAt,
      now + Number(d?.data?.resendAfter || 60) * 1000,
    );
    throw err;
  }

  if (d?.success && d?.data?.requiresPasswordChange) {
    const err = new Error(
      d?.message || 'You must set a new password before you can sign in.'
    ) as Error & { code: string; tempToken?: string };
    err.code = 'REQUIRES_PASSWORD_CHANGE';
    err.tempToken = d?.data?.token;
    throw err;
  }

  // Backend returns either { success, token, user } or { success, data: { token, user } }
  const token: string = d?.data?.token || d?.token;
  const rawUser: any = d?.data?.user || d?.user;
  if (!token || !rawUser) {
    throw new Error('Login response is missing token or user data.');
  }
  return { token, user: normalizeBackendUser(rawUser) };
};

export const authService = {
  async sendOtp(email: string): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post('/auth/send-otp', { email: normalizeEmail(email) });
    return response.data;
  },

  /**
   * Signup / email-verification OTP.
   *
   * When the customer account already exists, the backend activates it and
   * returns a full session in the same response. Consuming it here is what
   * removes the old second round trip through the sign-in screen.
   *
   * When the account does not exist yet (send-otp -> verify-otp -> register),
   * the backend deliberately returns no session; `session` is null and the
   * caller continues to /auth/register.
   */
  async verifyOtp(email: string, otp: string): Promise<{
    success: boolean;
    message: string;
    session: { token: string; backendUser: BackendUser } | null;
  }> {
    const response = await apiClient.post('/auth/verify-otp', {
      email: normalizeEmail(email),
      otp: normalizeOtp(otp),
    });
    const body = response.data;

    if (!body?.data?.token || !body?.data?.user) {
      return { success: Boolean(body?.success), message: body?.message, session: null };
    }

    const { token, user } = getAuthPayload(response);
    await persistSession(token, user);
    const authorized = await restoreStoredSession();
    return {
      success: true,
      message: body.message,
      session: { token: authorized.token, backendUser: authorized.user },
    };
  },

  /**
   * Web-aligned customer signup: POST /auth/register with phone, then email OTP.
   * Does not create a session — user verifies on the verify screen, then logs in.
   */
  async registerCustomer(params: {
    name: string;
    email: string;
    password: string;
    phone: string;
  }): Promise<{ success: true } | { success: false; message: string; status?: number }> {
    const email = normalizeEmail(params.email);
    try {
      const response = await apiClient.post('/auth/register', {
        name: params.name.trim(),
        email,
        password: params.password,
        phone: params.phone,
      });
      const d = response.data;
      if (d?.success) return { success: true };
      return {
        success: false,
        message: d?.message || 'Registration failed.',
        status: response.status,
      };
    } catch (err: any) {
      return {
        success: false,
        message: getApiErrorMessage(err, 'Registration failed.'),
        status: err?.response?.status,
      };
    }
  },

  /**
   * Email/password login — calls POST /api/auth/login directly (no Firebase).
   * This is the correct path for OTP-registered users and any user without a
   * Firebase account. Social (Google/Apple) users go through loginWithGoogle instead.
   */
  async loginWithEmailPassword(email: string, password: string): Promise<{
    token: string;
    backendUser: BackendUser;
  }> {
    const { token, user } = await loginEmailDirect(email, password);
    await persistSession(token, user);
    const authorized = await restoreStoredSession();
    return { token: authorized.token, backendUser: authorized.user };
  },

  async verifyLoginOtp(
    userId: string,
    challengeToken: string,
    otp: string
  ): Promise<{ token: string; backendUser: BackendUser }> {
    const response = await apiClient.post('/auth/verify-login-otp', {
      userId,
      challengeToken,
      otp: normalizeOtp(otp),
    });
    const { token, user } = getAuthPayload(response);
    await persistSession(token, user);
    const authorized = await restoreStoredSession();
    return { token: authorized.token, backendUser: authorized.user };
  },

  async resendLoginOtp(
    userId: string,
    challengeToken: string
  ): Promise<Pick<PendingLoginOtp, 'codeExpiresAt' | 'challengeExpiresAt' | 'resendAvailableAt'>> {
    const response = await apiClient.post('/auth/resend-login-otp', { userId, challengeToken });
    const data = response.data?.data || {};
    const now = Date.now();
    return {
      codeExpiresAt: parseServerTime(data.codeExpiresAt, now + Number(data.expiresIn || 300) * 1000),
      challengeExpiresAt: parseServerTime(data.challengeExpiresAt, now + 15 * 60 * 1000),
      resendAvailableAt: parseServerTime(
        data.resendAvailableAt,
        now + Number(data.resendAfter || 60) * 1000,
      ),
    };
  },

  /**
   * Email/password registration (OTP already verified before calling this).
   * Creates the MongoDB account then immediately logs in to obtain a JWT.
   * Does NOT create a Firebase account — email users are purely backend-authenticated.
   */
  async registerWithEmail(name: string, email: string, password: string): Promise<{
    token: string;
    backendUser: BackendUser;
  }> {
    // Step 1: Create backend account
    try {
      await apiClient.post('/auth/register', { name, email, password });
    } catch (err: any) {
      // 409 = user already exists (OTP re-verification race) — safe to continue
      if (err?.response?.status !== 409) throw err;
      console.warn('[Auth] /auth/register 409 (user exists) — proceeding to login');
    }

    // Step 2: Login to get JWT (password is still in memory from the form)
    if (__DEV__) console.log('[Auth] Registration complete → logging in directly');
    const { token, user } = await loginEmailDirect(email, password);
    await persistSession(token, user);
    const authorized = await restoreStoredSession();
    return { token: authorized.token, backendUser: authorized.user };
  },

  async preFlightLogin(email: string, password: string): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await apiClient.post('/auth/login', { email, password });
      return { success: response.data.success };
    } catch (error: any) {
      throw new Error(getApiErrorMessage(error));
    }
  },

  async loginWithEmail(email: string, password: string): Promise<{
    firebaseUser: FirebaseUser;
    token: string;
    backendUser: BackendUser;
  }> {
    if (__DEV__) console.log('[Auth] loginWithEmail → attempting Firebase sign-in for:', email);

    let firebaseUser: FirebaseUser;
    try {
      const credentials = await signInWithEmailAndPassword(auth, email, password);
      firebaseUser = credentials.user;
      if (__DEV__) console.log('[Auth] Firebase sign-in success, uid:', firebaseUser.uid);
    } catch (firebaseError: any) {
      const code = firebaseError?.code || '';
      console.warn('[Auth] Firebase sign-in failed, code:', code);

      // ── Firebase account recovery fallback ──────────────────────────────
      // Some customers registered on the web before Firebase UID was saved.
      // If Firebase reports user-not-found / invalid-credential, try the
      if (
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password'
      ) {
        if (__DEV__) console.log('[Auth] Attempting Firebase recovery via backend...');
        try {
          const recoveryResponse = await apiClient.post('/auth/recover-firebase', { email, password }, { timeout: 8000 });
          const recoveryData = recoveryResponse?.data;
          if (__DEV__) console.log('[Auth] recover-firebase response:', recoveryData?.success, '| needsClientCreate:', recoveryData?.data?.needsClientCreate);

          if (recoveryData?.success) {
            const needsClientCreate = recoveryData?.data?.needsClientCreate || recoveryData?.needsClientCreate;

            if (needsClientCreate) {
              // ── Firebase Admin not on server → create Firebase account client-side ──
              // MongoDB password was validated by backend. Now we create the Firebase
              // account here on the device (no Admin SDK needed).
              if (__DEV__) console.log('[Auth] Creating Firebase account client-side...');
              try {
                const newCredentials = await createUserWithEmailAndPassword(auth, email, password);
                firebaseUser = newCredentials.user;
                if (__DEV__) console.log('[Auth] Firebase account created client-side, uid:', firebaseUser.uid);
              } catch (createErr: any) {
                // If account already exists in Firebase with a different password, try sign in
                if (createErr?.code === 'auth/email-already-in-use') {
                  if (__DEV__) console.log('[Auth] Firebase account already exists — signing in...');
                  const retryCredentials = await signInWithEmailAndPassword(auth, email, password);
                  firebaseUser = retryCredentials.user;
                } else {
                  throw new Error(getFirebaseAuthErrorMessage(createErr));
                }
              }
            } else {
              // Backend (with Admin SDK) re-created the Firebase account — sign in again
              const credentials = await signInWithEmailAndPassword(auth, email, password);
              firebaseUser = credentials.user;
              if (__DEV__) console.log('[Auth] Firebase re-sign-in after server recovery, uid:', firebaseUser.uid);
            }

            // Now get the backend JWT via social-login (using the fresh Firebase session)
            const authPayload = await exchangeTokenForLogin(firebaseUser, email, password);
            await persistSession(authPayload.token, authPayload.user);

            let syncedUser = authPayload.user;
            try {
              syncedUser = await syncUserWithMongo(firebaseUser, authPayload.user);
              await persistSession(authPayload.token, syncedUser);
            } catch (syncErr) {
              console.warn('[Auth] Mongo sync after recovery (non-fatal):', getApiErrorMessage(syncErr));
            }

            if (__DEV__) console.log('[Auth] Recovery complete! role:', syncedUser.role);
            return { firebaseUser, token: authPayload.token, backendUser: syncedUser };
          }
        } catch (recoveryErr: any) {
          console.warn('[Auth] Firebase recovery failed:', getApiErrorMessage(recoveryErr));
          const status = recoveryErr?.response?.status;
          if (status === 404) {
            throw new Error('Authentication service unavailable. Please check your connection.');
          }
          // 401 from backend = wrong password for MongoDB too → show proper error
          if (status === 401) {
            throw new Error('Invalid email or password. Please try again.');
          }
        }
      }

      throw new Error(getFirebaseAuthErrorMessage(firebaseError));
    }

    if (__DEV__) console.log('[Auth] Exchanging Firebase token for backend JWT...');
    const authPayload = await exchangeTokenForLogin(firebaseUser, email, password);
    await persistSession(authPayload.token, authPayload.user);
    if (__DEV__) console.log('[Auth] Backend JWT received, user role:', authPayload.user.role);

    let syncedUser = authPayload.user;
    try {
      syncedUser = await syncUserWithMongo(firebaseUser, authPayload.user);
      await persistSession(authPayload.token, syncedUser);
    } catch (error) {
      console.warn('[Auth] Mongo user sync failed during login (non-fatal):', getApiErrorMessage(error));
    }

    return {
      firebaseUser,
      token: authPayload.token,
      backendUser: syncedUser,
    };
  },

  /**
   * Change password for email/password users — calls POST /api/auth/change-password.
   * Requires a valid JWT in authStorage (set automatically by apiClient interceptor).
   */
  async changePasswordDirect(currentPassword: string, newPassword: string): Promise<void> {
    await apiClient.post('/auth/change-password', { currentPassword, newPassword });
  },

  /**
   * Sign in with a Google id_token obtained from expo-auth-session.
   * Creates a Firebase credential, signs into Firebase, then syncs with backend.
   */
  async loginWithGoogle(idToken: string): Promise<{
    firebaseUser: FirebaseUser;
    token: string;
    backendUser: BackendUser;
  }> {
    let firebaseUser: FirebaseUser;
    try {
      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(auth, credential);
      firebaseUser = result.user;
    } catch (firebaseError: any) {
      throw new Error(getFirebaseAuthErrorMessage(firebaseError));
    }

    try {
      // Exchange Firebase identity for a Mobile-bound backend JWT. A rejected
      // authoritative role check must also tear down the Firebase session.
      const authPayload = await socialLogin(firebaseUser);
      await persistSession(authPayload.token, authPayload.user);

      let syncedUser = authPayload.user;
      try {
        syncedUser = await syncUserWithMongo(firebaseUser, authPayload.user);
        await persistSession(authPayload.token, syncedUser);
      } catch (error) {
        console.warn('Mongo user sync failed during Google login:', getApiErrorMessage(error));
      }

      const authorized = await restoreStoredSession();

      return {
        firebaseUser,
        token: authorized.token,
        backendUser: authorized.user,
      };
    } catch (error) {
      await clearLocalSession();
      throw error;
    }
  },

  async bootstrapFromFirebaseUser(firebaseUser: FirebaseUser): Promise<{
    token: string;
    backendUser: BackendUser;
  }> {
    const currentToken = await authStorage.getToken();
    const currentUser = await authStorage.getUser();

    if (__DEV__) {
      console.log('[Auth] bootstrapFromFirebaseUser | uid:', firebaseUser.uid,
        '| cachedUid:', currentUser?.firebaseUid || currentUser?.id,
        '| hasToken:', !!currentToken);
    }

    // Use cached session if token exists AND the stored user matches this Firebase uid.
    // Also accept match by email as fallback (handles old sessions missing firebaseUid).
    const uidMatches = currentUser?.firebaseUid === firebaseUser.uid;
    const emailMatches = !!(currentUser?.email && currentUser.email === firebaseUser.email);
    if (currentToken && currentUser && (uidMatches || emailMatches)) {
      if (__DEV__) console.log('[Auth] Bootstrap: validating cached session with backend');
      const restored = await restoreStoredSession();
      return { token: restored.token, backendUser: restored.user };
    }

    if (__DEV__) console.log('[Auth] Bootstrap: no valid cache, calling socialLogin...');
    const authPayload = await socialLogin(firebaseUser);
    await persistSession(authPayload.token, authPayload.user);

    let syncedUser = authPayload.user;
    try {
      syncedUser = await syncUserWithMongo(firebaseUser, authPayload.user);
      await persistSession(authPayload.token, syncedUser);
    } catch (error) {
      console.warn('[Auth] Mongo user sync failed during bootstrap (non-fatal):', getApiErrorMessage(error));
    }

    const authorized = await restoreStoredSession();

    if (__DEV__) console.log('[Auth] Bootstrap complete | role:', authorized.user.role);

    return {
      token: authorized.token,
      backendUser: authorized.user,
    };
  },

  async restoreStoredSession(): Promise<{
    token: string;
    backendUser: BackendUser;
  }> {
    const restored = await restoreStoredSession();
    return { token: restored.token, backendUser: restored.user };
  },

  async signOut(): Promise<void> {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Ignore backend logout failures; local sign-out still proceeds.
    }

    await clearLocalSession();
  },

  async clearLocalSession(): Promise<void> {
    await clearLocalSession();
  },

  async updateMyBackendProfile(data: { name?: string, avatar?: string, phone?: string }): Promise<BackendUser> {
    const response = await apiClient.patch<ApiEnvelope<any>>('/users/profile', data);
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to update user profile.');
    }
    const syncedUser = normalizeBackendUser(response.data.data);
    await persistSession(await authStorage.getToken() || '', syncedUser);
    return syncedUser;
  },

  async updateMyProfilePhoto(photo: ProfilePhotoUpload): Promise<BackendUser> {
    const formData = new FormData();
    const fileName = photo.fileName || `profile-${Date.now()}.jpg`;
    let payload: ProfilePhotoEnvelope;

    if (__DEV__) {
      console.log('[ProfilePhoto] upload request', {
        endpoint: `${API_BASE_URL}/users/profile`,
        fieldName: 'photo',
        mimeType: photo.mimeType || 'image/jpeg',
        fileName,
        fileSize: photo.fileSize || null,
      });
    }

    if (Platform.OS === 'web') {
      const blob = await fetch(photo.uri).then((result) => {
        if (!result.ok) throw new Error('Could not prepare the selected photo.');
        return result.blob();
      });
      formData.append('photo', blob, fileName);

      const response = await apiClient.patch<ProfilePhotoEnvelope>('/users/profile', formData, {
        timeout: 30_000,
      });
      if (__DEV__) console.log('[ProfilePhoto] upload response', { status: response.status });
      payload = response.data;
    } else {
      const token = await authStorage.getToken();
      if (!token) {
        throw new ProfilePhotoUploadError(
          'Authentication required. Please sign in again.',
          'PROFILE_PHOTO_UNAUTHORIZED',
          401,
        );
      }

      // Expo File implements Blob on native. Unlike React Native's legacy
      // { uri, name, type } shim, expo/fetch streams the actual JPEG bytes and
      // supplies a valid multipart boundary automatically.
      const file = new File(photo.uri);
      if (!file.exists || file.size <= 0) {
        throw new ProfilePhotoUploadError(
          'Could not prepare the selected photo.',
          'PROFILE_PHOTO_UNSUPPORTED',
        );
      }
      formData.append('photo', file, fileName);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      let response: Awaited<ReturnType<typeof expoFetch>>;
      try {
        response = await expoFetch(`${API_BASE_URL}/users/profile`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Client-Type': 'mobile',
            'ngrok-skip-browser-warning': 'true',
          },
          body: formData,
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new ProfilePhotoUploadError(
            'Profile photo upload timed out.',
            'PROFILE_PHOTO_NETWORK',
          );
        }
        throw new ProfilePhotoUploadError(
          error instanceof Error ? error.message : 'Network request failed.',
          'PROFILE_PHOTO_NETWORK',
        );
      } finally {
        clearTimeout(timeout);
      }

      let parsed: ProfilePhotoEnvelope | null = null;
      try {
        parsed = await response.json() as ProfilePhotoEnvelope;
      } catch {
        // The status-specific fallback below is clearer than a JSON parse error.
      }

      if (!response.ok) {
        if (__DEV__) {
          console.warn('[ProfilePhoto] upload rejected', {
            status: response.status,
            code: parsed?.code || null,
            message: parsed?.message || null,
          });
        }
        const fallbackCode = response.status === 401
          ? 'PROFILE_PHOTO_UNAUTHORIZED'
          : response.status >= 500
            ? 'PROFILE_PHOTO_STORAGE_FAILED'
            : 'PROFILE_PHOTO_UNSUPPORTED';
        throw new ProfilePhotoUploadError(
          parsed?.message || `Profile photo upload failed (${response.status}).`,
          parsed?.code || fallbackCode,
          response.status,
        );
      }
      if (__DEV__) console.log('[ProfilePhoto] upload response', { status: response.status });
      payload = parsed || {
        success: false,
        message: 'Invalid profile photo response.',
        data: null,
      };
    }

    if (!payload.success) {
      throw new ProfilePhotoUploadError(
        payload.message || 'Failed to update profile photo.',
        payload.code || 'PROFILE_PHOTO_INVALID_RESPONSE',
      );
    }

    const syncedUser = normalizeBackendUser(payload.data);
    await persistSession(await authStorage.getToken() || '', syncedUser);
    return syncedUser;
  },

  /**
   * Sends a Firebase password reset email — used after a successful OTP
   * password reset to also sync Firebase Auth with the new password.
   */
  async syncFirebasePasswordReset(email: string): Promise<void> {
    try {
      await firebaseSendPasswordReset(auth, email);
      console.log('[Auth] Firebase password reset email sent to', email);
    } catch (err) {
      // Non-fatal — user can still log in via backend recovery path
      console.warn('[Auth] Firebase password reset sync failed:', err);
    }
  },

  async reauthenticateAndUpdatePassword(firebaseUser: FirebaseUser, currentPw: string, newPw: string): Promise<void> {
    if (!firebaseUser.email) {
       throw new Error("User does not have an email associated.");
    }
    const credential = EmailAuthProvider.credential(firebaseUser.email, currentPw);
    await reauthenticateWithCredential(firebaseUser, credential);
    await updatePassword(firebaseUser, newPw);
    
    // Also try updating backend as fallback (silent fail)
    try {
      await apiClient.patch('/users/change-password', { currentPassword: currentPw, newPassword: newPw });
    } catch (syncError) {
      console.warn('[Password Sync] Backend password update failed — Firebase updated but MongoDB hash may be stale:', syncError);
    }
  }
};
