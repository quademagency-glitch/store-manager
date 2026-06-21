import { TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useAppTheme } from '@/lib/theme-context';

export function ThemeToggleButton({ size = 22, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const { scheme, theme, toggleScheme } = useAppTheme();

  return (
    <TouchableOpacity
      onPress={toggleScheme}
      style={[styles.button, style]}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={scheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <SymbolView
        name={scheme === 'dark' ? 'sun.max.fill' : 'moon.fill'}
        size={size}
        tintColor={theme.colors.primaryText}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 8,
  },
});
