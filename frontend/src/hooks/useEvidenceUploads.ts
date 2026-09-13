import { useMemo, useSyncExternalStore } from 'react';
import {
  evidenceUploadQueue,
  type EvidenceBatchSummary,
  type EvidenceUploadItem,
} from '@/lib/evidence-upload';

/** Live per-slot upload state and the current batch summary for one order's gate. */
export function useEvidenceUploads(orderId: string, stage: string): {
  bySlot: ReadonlyMap<string, EvidenceUploadItem>;
  batch: EvidenceBatchSummary | null;
} {
  const snapshot = useSyncExternalStore(
    evidenceUploadQueue.subscribe,
    evidenceUploadQueue.getSnapshot,
    evidenceUploadQueue.getSnapshot
  );

  return useMemo(() => {
    const bySlot = new Map<string, EvidenceUploadItem>();
    for (const item of snapshot.items.values()) {
      if (item.orderId === orderId && item.stage === stage) bySlot.set(item.slot, item);
    }
    return { bySlot, batch: evidenceUploadQueue.getBatchSummary(orderId, stage) };
  }, [snapshot, orderId, stage]);
}
