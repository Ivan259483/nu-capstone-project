/**
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │        AutoGloss (AutoSPF+) — Secure Token Storage Module          │
 * │                                                                      │
 * │  Uses expo-secure-store for encrypted keychain storage on iOS and   │
 * │  encrypted SharedPreferences on Android. Falls back to AsyncStorage│
 * │  only when SecureStore is unavailable (web preview).                │
 * │                                                                      │
 * │  Layer: services/storage/authStorage.ts                             │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * WHY SECURE STORE?
 * - JWT tokens are secrets that grant full API access
 * - AsyncStorage stores values in plain-text SQLite (rooted devices can read)
 * - SecureStore uses iOS Keychain / Android EncryptedSharedPreferences
 * - This is a capstone requirement for production-ready security
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { APP_STORAGE_KEYS } from '@/config/env';
import type { BackendUser } from '@/services/api/types';

export type PendingLoginOtp = {
  userId: string;
  challengeToken: string;
  maskedEmail: string;
  codeExpiresAt: number;
  challengeExpiresAt: number;
  resendAvailableAt: number;
};

// ── Helpers ────────────────────────────────────────────────────────────
// SecureStore is unavailable on web — fall back to AsyncStorage there.
const isSecureStoreAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Safe JSON parser — returns null on malformed data instead of crashing.
 */
const parseUser = (raw: string | null): BackendUser | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BackendUser;
  } catch {
    return null;
  }
};

const parsePendingLoginOtp = (raw: string | null): PendingLoginOtp | null => {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingLoginOtp>;
    if (
      typeof value.userId !== 'string'
      || typeof value.challengeToken !== 'string'
      || typeof value.maskedEmail !== 'string'
      || typeof value.codeExpiresAt !== 'number'
      || typeof value.challengeExpiresAt !== 'number'
      || typeof value.resendAvailableAt !== 'number'
    ) {
      return null;
    }
    return value as PendingLoginOtp;
  } catch {
    return null;
  }
};

// ── Encrypted Storage Adapter ──────────────────────────────────────────
// Provides a unified interface that always chooses the most secure storage
// mechanism available on the current platform.

async function secureGet(key: string): Promise<string | null> {
  if (isSecureStoreAvailable) {
    return SecureStore.getItemAsync(key);
  }
  return AsyncStorage.getItem(key);
}

async function secureSet(key: string, value: string): Promise<void> {
  if (isSecureStoreAvailable) {
    await SecureStore.setItemAsync(key, value);
  } else {
    await AsyncStorage.setItem(key, value);
  }
}

async function secureDelete(key: string): Promise<void> {
  if (isSecureStoreAvailable) {
    await SecureStore.deleteItemAsync(key);
  } else {
    await AsyncStorage.removeItem(key);
  }
}

// ── Public API ─────────────────────────────────────────────────────────
// Every function is async to keep a unified interface regardless of the
// underlying storage engine.

export const authStorage = {
  // ── Token (JWT) ──
  async getToken(): Promise<string | null> {
    return secureGet(APP_STORAGE_KEYS.token);
  },

  async setToken(token: string): Promise<void> {
    await secureSet(APP_STORAGE_KEYS.token, token);
  },

  async clearToken(): Promise<void> {
    await secureDelete(APP_STORAGE_KEYS.token);
  },

  // ── Backend User (cached profile for offline bootstrap) ──
  async getUser(): Promise<BackendUser | null> {
    const raw = await secureGet(APP_STORAGE_KEYS.backendUser);
    return parseUser(raw);
  },

  async setUser(user: BackendUser): Promise<void> {
    await secureSet(APP_STORAGE_KEYS.backendUser, JSON.stringify(user));
  },

  async clearUser(): Promise<void> {
    await secureDelete(APP_STORAGE_KEYS.backendUser);
  },

  // ── Password-validated login OTP challenge ──
  // The opaque challenge is stored only in Keychain/EncryptedSharedPreferences
  // on mobile. The actual six-digit OTP is never persisted by the app.
  async getPendingLoginOtp(): Promise<PendingLoginOtp | null> {
    return parsePendingLoginOtp(await secureGet(APP_STORAGE_KEYS.pendingLoginOtp));
  },

  async setPendingLoginOtp(challenge: PendingLoginOtp): Promise<void> {
    await secureSet(APP_STORAGE_KEYS.pendingLoginOtp, JSON.stringify(challenge));
  },

  async clearPendingLoginOtp(): Promise<void> {
    await secureDelete(APP_STORAGE_KEYS.pendingLoginOtp);
  },

  async isLoginOtpVerified(): Promise<boolean> {
    return (await secureGet(APP_STORAGE_KEYS.loginOtpVerified)) === 'true';
  },

  async setLoginOtpVerified(verified: boolean): Promise<void> {
    if (verified) {
      await secureSet(APP_STORAGE_KEYS.loginOtpVerified, 'true');
    } else {
      await secureDelete(APP_STORAGE_KEYS.loginOtpVerified);
    }
  },

  // ── Bulk clear (used during sign-out) ──
  async clearAll(): Promise<void> {
    await Promise.all([
      secureDelete(APP_STORAGE_KEYS.token),
      secureDelete(APP_STORAGE_KEYS.backendUser),
      secureDelete(APP_STORAGE_KEYS.pendingLoginOtp),
      secureDelete(APP_STORAGE_KEYS.loginOtpVerified),
    ]);
  },
};
