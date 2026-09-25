import { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, BackHandler } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import { BACK, resolveAuthBackAction } from '../lib/backAction';
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

  // Android's back button, for the signed-out screens. Register and Forgot
  // password are opened from Login by swapping this state, so the OS sees no
  // history and back closed the app instead of returning to sign-in. Hooks run
  // before the early returns below, which is why this sits above them.
  //
  // Only armed while signed out: once authenticated the resident area owns the
  // back button, and two handlers both claiming a press is how one of them
  // silently stops working.
  useEffect(() => {
    if (isAuthenticated) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (resolveAuthBackAction(screen) === BACK.GO_LOGIN) {
        setScreen('login');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [isAuthenticated, screen]);

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
