import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { qcService, getUrgencyLevel, type QCJob, type UrgencyLevel } from '@/services/api/qcService';
import { Toast } from '@/components/ui/PremiumToast';

const POLL_INTERVAL_MS = 15_000; // 15s — matches web

export type UrgencyFilter = 'all' | 'overdue' | 'urgent' | 'new';

export interface QCSummary {
  overdue: number;
  urgent: number;
  new: number;
  aiFlagged: number;
  total: number;
}

export function useQCJobs() {
  const [jobs, setJobs] = useState<QCJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>('all');
  const [aiOnly, setAiOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Pagination
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchJobs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await qcService.getJobs();
      setJobs(data);
      setError(null);
    } catch (err: any) {
      if (!silent) {
        const msg = err?.response?.data?.message || err?.message || 'Failed to fetch QC jobs';
        setError(msg);
      }
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const refetch = useCallback(() => {
    setRefreshing(true);
    fetchJobs(false);
  }, [fetchJobs]);

  // ── Auto-poll ─────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchJobs(false);
    pollRef.current = setInterval(() => fetchJobs(true), POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchJobs]);

  // ── Urgency summary ──────────────────────────────────────────────────────

  const summary: QCSummary = useMemo(() => {
    const s = { overdue: 0, urgent: 0, new: 0, aiFlagged: 0, total: jobs.length };
    for (const j of jobs) {
      const level = getUrgencyLevel(j.elapsedMinutes);
      if (level === 'overdue') s.overdue++;
      else if (level === 'urgent') s.urgent++;
      else s.new++;
      if (j.aiFlag) s.aiFlagged++;
    }
    return s;
  }, [jobs]);

  // ── Filtered + sorted ─────────────────────────────────────────────────────

  const filteredJobs = useMemo(() => {
    let data = [...jobs];

    // Urgency filter
    if (urgencyFilter !== 'all') {
      data = data.filter((j) => getUrgencyLevel(j.elapsedMinutes) === urgencyFilter);
    }

    // AI only
    if (aiOnly) {
      data = data.filter((j) => j.aiFlag);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter(
        (j) =>
          j.jobId.toLowerCase().includes(q) ||
          j.customer.toLowerCase().includes(q) ||
          (j.technician || '').toLowerCase().includes(q) ||
          j.vehicle.toLowerCase().includes(q)
      );
    }

    // Sort by elapsed (most urgent first)
    data.sort((a, b) => b.elapsedMinutes - a.elapsedMinutes);

    return data;
  }, [jobs, urgencyFilter, aiOnly, searchQuery]);

  // ── Paginated ──────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / itemsPerPage));
  const paginatedJobs = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return filteredJobs.slice(start, start + itemsPerPage);
  }, [filteredJobs, page, itemsPerPage]);

  // ── Selection ──────────────────────────────────────────────────────────────

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === paginatedJobs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedJobs.map((j) => j.id)));
    }
  }, [selectedIds.size, paginatedJobs]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // ── Actions ────────────────────────────────────────────────────────────────

  const approveJob = useCallback(async (id: string): Promise<boolean> => {
    try {
      const ok = await qcService.approveJob(id);
      if (ok) {
        Toast.show('Job approved ✓', 'success');
        // Optimistic remove
        setJobs((prev) => prev.filter((j) => j.id !== id));
        setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      }
      return ok;
    } catch (err: any) {
      Toast.show(err?.response?.data?.message || 'Approval failed', 'error');
      return false;
    }
  }, []);

  const returnJob = useCallback(async (id: string, reason: string): Promise<boolean> => {
    if (!reason?.trim()) {
      Toast.show('A return reason is required', 'error');
      return false;
    }
    try {
      const ok = await qcService.returnJob(id, reason);
      if (ok) {
        Toast.show('Job returned to technician', 'success');
        setJobs((prev) => prev.filter((j) => j.id !== id));
        setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      }
      return ok;
    } catch (err: any) {
      Toast.show(err?.response?.data?.message || 'Return failed', 'error');
      return false;
    }
  }, []);

  const batchApprove = useCallback(async (): Promise<void> => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    Toast.show(`Approving ${ids.length} jobs…`, 'info');
    const result = await qcService.batchApprove(ids);
    if (result.success > 0) {
      Toast.show(`${result.success} job${result.success > 1 ? 's' : ''} approved ✓`, 'success');
      // Optimistic remove
      setJobs((prev) => prev.filter((j) => !selectedIds.has(j.id)));
    }
    if (result.failed > 0) {
      Toast.show(`${result.failed} failed to approve`, 'error');
    }
    setSelectedIds(new Set());
    fetchJobs(true);
  }, [selectedIds, fetchJobs]);

  // ── Reset page on filter change ─────────────────────────────────────────

  useEffect(() => { setPage(1); }, [urgencyFilter, aiOnly, searchQuery]);

  return {
    // Data
    jobs: paginatedJobs,
    allJobs: filteredJobs,
    loading,
    refreshing,
    error,
    summary,

    // Filters
    urgencyFilter,
    setUrgencyFilter,
    aiOnly,
    setAiOnly,
    searchQuery,
    setSearchQuery,

    // Selection
    selectedIds,
    toggleSelect,
    toggleSelectAll,
    clearSelection,

    // Pagination
    page,
    setPage,
    totalPages,
    itemsPerPage,

    // Actions
    approveJob,
    returnJob,
    batchApprove,
    refetch,
  };
}
