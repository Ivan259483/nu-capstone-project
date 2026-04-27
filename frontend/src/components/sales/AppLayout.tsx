import React from 'react';
import SalesSidebar from '@/components/sales/SalesSidebar';
import SalesTopbar from '@/components/sales/SalesTopbar';
import ToastProvider from '@/components/sales/ui/ToastProvider';

interface AppLayoutProps {
  children: React.ReactNode;
  activeView?: string;
  onNavigate?: (v: any) => void;
  collapsed?: boolean;
  onToggle?: () => void;
}

/**
 * AppLayout — wraps every sales page with the sidebar, topbar, and toast provider.
 * Matches the reference component/AppLayout.tsx exactly.
 */
export default function AppLayout({
  children,
  activeView = 'dashboard',
  onNavigate = () => {},
  collapsed = false,
  onToggle = () => {},
}: AppLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <SalesSidebar
        activeView={activeView as any}
        onNavigate={onNavigate}
        collapsed={collapsed}
        onToggle={onToggle}
      />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <SalesTopbar />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="max-w-screen-2xl mx-auto px-6 py-6 xl:px-8 2xl:px-10">
            {children}
          </div>
        </main>
      </div>
      <ToastProvider />
    </div>
  );
}
