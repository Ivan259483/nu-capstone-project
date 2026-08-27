import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  X,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  DatabaseBackup,
  Download,
  FileCheck2,
  FileKey2,
  HardDrive,
  History,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  Trash2,
  Upload,
  UserRoundCog,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  SYSTEM_CLEANUP_CATEGORIES,
  SystemService,
  saveSystemDownload,
  verifySystemDownload,
  type ClassificationItem,
  type DataEnvironment,
  type LifecycleAction,
  type SystemBackupRecord,
  type SystemCapabilities,
  type SystemOperation,
  type SystemOverview,
} from '@/lib/system-service';
import {
  DEMO_RESET_CONFIRMATION_PHRASE,
  LIFECYCLE_CONFIRMATION_PHRASES,
  createIdempotencyKey,
  getHandoverInvitationError,
  getMissingOpeningInventoryProducts,
  parseOpeningInventoryCsv,
} from './systemManagementUtils';
import './system-management.css';

type SectionId = 'overview' | 'data' | 'turnover' | 'backup' | 'danger';

interface Props {
  currentUser?: any;
  users?: any[];
  inventory?: any[];
  onOperationalDataChanged?: () => void | Promise<void>;
  onExecutionBusyChange?: (busy: boolean) => void;
}

interface ErrorState {
  message: string;
  code?: string;
  status?: number;
}

const SYSTEM_STATE_LOAD_TIMEOUT_MS = 15_000;

const EMPTY_CAPABILITIES: SystemCapabilities = {
  viewOverview: false,
  exportData: false,
  manageClassification: false,
  clearDemoData: false,
  resetDemoEnvironment: false,
  createBackup: false,
  prepareTurnover: false,
  transferAdministrator: false,
  manageLifecycle: false,
  retryCleanup: false,
};

const SECTION_DEFINITIONS: Array<{
  id: SectionId;
  label: string;
  icon: typeof ServerCog;
  capability?: keyof SystemCapabilities;
}> = [
  { id: 'overview', label: 'System Overview', icon: ServerCog, capability: 'viewOverview' },
  { id: 'data', label: 'Data Management', icon: HardDrive, capability: 'manageClassification' },
  { id: 'turnover', label: 'Client Turnover', icon: UserRoundCog, capability: 'prepareTurnover' },
  { id: 'backup', label: 'Backup & Export', icon: FileKey2 },
  { id: 'danger', label: 'Danger Zone', icon: AlertTriangle, capability: 'manageLifecycle' },
];

function apiError(error: any): ErrorState {
  return {
    message: issueText(error?.response?.data?.message || error?.message || 'The operation could not be completed.'),
    code: typeof error?.response?.data?.code === 'string'
      ? error.response.data.code
      : typeof error?.code === 'string' ? error.code : undefined,
    status: Number.isFinite(Number(error?.response?.status)) ? Number(error.response.status) : undefined,
  };
}

function primitiveText(value: unknown, fallback = '—'): string {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : fallback;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  for (const key of ['name', 'label', 'message', 'code', 'email', 'status', 'id', '_id']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
  }
  return fallback;
}

function finiteNumber(value: unknown, fallback = 0): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function statusToken(value: unknown, fallback = 'unknown'): string {
  const token = primitiveText(value, fallback).toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  return token || fallback;
}

function withDeadline<T>(promise: Promise<T>, timeoutMs = SYSTEM_STATE_LOAD_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      const error = new Error('System Management did not respond in time.');
      (error as Error & { code?: string }).code = 'SYSTEM_MANAGEMENT_TIMEOUT';
      reject(error);
    }, timeoutMs);
    promise.then(
      (value) => { window.clearTimeout(timeout); resolve(value); },
      (error) => { window.clearTimeout(timeout); reject(error); },
    );
  });
}

function recordId(record: { id?: string; _id?: string; previewId?: string } | null | undefined): string {
  const value = record?.id ?? record?._id ?? record?.previewId;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function titleCase(value: unknown): string {
  return primitiveText(value, 'Unknown')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value?: unknown): string {
  const normalized = typeof value === 'string' || typeof value === 'number' || value instanceof Date
    ? value
    : null;
  if (normalized === null || normalized === '') return 'Not recorded';
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? 'Not recorded'
    : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

function issueText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return String(value || 'Unknown issue');
  const issue = value as Record<string, unknown>;
  const message = primitiveText(issue.message ?? issue.label ?? issue.code, 'System requirement');
  const detail = Array.isArray(issue.errors) ? ` ${issue.errors.map(issueText).join(' ')}` : '';
  return `${message}${detail}`.trim();
}

function countRows(value: unknown): Array<{ key: string; label: string; value: number }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([group, count]) => {
    if (typeof count === 'number' && Number.isFinite(count)) {
      return [{ key: group, label: titleCase(group), value: count }];
    }
    if (!count || typeof count !== 'object' || Array.isArray(count)) {
      return [{ key: group, label: titleCase(group), value: 0 }];
    }
    const nested = Object.entries(count as Record<string, unknown>)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
      .map(([key, nestedCount]) => ({
        key: `${group}.${key}`,
        label: group === 'usersByRole'
          ? `${titleCase(key)} users`
          : `${titleCase(key)} ${titleCase(group)}`,
        value: nestedCount,
      }));
    return nested.length ? nested : [{ key: group, label: titleCase(group), value: 0 }];
  });
}

function receiptValueText(value: unknown): string {
  if (Array.isArray(value)) {
    const values = value.map((item) => primitiveText(item, '')).filter(Boolean);
    return values.length ? values.join(', ') : 'None';
  }
  if (value && typeof value === 'object') {
    const fields = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const text = primitiveText(item, '');
        return text ? `${titleCase(key)}: ${text}` : '';
      })
      .filter(Boolean);
    return fields.length ? fields.join(' · ') : 'Recorded';
  }
  return primitiveText(value, 'Not recorded');
}

function totalPages(pagination?: { pages?: number; totalPages?: number; total?: number; limit?: number }): number {
  return Math.max(
    1,
    Number(pagination?.pages || pagination?.totalPages || Math.ceil(Number(pagination?.total || 0) / Number(pagination?.limit || 25))) || 1,
  );
}

function ErrorNotice({ error, onRetry }: { error: ErrorState; onRetry?: () => void }) {
  return (
    <div className="sm-error" role="alert">
      <AlertTriangle size={18} aria-hidden />
      <div>
        {error.code ? <strong>{error.code}</strong> : null}
        <p>{error.message}</p>
      </div>
      {onRetry ? (
        <button type="button" className="sm-text-button" onClick={onRetry}>Try again</button>
      ) : null}
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="sm-empty">
      <FileCheck2 size={24} aria-hidden />
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

class SystemManagementRenderBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  public state: { error: Error | null } = { error: null };

  public static getDerivedStateFromError(error: Error) {
    return { error };
  }

  public componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[SystemManagement] Render failure:', error, info.componentStack);
  }

  private retry = () => this.setState({ error: null });

  public render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="system-management-page ah-page-enter">
        <div className="sm-error sm-system-boundary" role="alert">
          <AlertTriangle size={20} aria-hidden />
          <div>
            <strong>System Management could not be loaded.</strong>
            <p>The Admin workspace is still available. Retry this section after reviewing the local runtime.</p>
          </div>
          <button type="button" className="sm-button sm-button--secondary" onClick={this.retry}>Retry</button>
        </div>
      </div>
    );
  }
}

function OperationSummary({ operation }: { operation: SystemOperation }) {
  const counts = countRows(operation.counts);
  const dependencies = Array.isArray(operation.dependencies)
    ? operation.dependencies
    : operation.dependencies && typeof operation.dependencies === 'object'
      ? Object.entries(operation.dependencies).flatMap(([category, values]) =>
          (Array.isArray(values) ? values : []).map((value) => `${titleCase(category)} includes ${titleCase(value)}`),
        )
      : [];
  return (
    <div className="sm-preview" aria-live="polite">
      <div className="sm-preview-heading">
        <div>
          <span className="sm-kicker">Server-verified plan</span>
          <h3>{titleCase(operation.operationType || operation.type || operation.action || operation.kind || 'Operation preview')}</h3>
        </div>
        <span className={`sm-status sm-status--${statusToken(operation.status, 'preview')}`}>
          {titleCase(operation.status || 'preview')}
        </span>
      </div>

      {counts.length > 0 ? (
        <div className="sm-count-grid">
          {counts.map((count) => (
            <div key={count.key}><span>{count.label}</span><strong>{count.value}</strong></div>
          ))}
        </div>
      ) : null}

      {dependencies.length > 0 ? (
        <div className="sm-callout sm-callout--info">
          <strong>Dependency closure</strong>
          <ul>{dependencies.map((item, index) => <li key={`${issueText(item)}-${index}`}>{issueText(item)}</li>)}</ul>
        </div>
      ) : null}

      {operation.blockers?.length ? (
        <div className="sm-callout sm-callout--danger">
          <strong>Execution is blocked</strong>
          <ul>{operation.blockers.map((blocker, index) => <li key={`${issueText(blocker)}-${index}`}>{issueText(blocker)}</li>)}</ul>
        </div>
      ) : null}

      {operation.warnings?.length ? (
        <div className="sm-callout sm-callout--warning">
          <strong>Warnings</strong>
          <ul>{operation.warnings.map((warning, index) => <li key={`${issueText(warning)}-${index}`}>{issueText(warning)}</li>)}</ul>
        </div>
      ) : null}

      {operation.expiresAt ? <p className="sm-expiry">Preview expires {formatDate(operation.expiresAt)}.</p> : null}
    </div>
  );
}

