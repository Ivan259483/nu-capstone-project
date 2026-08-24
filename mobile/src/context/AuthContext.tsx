import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { getApiErrorMessage, apiClient, setAuthInvalidHandler } from '@/services/api/client';
import { CUSTOMER_ROLE, getSafeUserRole } from '@/services/api/roles';
import { authService } from '@/services/api/authService';
import { authStorage } from '@/services/storage/authStorage';
import type { PendingLoginOtp } from '@/services/storage/authStorage';
import type { BackendUser, MobileProfile } from '@/services/api/types';
import { clearQueue } from '@/services/offlineQueue';


type AuthResult = {
  success: boolean;
  message?: string;
  /** Email not verified — navigate to verify screen with `verifyEmail`. */
  requiresEmailOtp?: boolean;
  verifyEmail?: string;
  /** Password login requires the email OTP challenge before a session is created. */
  requiresLoginOtp?: boolean;
  userId?: string;
  challengeToken?: string;
  maskedEmail?: string;
  codeExpiresAt?: number;
  challengeExpiresAt?: number;
  resendAvailableAt?: number;
  /** Backend requires password reset before login. */
  requiresPasswordChange?: boolean;
  /** Structured data from the backend (e.g., remaining login attempts, lock info) */
  data?: {
    remainingAttempts?: number;
    loginAttempts?: number;
    maxAttempts?: number;
    locked?: boolean;
    lockUntilMs?: number;
    remainingMinutes?: number;
  };
};

type AuthContextType = {
  session: FirebaseUser | null;
  user: FirebaseUser | null;
  backendUser: BackendUser | null;
  profile: MobileProfile | null;
  token: string | null;
  initialized: boolean;
  pendingLoginOtp: PendingLoginOtp | null;
  loginOtpVerified: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  completeLoginOtp: (userId: string, challengeToken: string, otp: string) => Promise<AuthResult>;
  resendLoginOtp: (userId: string, challengeToken: string) => Promise<AuthResult>;
  clearPendingLoginOtp: () => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<AuthResult>;
  signUp: (fullName: string, email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  deleteAccount: (password: string) => Promise<{ success: boolean; message?: string }>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  backendUser: null,
  profile: null,
  token: null,
  initialized: false,
  pendingLoginOtp: null,
  loginOtpVerified: false,
  signIn: async () => ({ success: false }),
  completeLoginOtp: async () => ({ success: false }),
  resendLoginOtp: async () => ({ success: false }),
  clearPendingLoginOtp: async () => {},
  signInWithGoogle: async () => ({ success: false }),
  signUp: async () => ({ success: false }),
  signOut: async () => {},
  refreshProfile: async () => {},
  deleteAccount: async () => ({ success: false }),
});

