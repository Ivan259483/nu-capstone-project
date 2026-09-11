import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AuthFeedback, {
  type AuthFeedbackData,
  type AuthFeedbackType,
} from '@/components/auth/AuthFeedback';

export type ToastType = AuthFeedbackType;

type ToastData = AuthFeedbackData & {
  id: number;
};

type ToastInput = string | AuthFeedbackData;

/**
 * A single-slot controller: new feedback replaces the current card instead of
 * stacking. Matching calls emitted in the same render/effect burst are ignored.
 */
class ToastController {
  listener: ((data: ToastData | null) => void) | null = null;
  private nextId = 0;
  private lastSignature = '';
  private lastShownAt = 0;

  show(input: ToastInput, type: ToastType = 'error') {
    if (!this.listener) return;

    const payload: AuthFeedbackData = typeof input === 'string'
      ? { title: input, type }
      : input;
    const signature = `${payload.type}:${payload.title}:${payload.message ?? ''}`;
    const now = Date.now();

    if (signature === this.lastSignature && now - this.lastShownAt < 600) return;
    this.lastSignature = signature;
    this.lastShownAt = now;

    this.nextId += 1;
    this.listener({ ...payload, id: this.nextId });
  }

  hide() {
    this.listener?.(null);
  }
}

export const Toast = new ToastController();

/** Root-level floating feedback renderer. Only one notification can exist. */
export default function PremiumToast() {
  const [toastData, setToastData] = useState<ToastData | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    Toast.listener = (data) => {
      setToastData(data);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (data) {
        timeoutRef.current = setTimeout(() => setToastData(null), 4200);
      }
    };

    return () => {
      Toast.listener = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!toastData) return null;

  return (
    <AuthFeedback
      key={toastData.id}
      type={toastData.type}
      title={toastData.title}
      message={toastData.message}
      mode="floating"
      style={[styles.position, { top: Math.max(insets.top, 50) + 10 }]}
      testID="global-feedback"
    />
  );
}

const styles = StyleSheet.create({
  position: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 9999,
  },
});
