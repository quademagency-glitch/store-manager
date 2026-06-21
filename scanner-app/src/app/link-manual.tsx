import { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { useAppTheme } from '../lib/theme-context';
import type { AppTheme } from '../lib/theme';
import { linkScanner } from '../lib/api';

export default function ManualLinkScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLink = async () => {
    if (!token.trim()) {
      Alert.alert('Error', 'Please enter a valid token');
      return;
    }

    setLoading(true);
    try {
      await linkScanner(token.trim());
      router.replace('/scanner');
    } catch (e: any) {
      Alert.alert('Connection Failed', e.message || 'Could not link scanner');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Scanner Token</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter the code shown on ERP..."
        placeholderTextColor={theme.colors.mutedText}
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        autoCorrect={false}
      />
      
      <TouchableOpacity 
        style={[styles.button, (!token || loading) && styles.buttonDisabled]} 
        onPress={handleLink}
        disabled={!token || loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>CONNECT SCANNER</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.xl,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.secondaryText,
    marginBottom: theme.spacing.sm,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    fontSize: 16,
    color: theme.colors.primaryText,
    marginBottom: theme.spacing.xl,
  },
  button: {
    backgroundColor: theme.colors.accent,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: theme.colors.mutedText,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  }
  });
}
