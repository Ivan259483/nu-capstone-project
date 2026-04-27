/**
 * Operational Manager Dashboard — Full-featured light-themed dashboard
 * 
 * Modules per capstone spec:
 * 1. Staff & Technician Dashboard — Job queue, in-progress/completed reports, workloads
 * 2. Customer Status Tracker — Service progress monitoring, timely updates
 * 
 * Uses REAL data from the backend (bookings + users), NOT dummy data.
 */
import React, { useState, useCallback } from 'react';
import {
  LayoutDashboard, Users, RefreshCw, Bell,
  ChevronLeft, ChevronRight, ChevronDown, LogOut
} from 'lucide-react';
import { useOpsData } from './hooks/useOpsData';
import type { OpsJob } from './ops-types';
import type { JobStatus } from './ui/OpsUIKit';
import { OrderService } from '@/lib/order-service';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

// Staff Dashboard components
import OpsKPIBentoGrid from './staff-dashboard/OpsKPIBentoGrid';
import OpsJobVolumeChart from './staff-dashboard/OpsJobVolumeChart';
import OpsTechnicianWorkloadGrid from './staff-dashboard/OpsTechnicianWorkloadGrid';
import OpsJobQueueTable from './staff-dashboard/OpsJobQueueTable';
import OpsJobSlideOver from './staff-dashboard/OpsJobSlideOver';

// Customer Tracker components
import OpsCustomerKPIRow from './customer-tracker/OpsCustomerKPIRow';
import OpsCustomerJobTable from './customer-tracker/OpsCustomerJobTable';

// CSS
import './ops-manager.css';

type ActiveView = 'staff-dashboard' | 'customer-tracker';

const navItems = [
  { label: 'Staff Dashboard', key: 'staff-dashboard' as ActiveView, icon: LayoutDashboard, group: 'Operations' },
  { label: 'Customer Tracker', key: 'customer-tracker' as ActiveView, icon: Users, group: 'Operations' },
];

