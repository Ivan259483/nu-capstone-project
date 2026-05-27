import React from 'react';
import { BookOpen, ChevronsUpDown, Circle, LogOut, Settings, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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

function MenuShortcut({ children }: { children: React.ReactNode }) {
  return <span className="ah-profile-menu-shortcut">{children}</span>;
}

function ProfileMenuItems({
  onViewProfile,
  onAccountSettings,
  onDocumentation,
  onSignOut,
  displayName,
  email,
  avatar,
}: Pick<
  Props,
  | 'onViewProfile'
  | 'onAccountSettings'
  | 'onDocumentation'
  | 'onSignOut'
  | 'displayName'
  | 'email'
  | 'avatar'
>) {
  const openDocs =
    onDocumentation ??
    (() => {
      window.open('/about', '_blank', 'noopener,noreferrer');
    });

  return (
    <>
      <div className="ah-profile-menu-actions">
        <DropdownMenuItem
          className="ah-profile-menu-item"
          onSelect={() => onViewProfile()}
        >
          <User size={16} strokeWidth={1.5} aria-hidden />
          <span className="ah-profile-menu-item-label">View profile</span>
          <MenuShortcut>
            <kbd>⌘</kbd>
            <span className="ah-profile-menu-shortcut-arrow">→</span>
            <kbd>P</kbd>
          </MenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="ah-profile-menu-item"
          onSelect={() => onAccountSettings()}
        >
          <Settings size={16} strokeWidth={1.5} aria-hidden />
          <span className="ah-profile-menu-item-label">Account settings</span>
          <MenuShortcut>
            <kbd>⌘</kbd>
            <kbd>S</kbd>
          </MenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="ah-profile-menu-item"
          onSelect={() => openDocs()}
        >
          <BookOpen size={16} strokeWidth={1.5} aria-hidden />
          <span className="ah-profile-menu-item-label">Documentation</span>
        </DropdownMenuItem>
      </div>

      <div className="ah-profile-menu-switch">
        <div className="ah-profile-menu-switch-label">Switch account</div>
        <div className="ah-profile-menu-account ah-profile-menu-account--active">
          <ProfileAvatar
            displayName={displayName}
            email={email}
            avatar={avatar}
            size="sm"
          />
          <div className="ah-profile-menu-account-info">
            <div className="ah-profile-menu-account-name">{displayName}</div>
            <div className="ah-profile-menu-account-email">{email}</div>
          </div>
          <span className="ah-profile-menu-account-radio" aria-hidden>
            <Circle size={16} strokeWidth={1.5} className="ah-profile-menu-radio-icon" />
          </span>
        </div>
      </div>

      <DropdownMenuSeparator className="ah-profile-menu-separator" />

      <DropdownMenuItem
        className="ah-profile-menu-item ah-profile-menu-item--signout"
        onSelect={() => onSignOut()}
      >
        <LogOut size={16} strokeWidth={1.5} aria-hidden />
        <span className="ah-profile-menu-item-label">Sign out</span>
        <MenuShortcut>
          <kbd>⌥</kbd>
          <kbd>⇧</kbd>
          <kbd>Q</kbd>
        </MenuShortcut>
      </DropdownMenuItem>
    </>
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
  const menuContentProps = {
    onViewProfile,
    onAccountSettings,
    onDocumentation,
    onSignOut,
    displayName,
    email,
    avatar,
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
            sideOffset={8}
            className="ah-profile-menu-content"
          >
            <ProfileMenuItems {...menuContentProps} />
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
        sideOffset={8}
        className="ah-profile-menu-content"
      >
        <ProfileMenuItems {...menuContentProps} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
