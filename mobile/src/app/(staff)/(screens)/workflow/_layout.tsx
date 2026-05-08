import React from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '@/hooks/useThemeContext';
import { WorkflowProvider } from './WorkflowContext';

function InnerWorkflowLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{
      headerShown: true,
      headerStyle: { backgroundColor: colors.background },
      headerTintColor: colors.text,
      animation: 'slide_from_right'
    }}>
      <Stack.Screen name="Step1_BookingInbox" options={{ title: 'Booking Inbox' }} />
      <Stack.Screen name="Step2_IngressChecklist" options={{ title: 'Pre-Assessment' }} />
      <Stack.Screen name="Step3_DigitalTerms" options={{ title: 'Service Terms' }} />
      <Stack.Screen name="Step4_DamageAnnotation" options={{ title: 'Inspection' }} />
      <Stack.Screen name="Step5_JobOrder" options={{ title: 'Job Order' }} />
      <Stack.Screen name="Step6_LiveProgress" options={{ title: 'Live Progress' }} />
      <Stack.Screen name="Step7_EgressChecklist" options={{ title: 'QC & Egress' }} />
      <Stack.Screen name="Step8_WarrantyReceipt" options={{ title: 'Warranty & Receipt' }} />
      <Stack.Screen name="Step9_FinalRelease" options={{ title: 'Final Release' }} />
    </Stack>
  );
}

export default function WorkflowLayout() {
  return (
    <WorkflowProvider>
      <InnerWorkflowLayout />
    </WorkflowProvider>
  );
}
