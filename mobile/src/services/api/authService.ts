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
import { chatbotService } from '@/services/api/chatbotService';
import { auth } from '@/config/firebase';
import { apiClient, getApiErrorMessage } from '@/services/api/client';
import type { ApiEnvelope, BackendUser, UserRole } from '@/services/api/types';
import { CUSTOMER_ROLE, getSafeUserRole } from '@/services/api/roles';
import { authStorage } from '@/services/storage/authStorage';

const DEFAULT_ROLE: UserRole = CUSTOMER_ROLE;

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

const normalizeBackendUser = (raw: any, firebaseUid?: string): BackendUser => {
  const mongoId = raw?._id || raw?.id || '';

  return {
    id: mongoId || firebaseUid || '',
    _id: mongoId || undefined,
    firebaseUid: raw?.firebaseUid || firebaseUid,
    name: raw?.name || safeNameFromEmail(raw?.email || ''),
    email: raw?.email || '',
    role: getSafeUserRole(raw?.role, DEFAULT_ROLE),
    avatar: raw?.avatar,
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
  await Promise.all([
    authStorage.setToken(token),
    authStorage.setUser(user),
  ]);
};

const clearLocalSession = async (): Promise<void> => {
  await Promise.allSettled([
    chatbotService.clearSession(),
    firebaseSignOut(auth),
  ]);
  await authStorage.clearAll();
};

const socialLogin = async (firebaseUser: FirebaseUser): Promise<{ token: string; user: BackendUser }> => {
  const email = firebaseUser.email || '';
  if (!email) {
    throw new Error('Firebase user email is missing.');
  }

  const isEmailPassword = firebaseUser.providerData?.some(p => p.providerId === 'password');
  const payload = {
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
    role: fallbackUser?.role || DEFAULT_ROLE,
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
  const response = await apiClient.post('/auth/social-login', {
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
      role: DEFAULT_ROLE,
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
  const response = await apiClient.post('/auth/login', { email, password });
  const d = response?.data;
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
    const response = await apiClient.post('/auth/send-otp', { email });
    return response.data;
  },

  async verifyOtp(email: string, otp: string): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post('/auth/verify-otp', { email, otp });
    return response.data;
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
    const email = params.email.trim().toLowerCase();
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
    return { token, backendUser: user };
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
      await apiClient.post('/auth/register', { name, email, password, role: DEFAULT_ROLE });
    } catch (err: any) {
      // 409 = user already exists (OTP re-verification race) — safe to continue
      if (err?.response?.status !== 409) throw err;
      console.warn('[Auth] /auth/register 409 (user exists) — proceeding to login');
    }

    // Step 2: Login to get JWT (password is still in memory from the form)
    if (__DEV__) console.log('[Auth] Registration complete → logging in directly');
    const { token, user } = await loginEmailDirect(email, password);
    await persistSession(token, user);
    return { token, backendUser: user };
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

    // Exchange Firebase session for backend JWT via social-login
    const authPayload = await socialLogin(firebaseUser);
    await persistSession(authPayload.token, authPayload.user);

    let syncedUser = authPayload.user;
    try {
      syncedUser = await syncUserWithMongo(firebaseUser, authPayload.user);
      await persistSession(authPayload.token, syncedUser);
    } catch (error) {
      console.warn('Mongo user sync failed during Google login:', getApiErrorMessage(error));
    }

    return {
      firebaseUser,
      token: authPayload.token,
      backendUser: syncedUser,
    };
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
      if (__DEV__) console.log('[Auth] Bootstrap: using cached session');
      return { token: currentToken, backendUser: currentUser };
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

    if (__DEV__) console.log('[Auth] Bootstrap complete | role:', syncedUser.role);

    return {
      token: authPayload.token,
      backendUser: syncedUser,
    };
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

  async updateUserBackendProfile(firebaseUser: FirebaseUser, data: { name?: string, avatar?: string, phone?: string }): Promise<BackendUser> {
    const response = await apiClient.put<ApiEnvelope<any>>(`/users/${firebaseUser.uid}`, data);
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to update user profile.');
    }
    const syncedUser = normalizeBackendUser(response.data.data, firebaseUser.uid);
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
