import React from 'react';
import { Toaster } from 'sonner';

export default function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          fontFamily: 'DM Sans, Inter, sans-serif',
          fontSize: '13px',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 8px 24px -4px rgba(0,0,0,0.12)',
        },
        duration: 3000,
      }}
    />
  );
}
