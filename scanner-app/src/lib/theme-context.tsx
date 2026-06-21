import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTheme, type AppTheme, type ColorScheme } from './theme';

type ThemeMode = ColorScheme | 'system';

const STORAGE_KEY = 'scanner_theme_mode';

type ThemeContextValue = {
  mode: ThemeMode;
  scheme: ColorScheme;
  theme: AppTheme;
  setMode: (mode: ThemeMode) => void;
  toggleScheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setModeState(saved);
      }
    });
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next);
  };

  const scheme: ColorScheme = mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;

  const toggleScheme = () => {
    setMode(scheme === 'dark' ? 'light' : 'dark');
  };

  const theme = useMemo(() => getTheme(scheme), [scheme]);

  const value = useMemo(
    () => ({ mode, scheme, theme, setMode, toggleScheme }),
    [mode, scheme, theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppTheme must be used within ThemeProvider');
  return ctx;
}
