import { useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import HomeScreen from '../screens/HomeScreen';

// Minimal auth-aware navigation: a splash while the session resolves, then either
// the auth flow (login/register toggle) or the role-based authenticated home.
// A full router (expo-router) can layer on in Sprint 2 when screens multiply.
export default function RootNavigator() {
  const { loading, isAuthenticated } = useAuth();
  const [screen, setScreen] = useState('login');

  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={colors.white} />
      </View>
    );
  }

  if (isAuthenticated) return <HomeScreen />;

  return screen === 'register' ? (
    <RegisterScreen onNavigate={setScreen} />
  ) : (
    <LoginScreen onNavigate={setScreen} />
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.forest },
});
