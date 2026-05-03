import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  Alert, Pressable, TextInput, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQCJobs, type UrgencyFilter } from '@/hooks/useQCJobs';
import { getUrgencyLevel, URGENCY_COLORS, type QCJob } from '@/services/api/qcService';
import QCReturnModal from '@/components/qc/QCReturnModal';

// ── Helpers ──────────────────────────────────────────────────────────────────

const shortenId = (id: string) => {
  if (id.length <= 10) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
};

const FILTER_TABS: { key: UrgencyFilter; label: string; emoji: string }[] = [
  { key: 'all', label: 'ALL', emoji: '' },
  { key: 'overdue', label: 'OVERDUE', emoji: '🔴' },
  { key: 'urgent', label: 'URGENT', emoji: '🟡' },
  { key: 'new', label: 'NEW', emoji: '🟢' },
];

// ── Job Card ─────────────────────────────────────────────────────────────────

function JobCard({
  job, selected, onToggle, onView, onApprove, onFlag, actioning,
}: {
  job: QCJob; selected: boolean; onToggle: () => void;
  onView: () => void; onApprove: () => void; onFlag: () => void;
  actioning: boolean;
}) {
  const urgency = getUrgencyLevel(job.elapsedMinutes);
  const colors = URGENCY_COLORS[urgency];
  const unassigned = !job.technician || job.technician === 'Unassigned';

  return (
    <View style={[c.card, selected && c.cardSelected]}>
      {/* Urgency stripe */}
      <View style={[c.stripe, { backgroundColor: colors.stripe }]} />

      <View style={c.cardInner}>
        {/* Top row: checkbox + job ID + urgency badge + AI badge */}
        <View style={c.topRow}>
          <TouchableOpacity onPress={onToggle} hitSlop={8} style={c.checkWrap}>
            <View style={[c.checkbox, selected && c.checkboxActive]}>
              {selected && <Feather name="check" size={10} color="#FFF" />}
            </View>
          </TouchableOpacity>

          <Pressable onLongPress={() => Alert.alert('Full Job ID', job.jobId)} style={c.idWrap}>
            <Text style={c.jobId}>{shortenId(job.jobId)}</Text>
          </Pressable>

          <View style={[c.urgencyBadge, { backgroundColor: colors.bg }]}>
            <Text style={[c.urgencyText, { color: colors.text }]}>{colors.label}</Text>
          </View>

          {job.aiFlag && (
            <View style={c.aiBadge}>
              <Feather name="alert-triangle" size={10} color="#EF4444" />
              <Text style={c.aiText}>AI</Text>
            </View>
          )}
        </View>

        {/* Middle row: customer + service + vehicle */}
        <View style={c.midRow}>
          <View style={c.infoCol}>
            <Text style={c.customerName} numberOfLines={1}>{job.customer}</Text>
            <Text style={c.serviceName} numberOfLines={1}>{job.service}</Text>
            <Text style={c.vehicleText} numberOfLines={1}>{job.vehicle}</Text>
          </View>

          {/* Elapsed — most prominent */}
          <View style={c.elapsedWrap}>
            <Text style={[c.elapsedValue, { color: colors.text }]}>{job.elapsed}</Text>
            <Text style={c.elapsedLabel}>elapsed</Text>
          </View>
        </View>

        {/* Bottom row: technician + status + actions */}
        <View style={c.bottomRow}>
          {unassigned ? (
            <View style={c.assignBadge}>
              <Feather name="alert-triangle" size={10} color="#F97316" />
              <Text style={c.assignText}>Assign Now</Text>
            </View>
          ) : (
            <View style={c.techRow}>
              <View style={c.techAvatar}>
                <Text style={c.techInitial}>
                  {job.technician.split(' ').map((w) => w[0]).join('').slice(0, 2)}
                </Text>
              </View>
              <Text style={c.techName} numberOfLines={1}>{job.technician}</Text>
            </View>
          )}

          <View style={c.statusBadge}>
            <View style={c.statusDot} />
            <Text style={c.statusText}>
              {job.status.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
            </Text>
          </View>

          {/* Actions */}
          <View style={c.actions}>
            {actioning ? (
              <ActivityIndicator size="small" color="#888" />
            ) : (
              <>
                <TouchableOpacity onPress={onView} style={c.actionBtn} hitSlop={6}>
                  <Feather name="eye" size={16} color="#888" />
                </TouchableOpacity>
                <TouchableOpacity onPress={onApprove} style={c.actionBtnGreen} hitSlop={6}>
                  <Feather name="check" size={16} color="#22C55E" />
                </TouchableOpacity>
                <TouchableOpacity onPress={onFlag} style={c.actionBtnRed} hitSlop={6}>
                  <Feather name="x" size={16} color="#EF4444" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function QCJobsForReview() {
  const insets = useSafeAreaInsets();
  const {
    jobs, loading, refreshing, summary, urgencyFilter, setUrgencyFilter,
    aiOnly, setAiOnly, searchQuery, setSearchQuery,
    selectedIds, toggleSelect, clearSelection,
    page, setPage, totalPages, allJobs,
    approveJob, returnJob, batchApprove, refetch,
  } = useQCJobs();

  const [actioningId, setActioningId] = useState<string | null>(null);
  const [returnModal, setReturnModal] = useState<{ visible: boolean; jobId: string; technician: string; id: string }>({
    visible: false, jobId: '', technician: '', id: '',
  });
  const [showSearch, setShowSearch] = useState(false);

  const handleApprove = useCallback(async (job: QCJob) => {
    setActioningId(job.id);
    await approveJob(job.id);
    setActioningId(null);
  }, [approveJob]);

  const handleFlag = useCallback((job: QCJob) => {
    setReturnModal({ visible: true, jobId: job.jobId, technician: job.technician || 'Unassigned', id: job.id });
  }, []);

  const handleReturnConfirm = useCallback(async (reason: string) => {
    await returnJob(returnModal.id, reason);
    setReturnModal({ visible: false, jobId: '', technician: '', id: '' });
  }, [returnJob, returnModal.id]);

  const handleView = useCallback((job: QCJob) => {
    const before = job.photos?.before?.[0];
    const after = job.photos?.after?.[0];
    Alert.alert(
      `${job.jobId} — Photos`,
      before || after
        ? `Before: ${before ? '✓ Available' : '✗ None'}\nAfter: ${after ? '✓ Available' : '✗ None'}\n\nVehicle: ${job.vehicle}\nService: ${job.service}`
        : 'No photos uploaded yet.',
    );
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────

  const renderItem = useCallback(({ item }: { item: QCJob }) => (
    <JobCard
      job={item}
      selected={selectedIds.has(item.id)}
      onToggle={() => toggleSelect(item.id)}
      onView={() => handleView(item)}
      onApprove={() => handleApprove(item)}
      onFlag={() => handleFlag(item)}
      actioning={actioningId === item.id}
    />
  ), [selectedIds, toggleSelect, handleView, handleApprove, handleFlag, actioningId]);

  const ListEmpty = () => (
    <View style={c.emptyWrap}>
      <View style={c.emptyIcon}>
        <Feather name="clipboard" size={28} color="#555" />
      </View>
      <Text style={c.emptyTitle}>No jobs to review</Text>
      <Text style={c.emptySub}>Jobs will appear when technicians submit completed work</Text>
    </View>
  );

  return (
    <View style={[c.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={c.header}>
        <View>
          <Text style={c.headerTitle}>Jobs for Review</Text>
          <Text style={c.headerSub}>{allJobs.length} job{allJobs.length !== 1 ? 's' : ''} in queue</Text>
        </View>
        <TouchableOpacity onPress={() => setShowSearch(!showSearch)} style={c.searchToggle}>
          <Feather name={showSearch ? 'x' : 'search'} size={18} color="#FFB77D" />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      {showSearch && (
        <View style={c.searchBar}>
          <Feather name="search" size={14} color="#666" />
          <TextInput
            style={c.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search job, customer, technician…"
            placeholderTextColor="#555"
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Feather name="x-circle" size={14} color="#666" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Summary bar */}
      <View style={c.summaryBar}>
        <View style={c.summaryItem}>
          <Text style={c.summaryEmoji}>🔴</Text>
          <Text style={c.summaryCount}>{summary.overdue}</Text>
          <Text style={c.summaryLabel}>Overdue</Text>
        </View>
        <View style={c.summaryDot} />
        <View style={c.summaryItem}>
          <Text style={c.summaryEmoji}>🟡</Text>
          <Text style={c.summaryCount}>{summary.urgent}</Text>
          <Text style={c.summaryLabel}>Urgent</Text>
        </View>
        <View style={c.summaryDot} />
        <View style={c.summaryItem}>
          <Text style={c.summaryEmoji}>🟢</Text>
          <Text style={c.summaryCount}>{summary.new}</Text>
          <Text style={c.summaryLabel}>New</Text>
        </View>
        <View style={c.summaryDot} />
        <View style={c.summaryItem}>
          <Text style={c.summaryEmoji}>⚠️</Text>
          <Text style={c.summaryCount}>{summary.aiFlagged}</Text>
          <Text style={c.summaryLabel}>AI</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={c.filterRow}>
        <View style={c.tabsRow}>
          {FILTER_TABS.map((tab) => {
            const active = urgencyFilter === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setUrgencyFilter(tab.key)}
                style={[c.tab, active && c.tabActive]}
                activeOpacity={0.7}
              >
                {tab.emoji ? <Text style={c.tabEmoji}>{tab.emoji}</Text> : null}
                <Text style={[c.tabText, active && c.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          onPress={() => setAiOnly(!aiOnly)}
          style={[c.aiToggle, aiOnly && c.aiToggleActive]}
          activeOpacity={0.7}
        >
          <Feather name="alert-triangle" size={12} color={aiOnly ? '#EF4444' : '#666'} />
          <Text style={[c.aiToggleText, aiOnly && c.aiToggleTextActive]}>AI Only</Text>
        </TouchableOpacity>
      </View>

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <View style={c.batchBar}>
          <Text style={c.batchCount}>{selectedIds.size} selected</Text>
          <TouchableOpacity onPress={batchApprove} style={c.batchBtn} activeOpacity={0.8}>
            <Feather name="check-circle" size={14} color="#FFF" />
            <Text style={c.batchBtnText}>Bulk Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={clearSelection} hitSlop={8}>
            <Text style={c.batchDeselect}>Deselect</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Job list */}
      {loading && jobs.length === 0 ? (
        <View style={c.loadingWrap}>
          <ActivityIndicator size="large" color="#FFB77D" />
          <Text style={c.loadingText}>Loading jobs…</Text>
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={c.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={ListEmpty}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor="#FFB77D" />
          }
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <View style={[c.pagination, { paddingBottom: insets.bottom + 70 }]}>
          <TouchableOpacity
            onPress={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            style={[c.pageBtn, page === 1 && c.pageBtnDisabled]}
          >
            <Feather name="chevron-left" size={16} color={page === 1 ? '#333' : '#CCC'} />
          </TouchableOpacity>
          <Text style={c.pageInfo}>{page} / {totalPages}</Text>
          <TouchableOpacity
            onPress={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            style={[c.pageBtn, page === totalPages && c.pageBtnDisabled]}
          >
            <Feather name="chevron-right" size={16} color={page === totalPages ? '#333' : '#CCC'} />
          </TouchableOpacity>
        </View>
      )}

      {/* Return Modal */}
      <QCReturnModal
        visible={returnModal.visible}
        jobId={returnModal.jobId}
        technician={returnModal.technician}
        onClose={() => setReturnModal({ visible: false, jobId: '', technician: '', id: '' })}
        onConfirm={handleReturnConfirm}
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const c = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0E0E0E' },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  headerSub: { color: '#888', fontSize: 12, marginTop: 2 },
  searchToggle: {
    width: 40, height: 40, borderRadius: 14,
    backgroundColor: 'rgba(255, 183, 125, 0.1)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12, height: 40, gap: 8,
  },
  searchInput: { flex: 1, color: '#FFF', fontSize: 13 },

  // Summary bar
  summaryBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 20, marginBottom: 12, paddingVertical: 10, paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  summaryEmoji: { fontSize: 10 },
  summaryCount: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  summaryLabel: { color: '#888', fontSize: 10, fontWeight: '600' },
  summaryDot: {
    width: 3, height: 3, borderRadius: 2, backgroundColor: '#333', marginHorizontal: 10,
  },

  // Filter tabs
  filterRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 8, gap: 8,
  },
  tabsRow: { flexDirection: 'row', flex: 1, gap: 6 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  tabActive: {
    backgroundColor: 'rgba(255, 183, 125, 0.12)',
    borderColor: 'rgba(255, 183, 125, 0.3)',
  },
  tabEmoji: { fontSize: 10 },
  tabText: { color: '#888', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  tabTextActive: { color: '#FFB77D' },

  aiToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  aiToggleActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  aiToggleText: { color: '#666', fontSize: 11, fontWeight: '700' },
  aiToggleTextActive: { color: '#EF4444' },

  // Batch bar
  batchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 20, marginBottom: 8, paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: 'rgba(34, 197, 94, 0.08)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(34, 197, 94, 0.2)',
  },
  batchCount: { color: '#22C55E', fontSize: 12, fontWeight: '700' },
  batchBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#22C55E', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  batchBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  batchDeselect: { color: '#888', fontSize: 11, fontWeight: '600', marginLeft: 'auto' },

  // Loading
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#888', fontSize: 13 },

  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 120 },

  // Card
  card: {
    backgroundColor: '#151515', borderRadius: 16, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden', flexDirection: 'row',
  },
  cardSelected: { borderColor: 'rgba(96, 165, 250, 0.4)', backgroundColor: 'rgba(96, 165, 250, 0.04)' },
  stripe: { width: 4 },
  cardInner: { flex: 1, padding: 14, gap: 10 },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkWrap: {},
  checkbox: {
    width: 18, height: 18, borderRadius: 5, borderWidth: 1.5,
    borderColor: '#444', alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  idWrap: {},
  jobId: { color: '#FFF', fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  urgencyBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  urgencyText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  aiBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(239, 68, 68, 0.12)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  aiText: { color: '#EF4444', fontSize: 9, fontWeight: '800' },

  midRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoCol: { flex: 1, gap: 2 },
  customerName: { color: '#E0E0E0', fontSize: 14, fontWeight: '700' },
  serviceName: { color: '#AAA', fontSize: 12 },
  vehicleText: { color: '#666', fontSize: 11 },
  elapsedWrap: { alignItems: 'flex-end' },
  elapsedValue: { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  elapsedLabel: { color: '#555', fontSize: 9, fontWeight: '600', letterSpacing: 0.5, marginTop: -2 },

  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  techRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  techAvatar: {
    width: 20, height: 20, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  techInitial: { color: '#AAA', fontSize: 8, fontWeight: '800' },
  techName: { color: '#888', fontSize: 11, flex: 1 },
  assignBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1,
    backgroundColor: 'rgba(249, 115, 22, 0.1)', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, alignSelf: 'flex-start',
  },
  assignText: { color: '#F97316', fontSize: 10, fontWeight: '700' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#F59E0B' },
  statusText: { color: '#F59E0B', fontSize: 9, fontWeight: '700' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionBtn: {
    width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  actionBtnGreen: {
    width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  actionBtnRed: {
    width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },

  // Empty
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  emptyIcon: {
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { color: '#888', fontSize: 15, fontWeight: '700' },
  emptySub: { color: '#555', fontSize: 12, marginTop: 4, textAlign: 'center', paddingHorizontal: 40 },

  // Pagination
  pagination: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16,
    paddingVertical: 12,
  },
  pageBtn: {
    width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  pageBtnDisabled: { opacity: 0.3 },
  pageInfo: { color: '#AAA', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
