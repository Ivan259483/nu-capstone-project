import type { ReactNode } from 'react';
import { AlertCircle, Check, Loader2, type LucideIcon } from 'lucide-react';

export function SettingsSection({ id, title, description, icon: Icon, children }: {
  id: string; title: string; description: string; icon: LucideIcon; children: ReactNode;
}) {
  return <section className="account-section" aria-labelledby={id}>
    <header className="account-section-heading">
      <span className="account-section-icon"><Icon size={20} strokeWidth={1.7} aria-hidden="true" /></span>
      <div><h2 id={id}>{title}</h2><p>{description}</p></div>
    </header>
    {children}
  </section>;
}

export function AccountAvatar({ name, image, large = false }: { name: string; image?: string; large?: boolean }) {
  return <span className={`account-avatar${large ? ' account-avatar-large' : ''}`}>
    <span aria-hidden="true">{name.trim().charAt(0).toUpperCase() || 'C'}</span>
    {image && <img key={image} src={image} alt="Profile photo" referrerPolicy="no-referrer"
      onError={(event) => { event.currentTarget.hidden = true; }} />}
  </span>;
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="account-field-error" role="alert">{message}</p> : null;
}

export function SaveStatus({ saving, error, saved, retry }: { saving?: boolean; error?: string; saved?: boolean; retry?: () => void }) {
  return <div className="account-save-status" aria-live="polite" aria-atomic="true">
    {error ? <span className="account-error"><AlertCircle size={16} aria-hidden="true" />{error}</span>
      : saving ? <span><Loader2 size={16} className="account-spin" aria-hidden="true" />Saving…</span>
        : saved ? <span className="account-success"><Check size={16} aria-hidden="true" />Changes saved</span>
          : <span>Changes save automatically.</span>}
    {error && retry && <button type="button" className="account-button account-button-secondary" onClick={retry}>Try again</button>}
  </div>;
}

export function PreferenceSkeleton({ rows = 4 }: { rows?: number }) {
  return <div className="account-preference-skeleton" role="status" aria-label="Loading preferences" aria-busy="true">
    {Array.from({ length: rows }, (_, index) => <div key={index}><span className="account-skeleton" /><span className="account-skeleton" /></div>)}
  </div>;
}
