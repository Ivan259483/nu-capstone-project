import React from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function AdminAccountSheetLayout({ title, onClose, children }: Props) {
  return (
    <>
      <button
        type="button"
        className="ah-account-sheet-backdrop"
        aria-label="Close panel"
        onClick={onClose}
      />
      <div className="ah-account-sheet ah-fade-in" role="dialog" aria-modal="true" aria-label={title}>
        <div className="ah-account-sheet-header">
          <h3 className="ah-account-sheet-title">{title}</h3>
          <button type="button" className="ah-account-sheet-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="ah-account-sheet-body">{children}</div>
      </div>
    </>
  );
}
