/**
 * AI Scan Stack Layout — drives the 5-step new-AI flow:
 *   index → analyzing → results → ar-view → estimate → confirm
 */
import React from 'react';
import { Stack } from 'expo-router';

export default function AiScanLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#040405' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="analyzing" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="results" options={{ animation: 'fade' }} />
      <Stack.Screen name="ar-view" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="estimate" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="confirm" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
