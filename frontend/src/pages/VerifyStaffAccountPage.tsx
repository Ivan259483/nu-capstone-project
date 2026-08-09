import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Loader2, MailCheck } from 'lucide-react';
import { getBaseApiUrl } from '@/lib/api';

type VerificationState = 'verifying' | 'success' | 'error';

export default function VerifyStaffAccountPage() {
  const startedRef = useRef(false);
  const [state, setState] = useState<VerificationState>('verifying');
  const [message, setMessage] = useState('Validating your secure verification link…');

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const url = new URL(window.location.href);
    const token = (url.searchParams.get('token') || '').trim();
    // Remove the secret from browser history and future referrer headers as soon
    // as it has been captured for the server-side exchange.
    window.history.replaceState({}, document.title, url.pathname);

    if (!token) {
      setState('error');
      setMessage('This verification link is incomplete. Ask an administrator to resend it.');
      return;
    }

    void (async () => {
      try {
        const response = await fetch(`${getBaseApiUrl()}/auth/verify-staff-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body?.success) {
          setState('error');
          setMessage(body?.message || 'This verification link is invalid, expired, or already used.');
          return;
        }

        setState('success');
        setMessage(body.message || 'Your account is active. You can now sign in.');
      } catch {
        setState('error');
        setMessage('We could not verify the account right now. Please try the link again shortly.');
      }
    })();
  }, []);

  const Icon = state === 'verifying' ? Loader2 : state === 'success' ? CheckCircle2 : AlertTriangle;

  return (
    <main className="min-h-screen bg-[#070b14] px-4 py-12 text-white flex items-center justify-center">
      <section
        aria-live={state === 'verifying' ? 'polite' : 'assertive'}
        className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0d1422] p-8 text-center shadow-2xl shadow-black/30"
      >
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-300">
          {state === 'verifying' ? (
            <Icon className="h-8 w-8 animate-spin" aria-hidden />
          ) : (
            <Icon className={state === 'success' ? 'h-8 w-8 text-emerald-400' : 'h-8 w-8 text-amber-300'} aria-hidden />
          )}
        </div>

        <div className="mb-3 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          <MailCheck className="h-4 w-4" aria-hidden />
          Staff account verification
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {state === 'verifying'
            ? 'Verifying account'
            : state === 'success'
              ? 'Account verified successfully'
              : 'Link unavailable'}
        </h1>
        <p className="mt-4 text-sm leading-6 text-zinc-400">{message}</p>

        {state === 'success' && (
          <p className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-xs leading-5 text-zinc-400">
            Sign in with your email and password. A fresh 6-digit sign-in code will then be sent to your registered email.
          </p>
        )}

        {state !== 'verifying' && (
          <Link
            to="/login"
            className="mt-7 inline-flex w-full items-center justify-center rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
          >
            {state === 'success' ? 'Continue to Login' : 'Return to Login'}
          </Link>
        )}
      </section>
    </main>
  );
}
