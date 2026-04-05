/**
 * AutoSPF+ Theme Context
 * System-aware dark mode with manual override persisted in AsyncStorage.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
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
  scheme: 'light',
  colors: Colors.light,
  isDark: false,
  toggleTheme: () => {},
  setScheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [override, setOverride] = useState<ColorScheme | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load persisted preference
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((val) => {
      if (val === 'light' || val === 'dark') {
        setOverride(val);
      }
      setLoaded(true);
    });
  }, []);

  const scheme: ColorScheme = override ?? (systemScheme === 'dark' ? 'dark' : 'light');
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

  if (!loaded) return null; // Prevent flash

  return (
    <ThemeContext.Provider value={{ scheme, colors, isDark, toggleTheme, setScheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
