import { forwardRef, type ReactNode } from 'react';
import { AlertCircle, CalendarPlus, ChevronDown, Inbox, Menu } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CustomerTone } from '@/lib/customer-booking-presentation';


type CustomerButtonProps = Omit<ButtonProps, 'variant'> & {
  tone?: 'primary' | 'secondary' | 'ghost' | 'danger';
};

export const CustomerButton = forwardRef<HTMLButtonElement, CustomerButtonProps>(
  ({ tone = 'secondary', className, type = 'button', ...props }, ref) => (
    <Button ref={ref} type={type} variant="ghost"
      className={cn('customer-button', `customer-button--${tone}`, className)} {...props} />
  ),
);
CustomerButton.displayName = 'CustomerButton';

export function CustomerTopbar({ greeting, subtitle = 'Your garage, bookings, and service progress at a glance.', onOpenNavigation, onBook, children }: {
  greeting: string; subtitle?: string; onOpenNavigation: () => void; onBook?: () => void; children?: ReactNode;
}) {
  return <header className="customer-topbar">
    <div className="customer-topbar__heading">
      <CustomerButton className="md:hidden" size="icon" aria-label="Open navigation" onClick={onOpenNavigation}>
        <Menu aria-hidden="true" />
      </CustomerButton>
      <div className="customer-dashboard-heading">
        <p className="customer-topbar__greeting">{greeting}</p>
        <p className="customer-topbar__subtitle">{subtitle}</p>
      </div>
    </div>
    <div className="customer-topbar__actions">
      {/* Keep the full global CTA alongside separate notification and avatar/chevron controls. */}
      {onBook && <CustomerButton className="customer-topbar__book" tone="primary" onClick={onBook}><CalendarPlus aria-hidden="true" /><span>Book Service</span></CustomerButton>}
      {children}
    </div>
  </header>;
}

export function CustomerProfileTrigger({ image, name, open, onClick }: {
  image?: string | null; name?: string; open: boolean; onClick: () => void;
}) {
  return <button type="button" className="customer-profile-trigger" onClick={onClick}
    aria-label="Open profile menu" aria-expanded={open}>
    <span className="customer-profile-trigger__avatar">
      {image ? <img src={image} alt="" referrerPolicy="no-referrer" /> : (name || 'C').charAt(0).toUpperCase()}
    </span>
    <ChevronDown className="customer-profile-trigger__chevron" aria-hidden="true" />
  </button>;
}

export function CustomerPageHeader({ title, subtitle, children }: {
  title: string; subtitle?: string; children?: ReactNode;
}) {
  return <header className="customer-page-header">
    <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    {children && <div className="customer-page-header__actions">{children}</div>}
  </header>;
}

export function CustomerMetricCard({ label, value, caption, icon, tone = 'neutral', selected, onClick, children }: {
  label: string; value: ReactNode; caption?: string; icon?: ReactNode; tone?: CustomerTone;
  selected?: boolean; onClick?: () => void; children?: ReactNode;
}) {
  const content = <>
    <span className="customer-metric__label">{label}</span>
    {icon && <span className="customer-metric__icon" aria-hidden="true">{icon}</span>}
    <span className="customer-metric__value" data-tone={tone}>{value}</span>
    {caption && <span className="customer-metric__caption">{caption}</span>}
    {children}
  </>;
  return onClick
    ? <button type="button" className="customer-card customer-metric" aria-pressed={selected} onClick={onClick}>{content}</button>
    : <div className="customer-card customer-metric">{content}</div>;
}

export function CustomerStatusBadge({ label, tone = 'neutral' }: { label: string; tone?: CustomerTone }) {
  return <span className="customer-status" data-tone={tone}>{label}</span>;
}

export function CustomerState({ title, description, error = false, children }: {
  title: string; description?: string; error?: boolean; children?: ReactNode;
}) {
  const Icon = error ? AlertCircle : Inbox;
  return <div className="customer-state" role={error ? 'alert' : 'status'}>
    <Icon size={28} aria-hidden="true" data-tone={error ? 'danger' : 'neutral'} />
    <h3>{title}</h3>{description && <p>{description}</p>}{children}
  </div>;
}
