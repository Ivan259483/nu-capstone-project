import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { getApiErrorMessage } from '@/services/api/client';
import { CUSTOMER_ROLE, getSafeUserRole } from '@/services/api/roles';
import { authService } from '@/services/api/authService';
import type { BackendUser, MobileProfile } from '@/services/api/types';

type AuthResult = {
  success: boolean;
  message?: string;
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
        applyState(firebaseUser, null, null);
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
      const result = await authService.loginWithEmail(email.trim(), password);
      applyState(result.firebaseUser, result.token, result.backendUser);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: getApiErrorMessage(error, 'Sign-in failed.'),
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
