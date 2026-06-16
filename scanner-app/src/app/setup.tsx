import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../lib/theme';

export default function SetupScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.prompt}>
        How would you like to link this scanner to the ERP?
      </Text>

      <TouchableOpacity 
        style={styles.primaryButton}
        onPress={() => router.push('/link-camera')}
        activeOpacity={0.8}
      >
        <Text style={styles.primaryButtonText}>SCAN CODE</Text>
        <Text style={styles.buttonSubText}>Scan the QR code shown on your ERP screen</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.secondaryButton}
        onPress={() => router.push('/link-manual')}
        activeOpacity={0.8}
      >
        <Text style={styles.secondaryButtonText}>SETUP MANUALLY</Text>
        <Text style={styles.buttonSubText}>Type the connection token directly</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.xl,
    justifyContent: 'center',
  },
  prompt: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.primaryText,
    marginBottom: theme.spacing.xxl,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: theme.colors.accent,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.xl,
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    shadowColor: theme.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 4,
  },
  secondaryButton: {
    backgroundColor: theme.colors.card,
    borderWidth: 2,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.xl,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: theme.colors.primaryText,
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 4,
  },
  buttonSubText: {
    color: theme.colors.mutedText,
    fontSize: 13,
  }
});
