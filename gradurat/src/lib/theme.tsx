import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { loadSettings, saveSettings } from '@/lib/api';

export type ThemeMode = 'dark' | 'light' | 'system';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  borderStrong: string;
  text: string;
  muted: string;
  subtle: string;
  blue: string;
  blueDark: string;
  green: string;
  orange: string;
  danger: string;
};

export const darkColors: ThemeColors = {
  background: '#02050b',
  surface: '#050c17',
  surfaceRaised: '#07152b',
  border: '#142844',
  borderStrong: '#123f82',
  text: '#ffffff',
  muted: '#8e9aac',
  subtle: '#65748b',
  blue: '#1683ff',
  blueDark: '#0b2b61',
  green: '#25c98a',
  orange: '#ff9f43',
  danger: '#ff8a8a',
};

export const lightColors: ThemeColors = {
  background: '#f4f7fb',
  surface: '#ffffff',
  surfaceRaised: '#ffffff',
  border: '#dce3ee',
  borderStrong: '#b9d3ff',
  text: '#111827',
  muted: '#5c677a',
  subtle: '#697586',
  blue: '#1266e3',
  blueDark: '#eaf2ff',
  green: '#138a5d',
  orange: '#b76500',
  danger: '#c43d3d',
};

const THEME_KEY = 'graduRatTheme';

type ThemeContextValue = {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  setMode: (mode: ThemeMode, persist?: boolean) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    let active = true;
    (async () => {
      const localMode = await AsyncStorage.getItem(THEME_KEY);
      if (active && (localMode === 'dark' || localMode === 'light' || localMode === 'system')) setModeState(localMode);
      try {
        const result = await loadSettings();
        if (active) {
          setModeState(result.theme);
          await AsyncStorage.setItem(THEME_KEY, result.theme);
        }
      } catch {
        // Keep the local/default theme when the API is unavailable before sign-in.
      }
    })();
    return () => { active = false; };
  }, []);

  const setMode = async (nextMode: ThemeMode, persist = true) => {
    setModeState(nextMode);
    await AsyncStorage.setItem(THEME_KEY, nextMode);
    if (persist) await saveSettings({ theme: nextMode });
  };

  const isDark = mode === 'dark' || (mode === 'system' && systemScheme !== 'light');
  const value = useMemo(() => ({ mode, colors: isDark ? darkColors : lightColors, isDark, setMode }), [mode, isDark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider.');
  return context;
}
