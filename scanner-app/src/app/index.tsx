import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../lib/theme';
import { getToken } from '../lib/api';

export default function WelcomeScreen() {
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
      <View style={styles.header}>
        <Text style={styles.title}>QuadERP Scanner</Text>
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

const styles = StyleSheet.create({
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
