import React, { useState } from 'react';
import SalesSidebar from '@/components/sales/SalesSidebar';
import SalesTopbar from '@/components/sales/SalesTopbar';
import PremiumSalesDashboard from '@/components/sales/dashboard/PremiumSalesDashboard';
import POSWorkspace from '@/components/sales/pos/POSWorkspace';
import TransactionsTable from '@/components/sales/transactions/TransactionsTable';
import CustomersView from '@/components/sales/customers/CustomersView';
import SalesReportsView from '@/components/sales/reports/SalesReportsView';
import SettingsView from '@/components/sales/settings/SettingsView';
import SalesProfileView from '@/components/sales/profile/SalesProfileView';
import ToastProvider from '@/components/sales/ui/ToastProvider';
import SalesSmartCalendar from '@/components/sales/calendar/SalesSmartCalendar';
import BookingApprovalsPage from '@/components/sales/booking/BookingApprovalsPage';
import SalesConciergeInbox from '@/components/sales/concierge/SalesConciergeInbox';
import { SalesAnalyticsProvider } from '@/contexts/SalesAnalyticsContext';

type SalesView = 'dashboard' | 'concierge-inbox' | 'pos' | 'transactions' | 'customers' | 'reports' | 'settings' | 'approvals' | 'calendar' | 'profile';


// ── Transactions View ─────────────────────────────────────────────────────────
function TransactionsView() {
  return (
    <div className="space-y-4 page-enter">
      <div>
        <h1 className="text-3xl font-bold text-slate-950">Transactions</h1>
        <p className="text-sm text-slate-500 mt-0.5">All service transactions — {new Date().toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</p>
      </div>
      <TransactionsTable />
    </div>
  );
}

// ── Dashboard View ────────────────────────────────────────────────────────────
function DashboardView({ onNavigate }: { onNavigate: (v: SalesView) => void }) {
  return <PremiumSalesDashboard onNavigate={onNavigate} />;
}

// ── POS View ──────────────────────────────────────────────────────────────────
function POSView({
  preloadOrderId,
  onPreloadConsumed,
}: {
  preloadOrderId: string | null;
  onPreloadConsumed: () => void;
}) {
  const today = new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ gap: '14px' }}>
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Point of Sale</h1>
          <p className="text-sm text-slate-500 mt-0.5">New transaction — {today}</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200">
          <div className="w-2 h-2 rounded-full bg-blue-600" />
          <span className="text-xs font-semibold text-blue-700">POS Active</span>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <POSWorkspace preloadOrderId={preloadOrderId} onPreloadConsumed={onPreloadConsumed} />
      </div>
    </div>
  );
}

// ── Calendar View ─────────────────────────────────────────────────────────────
function CalendarView() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 page-enter">
      <div className="shrink-0">
        <h1 className="text-3xl font-bold text-slate-950">Appointment</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          View all bookings, adjust schedules manually, and avoid double booking with server-side slot validation.
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <SalesSmartCalendar />
      </div>
    </div>
  );
}

// ── Main Sales Dashboard Page ─────────────────────────────────────────────────
export default function SalesDashboard() {
  const [activeView, setActiveView] = useState<SalesView>('dashboard');
  const [collapsed, setCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));
  const [posPreloadOrderId, setPosPreloadOrderId] = useState<string | null>(null);
  const [approvalsPreloadOrderId, setApprovalsPreloadOrderId] = useState<string | null>(null);

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <DashboardView onNavigate={setActiveView} />;
      case 'concierge-inbox': return <SalesConciergeInbox onBack={() => setActiveView('dashboard')} />;
      case 'pos':
        return (
          <POSView
            preloadOrderId={posPreloadOrderId}
            onPreloadConsumed={() => setPosPreloadOrderId(null)}
          />
        );
      case 'transactions': return <TransactionsView />;
      case 'customers': return <CustomersView />;
      case 'reports': return <SalesReportsView />;
      case 'settings': return <SettingsView />;
      case 'profile': return <SalesProfileView onNavigateHome={() => setActiveView('dashboard')} />;
      case 'approvals':
        return (
          <BookingApprovalsPage
            preloadOrderId={approvalsPreloadOrderId}
            onPreloadConsumed={() => setApprovalsPreloadOrderId(null)}
          />
        );
      case 'calendar': return <CalendarView />;
      default: return <DashboardView onNavigate={setActiveView} />;
    }
  };

  return (
    <SalesAnalyticsProvider>
      <div className="sales-layout flex h-screen bg-slate-50 overflow-hidden">
        <SalesSidebar
          activeView={activeView}
          onNavigate={setActiveView}
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <SalesTopbar
            onNavigateToApprovals={(orderId) => {
              if (orderId) setApprovalsPreloadOrderId(orderId);
              setActiveView('approvals');
            }}
            onNavigateToPos={(orderId) => {
              if (orderId) setPosPreloadOrderId(orderId);
              setActiveView('pos');
            }}
            onNavigateToProfile={() => setActiveView('profile')}
          />
          <main className={`min-h-0 flex-1 scrollbar-thin ${activeView === 'concierge-inbox' ? 'p-0' : activeView === 'profile' ? 'p-0' : 'p-6'} ${activeView === 'pos' ? 'flex flex-col overflow-hidden' :
              activeView === 'calendar' ? 'flex flex-col overflow-hidden' :
              activeView === 'concierge-inbox' ? 'flex flex-col overflow-hidden' :
              activeView === 'profile' ? 'flex flex-col overflow-hidden' :
              'overflow-y-auto'
            }`}>
            {activeView === 'profile' ? (
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-slate-50" style={{ padding: '20px clamp(16px, 2vw, 28px) 32px' }}>
                {renderView()}
              </div>
            ) : renderView()}
          </main>
        </div>
        <ToastProvider />
      </div>
    </SalesAnalyticsProvider>
  );
}
