import React from 'react';
import { CircleHelp, LogOut, Settings, User } from 'lucide-react';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface Props {
  displayName: string;
  email: string;
  onEditProfile: () => void;
  onAccountSettings: () => void;
  onSupport?: () => void;
  onSignOut: () => void;
}

export default function AdminAccountDropdownMenu({
  displayName,
  email,
  onEditProfile,
  onAccountSettings,
  onSupport,
  onSignOut,
}: Props) {
  const openSupport =
    onSupport ??
    (() => {
      window.open('/about', '_blank', 'noopener,noreferrer');
    });

  return (
    <>
      <div className="ah-account-dropdown-header">
        <p className="ah-account-dropdown-name">{displayName}</p>
        <p className="ah-account-dropdown-email">{email || 'No email on file'}</p>
      </div>

      <div className="ah-account-dropdown-list">
        <DropdownMenuItem
          className="ah-account-dropdown-item"
          onSelect={() => onEditProfile()}
        >
          <User size={18} strokeWidth={1.6} aria-hidden />
          <span>Edit profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="ah-account-dropdown-item"
          onSelect={() => onAccountSettings()}
        >
          <Settings size={18} strokeWidth={1.6} aria-hidden />
          <span>Account settings</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="ah-account-dropdown-item"
          onSelect={() => openSupport()}
        >
          <CircleHelp size={18} strokeWidth={1.6} aria-hidden />
          <span>Support</span>
        </DropdownMenuItem>
      </div>

      <DropdownMenuSeparator className="ah-account-dropdown-separator" />

      <DropdownMenuItem
        className="ah-account-dropdown-item ah-account-dropdown-item--signout"
        onSelect={() => onSignOut()}
      >
        <LogOut size={18} strokeWidth={1.6} aria-hidden />
        <span>Sign out</span>
      </DropdownMenuItem>
    </>
  );
}
