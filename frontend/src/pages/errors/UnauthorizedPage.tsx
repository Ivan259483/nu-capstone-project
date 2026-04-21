/**
 * UnauthorizedPage — 403 Forbidden
 *
 * Shown when an authenticated user attempts to access a route or resource
 * outside their permitted role scope.
 * Matches the existing dark luxury admin aesthetic.
 */
import { useNavigate } from 'react-router-dom';
import { ShieldOff, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getRoleLabel } from '@/lib/roles';

export default function UnauthorizedPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role ?? null;

  const roleLabel = getRoleLabel(role ?? undefined);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0e1a 0%, #0d1220 60%, #111827 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Inter', sans-serif",
        color: '#e2e8f0',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      {/* Glow backdrop */}
      <div
        style={{
          position: 'absolute',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(239,68,68,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Icon */}
      <div
        style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <ShieldOff size={36} color="#ef4444" />
      </div>

      {/* Error code */}
      <div
        style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: '#ef4444',
          marginBottom: '0.75rem',
          opacity: 0.8,
        }}
      >
        Error 403 — Forbidden
      </div>

      {/* Headline */}
      <h1
        style={{
          fontSize: '1.875rem',
          fontWeight: 700,
          color: '#f1f5f9',
          marginBottom: '0.75rem',
          letterSpacing: '-0.025em',
        }}
      >
        Access Denied
      </h1>

      {/* Description */}
      <p
        style={{
          fontSize: '1rem',
          color: '#94a3b8',
          maxWidth: '400px',
          lineHeight: 1.6,
          marginBottom: '1rem',
        }}
      >
        You don't have permission to access this page.
      </p>

      {/* Role badge */}
      {user && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.375rem 0.875rem',
            borderRadius: '9999px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            fontSize: '0.8rem',
            color: '#94a3b8',
            marginBottom: '2rem',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#3b82f6',
              display: 'inline-block',
            }}
          />
          Your role:&nbsp;
          <strong style={{ color: '#e2e8f0', fontWeight: 600 }}>{roleLabel}</strong>
        </div>
      )}

      {/* CTA */}
      <button
        id="unauthorized-go-to-dashboard"
        onClick={() => navigate('/admin/dashboard')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.625rem 1.5rem',
          borderRadius: '0.5rem',
          background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
          border: 'none',
          color: '#fff',
          fontWeight: 600,
          fontSize: '0.875rem',
          cursor: 'pointer',
          transition: 'opacity 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        <ArrowLeft size={16} />
        Go to Dashboard
      </button>
    </div>
  );
}
