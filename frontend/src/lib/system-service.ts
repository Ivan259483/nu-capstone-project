import type { AxiosResponse } from 'axios';
import api from './api';
import { syncOperationalDataEpoch } from './operational-data-epoch';
export { syncOperationalDataEpoch } from './operational-data-epoch';

export type SystemMode = 'development' | 'demo' | 'production' | 'archived';
export type DecommissioningPhase = 'none' | 'draining' | 'ready' | 'archived' | string;
export type DataEnvironment = 'demo' | 'production' | 'unclassified';

export interface SystemStatus {
  mode: SystemMode;
  decommissioningPhase: DecommissioningPhase;
  phase?: DecommissioningPhase;
  registrationEnabled: boolean;
  bookingsEnabled: boolean;
  bookingEnabled?: boolean;
  operationalDataEpoch: number;
  revision: number;
  archived: boolean;
  updatedAt?: string;
}

export interface SystemCapabilities {
  viewOverview: boolean;
  exportData: boolean;
  manageClassification: boolean;
  clearDemoData: boolean;
  resetDemoEnvironment: boolean;
  createBackup: boolean;
  prepareTurnover: boolean;
  transferAdministrator: boolean;
  manageLifecycle: boolean;
  retryCleanup: boolean;
  protectedAdministrator?: boolean;
}

export interface SystemClassificationSummary {
  demo: number;
  production: number;
  unclassified: number;
  total?: number;
  collections?: Record<string, {
    total?: number;
    demo?: number;
    production?: number;
    unclassified?: number;
  }>;
}

export interface SystemBackupRecord {
  id?: string;
  _id?: string;
  status: string;
  checksum?: string;
  createdAt?: string;
  verifiedAt?: string;
  downloadVerifiedAt?: string;
  dataFingerprint?: string;
  purpose?: 'general' | 'lifecycle';
  lifecycleEligible?: boolean;
  assetCoverage?: {
    requested?: boolean;
    managed?: number;
    included?: number;
    managedUnresolved?: number;
    legacyUnresolved?: number;
    unresolved?: number;
    complete?: boolean;
    snapshotManifestHash?: string;
  } | string;
}

export interface SystemOperation {
  id?: string;
  _id?: string;
  previewId?: string;
  planHash?: string;
  type?: string;
  operationType?: string;
  kind?: string;
  action?: string;
  status: string;
  createdAt?: string;
  completedAt?: string;
  expiresAt?: string;
  categories?: string[];
  resolvedCategories?: string[];
  counts?: Record<string, number | Record<string, number> | null | undefined>;
  preserved?: Record<string, number> | string[];
  dependencies?: Array<string | Record<string, unknown>> | Record<string, string[]>;
  requiresBackup?: boolean;
  blockers?: Array<string | Record<string, unknown>>;
  warnings?: Array<string | Record<string, unknown>>;
  receipt?: Record<string, unknown>;
  modeBefore?: SystemMode;
  modeAfter?: SystemMode;
}

export interface SystemOverview {
  state: SystemStatus & {
    protectedAdministratorId?: string;
    protectedAdministrator?: { id?: string; name?: string; email?: string };
    [key: string]: unknown;
  };
  capabilities: SystemCapabilities;
  counts: Record<string, number | Record<string, number> | null | undefined>;
  classificationSummary: SystemClassificationSummary;
  latestBackup: SystemBackupRecord | null;
  operations: SystemOperation[];
  handoverCandidates?: Array<{
    id?: string;
    _id?: string;
    name: string;
    email: string;
    role?: string;
    verified?: boolean;
    isVerified?: boolean;
    isEmailVerified?: boolean;
    status?: string;
  }>;
  inventory?: Array<{
    id?: string;
    _id?: string;
    name: string;
    sku?: string;
    stock?: number;
    isActive?: boolean;
  }>;
  inventoryProducts?: Array<{
    id?: string;
    _id?: string;
    name: string;
    sku?: string;
    inventory?: number;
    reserved?: number;
    isActive?: boolean;
  }>;
}

export interface ClassificationItem {
  collection: string;
  documentId: string;
  label: string;
  dataEnvironment: DataEnvironment;
  classifiedAt?: string | null;
  classifiedBy?: { id?: string; name?: string } | string | null;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages?: number;
  totalPages?: number;
}

export interface ClassificationResponse {
  items: ClassificationItem[];
  pagination: PaginationInfo;
  summary: SystemClassificationSummary;
}

