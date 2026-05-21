/**
 * AutoSPF+ Theme Context
 * Dark mode by default; optional light override persisted in AsyncStorage.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, type ColorScheme } from '@/constants/theme';

type ThemeColors = typeof Colors.light | typeof Colors.dark;

const THEME_KEY = '@autospf_theme_preference';

interface ThemeContextType {
  scheme: ColorScheme;
  colors: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
  setScheme: (scheme: ColorScheme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  scheme: 'dark',
  colors: Colors.dark,
  isDark: true,
  toggleTheme: () => {},
  setScheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [override, setOverride] = useState<ColorScheme | null>(null);

  // Load persisted preference (only when user explicitly toggled theme in settings)
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((val) => {
      if (val === 'light' || val === 'dark') {
        setOverride(val);
      }
    });
  }, []);

  const scheme: ColorScheme = override ?? 'dark';
  const isDark = scheme === 'dark';
  const colors = Colors[scheme];

  const toggleTheme = useCallback(() => {
    const next = isDark ? 'light' : 'dark';
    setOverride(next);
    AsyncStorage.setItem(THEME_KEY, next);
  }, [isDark]);

  const setScheme = useCallback((s: ColorScheme) => {
    setOverride(s);
    AsyncStorage.setItem(THEME_KEY, s);
  }, []);

  return (
    <ThemeContext.Provider value={{ scheme, colors, isDark, toggleTheme, setScheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
