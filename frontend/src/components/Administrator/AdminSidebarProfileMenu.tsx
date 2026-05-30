import React from 'react';
import { ChevronsUpDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import AdminAccountDropdownMenu from './AdminAccountDropdownMenu';

interface Props {
  displayName: string;
  email: string;
  roleLabel?: string;
  showRoleRow?: boolean;
  avatar?: string;
  collapsed: boolean;
  onViewProfile: () => void;
  onAccountSettings: () => void;
  onSignOut: () => void;
  onDocumentation?: () => void;
}

function ProfileAvatar({
  displayName,
  email,
  avatar,
  size = 'md',
}: {
  displayName: string;
  email: string;
  avatar?: string;
  size?: 'md' | 'sm';
}) {
  const initial = (displayName || email || '?').charAt(0).toUpperCase();
  return (
    <div
      className={`ah-sidebar-avatar${size === 'sm' ? ' ah-sidebar-avatar--sm' : ''}`}
      aria-hidden
    >
      {avatar ? (
        <img src={avatar} alt="" referrerPolicy="no-referrer" />
      ) : (
        initial
      )}
    </div>
  );
}

export default function AdminSidebarProfileMenu({
  displayName,
  email,
  roleLabel,
  showRoleRow,
  avatar,
  collapsed,
  onViewProfile,
  onAccountSettings,
  onSignOut,
  onDocumentation,
}: Props) {
  const menuProps = {
    displayName,
    email,
    onEditProfile: onViewProfile,
    onAccountSettings,
    onSupport: onDocumentation,
    onSignOut,
  };

  if (collapsed) {
    return (
      <div className="ah-sidebar-profile ah-sidebar-profile--collapsed">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ah-sidebar-profile-trigger ah-sidebar-profile-trigger--avatar"
              aria-label="Account menu"
            >
              <ProfileAvatar displayName={displayName} email={email} avatar={avatar} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="right"
            align="end"
            sideOffset={10}
            className="ah-account-dropdown-content"
          >
            <AdminAccountDropdownMenu {...menuProps} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="ah-sidebar-profile ah-sidebar-profile--interactive"
          aria-label="Account menu"
        >
          <ProfileAvatar displayName={displayName} email={email} avatar={avatar} />
          <div className="ah-sidebar-profile-info">
            <div className="ah-sidebar-profile-name">{displayName}</div>
            <div className="ah-sidebar-profile-email">{email}</div>
            {showRoleRow && roleLabel ? (
              <div className="ah-sidebar-profile-role">{roleLabel}</div>
            ) : null}
          </div>
          <span className="ah-sidebar-profile-chevron" aria-hidden>
            <ChevronsUpDown size={16} strokeWidth={1.5} />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={10}
        className="ah-account-dropdown-content"
      >
        <AdminAccountDropdownMenu {...menuProps} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