export default function OpsManagerDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { jobs, technicians, loading, error, refresh, lastRefreshed } = useOpsData();

  const [activeView, setActiveView] = useState<ActiveView>('staff-dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedJob, setSelectedJob] = useState<OpsJob | null>(null);
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Badge counts
  const unassignedCount = jobs.filter(j => j.status === 'Queued' && !j.technicianId).length;
  const escalatedCount = jobs.filter(j => j.slaStatus === 'Breached' || j.slaStatus === 'At Risk').length;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setTimeout(() => setRefreshing(false), 600);
  }, [refresh]);

  const handleJobClick = useCallback((job: OpsJob) => {
    setSelectedJob(job);
    setSlideOverOpen(true);
  }, []);

  const handleAssign = useCallback(async (jobId: string, techId: string) => {
    try {
      await OrderService.assignDetailer(jobId, techId);
      await refresh();
    } catch (err: any) {
      console.error('Failed to assign:', err);
    }
  }, [refresh]);

  const handleStatusChange = useCallback(async (jobId: string, status: JobStatus) => {
    try {
      const statusMap: Record<string, string> = {
        'Queued': 'pending',
        'Assigned': 'assigned',
        'En Route': 'received',
        'Ongoing': 'in_progress',
        'Completed': 'completed',
        'Delayed': 'pending',
        'Cancelled': 'cancelled',
      };
      await OrderService.updateCustomerStatus(jobId, statusMap[status] || 'pending');
      await refresh();
    } catch (err: any) {
      console.error('Failed to update status:', err);
    }
    setSlideOverOpen(false);
  }, [refresh]);

  const handleDragStart = useCallback((jobId: string) => setDraggedJobId(jobId), []);
  const handleDragEnd = useCallback(() => setDraggedJobId(null), []);
  const handleDropOnTech = useCallback((techId: string) => {
    if (!draggedJobId) return;
    handleAssign(draggedJobId, techId);
    setDraggedJobId(null);
  }, [draggedJobId, handleAssign]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  }, [logout, navigate]);

  const pageTitles: Record<ActiveView, { title: string; subtitle: string }> = {
    'staff-dashboard': { title: 'Staff Dashboard', subtitle: 'Job queue & technician dispatch' },
    'customer-tracker': { title: 'Customer Tracker', subtitle: 'Live job status & customer updates' },
  };

  const page = pageTitles[activeView];
  const lastUpdatedStr = lastRefreshed
    ? lastRefreshed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : 'Just now';

  const userInitials = user?.displayName
    ? user.displayName.split(' ').map((n: string) => n[0]?.toUpperCase()).join('').slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || 'OP';
  const userName = user?.displayName || user?.email || 'Ops Manager';

  return (
    <div className="ops-layout flex h-screen overflow-hidden">
      {/* ═══ Sidebar ═══ */}
      <aside
        className="hidden lg:flex flex-col ops-sidebar flex-shrink-0 overflow-hidden"
        style={{ width: sidebarCollapsed ? 64 : 240 }}
      >
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white text-[11px] font-bold">SPF</span>
            </div>
            {!sidebarCollapsed && (
              <span className="font-semibold text-gray-900 text-[15px] tracking-tight truncate">
                OpsDash
              </span>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 overflow-y-auto ops-scrollbar-thin">
          <div className="mb-4">
            {!sidebarCollapsed && (
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 px-3 mb-1">
                Operations
              </p>
            )}
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeView === item.key;
              const badge = item.key === 'customer-tracker' ? escalatedCount
                : item.key === 'staff-dashboard' ? unassignedCount : undefined;

              return (
                <button
                  key={item.key}
                  onClick={() => setActiveView(item.key)}
                  className={`ops-sidebar-item mb-0.5 w-full relative group ${isActive ? 'ops-sidebar-item-active' : ''}`}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon size={18} className={isActive ? 'text-indigo-600' : 'text-gray-500'} />
                  {!sidebarCollapsed && (
                    <span className="flex-1 text-[13.5px] text-left">{item.label}</span>
                  )}
                  {!sidebarCollapsed && badge !== undefined && badge > 0 && (
                    <span className="ml-auto bg-indigo-100 text-indigo-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums">
                      {badge}
                    </span>
                  )}
                  {sidebarCollapsed && badge !== undefined && badge > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-indigo-500 rounded-full" />
                  )}
                  {sidebarCollapsed && (
                    <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50">
                      {item.label}
                      <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* User + Collapse */}
        <div className="border-t border-gray-100 p-2">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors duration-150 mb-1">
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <span className="text-indigo-700 text-[11px] font-semibold">{userInitials}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-gray-900 truncate">{userName}</p>
                <p className="text-[11px] text-gray-400 truncate">Ops Manager</p>
              </div>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(c => !c)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all duration-150 text-xs font-medium"
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : (
              <>
                <ChevronLeft size={16} />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ═══ Main Content ═══ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-gray-100 flex items-center px-6 lg:px-8 xl:px-10 gap-4 flex-shrink-0" style={{ boxShadow: '0 1px 0 0 #F3F4F6' }}>
          {/* Mobile sidebar toggle */}
          <button
            onClick={() => setActiveView(activeView === 'staff-dashboard' ? 'customer-tracker' : 'staff-dashboard')}
            className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100"
          >
            <LayoutDashboard size={18} />
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-semibold text-gray-900 leading-none">{page.title}</h1>
            <p className="text-[12px] text-gray-400 mt-0.5 leading-none">{page.subtitle}</p>
          </div>

          {/* Live indicator */}
          <div className="hidden md:flex items-center gap-1.5 text-[12px] text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span>Updated {lastUpdatedStr}</span>
          </div>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all duration-150 disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>

          {/* Notifications */}
          <button className="relative p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all duration-150">
            <Bell size={16} />
            {escalatedCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
            )}
          </button>

          {/* User dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl hover:bg-gray-50 transition-colors duration-150"
            >
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center">
                <span className="text-indigo-700 text-[11px] font-semibold">{userInitials}</span>
              </div>
              <span className="hidden md:block text-[13px] font-medium text-gray-700 max-w-[120px] truncate">{userName}</span>
              <ChevronDown size={14} className="text-gray-400" />
            </button>
            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl border border-gray-100 py-1 min-w-[180px] ops-animate-scale-in" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}>
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-[13px] font-medium text-gray-900">{userName}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{user?.email}</p>
                    <p className="text-[10px] text-indigo-600 font-medium mt-0.5">Operation Manager</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2.5 text-[13px] text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                  >
                    <LogOut size={14} />
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Main content area */}
        <main className="flex-1 overflow-auto ops-scrollbar-thin bg-[#FAFAFA]">
          <div className="max-w-screen-2xl mx-auto px-6 lg:px-8 xl:px-10 2xl:px-12 py-6">
            {/* Loading state */}
            {loading && jobs.length === 0 && technicians.length === 0 && (
              <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-[13px] text-gray-500">Loading operations data…</p>
                </div>
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
                <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <div className="flex-1">
                  <p className="text-[13px] text-red-700 font-medium">{error}</p>
                  <p className="text-[12px] text-red-500 mt-1">Make sure the backend server is running and your account has the correct permissions.</p>
                </div>
                <button onClick={handleRefresh} className="text-[12px] text-red-600 hover:text-red-700 font-medium px-3 py-1.5 bg-red-100 hover:bg-red-200 rounded-lg transition-colors flex-shrink-0">
                  Retry
                </button>
              </div>
            )}

            {/* ═══ Staff Dashboard View ═══ */}
            {activeView === 'staff-dashboard' && !(loading && jobs.length === 0 && technicians.length === 0) && (
              <div className="space-y-6">
                {/* KPI cards */}
                <OpsKPIBentoGrid jobs={jobs} />

                {/* Charts + Workload */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  <div className="xl:col-span-2">
                    <OpsJobVolumeChart jobs={jobs} />
                  </div>
                  <div className="xl:col-span-1">
                    <OpsTechnicianWorkloadGrid
                      technicians={technicians}
                      jobs={jobs}
                      onDrop={handleDropOnTech}
                      draggedJobId={draggedJobId}
                    />
                  </div>
                </div>

                {/* Job Queue Table */}
                <OpsJobQueueTable
                  jobs={jobs}
                  technicians={technicians}
                  onJobClick={handleJobClick}
                  onAssign={handleAssign}
                  onStatusChange={handleStatusChange}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  draggedJobId={draggedJobId}
                />
              </div>
            )}

            {/* ═══ Customer Tracker View ═══ */}
            {activeView === 'customer-tracker' && !(loading && jobs.length === 0 && technicians.length === 0) && (
              <div className="space-y-6">
                {/* Live update banner */}
                <div className="flex items-center justify-between ops-card px-5 py-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-[12.5px] font-medium text-gray-700">Live Updates Active</span>
                    </div>
                    <span className="hidden sm:inline text-gray-200">·</span>
                    <span className="hidden sm:inline text-[12px] text-gray-400">Last refreshed at {lastUpdatedStr}</span>
                    <span className="hidden sm:inline text-gray-200">·</span>
                    <span className="hidden sm:inline text-[12px] text-gray-400">Auto-refresh every <span className="font-semibold text-gray-600">30s</span></span>
                  </div>
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-indigo-600 font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-all duration-150 disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                    Refresh Now
                  </button>
                </div>

                {/* Customer KPIs */}
                <OpsCustomerKPIRow jobs={jobs} />

                {/* Customer job table */}
                <OpsCustomerJobTable
                  jobs={jobs}
                  technicians={technicians}
                  onJobClick={handleJobClick}
                  onStatusChange={handleStatusChange}
                />
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Slide-over detail panel */}
      <OpsJobSlideOver
        job={selectedJob}
        open={slideOverOpen}
        onClose={() => setSlideOverOpen(false)}
        technicians={technicians}
        onAssign={handleAssign}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
}
