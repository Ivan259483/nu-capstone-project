type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeToPushNotificationRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function requestPushNotificationRefresh(): void {
  listeners.forEach((listener) => listener());
}
