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

  // ── Bulk clear (used during sign-out) ──
  async clearAll(): Promise<void> {
    await Promise.all([
      secureDelete(APP_STORAGE_KEYS.token),
      secureDelete(APP_STORAGE_KEYS.backendUser),
    ]);
  },
};
