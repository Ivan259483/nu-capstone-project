import { Stack } from 'expo-router';
import { useTheme } from '@/hooks/useThemeContext';
import { Motion } from '@/constants/motion';

export default function AuthLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'simple_push',
        animationDuration: Motion.duration.screen,
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="verify" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
