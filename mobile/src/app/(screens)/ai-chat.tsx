import React from 'react';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import ChatScreen from '@/components/ChatOverlay';

/**
 * Opaque router-owned AI assistant screen.
 *
 * Keeping presentation in the root stack prevents iOS sheet detents and the
 * underlying tab screen from bleeding through at different vertical offsets.
 */
export default function AiChatRoute() {
  const router = useRouter();

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(customer)/settings');
  };

  return (
    <>
      <StatusBar style="light" backgroundColor="#050506" />
      <ChatScreen onClose={handleClose} />
    </>
  );
}