export const SYSTEM_CLEANUP_CATEGORIES = [
  { id: 'customers', label: 'Customers', highRisk: true },
  { id: 'staff', label: 'Selected demo staff', highRisk: true },
  { id: 'vehicles', label: 'Vehicles', highRisk: true },
  { id: 'order_bundle', label: 'Bookings & order records', highRisk: true },
  { id: 'notifications', label: 'Notifications', highRisk: false },
  { id: 'rewards', label: 'Rewards', highRisk: false },
  { id: 'activity', label: 'Demo activity, reports, AI & chat', highRisk: false },
  { id: 'procurement', label: 'Procurement history', highRisk: true },
] as const;

export type CleanupCategory = (typeof SYSTEM_CLEANUP_CATEGORIES)[number]['id'];

export interface CleanupPreviewRequest {
  categories: string[];
  selection?: Record<string, string[]>;
  staffFallback?: 'archive';
  skipBackup?: boolean;
  operationType?: 'clear_demo_data' | 'turnover';
  openingInventory?: Array<{ productId: string; quantity: number }>;
}

export interface ConfirmationEnvelope {
  previewId: string;
  planHash: string;
  backupId?: string;
  password: string;
  phrase: string;
  idempotencyKey: string;
}

export interface HandoverInvitationResult {
  operationId: string;
  accountCreated: boolean;
  setupEmailSent: boolean;
  expiresAt?: string;
  target: {
    id: string;
    name: string;
    email: string;
    role: 'office_admin';
    status: 'pending' | string;
    isVerified: boolean;
    passwordOtpSignInComplete: boolean;
  };
}

export type LifecycleAction =
  | 'enter_production'
  | 'leave_production'
  | 'begin_decommissioning'
  | 'archive'
  | 'restore';

export interface SystemDownload {
  blob: Blob;
  id?: string;
  checksum?: string;
  filename: string;
  contentType: string;
}

function unwrap<T>(response: AxiosResponse): T {
  return (response.data?.data ?? response.data) as T;
}

