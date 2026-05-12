import { Stack } from 'expo-router';
import { useTheme } from '@/hooks/useThemeContext';

export default function AuthLayout() {
  const { colors } = useTheme();

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="verify" />
    </Stack>
  );
}
