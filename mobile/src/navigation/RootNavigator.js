import { useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import HomeScreen from '../screens/HomeScreen';
import ResidentNavigator from './ResidentNavigator';

// Minimal auth-aware navigation: a splash while the session resolves, then either
// the auth flow (login/register toggle) or the role-based authenticated area.
// Residents get the full reporting interface (ResidentNavigator); Staff/Admin
// keep the placeholder Home until their sprints (3–4).
export default function RootNavigator() {
  const { loading, isAuthenticated, user } = useAuth();
  const [screen, setScreen] = useState('login');

  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={colors.white} />
      </View>
    );
  }

  if (isAuthenticated) {
    return user?.role === 'Resident' ? <ResidentNavigator /> : <HomeScreen />;
  }

  if (screen === 'register') return <RegisterScreen onNavigate={setScreen} />;
  if (screen === 'forgot') return <ForgotPasswordScreen onNavigate={setScreen} />;
  return <LoginScreen onNavigate={setScreen} />;
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.forest },
});