const toProfile = (
  firebaseUser: FirebaseUser | null,
  backendUser: BackendUser | null
): MobileProfile | null => {
  if (!firebaseUser && !backendUser) {
    return null;
  }

  const fullName =
    backendUser?.name ||
    firebaseUser?.displayName ||
    (firebaseUser?.email ? firebaseUser.email.split('@')[0] : 'User');

  const email = backendUser?.email || firebaseUser?.email || '';

  return {
    id: backendUser?._id || backendUser?.id || firebaseUser?.uid || '',
    full_name: fullName,
    email,
    phone: backendUser?.phone || '',
    role: getSafeUserRole(backendUser?.role, CUSTOMER_ROLE),
    avatar_url: backendUser?.avatar || firebaseUser?.photoURL || null,
    backend_id: backendUser?._id || backendUser?.id,
    firebase_uid: firebaseUser?.uid,
  };
};

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [backendUser, setBackendUser] = useState<BackendUser | null>(null);
  const [profile, setProfile] = useState<MobileProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [pendingLoginOtp, setPendingLoginOtp] = useState<PendingLoginOtp | null>(null);
  const [loginOtpVerified, setLoginOtpVerified] = useState(false);

  useEffect(() => {
    setAuthInvalidHandler(async ({ path, message }) => {
      if (__DEV__) {
        console.warn(`[AuthContext] Invalid session detected from ${path}: ${message}`);
      }
      try {
        await authService.clearLocalSession();
        await clearQueue();
      } catch (error) {
        console.warn('[AuthContext] Forced sign-out warning:', getApiErrorMessage(error));
      } finally {
        setSession(null);
        setUser(null);
        setToken(null);
        setBackendUser(null);
        setProfile(null);
        setPendingLoginOtp(null);
        setLoginOtpVerified(false);
      }
    });

    return () => {
      setAuthInvalidHandler(null);
    };
  }, []);

  const applyState = (
    firebaseUser: FirebaseUser | null,
    nextToken: string | null,
    nextBackendUser: BackendUser | null
  ) => {
    setSession(firebaseUser);
    setUser(firebaseUser);
    setToken(nextToken);
    setBackendUser(nextBackendUser);
    setProfile(toProfile(firebaseUser, nextBackendUser));
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        // No Firebase session — check if an email/password user has a cached JWT.
        // Email-registered users never have a Firebase account; their session
        // lives only in SecureStore (token + backendUser).
        try {
          const [cachedToken, cachedUser, cachedChallenge, cachedOtpVerified] = await Promise.all([
            authStorage.getToken(),
            authStorage.getUser(),
            authStorage.getPendingLoginOtp(),
            authStorage.isLoginOtpVerified(),
          ]);
          if (cachedToken && cachedUser && cachedOtpVerified) {
            if (__DEV__) console.log('[AuthContext] No Firebase session, restoring email user from cache');
            setPendingLoginOtp(null);
            setLoginOtpVerified(true);
            await authStorage.clearPendingLoginOtp();
            applyState(null, cachedToken, cachedUser);
          } else {
            if (cachedToken || cachedUser) {
              await Promise.all([authStorage.clearToken(), authStorage.clearUser()]);
            }
            applyState(null, null, null);
            setLoginOtpVerified(false);
            if (cachedChallenge && cachedChallenge.challengeExpiresAt > Date.now()) {
              setPendingLoginOtp(cachedChallenge);
            } else {
              setPendingLoginOtp(null);
              if (cachedChallenge) await authStorage.clearPendingLoginOtp();
            }
          }
        } catch {
          applyState(null, null, null);
        }
        setInitialized(true);
        return;
      }

      try {
        setPendingLoginOtp(null);
        setLoginOtpVerified(false);
        await authStorage.clearPendingLoginOtp();
        const bootstrapped = await authService.bootstrapFromFirebaseUser(firebaseUser);
        applyState(firebaseUser, bootstrapped.token, bootstrapped.backendUser);
      } catch (error) {
        const msg = getApiErrorMessage(error);
        console.warn('[AuthContext] Bootstrap failed:', msg);

        // ── Graceful fallback: try cached token/user from SecureStore ───────
        // Do NOT sign out just because the backend is temporarily unreachable.
        // This prevents demo-breaking logouts on slow networks or backend hiccups.
        try {
          const { authStorage } = await import('@/services/storage/authStorage');
          const cachedToken = await authStorage.getToken();
          const cachedUser = await authStorage.getUser();
          if (cachedToken && cachedUser) {
            console.log('[AuthContext] Bootstrap failed but cached session found — continuing offline');
            applyState(firebaseUser, cachedToken, cachedUser);
          } else {
            // No cached session at all — must sign out
            console.warn('[AuthContext] No cached session, signing out');
            applyState(null, null, null);
            authService.signOut().catch(() => {});
          }
        } catch {
          applyState(null, null, null);
          authService.signOut().catch(() => {});
        }
      } finally {
        setInitialized(true);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<AuthResult> => {
    try {
      setPendingLoginOtp(null);
      await authStorage.clearPendingLoginOtp();
      // Direct backend login — does NOT involve Firebase.
      // This correctly handles users registered via OTP (no Firebase account)
      // as well as existing web-registered users.
      // Google/Apple sign-in goes through signInWithGoogle instead.
      const { token, backendUser } = await authService.loginWithEmailPassword(email.trim(), password);
      await authStorage.setLoginOtpVerified(false);
      setLoginOtpVerified(false);
      applyState(null, token, backendUser);
      void import('@/hooks/useRealtimeSync')
        .then(({ refreshRealtimeSocketAuth }) => refreshRealtimeSocketAuth())
        .catch(() => {});
      return { success: true };
    } catch (error: any) {
      if (error?.code === 'REQUIRES_EMAIL_OTP') {
        return {
          success: false,
          message: error.message,
          requiresEmailOtp: true,
          verifyEmail: error.verifyEmail,
        };
      }
      if (error?.code === 'REQUIRES_LOGIN_OTP') {
        if (!error.userId || !error.challengeToken || !error.maskedEmail) {
          return {
            success: false,
            message: 'The verification session could not be started. Please try again.',
          };
        }
        const challenge: PendingLoginOtp = {
          userId: error.userId,
          challengeToken: error.challengeToken,
          maskedEmail: error.maskedEmail,
          codeExpiresAt: Number(error.codeExpiresAt) || Date.now() + 5 * 60 * 1000,
          challengeExpiresAt: Number(error.challengeExpiresAt) || Date.now() + 15 * 60 * 1000,
          resendAvailableAt: Number(error.resendAvailableAt) || Date.now() + 60 * 1000,
        };
        await authStorage.setPendingLoginOtp(challenge);
        setPendingLoginOtp(challenge);
        return {
          success: false,
          message: error.message,
          requiresLoginOtp: true,
          userId: error.userId,
          challengeToken: error.challengeToken,
          maskedEmail: error.maskedEmail,
          codeExpiresAt: challenge.codeExpiresAt,
          challengeExpiresAt: challenge.challengeExpiresAt,
          resendAvailableAt: challenge.resendAvailableAt,
        };
      }
      if (error?.code === 'REQUIRES_PASSWORD_CHANGE') {
        return {
          success: false,
          message: error.message,
          requiresPasswordChange: true,
        };
      }
      // Extract structured data from backend error response (remaining attempts, lock info)
      const responseData = error?.response?.data?.data ?? error?.response?.data ?? undefined;
      return {
        success: false,
        message: getApiErrorMessage(error, 'Sign-in failed.'),
        data: responseData,
      };
    }
  };

  const completeLoginOtp = async (
    userId: string,
    challengeToken: string,
    otp: string
  ): Promise<AuthResult> => {
    try {
      const { token, backendUser } = await authService.verifyLoginOtp(userId, challengeToken, otp);
      await authStorage.setLoginOtpVerified(true);
      setLoginOtpVerified(true);
      await authStorage.clearPendingLoginOtp();
      setPendingLoginOtp(null);
      applyState(null, token, backendUser);
      void import('@/hooks/useRealtimeSync')
        .then(({ refreshRealtimeSocketAuth }) => refreshRealtimeSocketAuth())
        .catch(() => {});
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        message: getApiErrorMessage(error, 'Verification failed. Please try again.'),
        data: error?.response?.data?.data,
      };
    }
  };

  const resendLoginOtp = async (
    userId: string,
    challengeToken: string
  ): Promise<AuthResult> => {
    try {
      const timing = await authService.resendLoginOtp(userId, challengeToken);
      const current = pendingLoginOtp;
      if (current && current.userId === userId && current.challengeToken === challengeToken) {
        const updated = { ...current, ...timing };
        await authStorage.setPendingLoginOtp(updated);
        setPendingLoginOtp(updated);
      }
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        message: getApiErrorMessage(error, 'Unable to resend code.'),
        data: error?.response?.data?.data,
      };
    }
  };

  const clearPendingLoginOtp = async (): Promise<void> => {
    setPendingLoginOtp(null);
    await authStorage.clearPendingLoginOtp();
  };

  const signInWithGoogle = async (idToken: string): Promise<AuthResult> => {
    try {
      const result = await authService.loginWithGoogle(idToken);
      applyState(result.firebaseUser, result.token, result.backendUser);
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || getApiErrorMessage(error, 'Google sign-in failed.'),
      };
    }
  };

  const signUp = async (
    fullName: string,
    email: string,
    password: string
  ): Promise<AuthResult> => {
    try {
      // OTP already verified in signup.tsx before this is called.
      // registerWithEmail: POST /auth/register → POST /auth/login → JWT (no Firebase).
      const { token, backendUser } = await authService.registerWithEmail(fullName.trim(), email.trim(), password);
      applyState(null, token, backendUser);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: getApiErrorMessage(error, 'Sign-up failed.'),
      };
    }
  };

  const refreshProfile = async (): Promise<void> => {
    if (!user) {
      // Email/password user — no Firebase user to bootstrap from; restore from cache.
      try {
        const cachedToken = await authStorage.getToken();
        const cachedUser  = await authStorage.getUser();
        if (cachedToken && cachedUser) applyState(null, cachedToken, cachedUser);
      } catch (error) {
        console.warn('Failed to refresh email user profile:', getApiErrorMessage(error));
      }
      return;
    }

    try {
      const result = await authService.bootstrapFromFirebaseUser(user);
      applyState(user, result.token, result.backendUser);
    } catch (error) {
      console.warn('Failed to refresh profile:', getApiErrorMessage(error));
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      const { unregisterCurrentPushToken } = await import('@/hooks/usePushNotifications');
      await unregisterCurrentPushToken();
      await authService.signOut();
      // Clear any stuck offline-queued requests so they aren't
      // replayed with a stale token in the next session.
      await clearQueue();
    } catch (error) {
      console.warn('Sign-out warning:', getApiErrorMessage(error));
    } finally {
      applyState(null, null, null);
      setLoginOtpVerified(false);
    }
  };

  const deleteAccount = async (password: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const token = await authStorage.getToken();
      if (!token) return { success: false, message: 'Not authenticated.' };

      const response = await apiClient.delete('/auth/account', {
        data: { password },
        headers: { Authorization: `Bearer ${token}` },
      });

      // Clear session on success
      await signOut();
      return { success: true, message: response.data?.message || 'Account deleted.' };
    } catch (error: any) {
      const msg =
        error?.response?.data?.message ||
        getApiErrorMessage(error, 'Failed to delete account.');
      return { success: false, message: msg };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        backendUser,
        profile,
        token,
        initialized,
        pendingLoginOtp,
        loginOtpVerified,
        signIn,
        completeLoginOtp,
        resendLoginOtp,
        clearPendingLoginOtp,
        signInWithGoogle,
        signUp,
        signOut,
        refreshProfile,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