function ConfirmationPanel({
  preview,
  phrase,
  backups,
  buttonLabel,
  danger = false,
  onBusyChange,
  onConfirm,
  onError,
}: {
  preview: SystemOperation;
  phrase: string;
  backups: SystemBackupRecord[];
  buttonLabel: string;
  danger?: boolean;
  onBusyChange: (busy: boolean) => void;
  onConfirm: (input: { password: string; phrase: string; backupId?: string; idempotencyKey: string }) => Promise<void>;
  onError: (error: ErrorState) => void;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [backupId, setBackupId] = useState(() => {
    const verified = backups.find((backup) => (
      statusToken(backup.status) === 'verified'
      && backup.purpose === 'lifecycle'
      && backup.lifecycleEligible === true
    ));
    return recordId(verified);
  });
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(() => Boolean(preview.expiresAt && new Date(preview.expiresAt).getTime() <= Date.now()));
  const verifiedBackups = backups.filter((backup) => (
    statusToken(backup.status) === 'verified'
    && backup.purpose === 'lifecycle'
    && backup.lifecycleEligible === true
  ));
  const isBlocked = Boolean(preview.blockers?.length);
  const backupReady = !preview.requiresBackup || Boolean(backupId);
  const ready = password.length > 0 && confirmation === phrase && backupReady && !isBlocked && !busy && !expired;

  useEffect(() => {
    if (!preview.expiresAt) return;
    const remaining = new Date(preview.expiresAt).getTime() - Date.now();
    const expire = () => {
      setPassword('');
      setConfirmation('');
      setExpired(true);
    };
    if (remaining <= 0) {
      expire();
      return;
    }
    const timer = window.setTimeout(expire, remaining);
    return () => window.clearTimeout(timer);
  }, [preview.expiresAt]);

  useEffect(() => {
    if (backupId && !verifiedBackups.some((backup) => recordId(backup) === backupId)) setBackupId('');
  }, [backupId, verifiedBackups]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    onBusyChange(true);
    try {
      await onConfirm({
        password,
        phrase: confirmation,
        ...(backupId ? { backupId } : {}),
        idempotencyKey: createIdempotencyKey('system-execution'),
      });
      setPassword('');
      setConfirmation('');
    } catch (error) {
      setPassword('');
      setConfirmation('');
      onError(apiError(error));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  return (
    <form className={`sm-confirmation${danger ? ' sm-confirmation--danger' : ''}`} onSubmit={submit}>
      <div className="sm-confirmation-header">
        <LockKeyhole size={20} aria-hidden />
        <div><strong>Reauthenticate to execute</strong><p>The server will reject expired or changed previews.</p></div>
      </div>
      {preview.requiresBackup ? (
        <label className="sm-field">
          <span>Verified backup</span>
          <select value={backupId} onChange={(event) => setBackupId(event.target.value)} disabled={busy}>
            <option value="">Select a verified lifecycle backup</option>
            {verifiedBackups.map((backup) => (
              <option key={recordId(backup)} value={recordId(backup)}>
                {formatDate(backup.verifiedAt || backup.downloadVerifiedAt || backup.createdAt)} · {titleCase(backup.status)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="sm-field">
        <span>Current administrator password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
        />
      </label>
      <label className="sm-field">
        <span>Type <code>{phrase}</code> exactly</span>
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={busy}
        />
      </label>
      <button type="submit" className={danger ? 'sm-button sm-button--danger' : 'sm-button sm-button--primary'} disabled={!ready}>
        {busy ? <LoaderCircle className="sm-spin" size={17} aria-hidden /> : <ShieldCheck size={17} aria-hidden />}
        {busy ? 'Executing securely…' : buttonLabel}
      </button>
      {expired ? <p className="sm-field-error" role="alert">This preview expired. Sensitive confirmation fields were cleared; create a new preview.</p> : null}
    </form>
  );
}

function DemoResetModal({
  preview,
  onClose,
  onBusyChange,
  onConfirm,
  onError,
}: {
  preview: SystemOperation;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  onConfirm: (input: { password: string; phrase: string; idempotencyKey: string }) => Promise<void>;
  onError: (error: ErrorState) => void;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(() => Boolean(
    preview.expiresAt && new Date(preview.expiresAt).getTime() <= Date.now(),
  ));
  const removableCounts = countRows(preview.counts).filter((entry) => (
    entry.value > 0 && !['users', 'unresolvedAssets'].includes(entry.key)
  ));
  const ready = Boolean(
    password
    && confirmation === DEMO_RESET_CONFIRMATION_PHRASE
    && !busy
    && !expired
    && !preview.blockers?.length,
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [busy, onClose]);

  useEffect(() => {
    if (!preview.expiresAt) return;
    const remaining = new Date(preview.expiresAt).getTime() - Date.now();
    const expire = () => {
      setPassword('');
      setConfirmation('');
      setExpired(true);
    };
    if (remaining <= 0) {
      expire();
      return;
    }
    const timer = window.setTimeout(expire, remaining);
    return () => window.clearTimeout(timer);
  }, [preview.expiresAt]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    onBusyChange(true);
    try {
      await onConfirm({
        password,
        phrase: confirmation,
        idempotencyKey: createIdempotencyKey('demo-reset'),
      });
      setPassword('');
      setConfirmation('');
    } catch (error) {
      setPassword('');
      setConfirmation('');
      onError(apiError(error));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  return (
    <div className="sm-modal-backdrop" role="presentation">
      <section className="sm-modal" role="dialog" aria-modal="true" aria-labelledby="demo-reset-title">
        <header className="sm-modal-header">
          <div><span className="sm-kicker">Development / Demo only</span><h3 id="demo-reset-title">Reset Demo Environment?</h3></div>
          <button type="button" className="sm-icon-button" onClick={onClose} disabled={busy} aria-label="Close reset confirmation"><X size={18} aria-hidden /></button>
        </header>
        <p>This will permanently remove all current testing, customer, staff, booking, financial, tracking, QC, notification, and demo operational data. The protected Administrator and core AutoSPF+ configuration will remain.</p>

        {removableCounts.length ? (
          <div className="sm-reset-counts" aria-label="Server preview counts">
            {removableCounts.map((count) => <span key={count.key}><strong>{count.value}</strong>{count.label}</span>)}
          </div>
        ) : <div className="sm-callout sm-callout--info"><strong>No operational records are currently present.</strong><p>The reset will still normalize inventory and derived counters.</p></div>}

        <div className="sm-reset-summary">
          <div><strong>Will be removed</strong><ul><li>Customers</li><li>Sales, QC, Office Admin, and other non-protected accounts</li><li>Vehicles</li><li>Bookings and appointments</li><li>Transactions and payment proofs</li><li>Tracking and QC history</li><li>Notifications, rewards, chat, AI, and demo activity</li><li>Demo procurement and inventory history</li></ul></div>
          <div><strong>Will remain</strong><ul><li>Protected Administrator</li><li>Services and pricing</li><li>Inventory product definitions</li><li>Suppliers</li><li>Roles and permissions</li><li>Branding and workflows</li><li>Core settings and System Management audits</li></ul></div>
        </div>

        {preview.warnings?.length ? <div className="sm-callout sm-callout--warning"><strong>External cleanup notice</strong><ul>{preview.warnings.map((warning, index) => <li key={`${issueText(warning)}-${index}`}>{issueText(warning)}</li>)}</ul></div> : null}
        <form className="sm-modal-form" onSubmit={submit}>
          <label className="sm-field">
            <span>Current administrator password</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} autoFocus />
          </label>
          <label className="sm-field">
            <span>Type <code>{DEMO_RESET_CONFIRMATION_PHRASE}</code> exactly</span>
            <input type="text" autoComplete="off" spellCheck={false} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} />
          </label>
          {expired ? <p className="sm-field-error" role="alert">This preview expired. Close this dialog and create a new reset preview.</p> : null}
          <div className="sm-modal-actions">
            <button type="button" className="sm-button sm-button--secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="sm-button sm-button--danger" disabled={!ready}>
              {busy ? <LoaderCircle className="sm-spin" size={17} aria-hidden /> : <Trash2 size={17} aria-hidden />}
              {busy ? 'Resetting securely…' : 'Reset and Start Fresh'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Receipt({ operation, onRetry, retrying }: {
  operation: SystemOperation;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const receipt = operation.receipt || {};
  return (
    <article className="sm-receipt">
      <div className="sm-receipt-icon"><CheckCircle2 size={22} aria-hidden /></div>
      <div className="sm-receipt-content">
        <div className="sm-preview-heading">
          <div><span className="sm-kicker">Immutable operation receipt</span><h3>{titleCase(operation.operationType || operation.type || operation.action || operation.kind || 'System operation')}</h3></div>
          <span className={`sm-status sm-status--${statusToken(operation.status)}`}>{titleCase(operation.status)}</span>
        </div>
        <dl>
          <div><dt>Operation ID</dt><dd>{recordId(operation) || 'Pending receipt ID'}</dd></div>
          <div><dt>Completed</dt><dd>{formatDate(operation.completedAt || operation.createdAt)}</dd></div>
          {Object.entries(receipt).slice(0, 8).map(([key, value]) => (
            <div key={key}><dt>{titleCase(key)}</dt><dd>{receiptValueText(value)}</dd></div>
          ))}
        </dl>
        {operation.warnings?.length ? <div className="sm-callout sm-callout--warning"><strong>Completed with warnings</strong><ul>{operation.warnings.map((warning, index) => <li key={`${issueText(warning)}-${index}`}>{issueText(warning)}</li>)}</ul></div> : null}
        {onRetry ? (
          <button type="button" className="sm-button sm-button--secondary" onClick={onRetry} disabled={retrying}>
            <RotateCcw size={16} className={retrying ? 'sm-spin' : undefined} aria-hidden />
            {retrying ? 'Retrying cleanup…' : 'Retry external cleanup'}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function SystemManagementPageContent({ currentUser, users = [], inventory = [], onOperationalDataChanged, onExecutionBusyChange }: Props) {
  const [activeSection, setActiveSection] = useState<SectionId>('overview');
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [backups, setBackups] = useState<SystemBackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [criticalBusy, setCriticalBusy] = useState(false);
  const [pageError, setPageError] = useState<ErrorState | null>(null);
  const [operationError, setOperationError] = useState<ErrorState | null>(null);
  const [receipt, setReceipt] = useState<SystemOperation | null>(null);
  const [retryingReceipt, setRetryingReceipt] = useState(false);
  const loadRequestId = useRef(0);

  const setExecutionBusy = useCallback((busy: boolean) => {
    setCriticalBusy(busy);
    onExecutionBusyChange?.(busy);
  }, [onExecutionBusyChange]);

  useEffect(() => {
    if (!criticalBusy) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [criticalBusy]);

  useEffect(() => () => onExecutionBusyChange?.(false), [onExecutionBusyChange]);
  useEffect(() => () => { loadRequestId.current += 1; }, []);

  const capabilities = overview?.capabilities || EMPTY_CAPABILITIES;
  const state = overview?.state;
  const currentUserId = primitiveText(currentUser?._id ?? currentUser?.id, '');
  const protectedId = primitiveText(state?.protectedAdministratorId ?? state?.protectedAdministrator?.id, '');
  const isProtected = Boolean(currentUserId && protectedId && currentUserId === protectedId);
  const hasProtectedCapabilities = isProtected || capabilities.protectedAdministrator === true;

  const loadOverview = useCallback(async (quiet = false) => {
    const requestId = ++loadRequestId.current;
    if (!quiet) setLoading(true);
    setPageError(null);
    try {
      const { nextOverview, nextBackups } = await withDeadline((async () => {
        const loadedOverview = await SystemService.getOverview();
        // Office Admin is intentionally limited to overview + sanitized export.
        // Do not probe the protected backup-list endpoint and surface a misleading
        // authorization toast while rendering that legitimate read-only view.
        const loadedBackups = loadedOverview.capabilities.createBackup
          ? await SystemService.listBackups().catch(() => [])
          : loadedOverview.latestBackup ? [loadedOverview.latestBackup] : [];
        return { nextOverview: loadedOverview, nextBackups: loadedBackups };
      })());
      if (requestId !== loadRequestId.current) return;
      setOverview(nextOverview);
      setBackups(nextBackups);
    } catch (error) {
      if (requestId !== loadRequestId.current) return;
      setPageError(apiError(error));
    } finally {
      if (!quiet && requestId === loadRequestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  const availableSections = useMemo(() => SECTION_DEFINITIONS.filter((section) => {
    if (section.id === 'backup') return capabilities.createBackup || capabilities.exportData;
    if (['data', 'turnover', 'danger'].includes(section.id)) return hasProtectedCapabilities;
    return !section.capability || capabilities[section.capability];
  }), [capabilities, hasProtectedCapabilities]);

  useEffect(() => {
    if (!loading && !availableSections.some((section) => section.id === activeSection)) {
      setActiveSection('overview');
    }
  }, [activeSection, availableSections, loading]);

  const navigateSection = (section: SectionId) => {
    if (criticalBusy || section === activeSection) return;
    setOperationError(null);
    setReceipt(null);
    setActiveSection(section);
  };

  const finishOperation = useCallback(async (operation: SystemOperation, operationalDataChanged = false) => {
    setReceipt(operation);
    setOperationError(null);
    if (operationalDataChanged && onOperationalDataChanged) await onOperationalDataChanged();
    await loadOverview(true);
  }, [loadOverview, onOperationalDataChanged]);

  const retryReceipt = async () => {
    const id = recordId(receipt);
    if (!id) return;
    setRetryingReceipt(true);
    setOperationError(null);
    try {
      setReceipt(await SystemService.retryOperation(id));
      await loadOverview(true);
    } catch (error) {
      setOperationError(apiError(error));
    } finally {
      setRetryingReceipt(false);
    }
  };

  if (loading) {
    return <div className="sm-loading" role="status"><LoaderCircle className="sm-spin" size={24} aria-hidden /><span>Loading protected system state…</span></div>;
  }

  if (pageError?.status === 403) {
    return (
      <div className="system-management-page ah-page-enter">
        <div className="sm-empty" role="alert">
          <LockKeyhole size={24} aria-hidden />
          <strong>System Management access is not available.</strong>
          <p>Your current role or protected-administrator capability does not permit this view.</p>
          <button type="button" className="sm-button sm-button--secondary" onClick={() => void loadOverview()}>Retry</button>
        </div>
      </div>
    );
  }

  if (pageError || !overview || !state) {
    return <div className="system-management-page"><ErrorNotice error={pageError || { message: 'System state is unavailable.' }} onRetry={() => void loadOverview()} /></div>;
  }

  const stateMode = primitiveText(state.mode, 'development');
  const lifecyclePhase = primitiveText(state.decommissioningPhase ?? state.phase, stateMode === 'archived' ? 'archived' : 'none');

  return (
    <div className="system-management-page ah-page-enter">
      <header className="sm-page-header">
        <div>
          <span className="sm-eyebrow"><ShieldCheck size={14} aria-hidden /> Protected workspace</span>
          <h1>System Management</h1>
          <p>Manage lifecycle, turnover, classified operational data, and verified recovery artifacts.</p>
        </div>
        <div className="sm-header-meta">
          {isProtected ? <span className="sm-protected-badge"><KeyRound size={14} aria-hidden /> Protected Administrator</span> : null}
          <span className={`sm-mode-badge sm-mode-badge--${statusToken(stateMode)}`}>{titleCase(stateMode)}</span>
          <button type="button" className="sm-icon-button" onClick={() => void loadOverview(true)} disabled={criticalBusy} aria-label="Refresh system state"><RefreshCw size={17} aria-hidden /></button>
        </div>
      </header>

      {booleanValue(state.archived) || stateMode === 'archived' ? (
        <div className="sm-archived-banner" role="status">
          <Archive size={20} aria-hidden />
          <div><strong>AutoSPF+ is archived and read-only</strong><p>Operational mutations are disabled. Only protected recovery, inspection, and export actions remain available.</p></div>
        </div>
      ) : lifecyclePhase !== 'none' ? (
        <div className="sm-callout sm-callout--warning"><strong>Decommissioning in progress</strong><p>Registration and bookings may be disabled while active work and payments are resolved.</p></div>
      ) : null}

      {!isProtected && currentUser?.role === 'office_admin' ? (
        <div className="sm-readonly-banner"><LockKeyhole size={17} aria-hidden /><span>Office Admin access is capability-limited to system overview and sanitized export.</span></div>
      ) : null}

      <nav className="sm-section-tabs" aria-label="System Management sections">
        {availableSections.map((section) => {
          const Icon = section.icon;
          return (
            <button key={section.id} type="button" className={activeSection === section.id ? 'active' : ''} onClick={() => navigateSection(section.id)} disabled={criticalBusy}>
              <Icon size={16} aria-hidden /><span>{section.label}</span>
            </button>
          );
        })}
      </nav>

      {criticalBusy ? <div className="sm-execution-lock" role="status"><LoaderCircle className="sm-spin" size={17} aria-hidden />Secure execution in progress. Navigation is temporarily locked.</div> : null}
      {operationError ? <ErrorNotice error={operationError} /> : null}
      {receipt ? <Receipt operation={receipt} onRetry={capabilities.retryCleanup && (receipt.warnings?.length || receipt.status === 'completed_with_warnings') ? retryReceipt : undefined} retrying={retryingReceipt} /> : null}

      {activeSection === 'overview' ? (
        <OverviewSection overview={overview} onSelectOperation={setReceipt} />
      ) : null}
      {activeSection === 'data' ? (
        <DataManagementSection
          stateMode={stateMode}
          capabilities={capabilities}
          backups={backups}
          onBusyChange={setExecutionBusy}
          onError={setOperationError}
          onComplete={(operation) => finishOperation(operation, true)}
          onOverviewRefresh={() => loadOverview(true)}
        />
      ) : null}
      {activeSection === 'turnover' ? (
        <TurnoverSection
          overview={overview}
          users={users}
          inventoryFallback={inventory}
          backups={backups}
          prepareTurnoverEnabled={capabilities.prepareTurnover}
          handoverEnabled={capabilities.transferAdministrator}
          onBusyChange={setExecutionBusy}
          onError={setOperationError}
          onRefresh={() => loadOverview(true)}
          onComplete={(operation, changed) => finishOperation(operation, changed)}
        />
      ) : null}
      {activeSection === 'backup' ? (
        <BackupSection
          capabilities={capabilities}
          backups={backups}
          onBusyChange={setExecutionBusy}
          onError={setOperationError}
          onRefresh={() => loadOverview(true)}
        />
      ) : null}
      {activeSection === 'danger' ? (
        <LifecycleSection
          mode={stateMode}
          decommissioningPhase={lifecyclePhase}
          backups={backups}
          onBusyChange={setExecutionBusy}
          onError={setOperationError}
          onComplete={(operation) => finishOperation(operation, true)}
        />
      ) : null}
    </div>
  );
}

export default function SystemManagementPage(props: Props) {
  return (
    <SystemManagementRenderBoundary>
      <SystemManagementPageContent {...props} />
    </SystemManagementRenderBoundary>
  );
}

function OverviewSection({ overview, onSelectOperation }: { overview: SystemOverview; onSelectOperation: (operation: SystemOperation) => void }) {
  const { state, classificationSummary, counts, latestBackup, operations } = overview;
  const protectedAdmin = state.protectedAdministrator;
  const lifecyclePhase = primitiveText(state.decommissioningPhase ?? state.phase, 'none');
  const registrationEnabled = booleanValue(state.registrationEnabled);
  const bookingsEnabled = booleanValue(state.bookingsEnabled ?? state.bookingEnabled);
  const protectedAdministrator = primitiveText(
    protectedAdmin?.name ?? protectedAdmin?.email ?? state.protectedAdministratorId,
    'Not assigned',
  );
  const metrics = [
    { label: 'Operational epoch', value: finiteNumber(state.operationalDataEpoch) },
    { label: 'Unclassified roots', value: finiteNumber(classificationSummary?.unclassified) },
    { label: 'Demo roots', value: finiteNumber(classificationSummary?.demo) },
    { label: 'System revision', value: finiteNumber(state.revision) },
  ];
  const preservedCounts = countRows(counts);
  return (
    <section className="sm-section" aria-labelledby="system-overview-title">
      <div className="sm-section-heading"><div><span className="sm-kicker">Authoritative state</span><h2 id="system-overview-title">System Overview</h2></div></div>
      <div className="sm-metric-grid">{metrics.map((metric) => <article key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></article>)}</div>
      <div className="sm-two-column">
        <article className="sm-card">
          <div className="sm-card-heading"><ShieldCheck size={19} aria-hidden /><div><h3>Lifecycle gates</h3><p>Enforced by the backend for every client.</p></div></div>
          <dl className="sm-detail-list">
            <div><dt>Mode</dt><dd>{titleCase(state.mode)}</dd></div>
            <div><dt>Decommissioning</dt><dd>{titleCase(lifecyclePhase)}</dd></div>
            <div><dt>Registration</dt><dd>{registrationEnabled ? 'Enabled' : 'Blocked'}</dd></div>
            <div><dt>Bookings</dt><dd>{bookingsEnabled ? 'Enabled' : 'Blocked'}</dd></div>
            <div><dt>Protected administrator</dt><dd>{protectedAdministrator}</dd></div>
          </dl>
        </article>
        <article className="sm-card">
          <div className="sm-card-heading"><DatabaseBackup size={19} aria-hidden /><div><h3>Recovery readiness</h3><p>Only downloaded and checksum-acknowledged backups qualify.</p></div></div>
          {latestBackup ? (
            <dl className="sm-detail-list">
              <div><dt>Status</dt><dd>{titleCase(latestBackup.status)}</dd></div>
              <div><dt>Created</dt><dd>{formatDate(latestBackup.createdAt)}</dd></div>
              <div><dt>Verified</dt><dd>{formatDate(latestBackup.verifiedAt || latestBackup.downloadVerifiedAt)}</dd></div>
              <div><dt>Fingerprint</dt><dd className="sm-mono">{primitiveText(latestBackup.dataFingerprint)}</dd></div>
            </dl>
          ) : <EmptyState title="No verified backup" detail="Create and verify an encrypted archive before destructive lifecycle work." />}
        </article>
      </div>
      {preservedCounts.length ? (
        <article className="sm-card"><div className="sm-card-heading"><HardDrive size={19} aria-hidden /><div><h3>Preserved system counts</h3><p>Current server-side inventory of configured and operational records.</p></div></div><div className="sm-count-grid">{preservedCounts.map((count) => <div key={count.key}><span>{count.label}</span><strong>{count.value}</strong></div>)}</div></article>
      ) : null}
      <article className="sm-card">
        <div className="sm-card-heading"><History size={19} aria-hidden /><div><h3>Recent protected operations</h3><p>Select an entry to inspect its immutable receipt.</p></div></div>
        {operations?.length ? (
          <div className="sm-operation-list">{operations.map((operation) => <button key={recordId(operation) || `${primitiveText(operation.type)}-${formatDate(operation.createdAt)}`} type="button" onClick={() => onSelectOperation(operation)}><span><strong>{titleCase(operation.operationType || operation.type || operation.action || operation.kind)}</strong><small>{formatDate(operation.createdAt)}</small></span><span className={`sm-status sm-status--${statusToken(operation.status)}`}>{titleCase(operation.status)}</span><ArrowRight size={16} aria-hidden /></button>)}</div>
        ) : <EmptyState title="No protected operations yet" detail="Previews, backups, turnover, and lifecycle receipts will appear here." />}
      </article>
    </section>
  );
}

function DataManagementSection({
  stateMode,
  capabilities,
  backups,
  onBusyChange,
  onError,
  onComplete,
  onOverviewRefresh,
}: {
  stateMode: string;
  capabilities: SystemCapabilities;
  backups: SystemBackupRecord[];
  onBusyChange: (busy: boolean) => void;
  onError: (error: ErrorState | null) => void;
  onComplete: (operation: SystemOperation) => Promise<void>;
  onOverviewRefresh: () => Promise<void> | void;
}) {
  const [classification, setClassification] = useState<{ items: ClassificationItem[]; pagination: any; summary: any } | null>(null);
  const [classificationLoading, setClassificationLoading] = useState(true);
  const [environmentFilter, setEnvironmentFilter] = useState<DataEnvironment | 'all'>('unclassified');
  const [collectionFilter, setCollectionFilter] = useState('orders');
  const [classificationPage, setClassificationPage] = useState(1);
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());
  const [staffCleanupIds, setStaffCleanupIds] = useState<Set<string>>(new Set());
  const [batchEnvironment, setBatchEnvironment] = useState<DataEnvironment>('demo');
  const [savingClassification, setSavingClassification] = useState(false);
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [archiveReferencedStaff, setArchiveReferencedStaff] = useState(false);
  const [skipBackup, setSkipBackup] = useState(false);
  const [preview, setPreview] = useState<SystemOperation | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [demoResetPreview, setDemoResetPreview] = useState<SystemOperation | null>(null);
  const [demoResetPreviewing, setDemoResetPreviewing] = useState(false);

  const loadClassification = useCallback(async () => {
    setClassificationLoading(true);
    try {
      setClassification(await SystemService.getClassification({ page: classificationPage, limit: 25, environment: environmentFilter, collection: collectionFilter || undefined }));
    } catch (error) {
      onError(apiError(error));
    } finally {
      setClassificationLoading(false);
    }
  }, [classificationPage, collectionFilter, environmentFilter, onError]);

  useEffect(() => { void loadClassification(); }, [loadClassification]);
  useEffect(() => { setClassificationPage(1); setSelectedRecords(new Set()); }, [environmentFilter, collectionFilter]);

  const itemKey = (item: ClassificationItem) => `${primitiveText(item.collection, 'unknown')}:${primitiveText(item.documentId, 'unknown')}`;
  const collectionOptions = ['orders', 'customers', 'staff', 'vehicles', 'notifications', 'activity', 'ai_scans', 'ai_requests', 'chat_conversations', 'chat_sessions', 'supplier_orders', 'inventory_transactions'];
  const safeOnly = Array.from(categories).every((category) => ['notifications', 'rewards', 'activity'].includes(category));
  const staffSelectionReady = !categories.has('staff') || staffCleanupIds.size > 0;

  const saveClassification = async () => {
    const items = (classification?.items || []).filter((item) => selectedRecords.has(itemKey(item)));
    if (!items.length) return;
    setSavingClassification(true);
    onError(null);
    try {
      await SystemService.updateClassification(items.map((item) => ({ collection: item.collection, documentId: item.documentId, dataEnvironment: batchEnvironment })));
      setSelectedRecords(new Set());
      toast.success(`${items.length} record${items.length === 1 ? '' : 's'} classified`);
      await Promise.all([loadClassification(), onOverviewRefresh()]);
    } catch (error) {
      onError(apiError(error));
    } finally {
      setSavingClassification(false);
    }
  };

  const createPreview = async () => {
    if (!categories.size) return;
    setPreviewing(true);
    setPreview(null);
    onError(null);
    try {
      setPreview(await SystemService.createCleanupPreview({
        categories: Array.from(categories),
        operationType: 'clear_demo_data',
        selection: categories.has('staff') && staffCleanupIds.size ? { staff: Array.from(staffCleanupIds) } : undefined,
        staffFallback: categories.has('staff') && archiveReferencedStaff ? 'archive' : undefined,
        skipBackup: skipBackup && safeOnly,
      }));
    } catch (error) {
      onError(apiError(error));
    } finally {
      setPreviewing(false);
    }
  };

  const createDemoResetPreview = async () => {
    setDemoResetPreviewing(true);
    setDemoResetPreview(null);
    onError(null);
    try {
      setDemoResetPreview(await SystemService.createDemoResetPreview());
    } catch (error) {
      onError(apiError(error));
    } finally {
      setDemoResetPreviewing(false);
    }
  };

  return (
    <section className="sm-section" aria-labelledby="data-management-title">
      <div className="sm-section-heading"><div><span className="sm-kicker">Operational reset and reviewed cleanup</span><h2 id="data-management-title">Data Management</h2><p>Start from a fresh Development/Demo environment, or classify records for selective cleanup. Unknown data is never selected automatically by the selective workflow.</p></div></div>
      <article className="sm-card sm-fresh-demo-card">
        <div className="sm-card-heading"><RotateCcw size={19} aria-hidden /><div><h3>Fresh Demo Environment</h3><p>Return AutoSPF+ to a clean testing state while preserving system configuration.</p></div></div>
        <p className="sm-card-copy">This server-owned reset removes all non-protected accounts and operational testing data in one transaction. It does not require classification or category selection.</p>
        {['development', 'demo'].includes(stateMode) && capabilities.resetDemoEnvironment ? (
          <button type="button" className="sm-button sm-button--danger" onClick={() => void createDemoResetPreview()} disabled={demoResetPreviewing}>
            {demoResetPreviewing ? <LoaderCircle className="sm-spin" size={16} aria-hidden /> : <Trash2 size={16} aria-hidden />}
            {demoResetPreviewing ? 'Preparing authoritative preview…' : 'Reset Demo Environment'}
          </button>
        ) : (
          <div className="sm-callout sm-callout--warning"><strong>Reset Demo Environment is unavailable in {titleCase(stateMode)} mode.</strong><p>Production cannot be reset. Leave Production through the existing audited lifecycle workflow first.</p></div>
        )}
      </article>
      <article className="sm-card">
        <div className="sm-card-heading"><FileCheck2 size={19} aria-hidden /><div><h3>Operational data classifier</h3><p>Existing records remain unclassified until an administrator reviews them.</p></div></div>
        {!capabilities.manageClassification ? <div className="sm-callout sm-callout--warning"><strong>Classification is read-only in {titleCase(stateMode)} mode.</strong><p>Reviewed classification changes are available only in Development or Demo mode.</p></div> : null}
        <div className="sm-toolbar">
          <label><span>Environment</span><select value={environmentFilter} onChange={(event) => setEnvironmentFilter(event.target.value as DataEnvironment | 'all')}><option value="unclassified">Unclassified</option><option value="demo">Demo</option><option value="production">Production</option><option value="all">All</option></select></label>
          <label><span>Collection</span><select value={collectionFilter} onChange={(event) => setCollectionFilter(event.target.value)}>{collectionOptions.map((collection) => <option key={collection} value={collection}>{titleCase(collection)}</option>)}</select></label>
          <button type="button" className="sm-button sm-button--secondary" onClick={() => void loadClassification()} disabled={classificationLoading}><RefreshCw size={15} className={classificationLoading ? 'sm-spin' : undefined} aria-hidden />Refresh</button>
        </div>
        {classificationLoading ? <div className="sm-inline-loading"><LoaderCircle className="sm-spin" size={18} aria-hidden />Loading classified roots…</div> : classification?.items.length ? (
          <>
            <div className="sm-table-wrap"><table className="sm-table"><thead><tr><th><input type="checkbox" aria-label="Select this page" disabled={!capabilities.manageClassification} checked={classification.items.length > 0 && classification.items.every((item) => selectedRecords.has(itemKey(item)))} onChange={(event) => setSelectedRecords(event.target.checked ? new Set(classification.items.map(itemKey)) : new Set())} /></th><th>Record</th><th>Collection</th><th>Environment</th><th>Reviewed</th></tr></thead><tbody>{classification.items.map((item) => { const itemLabel = primitiveText(item.label ?? item.documentId, 'Unnamed record'); const documentId = primitiveText(item.documentId, 'Unknown ID'); const environment = primitiveText(item.dataEnvironment, 'unclassified'); return <tr key={itemKey(item)}><td><input type="checkbox" aria-label={`Select ${itemLabel}`} disabled={!capabilities.manageClassification} checked={selectedRecords.has(itemKey(item))} onChange={(event) => setSelectedRecords((current) => { const next = new Set(current); if (event.target.checked) next.add(itemKey(item)); else next.delete(itemKey(item)); return next; })} /></td><td><strong>{itemLabel}</strong><small className="sm-mono">{documentId}</small></td><td>{titleCase(item.collection)}</td><td><span className={`sm-env sm-env--${statusToken(environment, 'unclassified')}`}>{titleCase(environment)}</span></td><td>{item.classifiedAt ? formatDate(item.classifiedAt) : 'Pending review'}</td></tr>; })}</tbody></table></div>
            <div className="sm-table-footer">
              <div className="sm-batch">
                <span>{selectedRecords.size} selected</span>
                <select value={batchEnvironment} disabled={!capabilities.manageClassification} onChange={(event) => setBatchEnvironment(event.target.value as DataEnvironment)}><option value="demo">Mark as Demo</option><option value="production">Mark as Production</option><option value="unclassified">Return to Unclassified</option></select>
                <button type="button" className="sm-button sm-button--primary" disabled={!capabilities.manageClassification || !selectedRecords.size || savingClassification} onClick={() => void saveClassification()}>{savingClassification ? <LoaderCircle className="sm-spin" size={15} aria-hidden /> : <Check size={15} aria-hidden />}Apply reviewed classification</button>
                {collectionFilter === 'staff' && environmentFilter === 'demo' ? (
                  <button
                    type="button"
                    className="sm-button sm-button--secondary"
                    disabled={!selectedRecords.size}
                    onClick={() => {
                      const selectedStaff = (classification?.items || [])
                        .filter((item) => selectedRecords.has(itemKey(item)))
                        .map((item) => item.documentId);
                      setStaffCleanupIds((current) => new Set([...current, ...selectedStaff]));
                      setCategories((current) => new Set([...current, 'staff']));
                      setPreview(null);
                    }}
                  >
                    <Trash2 size={15} aria-hidden />Stage selected staff for cleanup
                  </button>
                ) : null}
              </div>
              <div className="sm-pagination"><button type="button" onClick={() => setClassificationPage((page) => Math.max(1, page - 1))} disabled={classificationPage <= 1}><ChevronLeft size={16} aria-hidden /></button><span>Page {classificationPage} of {totalPages(classification.pagination)}</span><button type="button" onClick={() => setClassificationPage((page) => Math.min(totalPages(classification.pagination), page + 1))} disabled={classificationPage >= totalPages(classification.pagination)}><ChevronRight size={16} aria-hidden /></button></div>
            </div>
          </>
        ) : <EmptyState title="No records match this filter" detail="Change the environment or collection filter to review other operational roots." />}
      </article>

      <article className="sm-card">
        <div className="sm-card-heading"><Trash2 size={19} aria-hidden /><div><h3>Clear Demo Data</h3><p>The backend expands every category into its required dependency closure.</p></div></div>
        {stateMode === 'production' || stateMode === 'archived' || !capabilities.clearDemoData ? <div className="sm-callout sm-callout--warning"><strong>Cleanup is disabled in {titleCase(stateMode)} mode.</strong><p>Return through the audited lifecycle workflow before preparing another demo cleanup.</p></div> : (
          <>
            <div className="sm-category-grid">{SYSTEM_CLEANUP_CATEGORIES.map((category) => <label key={category.id} className={categories.has(category.id) ? 'selected' : ''}><input type="checkbox" checked={categories.has(category.id)} onChange={(event) => { setPreview(null); setCategories((current) => { const next = new Set(current); if (event.target.checked) next.add(category.id); else next.delete(category.id); return next; }); }} /><span><strong>{category.label}</strong><small>{category.highRisk ? 'Verified backup required' : 'Independently removable when safe'}</small></span></label>)}</div>
            {categories.has('staff') ? (
              <div className="sm-callout sm-callout--warning">
                <strong>{staffCleanupIds.size ? `${staffCleanupIds.size} reviewed demo staff account${staffCleanupIds.size === 1 ? '' : 's'} staged` : 'Select demo staff in the classifier first.'}</strong>
                <p>The protected Administrator is never selectable. Referenced staff cannot be hard-deleted.</p>
                {staffCleanupIds.size ? <button type="button" className="sm-button sm-button--secondary" onClick={() => { setStaffCleanupIds(new Set()); setPreview(null); }}>Clear staged staff</button> : null}
                <label className="sm-check-row"><input type="checkbox" checked={archiveReferencedStaff} onChange={(event) => { setArchiveReferencedStaff(event.target.checked); setPreview(null); }} /><span><strong>Archive referenced staff instead</strong><small>Required when preserved operational or configuration records still reference an account.</small></span></label>
              </div>
            ) : null}
            {safeOnly && categories.size ? <label className="sm-check-row"><input type="checkbox" checked={skipBackup} onChange={(event) => setSkipBackup(event.target.checked)} /><span><strong>Explicitly skip backup for low-risk-only cleanup</strong><small>The server will still reject this if dependency expansion reaches protected categories.</small></span></label> : null}
            <button type="button" className="sm-button sm-button--primary" onClick={() => void createPreview()} disabled={!categories.size || !staffSelectionReady || previewing}>{previewing ? <LoaderCircle className="sm-spin" size={16} aria-hidden /> : <FileCheck2 size={16} aria-hidden />}{previewing ? 'Building server preview…' : 'Preview demo cleanup'}</button>
          </>
        )}
        {preview ? <><OperationSummary operation={preview} /><ConfirmationPanel key={primitiveText(preview.previewId ?? preview.planHash, 'cleanup-preview')} preview={preview} phrase="CLEAR DEMO DATA" backups={backups} buttonLabel="Clear classified demo data" danger onBusyChange={onBusyChange} onError={(error) => { if (error.code === 'PREVIEW_STALE') setPreview(null); onError(error); }} onConfirm={async (input) => { const operation = await SystemService.executeCleanup({ previewId: primitiveText(preview.previewId, ''), planHash: primitiveText(preview.planHash, ''), ...input }); setPreview(null); await onComplete(operation); }} /></> : null}
      </article>
      {demoResetPreview ? (
        <DemoResetModal
          key={primitiveText(demoResetPreview.previewId ?? demoResetPreview.planHash, 'demo-reset-preview')}
          preview={demoResetPreview}
          onClose={() => setDemoResetPreview(null)}
          onBusyChange={onBusyChange}
          onError={(error) => {
            if (['PREVIEW_STALE', 'PREVIEW_EXPIRED', 'DEMO_RESET_NOT_ALLOWED_IN_PRODUCTION'].includes(error.code || '')) {
              setDemoResetPreview(null);
            }
            onError(error);
          }}
          onConfirm={async (input) => {
            const operation = await SystemService.executeDemoReset({
              previewId: primitiveText(demoResetPreview.previewId, ''),
              planHash: primitiveText(demoResetPreview.planHash, ''),
              ...input,
            });
            setDemoResetPreview(null);
            setPreview(null);
            setSelectedRecords(new Set());
            setStaffCleanupIds(new Set());
            setCategories(new Set());
            await onComplete(operation);
            await loadClassification();
          }}
        />
      ) : null}
    </section>
  );
}

function TurnoverSection({ overview, users, inventoryFallback, backups, prepareTurnoverEnabled, handoverEnabled, onBusyChange, onError, onRefresh, onComplete }: {
  overview: SystemOverview;
  users: any[];
  inventoryFallback: any[];
  backups: SystemBackupRecord[];
  prepareTurnoverEnabled: boolean;
  handoverEnabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onError: (error: ErrorState | null) => void;
  onRefresh: () => Promise<void> | void;
  onComplete: (operation: SystemOperation, operationalDataChanged: boolean) => Promise<void>;
}) {
  const products = useMemo(() => {
    const serverProducts = overview.inventoryProducts || overview.inventory || [];
    const source = serverProducts.length ? serverProducts : inventoryFallback;
    return source.map((product: any) => ({
      ...product,
      id: primitiveText(product?.id ?? product?._id, ''),
      name: primitiveText(product?.name, 'Unnamed product'),
      sku: primitiveText(product?.sku, ''),
      inventory: finiteNumber(product?.inventory ?? product?.stock),
      reserved: finiteNumber(product?.reserved),
    })).filter((product: any) => product.id && product.isActive !== false);
  }, [inventoryFallback, overview.inventory, overview.inventoryProducts]);
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(products.map((product: any) => [product.id, String(product.inventory || 0)])));
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvReviewed, setCsvReviewed] = useState(false);
  const [turnoverPreview, setTurnoverPreview] = useState<SystemOperation | null>(null);
  const [turnoverPreviewing, setTurnoverPreviewing] = useState(false);
  const candidates = useMemo(() => {
    const provided = overview.handoverCandidates || [];
    if (overview.handoverCandidates) return provided;
    return users.filter((user) => user.role === 'office_admin' && user.isActive !== false && (user.isVerified || user.isEmailVerified || user.emailVerified));
  }, [overview.handoverCandidates, users]);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [invitationSentTo, setInvitationSentTo] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [handoverPreview, setHandoverPreview] = useState<SystemOperation | null>(null);
  const [handoverPreviewing, setHandoverPreviewing] = useState(false);
  const missingProducts = getMissingOpeningInventoryProducts(products, quantities);
  const unclassified = Number(overview.classificationSummary?.unclassified || 0);
  const invitationError = getHandoverInvitationError(inviteName, inviteEmail);

  useEffect(() => {
    setQuantities((current) => ({ ...Object.fromEntries(products.map((product: any) => [product.id, String(product.inventory || 0)])), ...current }));
  }, [products]);

  const importCsv = async (file?: File) => {
    if (!file) return;
    const parsed = parseOpeningInventoryCsv(await file.text(), products);
    setCsvErrors(parsed.errors);
    setCsvReviewed(parsed.errors.length === 0);
    if (!parsed.errors.length) setQuantities(Object.fromEntries(parsed.rows.map((row) => [row.productId, String(row.quantity)])));
  };

  const previewTurnover = async () => {
    setTurnoverPreviewing(true);
    setTurnoverPreview(null);
    onError(null);
    try {
      const openingInventory = products.map((product: any) => ({ productId: product.id, quantity: Number(quantities[product.id]) }));
      setTurnoverPreview(await SystemService.createCleanupPreview({ categories: SYSTEM_CLEANUP_CATEGORIES.map((category) => category.id), operationType: 'turnover', openingInventory }));
    } catch (error) {
      onError(apiError(error));
    } finally {
      setTurnoverPreviewing(false);
    }
  };

  const previewHandover = async () => {
    if (!targetUserId) return;
    setHandoverPreviewing(true);
    setHandoverPreview(null);
    onError(null);
    try {
      setHandoverPreview(await SystemService.createHandoverPreview(targetUserId));
    } catch (error) {
      onError(apiError(error));
    } finally {
      setHandoverPreviewing(false);
    }
  };

  const inviteClientAdministrator = async () => {
    if (invitationError) return;
    setInviting(true);
    setInvitationSentTo('');
    onError(null);
    try {
      const invitation = await SystemService.inviteHandoverCandidate({
        name: inviteName.trim().replace(/\s+/g, ' '),
        email: inviteEmail.trim().toLowerCase(),
      });
      setInvitationSentTo(primitiveText(invitation.target?.email, ''));
      setInviteName('');
      setInviteEmail('');
      toast.success('Secure password setup email sent.');
      await onRefresh();
    } catch (error) {
      onError(apiError(error));
    } finally {
      setInviting(false);
    }
  };

  return (
    <section className="sm-section" aria-labelledby="turnover-title">
      <div className="sm-section-heading"><div><span className="sm-kicker">Ownership-ready production data</span><h2 id="turnover-title">Client Turnover</h2><p>Prepare a clean operational baseline, then transfer protected ownership to a verified client administrator.</p></div></div>
      <article className="sm-card">
        <div className="sm-card-heading"><HardDrive size={19} aria-hidden /><div><h3>1. Opening inventory baseline</h3><p>Every active product needs a reviewed whole-number quantity.</p></div></div>
        {!prepareTurnoverEnabled ? <div className="sm-callout sm-callout--warning"><strong>Turnover preparation is unavailable in {titleCase(overview.state.mode)} mode.</strong><p>The inventory baseline remains visible for inspection, but cleanup cannot be previewed.</p></div> : null}
        {unclassified > 0 ? <div className="sm-callout sm-callout--danger"><strong>{unclassified} operational root{unclassified === 1 ? ' is' : 's are'} still unclassified.</strong><p>Complete classification in Data Management before turnover.</p></div> : null}
        <div className="sm-inventory-toolbar"><label className="sm-file-button"><Upload size={16} aria-hidden /><span>Import CSV</span><input type="file" accept=".csv,text/csv" onChange={(event) => void importCsv(event.target.files?.[0])} /></label><small>Headers: <code>productId,quantity</code> or <code>sku,quantity</code></small>{csvReviewed ? <span className="sm-inline-success"><Check size={14} aria-hidden /> CSV reviewed</span> : null}</div>
        {csvErrors.length ? <div className="sm-callout sm-callout--danger"><strong>CSV review failed</strong><ul>{csvErrors.slice(0, 8).map((error) => <li key={error}>{error}</li>)}</ul></div> : null}
        {products.length ? <div className="sm-inventory-grid">{products.map((product: any) => <label key={product.id}><span><strong>{product.name}</strong><small>{product.sku || product.id}{product.reserved > 0 ? ` · ${product.reserved} reserved minimum` : ''}</small></span><input type="number" min={product.reserved || 0} step="1" inputMode="numeric" value={quantities[product.id] ?? ''} onChange={(event) => { setTurnoverPreview(null); setQuantities((current) => ({ ...current, [product.id]: event.target.value })); }} aria-label={`Opening quantity for ${product.name}`} /></label>)}</div> : <EmptyState title="No active products" detail="Turnover requires at least one server-provided active inventory product." />}
        <button type="button" className="sm-button sm-button--primary" onClick={() => void previewTurnover()} disabled={!prepareTurnoverEnabled || unclassified > 0 || missingProducts.length > 0 || !products.length || turnoverPreviewing}>{turnoverPreviewing ? <LoaderCircle className="sm-spin" size={16} aria-hidden /> : <FileCheck2 size={16} aria-hidden />}{turnoverPreviewing ? 'Validating turnover…' : 'Preview client turnover'}</button>
        {missingProducts.length ? <p className="sm-field-error">Enter a valid quantity for all {missingProducts.length} remaining product{missingProducts.length === 1 ? '' : 's'}.</p> : null}
        {turnoverPreview ? <><OperationSummary operation={turnoverPreview} /><ConfirmationPanel key={primitiveText(turnoverPreview.previewId ?? turnoverPreview.planHash, 'turnover-preview')} preview={turnoverPreview} phrase="PREPARE AUTOSPF" backups={backups} buttonLabel="Prepare AutoSPF+ for client" danger onBusyChange={onBusyChange} onError={(error) => { if (error.code === 'PREVIEW_STALE') setTurnoverPreview(null); onError(error); }} onConfirm={async (input) => { const operation = await SystemService.executeCleanup({ previewId: primitiveText(turnoverPreview.previewId, ''), planHash: primitiveText(turnoverPreview.planHash, ''), ...input }); setTurnoverPreview(null); await onComplete(operation, true); }} /></> : null}
      </article>

      <article className="sm-card">
        <div className="sm-card-heading"><UserRoundCog size={19} aria-hidden /><div><h3>2. Transfer protected administrator</h3><p>The target must be an active, verified Office Admin who completed password and OTP sign-in.</p></div></div>
        {!handoverEnabled ? <div className="sm-callout sm-callout--warning"><strong>Ownership transfer is not available to this account.</strong></div> : (
          <>
            <div className="sm-callout sm-callout--info">
              <strong>Invite a new client Office Admin</strong>
              <p>The setup link creates their password without signing them in. They must then complete the normal password-plus-OTP login before becoming eligible below.</p>
              <div className="sm-inline-form">
                <label className="sm-field"><span>Full name</span><input type="text" autoComplete="name" maxLength={80} value={inviteName} onChange={(event) => { setInviteName(event.target.value); setInvitationSentTo(''); }} /></label>
                <label className="sm-field"><span>Email address</span><input type="email" autoComplete="email" maxLength={254} value={inviteEmail} onChange={(event) => { setInviteEmail(event.target.value); setInvitationSentTo(''); }} /></label>
                <button type="button" className="sm-button sm-button--secondary" onClick={() => void inviteClientAdministrator()} disabled={Boolean(invitationError) || inviting}>{inviting ? <LoaderCircle className="sm-spin" size={16} aria-hidden /> : <UserRoundCog size={16} aria-hidden />}{inviting ? 'Sending secure invite…' : 'Send setup email'}</button>
              </div>
              {(inviteName || inviteEmail) && invitationError ? <p className="sm-field-error">{invitationError}</p> : null}
              {invitationSentTo ? <p className="sm-inline-success"><Check size={14} aria-hidden /> Setup email sent to {invitationSentTo}. It will appear as eligible only after password-plus-OTP sign-in.</p> : null}
            </div>

            {candidates.length ? <div className="sm-inline-form"><label className="sm-field"><span>Eligible client administrator</span><select value={targetUserId} onChange={(event) => { setTargetUserId(event.target.value); setHandoverPreview(null); }}><option value="">Choose an Office Admin</option>{candidates.map((candidate: any) => { const id = recordId(candidate); const name = primitiveText(candidate?.name, 'Unnamed Office Admin'); const email = primitiveText(candidate?.email, 'Email unavailable'); return <option key={id} value={id}>{name} · {email}</option>; })}</select></label><button type="button" className="sm-button sm-button--primary" onClick={() => void previewHandover()} disabled={!targetUserId || handoverPreviewing}>{handoverPreviewing ? <LoaderCircle className="sm-spin" size={16} aria-hidden /> : <FileCheck2 size={16} aria-hidden />}Preview ownership transfer</button></div> : <EmptyState title="No eligible client administrator" detail="Invite an Office Admin, then have them finish password setup and a password-plus-OTP sign-in." />}
          </>
        )}
        {handoverPreview ? <><OperationSummary operation={handoverPreview} /><ConfirmationPanel key={primitiveText(handoverPreview.previewId ?? handoverPreview.planHash, 'handover-preview')} preview={handoverPreview} phrase="TRANSFER AUTOSPF ADMIN" backups={backups} buttonLabel="Transfer protected ownership" danger onBusyChange={onBusyChange} onError={(error) => { if (error.code === 'PREVIEW_STALE') setHandoverPreview(null); onError(error); }} onConfirm={async (input) => { const operation = await SystemService.executeHandover({ previewId: primitiveText(handoverPreview.previewId, ''), planHash: primitiveText(handoverPreview.planHash, ''), ...input }); setHandoverPreview(null); await onComplete(operation, false); }} /></> : null}
      </article>
    </section>
  );
}

function BackupSection({ capabilities, backups, onBusyChange, onError, onRefresh }: {
  capabilities: SystemCapabilities;
  backups: SystemBackupRecord[];
  onBusyChange: (busy: boolean) => void;
  onError: (error: ErrorState | null) => void;
  onRefresh: () => Promise<void> | void;
}) {
  const [passphrase, setPassphrase] = useState('');
  const [passphraseAgain, setPassphraseAgain] = useState('');
  const [busyAction, setBusyAction] = useState<'backup' | 'export' | null>(null);
  const passphraseReady = passphrase.length >= 12 && passphrase === passphraseAgain;

  useEffect(() => () => { setPassphrase(''); setPassphraseAgain(''); }, []);

  const createBackup = async () => {
    if (!passphraseReady) return;
    setBusyAction('backup'); onBusyChange(true); onError(null);
    try {
      const artifact = await SystemService.downloadBackup(passphrase);
      const checksum = await verifySystemDownload(artifact);
      saveSystemDownload(artifact);
      if (!artifact.id) throw new Error('Backup identifier was not returned; verification cannot be acknowledged.');
      await SystemService.acknowledgeBackup(artifact.id, checksum);
      toast.success('Encrypted backup downloaded and checksum verified');
      await onRefresh();
    } catch (error) {
      onError(apiError(error));
    } finally {
      setPassphrase(''); setPassphraseAgain(''); setBusyAction(null); onBusyChange(false);
    }
  };

  const exportData = async () => {
    setBusyAction('export'); onBusyChange(true); onError(null);
    try {
      const artifact = await SystemService.downloadSanitizedExport();
      await verifySystemDownload(artifact);
      saveSystemDownload(artifact);
      toast.success('Sanitized system export downloaded and verified');
    } catch (error) {
      onError(apiError(error));
    } finally {
      setBusyAction(null); onBusyChange(false);
    }
  };

  return (
    <section className="sm-section" aria-labelledby="backup-title">
      <div className="sm-section-heading"><div><span className="sm-kicker">Verified recovery artifacts</span><h2 id="backup-title">Backup & Export</h2><p>Encrypted recovery archives and secret-free reporting exports are separate workflows.</p></div></div>
      <div className="sm-two-column">
        {capabilities.createBackup ? <article className="sm-card"><div className="sm-card-heading"><DatabaseBackup size={19} aria-hidden /><div><h3>Encrypted AutoSPF+ backup</h3><p>The passphrase is sent only for this request and is never persisted by the browser.</p></div></div><label className="sm-field"><span>Backup passphrase</span><input type="password" autoComplete="new-password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} /><small>Use at least 12 characters and store it separately.</small></label><label className="sm-field"><span>Confirm passphrase</span><input type="password" autoComplete="new-password" value={passphraseAgain} onChange={(event) => setPassphraseAgain(event.target.value)} /></label>{passphraseAgain && passphrase !== passphraseAgain ? <p className="sm-field-error">Passphrases do not match.</p> : null}<button type="button" className="sm-button sm-button--primary" onClick={() => void createBackup()} disabled={!passphraseReady || busyAction !== null}>{busyAction === 'backup' ? <LoaderCircle className="sm-spin" size={16} aria-hidden /> : <Download size={16} aria-hidden />}{busyAction === 'backup' ? 'Encrypting and verifying…' : 'Create encrypted backup'}</button></article> : null}
        {capabilities.exportData ? <article className="sm-card"><div className="sm-card-heading"><FileCheck2 size={19} aria-hidden /><div><h3>Sanitized data export</h3><p>Creates an audited JSON export without password hashes, tokens, OTPs, or environment secrets.</p></div></div><div className="sm-callout sm-callout--info"><strong>Reporting use only</strong><p>This export cannot be used as a database restore artifact.</p></div><button type="button" className="sm-button sm-button--secondary" onClick={() => void exportData()} disabled={busyAction !== null}>{busyAction === 'export' ? <LoaderCircle className="sm-spin" size={16} aria-hidden /> : <Download size={16} aria-hidden />}{busyAction === 'export' ? 'Generating verified export…' : 'Download sanitized export'}</button></article> : null}
      </div>
      <article className="sm-card"><div className="sm-card-heading"><History size={19} aria-hidden /><div><h3>Backup history</h3><p>Only verified or acknowledged downloads can satisfy destructive-action gates.</p></div></div>{backups.length ? <div className="sm-backup-list">{backups.map((backup) => <div key={recordId(backup)}><span><strong>{formatDate(backup.createdAt)}</strong><small className="sm-mono">{recordId(backup)}</small></span><span className={`sm-status sm-status--${statusToken(backup.status)}`}>{titleCase(backup.status)}</span></div>)}</div> : <EmptyState title="No backup history" detail="Protected administrators can create the first encrypted archive above." />}</article>
    </section>
  );
}

function LifecycleSection({ mode, decommissioningPhase, backups, onBusyChange, onError, onComplete }: {
  mode: string;
  decommissioningPhase: string;
  backups: SystemBackupRecord[];
  onBusyChange: (busy: boolean) => void;
  onError: (error: ErrorState | null) => void;
  onComplete: (operation: SystemOperation) => Promise<void>;
}) {
  const [preview, setPreview] = useState<SystemOperation | null>(null);
  const [action, setAction] = useState<LifecycleAction | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const actions: Array<{ id: LifecycleAction; title: string; detail: string; danger?: boolean }> = mode === 'archived'
    ? [{ id: 'restore', title: 'Restore prior mode', detail: 'Return from archived read-only state through an audited recovery action.' }]
    : [
        ...(mode === 'production' ? [{ id: 'leave_production' as const, title: 'Leave Production', detail: 'Requires a current verified backup and revokes all active sessions.' }] : [{ id: 'enter_production' as const, title: 'Enter Production', detail: 'Requires complete classification, turnover, inventory baseline, and client ownership.' }]),
        ...(decommissioningPhase === 'none' ? [{ id: 'begin_decommissioning' as const, title: 'Begin decommissioning', detail: 'Immediately blocks new registrations and bookings while active work drains.', danger: true }] : []),
        { id: 'archive' as const, title: 'Finalize archive', detail: 'Makes operations read-only and revokes every session after final readiness checks.', danger: true },
      ];

  const createPreview = async (nextAction: LifecycleAction) => {
    setAction(nextAction); setPreview(null); setPreviewing(true); onError(null);
    try {
      setPreview(await SystemService.createLifecyclePreview(nextAction));
    } catch (error) {
      onError(apiError(error));
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <section className="sm-section" aria-labelledby="danger-title">
      <div className="sm-section-heading"><div><span className="sm-kicker">Audited lifecycle controls</span><h2 id="danger-title">Danger Zone</h2><p>These state transitions preserve configuration and produce immutable receipts.</p></div></div>
      <div className="sm-lifecycle-list">{actions.map((item) => <article key={item.id} className={item.danger ? 'danger' : ''}><div><strong>{item.title}</strong><p>{item.detail}</p></div><button type="button" className={item.danger ? 'sm-button sm-button--danger-outline' : 'sm-button sm-button--secondary'} onClick={() => void createPreview(item.id)} disabled={previewing}>{previewing && action === item.id ? <LoaderCircle className="sm-spin" size={16} aria-hidden /> : <FileCheck2 size={16} aria-hidden />}Preview</button></article>)}</div>
      {preview && action ? <><OperationSummary operation={preview} /><ConfirmationPanel key={primitiveText(preview.previewId ?? preview.planHash, 'lifecycle-preview')} preview={preview} phrase={LIFECYCLE_CONFIRMATION_PHRASES[action]} backups={backups} buttonLabel={actions.find((item) => item.id === action)?.title || 'Execute lifecycle action'} danger={actions.find((item) => item.id === action)?.danger} onBusyChange={onBusyChange} onError={(error) => { if (error.code === 'PREVIEW_STALE') setPreview(null); onError(error); }} onConfirm={async (input) => { const operation = await SystemService.executeLifecycle({ previewId: primitiveText(preview.previewId, ''), planHash: primitiveText(preview.planHash, ''), ...input }); setPreview(null); await onComplete(operation); }} /></> : null}
    </section>
  );
}
