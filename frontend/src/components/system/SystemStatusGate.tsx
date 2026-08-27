import { useCallback, useEffect, useState } from 'react';
import { Archive, LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getSafeUserRole } from '@/lib/roles';
import { SystemService, type SystemStatus } from '@/lib/system-service';

const STATUS_REFRESH_MS = 60_000;

export default function SystemStatusGate() {
  const { user, logout } = useAuth();
  const userId = String(user?._id || user?.id || '');
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setStatus(await SystemService.getStatus());
    } catch {
      // Network/API failures must not lock users out locally. Protected endpoints
      // remain authoritative and expose their stable lifecycle error codes.
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setStatus(null);
      return;
    }
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, STATUS_REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, userId]);

  const archived = status?.archived || status?.mode === 'archived';
  const protectedAdministratorWorkspace = getSafeUserRole(user?.role) === 'administrator';
  if (!user || !archived || protectedAdministratorWorkspace) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="system-archived-title"
      style={{
        alignItems: 'center',
        background: '#f6f7f9',
        color: '#172033',
        display: 'flex',
        inset: 0,
        justifyContent: 'center',
        padding: 24,
        position: 'fixed',
        zIndex: 10000,
      }}
    >
      <section style={{ background: '#fff', border: '1px solid #dfe4eb', borderRadius: 16, maxWidth: 540, padding: 30, textAlign: 'center', width: '100%' }}>
        <span style={{ alignItems: 'center', background: '#eef1f5', borderRadius: 12, color: '#536174', display: 'inline-flex', height: 48, justifyContent: 'center', width: 48 }}><Archive size={23} aria-hidden /></span>
        <h1 id="system-archived-title" style={{ fontSize: 25, letterSpacing: '-0.025em', margin: '18px 0 8px' }}>AutoSPF+ is archived</h1>
        <p style={{ color: '#64748b', lineHeight: 1.6, margin: '0 auto 22px', maxWidth: 430 }}>This system is read-only. New registrations, bookings, and operational changes are unavailable. Contact the protected administrator if service should be restored.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
          <button type="button" onClick={() => void refresh()} disabled={refreshing} style={{ alignItems: 'center', background: '#fff', border: '1px solid #dfe4eb', borderRadius: 8, color: '#334155', cursor: 'pointer', display: 'inline-flex', font: 'inherit', fontSize: 13, fontWeight: 700, gap: 7, minHeight: 40, padding: '9px 14px' }}><RefreshCw size={16} aria-hidden />{refreshing ? 'Checking…' : 'Check status'}</button>
          <button type="button" onClick={() => void logout()} style={{ alignItems: 'center', background: '#1f2937', border: 0, borderRadius: 8, color: '#fff', cursor: 'pointer', display: 'inline-flex', font: 'inherit', fontSize: 13, fontWeight: 700, gap: 7, minHeight: 40, padding: '9px 14px' }}><LogOut size={16} aria-hidden />Sign out</button>
        </div>
      </section>
    </div>
  );
}
