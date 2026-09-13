import { evidenceUploadTransport } from './evidence-api';
import { EvidenceUploadQueue } from './upload-queue';

export {
  EvidenceUploadError,
  EvidenceUploadQueue,
  evidenceUploadKey,
  type EvidenceBatchSummary,
  type EvidenceCommitResult,
  type EvidenceUploadItem,
  type EvidenceUploadOutcome,
  type EvidenceUploadPhase,
  type EvidenceUploadSnapshot,
  type EvidenceUploadState,
} from './upload-queue';

/** Weak or data-saver connections get fewer simultaneous uploads so each one keeps moving. */
function initialUploadConcurrency(): number {
  const connection = typeof navigator !== 'undefined' ? (navigator as any).connection : null;
  const effectiveType = String(connection?.effectiveType || '');
  if (connection?.saveData || ['slow-2g', '2g', '3g'].includes(effectiveType)) return 2;
  return 5;
}

const directUpload = String(import.meta.env.VITE_EVIDENCE_DIRECT_UPLOAD ?? 'true').toLowerCase() !== 'false';

export const evidenceUploadQueue = new EvidenceUploadQueue(evidenceUploadTransport, {
  uploadConcurrency: initialUploadConcurrency(),
  directUpload,
});

evidenceUploadQueue.onBatchSettled((summary) => {
  console.info('[EVIDENCE-UPLOAD] batch settled', summary);
});

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (event) => {
    if (!evidenceUploadQueue.hasActiveUploads()) return;
    event.preventDefault();
    event.returnValue = '';
  });
}
