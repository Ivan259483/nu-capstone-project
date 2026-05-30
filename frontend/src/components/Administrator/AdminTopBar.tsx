import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  Menu,
  Moon,
  Search,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { SystemNotification } from '@/lib/notification-service';
import AdminAccountDropdownMenu from './AdminAccountDropdownMenu';

type CommandPage = { id: string; label: string; icon: LucideIcon };

interface AdminTopBarProps {
  collapsed: boolean;
  onToggleSidebar: () => void;
  navSearch: string;
  onNavSearchChange: (value: string) => void;
  commandPages: CommandPage[];
  onSelectPage: (pageId: string) => void;
  displayName: string;
  email: string;
  avatar?: string;
  onViewProfile: () => void;
  onAccountSettings: () => void;
  onSignOut: () => void;
  notifications: SystemNotification[];
  onNotificationClick: (notification: SystemNotification) => void;
  onMarkAllNotificationsRead: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

function TopBarAvatar({
  displayName,
  email,
  avatar,
}: {
  displayName: string;
  email: string;
  avatar?: string;
}) {
  const initial = (displayName || email || '?').charAt(0).toUpperCase();
  return (
    <div className="ah-topbar-avatar" aria-hidden>
      {avatar ? (
        <img src={avatar} alt="" referrerPolicy="no-referrer" />
      ) : (
        initial
      )}
    </div>
  );
}

export default function AdminTopBar({
  collapsed,
  onToggleSidebar,
  navSearch,
  onNavSearchChange,
  commandPages,
  onSelectPage,
  displayName,
  email,
  avatar,
  onViewProfile,
  onAccountSettings,
  onSignOut,
  notifications,
  onNotificationClick,
  onMarkAllNotificationsRead,
  theme,
  onToggleTheme,
}: AdminTopBarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const commandListRef = useRef<HTMLDivElement>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const query = navSearch.trim().toLowerCase();

  const commandResults = useMemo(() => {
    if (!query) return commandPages.slice(0, 8);
    return commandPages.filter((page) => page.label.toLowerCase().includes(query)).slice(0, 8);
  }, [commandPages, query]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen(true);
        window.requestAnimationFrame(() => searchInputRef.current?.focus());
      }
      if (e.key === 'Escape') {
        setCommandOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!commandOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        commandListRef.current?.contains(target) ||
        searchInputRef.current?.contains(target)
      ) {
        return;
      }
      setCommandOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [commandOpen]);

  const pickCommand = (pageId: string) => {
    onSelectPage(pageId);
    onNavSearchChange('');
    setCommandOpen(false);
    searchInputRef.current?.blur();
  };

  return (
    <header className="ah-topbar">
      <div className="ah-topbar-start">
        <button
          type="button"
          className="ah-topbar-icon-btn"
          onClick={onToggleSidebar}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          <Menu size={17} strokeWidth={1.75} aria-hidden />
        </button>

        <div className="ah-topbar-command-wrap">
          <label className="ah-topbar-command">
            <Search size={15} strokeWidth={1.75} className="ah-topbar-command-icon" aria-hidden />
            <input
              ref={searchInputRef}
              type="search"
              value={navSearch}
              onChange={(e) => {
                onNavSearchChange(e.target.value);
                setCommandOpen(true);
              }}
              onFocus={() => setCommandOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && commandResults[0]) {
                  e.preventDefault();
                  pickCommand(commandResults[0].id);
                }
              }}
              placeholder="Search or type command..."
              aria-label="Search navigation and commands"
              aria-expanded={commandOpen}
              aria-controls="ah-topbar-command-list"
              autoComplete="off"
            />
            <kbd className="ah-topbar-command-kbd" aria-hidden>
              ⌘K
            </kbd>
          </label>

          {commandOpen && commandResults.length > 0 ? (
            <div
              id="ah-topbar-command-list"
              ref={commandListRef}
              className="ah-topbar-command-panel"
              role="listbox"
            >
              {commandResults.map((page) => {
                const Icon = page.icon;
                return (
                  <button
                    key={page.id}
                    type="button"
                    role="option"
                    className="ah-topbar-command-item"
                    onClick={() => pickCommand(page.id)}
                  >
                    <Icon size={18} strokeWidth={1.6} aria-hidden />
                    <span>{page.label}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div className="ah-topbar-end">
        <button
          type="button"
          className="ah-topbar-icon-btn"
          onClick={onToggleTheme}
          aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {theme === 'light' ? (
            <Moon size={17} strokeWidth={1.75} aria-hidden />
          ) : (
            <Sun size={17} strokeWidth={1.75} aria-hidden />
          )}
        </button>

        <DropdownMenu open={notificationsOpen} onOpenChange={setNotificationsOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ah-topbar-icon-btn ah-topbar-icon-btn--notify"
              aria-label={
                unreadCount > 0
                  ? `Notifications, ${unreadCount} unread`
                  : 'Notifications'
              }
            >
              <Bell size={17} strokeWidth={1.75} aria-hidden />
              {unreadCount > 0 ? (
                <span className="ah-topbar-notify-dot" aria-hidden />
              ) : null}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="ah-topbar-notify-panel">
            <div className="ah-topbar-notify-head">
              <strong>Notifications</strong>
              {unreadCount > 0 ? (
                <button
                  type="button"
                  className="ah-topbar-notify-mark"
                  onClick={() => void onMarkAllNotificationsRead()}
                >
                  Mark all read
                </button>
              ) : null}
            </div>
            <div className="ah-topbar-notify-list">
              {notifications.length === 0 ? (
                <p className="ah-topbar-notify-empty">No new notifications.</p>
              ) : (
                notifications.slice(0, 12).map((n) => {
                  const id = n.id || n._id || '';
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`ah-topbar-notify-item${n.isRead ? '' : ' is-unread'}`}
                      onClick={() => {
                        onNotificationClick(n);
                        setNotificationsOpen(false);
                      }}
                    >
                      <span className="ah-topbar-notify-title">{n.title}</span>
                      <span className="ah-topbar-notify-message">{n.message}</span>
                    </button>
                  );
                })
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu open={profileOpen} onOpenChange={setProfileOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ah-topbar-user"
              aria-label="Account menu"
            >
              <TopBarAvatar displayName={displayName} email={email} avatar={avatar} />
              <span className="ah-topbar-user-name">{displayName}</span>
              <ChevronDown size={14} strokeWidth={1.75} className="ah-topbar-user-chevron" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={10} className="ah-account-dropdown-content">
            <AdminAccountDropdownMenu
              displayName={displayName}
              email={email}
              onEditProfile={() => {
                setProfileOpen(false);
                onViewProfile();
              }}
              onAccountSettings={() => {
                setProfileOpen(false);
                onAccountSettings();
              }}
              onSignOut={() => {
                setProfileOpen(false);
                onSignOut();
              }}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
