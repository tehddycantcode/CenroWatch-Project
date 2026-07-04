import { LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';

// The "SafeAreaView has been deprecated" notice is a known, harmless RN warning
// in this Expo SDK — hide its on-screen LogBox so it doesn't cover the UI.
LogBox.ignoreLogs(['SafeAreaView has been deprecated']);

// CENROWATCH mobile entry. Auth flow (login/register) + role-based home.
export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </AuthProvider>
  );
}
