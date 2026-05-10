/**
 * AccountRequestsPage
 *
 * Office admins can submit or review staff account requests.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ClipboardList, Clock, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import api from '@/lib/api';

interface AccountRequest {
  id: string;
  requestedName: string;
  requestedEmail: string;
  requestedRole: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  office_admin: 'Office Admin',
  sales: 'Sales',
  staff_quality_checker: 'Quality Checker - Technician',
};

const HR_REQUESTABLE_ROLES = ['office_admin', 'sales', 'staff_quality_checker'];

function AccountRequestsForm() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Form state
  const [requestedName, setRequestedName] = useState('');
  const [requestedEmail, setRequestedEmail] = useState('');
  const [requestedRole, setRequestedRole] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Existing requests
  const [requests, setRequests] = useState<AccountRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load pending requests
  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/users/account-requests');
        if (res.data?.success && Array.isArray(res.data?.data)) {
          setRequests(res.data.data);
        }
      } catch {
        // Not critical — endpoint may not yet exist
        setRequests([]);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestedName || !requestedEmail || !requestedRole || !reason) {
      toast.error('All fields are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/users/account-requests', {
        requestedName,
        requestedEmail,
        requestedRole,
        reason,
        requestedBy: user?._id || user?.id,
      });

      toast.success('Account request submitted. Office Admin has been notified.');
      setRequests((prev) => [
        {
          id: Date.now().toString(),
          requestedName,
          requestedEmail,
          requestedRole,
          reason,
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);

      setRequestedName('');
      setRequestedEmail('');
      setRequestedRole('');
      setReason('');
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to submit request.';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const label: React.CSSProperties = {
    display: 'block',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#94a3b8',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    marginBottom: '0.4rem',
  };

  const input: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '0.5rem',
    padding: '0.625rem 0.875rem',
    color: '#e2e8f0',
    fontSize: '0.9rem',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const statusConfig = {
    pending:  { color: '#f59e0b', icon: <Clock size={14} />, label: 'Pending' },
    approved: { color: '#22c55e', icon: <CheckCircle size={14} />, label: 'Approved' },
    rejected: { color: '#ef4444', icon: <XCircle size={14} />, label: 'Rejected' },
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0e1a 0%, #0d1220 60%, #111827 100%)',
        padding: '2rem',
        fontFamily: "'Inter', sans-serif",
        color: '#e2e8f0',
      }}
    >
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        {/* Header */}
        <button
          onClick={() => navigate('/admin/dashboard')}
          style={{
            background: 'none',
            border: 'none',
            color: '#64748b',
            fontSize: '0.8rem',
            cursor: 'pointer',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: 0,
          }}
        >
          ← Back to Dashboard
        </button>

        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '0.5rem' }}>
          Account Creation Requests
        </h1>
        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '2rem' }}>
          HR can request new staff accounts. Requests must be approved by the Office Admin.
        </p>

        {/* Submission Form */}
        <div
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '1rem',
            padding: '1.75rem',
            marginBottom: '2rem',
          }}
        >
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '1.25rem' }}>
            Submit New Request
          </h2>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={label} htmlFor="ar-name">Full Name</label>
                <input
                  id="ar-name"
                  type="text"
                  required
                  placeholder="e.g. Juan Cruz"
                  value={requestedName}
                  onChange={(e) => setRequestedName(e.target.value)}
                  style={input}
                />
              </div>
              <div>
                <label style={label} htmlFor="ar-email">Email Address</label>
                <input
                  id="ar-email"
                  type="email"
                  required
                  placeholder="staff@autospf.com"
                  value={requestedEmail}
                  onChange={(e) => setRequestedEmail(e.target.value)}
                  style={input}
                />
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={label} htmlFor="ar-role">Requested Role</label>
              <select
                id="ar-role"
                required
                value={requestedRole}
                onChange={(e) => setRequestedRole(e.target.value)}
                style={{ ...input, cursor: 'pointer' }}
              >
                <option value="" disabled>Select a role...</option>
                {HR_REQUESTABLE_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={label} htmlFor="ar-reason">Reason / Justification</label>
              <textarea
                id="ar-reason"
                required
                rows={3}
                placeholder="Why is this account needed?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{
                  ...input,
                  resize: 'vertical',
                  minHeight: '80px',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <button
              id="ar-submit"
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '0.625rem 1.5rem',
                borderRadius: '0.5rem',
                background: isSubmitting
                  ? 'rgba(59,130,246,0.4)'
                  : 'linear-gradient(135deg, #3b82f6, #6366f1)',
                border: 'none',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </form>
        </div>

        {/* Existing Requests */}
        <div>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ClipboardList size={16} />
            My Requests
          </h2>

          {isLoading ? (
            <div style={{ color: '#64748b', fontSize: '0.875rem' }}>Loading requests...</div>
          ) : requests.length === 0 ? (
            <div
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px dashed rgba(255,255,255,0.08)',
                borderRadius: '0.75rem',
                padding: '2rem',
                textAlign: 'center',
                color: '#475569',
                fontSize: '0.875rem',
              }}
            >
              No account requests submitted yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {requests.map((req) => {
                const sc = statusConfig[req.status];
                return (
                  <div
                    key={req.id}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: '0.75rem',
                      padding: '1rem 1.25rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '1rem',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.9rem' }}>
                        {req.requestedName}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
                        {req.requestedEmail} · {ROLE_LABELS[req.requestedRole] || req.requestedRole}
                      </div>
                      {req.reason && (
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.35rem', fontStyle: 'italic' }}>
                          "{req.reason}"
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.25rem 0.7rem',
                        borderRadius: '9999px',
                        background: `${sc.color}18`,
                        border: `1px solid ${sc.color}40`,
                        color: sc.color,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {sc.icon}
                      {sc.label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AccountRequestsPage() {
  return (
    <ProtectedRoute allowedRoles={['administrator', 'office_admin']}>
      <AccountRequestsForm />
    </ProtectedRoute>
  );
}
