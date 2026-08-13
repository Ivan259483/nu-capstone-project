import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  contentClassName?: string;
}

const sizeClasses = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' };

export default function Modal({ open, onClose, title, subtitle, children, size = 'md', contentClassName }: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const portalRoot = document.querySelector<HTMLElement>('.adminhub-root') ?? document.body;

  return createPortal(
    <div className="inv-root inv-modal-root ah-viewport-modal-layer fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className={`inv-modal-panel relative flex max-h-[calc(100dvh-2rem)] w-full ${sizeClasses[size]} flex-col overflow-hidden glass-card rounded-2xl shadow-glass-hover modal-enter`}>
        <div className="inv-modal-header flex shrink-0 items-start justify-between px-6 py-5 border-b border-gray-100/80">
          <div>
            <h2 id="modal-title" className="text-lg font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="ml-4 p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-150 active:scale-95" aria-label="Close modal"><X size={18} /></button>
        </div>
        <div className={contentClassName ?? 'min-h-0 overflow-y-auto'}>{children}</div>
      </div>
    </div>,
    portalRoot,
  );
}
