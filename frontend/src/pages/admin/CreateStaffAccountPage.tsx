/**
 * CreateStaffAccountPage
 *
 * Accessible ONLY to office_admin.
 * Allows creating system accounts for staff members.
 * POSTs to /api/users/create.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import api from '@/lib/api';
import { USER_ROLE_OPTIONS } from '@/lib/roles';

// Staff roles only — customer is excluded per spec
const STAFF_ROLE_OPTIONS = USER_ROLE_OPTIONS.filter(
  (r) => r.value !== 'customer'
);

function CreateStaffAccountForm() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [role, setRole] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !tempPassword || !role) {
      toast.error('All fields are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post('/users/create', {
        name: fullName,
        email,
        password: tempPassword,
        role,
        isActive,
        createdBy: user?._id || user?.id,
      });

      const json = res.data;
      const createdName = json?.data?.name || fullName;
      const createdRole = STAFF_ROLE_OPTIONS.find((r) => r.value === role)?.label || role;
      toast.success(`Account created for ${createdName} (${createdRole})`);

      // Reset form
      setFullName('');
      setEmail('');
      setTempPassword('');
      setRole('');
      setIsActive(true);
    } catch (err: any) {
      const msg: string = err?.response?.data?.message || '';
      if (msg.toLowerCase().includes('email') || msg.toLowerCase().includes('already')) {
        toast.error(`Email already exists: ${email}`);
      } else {
        toast.error(msg || 'Failed to create account. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Inline styles — matches admin dark luxury theme ──────────────────────
  const card: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '1rem',
    padding: '2rem',
    maxWidth: '520px',
    width: '100%',
    boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
  };

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

  const fieldGap: React.CSSProperties = { marginBottom: '1.25rem' };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0e1a 0%, #0d1220 60%, #111827 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        fontFamily: "'Inter', sans-serif",
        color: '#e2e8f0',
      }}
    >
      <div style={card}>
        {/* Header */}
        <div style={{ marginBottom: '1.75rem' }}>
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
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f1f5f9', margin: 0, lineHeight: 1.2 }}>
            Create Staff Account
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0.5rem 0 0' }}>
            Office Admin only — creates system-authenticated staff access
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Full Name */}
          <div style={fieldGap}>
            <label style={label} htmlFor="csap-fullname">Full Name</label>
            <input
              id="csap-fullname"
              type="text"
              required
              placeholder="e.g. Maria Santos"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              style={input}
            />
          </div>

          {/* Email */}
          <div style={fieldGap}>
            <label style={label} htmlFor="csap-email">Email Address</label>
            <input
              id="csap-email"
              type="email"
              required
              placeholder="staff@autospf.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={input}
            />
          </div>

          {/* Temporary Password */}
          <div style={fieldGap}>
            <label style={label} htmlFor="csap-password">Temporary Password</label>
            <input
              id="csap-password"
              type="password"
              required
              placeholder="Min. 8 characters"
              minLength={8}
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              style={input}
            />
          </div>

          {/* Role */}
          <div style={fieldGap}>
            <label style={label} htmlFor="csap-role">Role</label>
            <select
              id="csap-role"
              required
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{ ...input, cursor: 'pointer' }}
            >
              <option value="" disabled>Select a role...</option>
              {STAFF_ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status toggle */}
          <div
            style={{
              ...fieldGap,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '0.5rem',
              padding: '0.75rem 0.875rem',
            }}
          >
            <div>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0' }}>
                Account Status
              </span>
              <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0.125rem 0 0' }}>
                {isActive ? 'Active — user can log in immediately' : 'Inactive — user cannot log in'}
              </p>
            </div>
            <button
              type="button"
              id="csap-status-toggle"
              onClick={() => setIsActive((prev) => !prev)}
              style={{
                width: '44px',
                height: '24px',
                borderRadius: '9999px',
                background: isActive ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: '3px',
                  left: isActive ? '23px' : '3px',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}
              />
            </button>
          </div>

          {/* Submit */}
          <button
            id="csap-submit"
            type="submit"
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              background: isSubmitting
                ? 'rgba(59,130,246,0.4)'
                : 'linear-gradient(135deg, #3b82f6, #6366f1)',
              border: 'none',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.2s',
              marginTop: '0.5rem',
            }}
          >
            {isSubmitting ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

// Wrap in ProtectedRoute — office_admin only
export default function CreateStaffAccountPage() {
  return (
    <ProtectedRoute allowedRoles={['office_admin', 'administrator']}>
      <CreateStaffAccountForm />
    </ProtectedRoute>
  );
}
