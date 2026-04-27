import React, { useState } from 'react';
import SalesSidebar from '@/components/sales/SalesSidebar';
import SalesTopbar from '@/components/sales/SalesTopbar';
import KPIBentoGrid from '@/components/sales/dashboard/KPIBentoGrid';
import HourlySalesChart from '@/components/sales/dashboard/HourlySalesChart';
import ServiceMixChart from '@/components/sales/dashboard/ServiceMixChart';
import SevenDayTrendChart from '@/components/sales/dashboard/SevenDayTrendChart';
import RecentTransactionsFeed from '@/components/sales/dashboard/RecentTransactionsFeed';
import POSWorkspace from '@/components/sales/pos/POSWorkspace';
import TransactionsTable from '@/components/sales/transactions/TransactionsTable';
import CustomersView from '@/components/sales/customers/CustomersView';
import SalesReportsView from '@/components/sales/reports/SalesReportsView';
import SettingsView from '@/components/sales/settings/SettingsView';
import ToastProvider from '@/components/sales/ui/ToastProvider';
import SalesSmartCalendar from '@/components/sales/calendar/SalesSmartCalendar';
import BookingApprovalsPage from '@/components/sales/booking/BookingApprovalsPage';
import { SalesAnalyticsProvider } from '@/contexts/SalesAnalyticsContext';

type SalesView = 'dashboard' | 'pos' | 'transactions' | 'customers' | 'reports' | 'settings' | 'approvals' | 'calendar';


// ── Transactions View ─────────────────────────────────────────────────────────
function TransactionsView() {
  return (
    <div className="space-y-4 page-enter">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Transactions</h1>
        <p className="text-sm text-slate-500 mt-0.5">All service transactions — {new Date().toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</p>
      </div>
      <TransactionsTable />
    </div>
  );
}

// ── Dashboard View ────────────────────────────────────────────────────────────
function DashboardView({ onNavigate }: { onNavigate: (v: SalesView) => void }) {
  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sales Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">{today} — Shift: 8:00 AM – 6:00 PM</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-700">Live</span>
          </div>
        </div>
      </div>
      <KPIBentoGrid />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2"><HourlySalesChart /></div>
        <div className="lg:col-span-1"><ServiceMixChart /></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2"><SevenDayTrendChart /></div>
        <div className="lg:col-span-1"><RecentTransactionsFeed onViewAll={() => onNavigate('transactions')} /></div>
      </div>
    </div>
  );
}

// ── POS View ──────────────────────────────────────────────────────────────────
function POSView() {
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
      <div className="flex-1 overflow-hidden"><POSWorkspace /></div>
    </div>
  );
}

// ── Main Sales Dashboard Page ─────────────────────────────────────────────────
export default function SalesDashboard() {
  const [activeView, setActiveView] = useState<SalesView>('dashboard');
  const [collapsed, setCollapsed] = useState(false);

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':    return <DashboardView onNavigate={setActiveView} />;
      case 'pos':          return <POSView />;
      case 'transactions': return <TransactionsView />;
      case 'customers':    return <CustomersView />;
      case 'reports':      return <SalesReportsView />;
      case 'settings':     return <SettingsView />;
      case 'approvals':    return <BookingApprovalsPage />;
      case 'calendar':     return <SalesSmartCalendar />;
      default:             return <DashboardView onNavigate={setActiveView} />;
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
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <SalesTopbar />
          <main className={`flex-1 p-6 scrollbar-thin ${
            activeView === 'pos' ? 'overflow-hidden flex flex-col' :
            activeView === 'calendar' ? 'overflow-hidden flex flex-col' :
            'overflow-y-auto'
          }`}>
            {renderView()}
          </main>
        </div>
        <ToastProvider />
      </div>
    </SalesAnalyticsProvider>
  );
}
