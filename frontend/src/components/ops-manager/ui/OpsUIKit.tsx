import React from 'react';
import { createPortal } from 'react-dom';

// ═══ Types ═══
export type JobStatus = 'Queued' | 'Assigned' | 'En Route' | 'Ongoing' | 'Completed' | 'Delayed' | 'Cancelled';
export type Priority = 'Critical' | 'High' | 'Medium' | 'Low';

// ═══ Status Badge ═══
const statusConfig: Record<JobStatus, { cls: string; dot: string; label: string }> = {
  Queued:     { cls: 'bg-gray-100 text-gray-700',     dot: 'bg-gray-400',   label: 'Queued' },
  Assigned:   { cls: 'bg-blue-50 text-blue-700',      dot: 'bg-blue-500',   label: 'Assigned' },
  'En Route': { cls: 'bg-purple-50 text-purple-700',  dot: 'bg-purple-500', label: 'En Route' },
  Ongoing:    { cls: 'bg-indigo-50 text-indigo-700',   dot: 'bg-indigo-500', label: 'Ongoing' },
  Completed:  { cls: 'bg-green-50 text-green-700',    dot: 'bg-green-500',  label: 'Completed' },
  Delayed:    { cls: 'bg-red-50 text-red-700',        dot: 'bg-red-500',    label: 'Delayed' },
  Cancelled:  { cls: 'bg-gray-100 text-gray-400',     dot: 'bg-gray-300',   label: 'Cancelled' },
};

const priorityConfig: Record<Priority, { cls: string }> = {
  Critical: { cls: 'bg-red-50 text-red-700' },
  High:     { cls: 'bg-orange-50 text-orange-700' },
  Medium:   { cls: 'bg-yellow-50 text-yellow-700' },
  Low:      { cls: 'bg-gray-50 text-gray-600' },
};

export function OpsStatusBadge({ status }: { status: JobStatus }) {
  const cfg = statusConfig[status] || statusConfig.Queued;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} flex-shrink-0`} />
      {cfg.label}
    </span>
  );
}

export function OpsPriorityBadge({ priority }: { priority: Priority }) {
  const cfg = priorityConfig[priority] || priorityConfig.Medium;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide ${cfg.cls}`}>
      {priority}
    </span>
  );
}

// ═══ SlideOver ═══
interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: string;
  children: React.ReactNode;
}

const SLIDE_OVER_EXIT_MS = 240;

export function OpsSlideOver({ open, onClose, title, subtitle, width = 'w-[460px]', children }: SlideOverProps) {
  const [shouldRender, setShouldRender] = React.useState(open);
  const [headerOffset, setHeaderOffset] = React.useState(0);
  const [contentScrolled, setContentScrolled] = React.useState(false);
  const titleId = React.useId();

  React.useEffect(() => {
    if (open) {
      setShouldRender(true);
      return undefined;
    }
    if (!shouldRender) return undefined;

    const exitTimer = window.setTimeout(() => {
      setShouldRender(false);
      setContentScrolled(false);
    }, SLIDE_OVER_EXIT_MS);
    return () => window.clearTimeout(exitTimer);
  }, [open, shouldRender]);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  React.useLayoutEffect(() => {
    if (!shouldRender) return undefined;

    const topbar = document.querySelector<HTMLElement>('.adminhub-root .ah-topbar');
    const updateHeaderOffset = () => {
      const nextOffset = topbar ? Math.max(0, Math.round(topbar.getBoundingClientRect().bottom)) : 0;
      setHeaderOffset(nextOffset);
    };

    updateHeaderOffset();
    window.addEventListener('resize', updateHeaderOffset);
    const resizeObserver = typeof ResizeObserver !== 'undefined' && topbar
      ? new ResizeObserver(updateHeaderOffset)
      : null;
    resizeObserver?.observe(topbar!);

    return () => {
      window.removeEventListener('resize', updateHeaderOffset);
      resizeObserver?.disconnect();
    };
  }, [shouldRender]);

  React.useEffect(() => {
    if (!shouldRender) return undefined;

    const root = document.documentElement;
    const body = document.body;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPaddingRight = body.style.paddingRight;
    const scrollbarGap = Math.max(0, window.innerWidth - root.clientWidth);

    root.classList.add('ops-drawer-open');
    body.style.overflow = 'hidden';
    if (scrollbarGap > 0) body.style.paddingRight = `${scrollbarGap}px`;

    return () => {
      root.classList.remove('ops-drawer-open');
      body.style.overflow = previousBodyOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
    };
  }, [shouldRender]);

  if (!shouldRender || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`ops-slide-layer ${open ? 'is-open' : 'is-closing'}`}
      style={{ '--ops-slide-top': `${headerOffset}px` } as React.CSSProperties}
    >
      <div className="ops-slide-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        className={`ops-slide-panel ${width}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`ops-slide-header ${contentScrolled ? 'is-scrolled' : ''}`}>
          <div>
            <h2 id={titleId} className="text-[15px] font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="text-[12px] text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ops-slide-close-btn"
            aria-label="Close order details"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div
          className="ops-slide-scroll ops-scrollbar-thin"
          onScroll={(event) => setContentScrolled(event.currentTarget.scrollTop > 2)}
        >
          {children}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
