import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useAppTheme } from '../lib/theme-context';
import type { AppTheme } from '../lib/theme';
import { ThemeToggleButton } from '../components/theme-toggle-button';
import { getToken } from '../lib/api';
import Logo from '../components/Logo';

export default function WelcomeScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkToken();
  }, []);

  const checkToken = async () => {
    try {
      const token = await getToken();
      if (token) {
        // If already linked, go straight to scanner
        router.replace('/scanner');
      } else {
        setLoading(false);
      }
    } catch (e) {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ThemeToggleButton style={styles.themeToggle} />
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Logo size={100} />
        </View>
        <Text style={styles.title}>
          Quad<Text style={{ color: theme.colors.brandErp }}>ERP</Text> Scanner
        </Text>
        <Text style={styles.subtitle}>Your dedicated inventory assistant</Text>
      </View>

      <View style={styles.content}>
        <TouchableOpacity 
          style={styles.setupButton}
          onPress={() => router.push('/setup')}
          activeOpacity={0.8}
        >
          <Text style={styles.setupButtonText}>SETUP</Text>
        </TouchableOpacity>
        
        <Text style={styles.creditText}>Developed by Quadem Digital</Text>
      </View>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  themeToggle: {
    position: 'absolute',
    top: theme.spacing.xl,
    right: theme.spacing.lg,
    zIndex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'space-between',
    padding: theme.spacing.xl,
  },
  header: {
    marginTop: theme.spacing.xxl * 1.5,
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: theme.spacing.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.primaryText,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.secondaryText,
    textAlign: 'center',
  },
  content: {
    alignItems: 'center',
    marginBottom: theme.spacing.xxl,
  },
  setupButton: {
    backgroundColor: theme.colors.accent,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl * 2,
    borderRadius: theme.radius.xl,
    shadowColor: theme.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    width: '100%',
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  setupButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  creditText: {
    fontSize: 14,
    color: theme.colors.mutedText,
    fontWeight: '500',
  }
});
}
