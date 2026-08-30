export const AUTH_SESSION_EXPIRED_EVENT = 'autospf:auth-session-expired';

export interface AuthSessionExpiredDetail {
  rejectedToken?: string;
}

export function notifyAuthSessionExpired(detail: AuthSessionExpiredDetail = {}): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AuthSessionExpiredDetail>(AUTH_SESSION_EXPIRED_EVENT, { detail }));
}
