import { Stack } from 'expo-router';
import { Motion } from '@/constants/motion';
import { AuthColors } from '@/constants/authTheme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: AuthColors.bg },
        animation: 'simple_push',
        animationDuration: Motion.duration.screen,
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="verify" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
