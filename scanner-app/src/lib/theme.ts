export type ColorScheme = 'light' | 'dark';

const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

const radius = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

const darkColors = {
  background: '#0B0F19',
  cardBackground: '#1A1F2E',
  primaryText: '#F8FAFC',
  secondaryText: '#94A3B8',
  mutedText: '#64748B',
  border: '#2E364F',
  accent: '#19A8CB', // Company Brand Cyan
  accentHover: '#12829F',
  success: '#10B981', // Emerald
  successBackground: '#064E3B', // Dark emerald tint
  error: '#EF4444',
  warning: '#F59E0B',
  card: '#1A1F2E',
  glass: 'rgba(26, 31, 46, 0.7)',
  brandErp: '#19A8CB', // Logo wordmark cyan, fixed across themes
};

const lightColors = {
  background: '#F4F5F9',
  cardBackground: '#FFFFFF',
  primaryText: '#0B0F19',
  secondaryText: '#475569',
  mutedText: '#94A3B8',
  border: '#E2E8F0',
  accent: '#19A8CB', // Company Brand Cyan
  accentHover: '#12829F',
  success: '#10B981', // Emerald
  successBackground: '#D1FAE5', // Light emerald tint
  error: '#EF4444',
  warning: '#F59E0B',
  card: '#FFFFFF',
  glass: 'rgba(255, 255, 255, 0.7)',
  brandErp: '#19A8CB', // Logo wordmark cyan, fixed across themes
};

export function getTheme(scheme: ColorScheme) {
  return {
    colors: scheme === 'dark' ? darkColors : lightColors,
    spacing,
    radius,
  };
}

export type AppTheme = ReturnType<typeof getTheme>;
