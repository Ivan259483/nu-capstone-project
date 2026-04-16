import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { getApiErrorMessage, apiClient } from '@/services/api/client';
import { CUSTOMER_ROLE, getSafeUserRole } from '@/services/api/roles';
import { authService } from '@/services/api/authService';
import { authStorage } from '@/services/storage/authStorage';
import type { BackendUser, MobileProfile } from '@/services/api/types';

type AuthResult = {
  success: boolean;
  message?: string;
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
  signIn: (email: string, password: string) => Promise<AuthResult>;
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
  signIn: async () => ({ success: false }),
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
        applyState(null, null, null);
        setInitialized(true);
        return;
      }

      try {
        const bootstrapped = await authService.bootstrapFromFirebaseUser(firebaseUser);
        applyState(firebaseUser, bootstrapped.token, bootstrapped.backendUser);
      } catch (error) {
        console.warn('Failed to bootstrap Firebase session:', getApiErrorMessage(error));
        applyState(null, null, null);
        authService.signOut().catch(() => {});
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
      // Perform the exact localized Firebase Auth login
      // Firebase manages password attempts and brute force locking securely (auth/too-many-requests).
      const result = await authService.loginWithEmail(email.trim(), password);
      applyState(result.firebaseUser, result.token, result.backendUser);
      return { success: true };
    } catch (error: any) {
      // Extract structured data from backend error response (remaining attempts, lock info)
      const responseData = error?.response?.data?.data ?? error?.data ?? undefined;
      return {
        success: false,
        message: error.message || getApiErrorMessage(error, 'Sign-in failed.'),
        data: responseData,
      };
    }
  };

  const signUp = async (
    fullName: string,
    email: string,
    password: string
  ): Promise<AuthResult> => {
    try {
      const result = await authService.registerWithEmail(fullName.trim(), email.trim(), password);
      applyState(result.firebaseUser, result.token, result.backendUser);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: getApiErrorMessage(error, 'Sign-up failed.'),
      };
    }
  };

  const refreshProfile = async (): Promise<void> => {
    if (!user) return;

    try {
      const result = await authService.bootstrapFromFirebaseUser(user);
      applyState(user, result.token, result.backendUser);
    } catch (error) {
      console.warn('Failed to refresh profile:', getApiErrorMessage(error));
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      await authService.signOut();
    } catch (error) {
      console.warn('Sign-out warning:', getApiErrorMessage(error));
    } finally {
      applyState(null, null, null);
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
        signIn,
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
