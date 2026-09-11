import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/config/firebase';
import {
  clearApiCache,
  getApiErrorMessage,
  apiClient,
  setAuthInvalidHandler,
} from '@/services/api/client';
import { CUSTOMER_ROLE, isCustomerRole } from '@/services/api/roles';
import { authService } from '@/services/api/authService';
import { authStorage } from '@/services/storage/authStorage';
import type { PendingLoginOtp } from '@/services/storage/authStorage';
import type { BackendUser, MobileProfile } from '@/services/api/types';
import { clearQueue } from '@/services/offlineQueue';
import { aiScanStore } from '@/features/ai-scan/scanStore';
import { BOOKING_DRAFT_STORAGE_KEY } from '@/services/storage/bookingDraftStorage';

const SENSITIVE_CUSTOMER_STORAGE_KEYS = [
  '@autospf_addresses',
  '@autospf_latest_scan_context',
  BOOKING_DRAFT_STORAGE_KEY,
];

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
  /** Signup OTP verified ownership but no account exists yet — continue to /auth/register. */
  verifiedWithoutSession?: boolean;
  /** Machine-readable backend failure reason (OTP_INVALID, OTP_EXPIRED, ...). */
  code?: string;
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
  completeSignupOtp: (email: string, otp: string) => Promise<AuthResult>;
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
  completeSignupOtp: async () => ({ success: false }),
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
  if (!backendUser || !isCustomerRole(backendUser.role)) {
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
    role: CUSTOMER_ROLE,
    avatar_url: backendUser?.avatar || firebaseUser?.photoURL || null,
    backend_id: backendUser?._id || backendUser?.id,
    firebase_uid: firebaseUser?.uid,
  };
};

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [backendUser, setBackendUser] = useState<BackendUser | null>(null);
  const [profile, setProfile] = useState<MobileProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [pendingLoginOtp, setPendingLoginOtp] = useState<PendingLoginOtp | null>(null);
  const [loginOtpVerified, setLoginOtpVerified] = useState(false);
  const signOutPromiseRef = useRef<Promise<void> | null>(null);

  const clearCustomerRuntimeState = useCallback(() => {
    queryClient.clear();
    clearApiCache();
    aiScanStore.reset();
  }, [queryClient]);

  useEffect(() => {
    setAuthInvalidHandler(async ({ path, message }) => {
      if (__DEV__) {
        console.warn(`[AuthContext] Invalid session detected from ${path}: ${message}`);
      }
      const cleanupResults = await Promise.allSettled([
        authService.clearLocalSession(),
        clearQueue(),
        AsyncStorage.multiRemove(SENSITIVE_CUSTOMER_STORAGE_KEYS),
      ]);
      cleanupResults.forEach((result) => {
        if (result.status === 'rejected' && __DEV__) {
          console.warn(
            '[AuthContext] Forced sign-out cleanup warning:',
            getApiErrorMessage(result.reason)
          );
        }
      });

      clearCustomerRuntimeState();
      setSession(null);
      setUser(null);
      setToken(null);
      setBackendUser(null);
      setProfile(null);
      setPendingLoginOtp(null);
      setLoginOtpVerified(false);
    });

    return () => {
      setAuthInvalidHandler(null);
    };
  }, [clearCustomerRuntimeState]);

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
          const [cachedToken, cachedChallenge, cachedOtpVerified] = await Promise.all([
            authStorage.getToken(),
            authStorage.getPendingLoginOtp(),
            authStorage.isLoginOtpVerified(),
          ]);
          if (cachedToken && cachedOtpVerified) {
            if (__DEV__) console.log('[AuthContext] Validating stored email session with backend');
            const restored = await authService.restoreStoredSession();
            setPendingLoginOtp(null);
            setLoginOtpVerified(true);
            await authStorage.clearPendingLoginOtp();
            applyState(null, restored.token, restored.backendUser);
          } else {
            if (cachedToken) {
              await authService.clearLocalSession();
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
        } catch (error) {
          if (__DEV__) console.warn('[AuthContext] Stored session rejected:', getApiErrorMessage(error));
          await authService.clearLocalSession().catch(() => {});
          await clearQueue().catch(() => {});
          applyState(null, null, null);
          setPendingLoginOtp(null);
          setLoginOtpVerified(false);
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
        // Session restoration is fail-closed: protected routes never render
        // from cached role data when the authoritative check did not succeed.
        await authService.clearLocalSession().catch(() => {});
        await clearQueue().catch(() => {});
        applyState(null, null, null);
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
          clientType: 'mobile',
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
      if (error?.response?.data?.code === 'MOBILE_CUSTOMER_ONLY') {
        await authService.clearLocalSession().catch(() => {});
        await clearQueue().catch(() => {});
        setPendingLoginOtp(null);
        setLoginOtpVerified(false);
        applyState(null, null, null);
      }
      return {
        success: false,
        message: getApiErrorMessage(error, 'Verification failed. Please try again.'),
        code: error?.response?.data?.code,
        data: error?.response?.data?.data,
      };
    }
  };

  /**
   * Signup / email-verification OTP. The backend activates the customer account
   * and returns the session in the same response, so a correct code lands the
   * user in the app — no return trip through the sign-in screen for a second code.
   */
  const completeSignupOtp = async (email: string, otp: string): Promise<AuthResult> => {
    try {
      const result = await authService.verifyOtp(email, otp);
      if (!result.success) {
        return { success: false, message: result.message };
      }
      if (!result.session) {
        // Ownership proven before the account exists (send-otp -> verify-otp -> register).
        return { success: true, verifiedWithoutSession: true, message: result.message };
      }
      // Mirrors completeLoginOtp: without this flag the session-restore effect
      // refuses to rehydrate the stored token on the next cold start.
      await authStorage.setLoginOtpVerified(true);
      setLoginOtpVerified(true);
      await authStorage.clearPendingLoginOtp();
      setPendingLoginOtp(null);
      applyState(null, result.session.token, result.session.backendUser);
      void import('@/hooks/useRealtimeSync')
        .then(({ refreshRealtimeSocketAuth }) => refreshRealtimeSocketAuth())
        .catch(() => {});
      return { success: true };
    } catch (error: any) {
      if (error?.response?.data?.code === 'MOBILE_CUSTOMER_ONLY') {
        await authService.clearLocalSession().catch(() => {});
        await clearQueue().catch(() => {});
        setLoginOtpVerified(false);
        applyState(null, null, null);
      }
      return {
        success: false,
        message: getApiErrorMessage(error, 'Verification failed. Please try again.'),
        code: error?.response?.data?.code,
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
      if (error?.response?.data?.code === 'MOBILE_CUSTOMER_ONLY') {
        await authService.clearLocalSession().catch(() => {});
        setPendingLoginOtp(null);
        setLoginOtpVerified(false);
        applyState(null, null, null);
      }
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
      // Email/password user — validate the stored JWT and current DB role.
      try {
        const restored = await authService.restoreStoredSession();
        applyState(null, restored.token, restored.backendUser);
      } catch (error) {
        console.warn('Failed to refresh email user profile:', getApiErrorMessage(error));
        await signOut();
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

  const signOut = useCallback((): Promise<void> => {
    if (signOutPromiseRef.current) return signOutPromiseRef.current;

    const operation = (async () => {
      try {
        const { unregisterCurrentPushToken } = await import('@/hooks/usePushNotifications');
        await unregisterCurrentPushToken();
      } catch (error) {
        // Push-token detachment is best-effort; it must not strand a customer
        // in an authenticated session when the auth provider can sign out.
        if (__DEV__) console.warn('[AuthContext] Push cleanup warning:', getApiErrorMessage(error));
      }

      try {
        await authService.signOut();
      } catch (error) {
        console.warn('[AuthContext] Sign-out failed:', getApiErrorMessage(error));
        throw new Error('Unable to sign out. Please try again.');
      }

      // Clear in-memory data before publishing the unauthenticated state, so a
      // subsequent account can never render the previous customer's results.
      clearCustomerRuntimeState();

      const cleanupResults = await Promise.allSettled([
        clearQueue(),
        AsyncStorage.multiRemove(SENSITIVE_CUSTOMER_STORAGE_KEYS),
      ]);
      cleanupResults.forEach((result) => {
        if (result.status === 'rejected' && __DEV__) {
          console.warn('[AuthContext] Customer data cleanup warning:', result.reason);
        }
      });

      applyState(null, null, null);
      setPendingLoginOtp(null);
      setLoginOtpVerified(false);
    })();

    signOutPromiseRef.current = operation;
    operation.then(
      () => {
        if (signOutPromiseRef.current === operation) signOutPromiseRef.current = null;
      },
      () => {
        if (signOutPromiseRef.current === operation) signOutPromiseRef.current = null;
      }
    );
    return operation;
  }, [clearCustomerRuntimeState]);

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
        completeSignupOtp,
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