function headerValue(response: AxiosResponse, name: string): string | undefined {
  const value = response.headers?.[name.toLowerCase()];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function filenameFromDisposition(disposition?: string): string | undefined {
  if (!disposition) return undefined;
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) {
    try {
      return decodeURIComponent(utf8.replace(/["']/g, ''));
    } catch {
      return utf8.replace(/["']/g, '');
    }
  }
  return disposition.match(/filename="?([^";]+)"?/i)?.[1];
}

function parseDownload(response: AxiosResponse<Blob>, fallbackFilename: string): SystemDownload {
  return {
    blob: response.data,
    id: headerValue(response, 'x-autospf-backup-id') || headerValue(response, 'x-autospf-export-id'),
    checksum: headerValue(response, 'x-autospf-checksum'),
    filename: filenameFromDisposition(headerValue(response, 'content-disposition')) || fallbackFilename,
    contentType: headerValue(response, 'content-type') || response.data.type || 'application/octet-stream',
  };
}

export function normalizeChecksum(value?: string): string {
  return String(value || '').trim().toLowerCase().replace(/^sha-?256[=:]/, '');
}

export async function sha256Hex(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('This browser cannot verify backup checksums securely.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifySystemDownload(download: SystemDownload): Promise<string> {
  if (!download.checksum) throw new Error('The server did not provide a checksum.');
  const actual = await sha256Hex(download.blob);
  if (actual !== normalizeChecksum(download.checksum)) {
    throw new Error('Downloaded file checksum does not match the server receipt.');
  }
  return actual;
}

export function saveSystemDownload(download: SystemDownload): void {
  const url = URL.createObjectURL(download.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = download.filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function syncStateEpoch<T extends { operationalDataEpoch?: number }>(state: T | undefined): void {
  if (typeof state?.operationalDataEpoch === 'number') syncOperationalDataEpoch(state.operationalDataEpoch);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback = 0): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeSystemStatus<T extends Partial<SystemStatus> & {
  phase?: DecommissioningPhase;
  bookingEnabled?: boolean;
}>(status: T): T & SystemStatus {
  const mode = typeof status.mode === 'string' && ['development', 'demo', 'production', 'archived'].includes(status.mode)
    ? status.mode as SystemMode
    : 'development';
  const rawPhase = status.decommissioningPhase ?? status.phase;
  const decommissioningPhase = typeof rawPhase === 'string' && rawPhase.trim()
    ? rawPhase
    : mode === 'archived' ? 'archived' : 'none';
  return {
    ...status,
    mode,
    decommissioningPhase,
    bookingsEnabled: typeof status.bookingsEnabled === 'boolean'
      ? status.bookingsEnabled
      : typeof status.bookingEnabled === 'boolean' ? status.bookingEnabled : false,
    registrationEnabled: typeof status.registrationEnabled === 'boolean' ? status.registrationEnabled : false,
    operationalDataEpoch: finiteNumber(status.operationalDataEpoch),
    revision: finiteNumber(status.revision),
    archived: typeof status.archived === 'boolean' ? status.archived : mode === 'archived',
  };
}

function normalizeCapabilities(value: unknown): SystemCapabilities {
  const capabilities = isRecord(value) ? value : {};
  return {
    viewOverview: capabilities.viewOverview === true,
    exportData: capabilities.exportData === true,
    manageClassification: capabilities.manageClassification === true,
    clearDemoData: capabilities.clearDemoData === true,
    resetDemoEnvironment: capabilities.resetDemoEnvironment === true,
    createBackup: capabilities.createBackup === true,
    prepareTurnover: capabilities.prepareTurnover === true,
    transferAdministrator: capabilities.transferAdministrator === true,
    manageLifecycle: capabilities.manageLifecycle === true,
    retryCleanup: capabilities.retryCleanup === true,
    protectedAdministrator: capabilities.protectedAdministrator === true,
  };
}

function normalizeClassificationResponse(value: unknown): ClassificationResponse {
  const response = isRecord(value) ? value : {};
  const pagination = isRecord(response.pagination) ? response.pagination : {};
  const summary = isRecord(response.summary) ? response.summary : {};
  return {
    items: Array.isArray(response.items)
      ? response.items.filter(isRecord) as unknown as ClassificationItem[]
      : [],
    pagination: {
      page: Math.max(1, finiteNumber(pagination.page, 1)),
      limit: Math.max(1, finiteNumber(pagination.limit, 25)),
      total: Math.max(0, finiteNumber(pagination.total)),
      pages: Math.max(1, finiteNumber(pagination.pages ?? pagination.totalPages, 1)),
      totalPages: Math.max(1, finiteNumber(pagination.totalPages ?? pagination.pages, 1)),
    },
    summary: {
      total: Math.max(0, finiteNumber(summary.total)),
      demo: Math.max(0, finiteNumber(summary.demo)),
      production: Math.max(0, finiteNumber(summary.production)),
      unclassified: Math.max(0, finiteNumber(summary.unclassified)),
      ...(isRecord(summary.collections) ? { collections: summary.collections } : {}),
    },
  };
}

export const SystemService = {
  async getStatus(): Promise<SystemStatus> {
    const response = await api.get('/system/status', { meta: { suppressErrorToast: true } } as never);
    const status = normalizeSystemStatus(unwrap<SystemStatus>(response));
    syncStateEpoch(status);
    return status;
  },

  async getOverview(): Promise<SystemOverview> {
    const response = await api.get('/system/overview', { meta: { suppressErrorToast: true } } as never);
    const raw = unwrap<unknown>(response);
    if (!isRecord(raw) || !isRecord(raw.state)) {
      const error = new Error('System Management returned an invalid overview payload.');
      (error as Error & { code?: string }).code = 'INVALID_SYSTEM_OVERVIEW';
      throw error;
    }
    const classification = isRecord(raw.classificationSummary) ? raw.classificationSummary : {};
    const overview = {
      ...raw,
      state: normalizeSystemStatus(raw.state as Partial<SystemStatus>),
      capabilities: normalizeCapabilities(raw.capabilities),
      counts: isRecord(raw.counts) ? raw.counts : {},
      classificationSummary: {
        total: finiteNumber(classification.total),
        demo: finiteNumber(classification.demo),
        production: finiteNumber(classification.production),
        unclassified: finiteNumber(classification.unclassified),
        ...(isRecord(classification.collections) ? { collections: classification.collections } : {}),
      },
      latestBackup: isRecord(raw.latestBackup) ? raw.latestBackup as unknown as SystemBackupRecord : null,
      operations: Array.isArray(raw.operations)
        ? raw.operations.filter(isRecord) as unknown as SystemOperation[]
        : [],
      handoverCandidates: Array.isArray(raw.handoverCandidates)
        ? raw.handoverCandidates.filter(isRecord) as unknown as SystemOverview['handoverCandidates']
        : [],
      inventoryProducts: Array.isArray(raw.inventoryProducts)
        ? raw.inventoryProducts.filter(isRecord) as unknown as SystemOverview['inventoryProducts']
        : [],
    } as SystemOverview;
    syncStateEpoch(overview.state);
    return overview;
  },

  async getClassification(params: {
    collection?: string;
    environment?: DataEnvironment | 'all';
    page?: number;
    limit?: number;
  } = {}): Promise<ClassificationResponse> {
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== '' && value !== 'all'),
    );
    const response = await api.get('/system/classification', { params: cleanParams });
    return normalizeClassificationResponse(unwrap<unknown>(response));
  },

  async updateClassification(items: Array<{
    collection: string;
    documentId: string;
    dataEnvironment: DataEnvironment;
  }>): Promise<ClassificationResponse> {
    const response = await api.patch('/system/classification', { items, reviewed: true });
    return normalizeClassificationResponse(unwrap<unknown>(response));
  },

  async createCleanupPreview(payload: CleanupPreviewRequest): Promise<SystemOperation> {
    const response = await api.post('/system/cleanup/previews', payload);
    return unwrap<SystemOperation>(response);
  },

  async executeCleanup(payload: ConfirmationEnvelope): Promise<SystemOperation> {
    const response = await api.post('/system/cleanup/executions', payload);
    const operation = unwrap<SystemOperation>(response);
    const epoch = Number((operation.receipt as { operationalDataEpoch?: number } | undefined)?.operationalDataEpoch);
    if (Number.isFinite(epoch)) syncOperationalDataEpoch(epoch);
    return operation;
  },

  async createDemoResetPreview(): Promise<SystemOperation> {
    const response = await api.post('/system/demo-reset/previews', {});
    return unwrap<SystemOperation>(response);
  },

  async executeDemoReset(payload: Omit<ConfirmationEnvelope, 'backupId'>): Promise<SystemOperation> {
    const response = await api.post('/system/demo-reset/executions', payload);
    const operation = unwrap<SystemOperation>(response);
    const epoch = Number((operation.receipt as { operationalDataEpoch?: number } | undefined)?.operationalDataEpoch);
    if (Number.isFinite(epoch)) syncOperationalDataEpoch(epoch);
    return operation;
  },

  async downloadBackup(passphrase: string, previewId?: string): Promise<SystemDownload> {
    const response = await api.post<Blob>(
      '/system/backups/download',
      {
        passphrase,
        purpose: 'lifecycle',
        includeAssets: true,
        ...(previewId ? { previewId } : {}),
      },
      { responseType: 'blob', timeout: 120_000 },
    );
    return parseDownload(response, `autospf-${new Date().toISOString().slice(0, 10)}.autospf-backup`);
  },

  async acknowledgeBackup(id: string, checksum: string): Promise<SystemBackupRecord> {
    const response = await api.post(`/system/backups/${encodeURIComponent(id)}/acknowledge`, { checksum });
    return unwrap<SystemBackupRecord>(response);
  },

  async listBackups(): Promise<SystemBackupRecord[]> {
    const response = await api.get('/system/backups');
    const data = unwrap<unknown>(response);
    const backups = Array.isArray(data)
      ? data
      : isRecord(data) && Array.isArray(data.backups) ? data.backups : [];
    return backups.filter(isRecord) as unknown as SystemBackupRecord[];
  },

  async downloadSanitizedExport(): Promise<SystemDownload> {
    const response = await api.post<Blob>(
      '/system/exports/download',
      {},
      { responseType: 'blob', timeout: 120_000 },
    );
    return parseDownload(response, `autospf-safe-export-${new Date().toISOString().slice(0, 10)}.json`);
  },

  async createHandoverPreview(targetUserId: string): Promise<SystemOperation> {
    const response = await api.post('/system/handover/previews', { targetUserId });
    return unwrap<SystemOperation>(response);
  },

  async inviteHandoverCandidate(input: { name: string; email: string }): Promise<HandoverInvitationResult> {
    const response = await api.post('/system/handover/invitations', input);
    return unwrap<HandoverInvitationResult>(response);
  },

  async executeHandover(payload: ConfirmationEnvelope): Promise<SystemOperation> {
    const response = await api.post('/system/handover/executions', payload);
    return unwrap<SystemOperation>(response);
  },

  async createLifecyclePreview(action: LifecycleAction): Promise<SystemOperation> {
    const response = await api.post('/system/lifecycle/previews', { action });
    return unwrap<SystemOperation>(response);
  },

  async executeLifecycle(payload: ConfirmationEnvelope): Promise<SystemOperation> {
    const response = await api.post('/system/lifecycle/executions', payload);
    const operation = unwrap<SystemOperation>(response);
    const epoch = Number((operation.receipt as { operationalDataEpoch?: number } | undefined)?.operationalDataEpoch);
    if (Number.isFinite(epoch)) syncOperationalDataEpoch(epoch);
    return operation;
  },

  async getOperation(id: string): Promise<SystemOperation> {
    const response = await api.get(`/system/operations/${encodeURIComponent(id)}`);
    return unwrap<SystemOperation>(response);
  },

  async retryOperation(id: string): Promise<SystemOperation> {
    const response = await api.post(`/system/operations/${encodeURIComponent(id)}/retry`);
    return unwrap<SystemOperation>(response);
  },
};
