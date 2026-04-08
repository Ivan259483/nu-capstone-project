import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  type User as FirebaseUser,
} from 'firebase/auth';
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

const socialLogin = async (firebaseUser: FirebaseUser): Promise<{ token: string; user: BackendUser }> => {
  const email = firebaseUser.email || '';
  if (!email) {
    throw new Error('Firebase user email is missing.');
  }

  const response = await apiClient.post('/auth/social-login', {
    email,
    name: firebaseUser.displayName || safeNameFromEmail(email),
    provider: 'firebase',
    providerId: firebaseUser.uid,
    photoURL: firebaseUser.photoURL,
  });

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
  try {
    const response = await apiClient.post('/auth/login', {
      email,
      password,
    });

    return getAuthPayload(response, firebaseUser.uid);
  } catch {
    return socialLogin(firebaseUser);
  }
};

const exchangeTokenForRegistration = async (
  firebaseUser: FirebaseUser,
  name: string,
  email: string,
  password: string
): Promise<{ token: string; user: BackendUser }> => {
  try {
    const response = await apiClient.post('/auth/register', {
      name,
      email,
      password,
      role: DEFAULT_ROLE,
    });

    return getAuthPayload(response, firebaseUser.uid);
  } catch {
    return socialLogin(firebaseUser);
  }
};

export const authService = {
  async loginWithEmail(email: string, password: string): Promise<{
    firebaseUser: FirebaseUser;
    token: string;
    backendUser: BackendUser;
  }> {
    let firebaseUser: FirebaseUser;
    try {
      const credentials = await signInWithEmailAndPassword(auth, email, password);
      firebaseUser = credentials.user;
    } catch (firebaseError: any) {
      // Translate Firebase errors (like auth/too-many-requests) to user-friendly messages
      throw new Error(getFirebaseAuthErrorMessage(firebaseError));
    }

    const authPayload = await exchangeTokenForLogin(firebaseUser, email, password);

    let syncedUser = authPayload.user;
    try {
      syncedUser = await syncUserWithMongo(firebaseUser, authPayload.user);
    } catch (error) {
      console.warn('Mongo user sync failed during login:', getApiErrorMessage(error));
    }

    await persistSession(authPayload.token, syncedUser);

    return {
      firebaseUser,
      token: authPayload.token,
      backendUser: syncedUser,
    };
  },

  async registerWithEmail(name: string, email: string, password: string): Promise<{
    firebaseUser: FirebaseUser;
    token: string;
    backendUser: BackendUser;
  }> {
    let firebaseUser: FirebaseUser;
    try {
      const credentials = await createUserWithEmailAndPassword(auth, email, password);
      firebaseUser = credentials.user;
    } catch (firebaseError: any) {
      throw new Error(getFirebaseAuthErrorMessage(firebaseError));
    }

    if (name.trim()) {
      await updateProfile(firebaseUser, { displayName: name.trim() });
    }

    const authPayload = await exchangeTokenForRegistration(
      firebaseUser,
      name.trim() || safeNameFromEmail(email),
      email,
      password
    );

    let syncedUser = authPayload.user;
    try {
      syncedUser = await syncUserWithMongo(firebaseUser, authPayload.user);
    } catch (error) {
      console.warn('Mongo user sync failed during registration:', getApiErrorMessage(error));
    }

    await persistSession(authPayload.token, syncedUser);

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

    if (currentToken && currentUser && currentUser.firebaseUid === firebaseUser.uid) {
      return {
        token: currentToken,
        backendUser: currentUser,
      };
    }

    const authPayload = await socialLogin(firebaseUser);

    let syncedUser = authPayload.user;
    try {
      syncedUser = await syncUserWithMongo(firebaseUser, authPayload.user);
    } catch (error) {
      console.warn('Mongo user sync failed during bootstrap:', getApiErrorMessage(error));
    }

    await persistSession(authPayload.token, syncedUser);

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

    await firebaseSignOut(auth);
    await authStorage.clearAll();
  },

  async updateUserBackendProfile(firebaseUser: FirebaseUser, data: { name?: string, avatar?: string }): Promise<BackendUser> {
    const response = await apiClient.put<ApiEnvelope<any>>(`/users/${firebaseUser.uid}`, data);
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to update user profile.');
    }
    const syncedUser = normalizeBackendUser(response.data.data, firebaseUser.uid);
    await persistSession(await authStorage.getToken() || '', syncedUser);
    return syncedUser;
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
    } catch {
      // Ignored
    }
  }
};
