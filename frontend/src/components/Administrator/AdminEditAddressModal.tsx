import React from 'react';
import { X } from 'lucide-react';

export type AddressDraft = {
  country: string;
  cityState: string;
  postalCode: string;
  taxId: string;
};

interface Props {
  open: boolean;
  draft: AddressDraft;
  onChange: (patch: Partial<AddressDraft>) => void;
  onClose: () => void;
  onSave: () => void;
  isSaving?: boolean;
}

export default function AdminEditAddressModal({
  open,
  draft,
  onChange,
  onClose,
  onSave,
  isSaving = false,
}: Props) {
  if (!open) return null;

  return (
    <div className="ah-profile-modal-root" role="presentation">
      <button
        type="button"
        className="ah-profile-modal-backdrop"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        className="ah-profile-modal ah-profile-modal--compact"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ah-edit-address-title"
      >
        <div className="ah-profile-modal-header">
          <div>
            <h2 id="ah-edit-address-title" className="ah-profile-modal-title">
              Edit Address
            </h2>
            <p className="ah-profile-modal-subtitle">
              Update your location details shown on your profile.
            </p>
          </div>
          <button
            type="button"
            className="ah-profile-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="ah-profile-modal-body">
          <div className="ah-profile-modal-grid">
            <label className="ah-profile-modal-field">
              <span>Country</span>
              <input
                value={draft.country}
                onChange={(e) => onChange({ country: e.target.value })}
              />
            </label>
            <label className="ah-profile-modal-field">
              <span>City / State</span>
              <input
                value={draft.cityState}
                onChange={(e) => onChange({ cityState: e.target.value })}
              />
            </label>
            <label className="ah-profile-modal-field">
              <span>Postal Code</span>
              <input
                value={draft.postalCode}
                onChange={(e) => onChange({ postalCode: e.target.value })}
              />
            </label>
            <label className="ah-profile-modal-field">
              <span>Tax ID</span>
              <input
                value={draft.taxId}
                onChange={(e) => onChange({ taxId: e.target.value })}
              />
            </label>
          </div>
        </div>

        <div className="ah-profile-modal-footer">
          <button
            type="button"
            className="ah-profile-modal-btn ah-profile-modal-btn--ghost"
            onClick={onClose}
            disabled={isSaving}
          >
            Close
          </button>
          <button
            type="button"
            className="ah-profile-modal-btn ah-profile-modal-btn--primary"
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
