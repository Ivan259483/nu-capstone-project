/**
 * Shared in-memory store for the new AI Scan flow.
 *
 * The (customer)/ai-scan/* screens are stateless expo-router routes — to
 * keep them lean and let users navigate forward/back without losing their
 * scan context, we hold the active scan + pipeline state in a tiny pub/sub
 * singleton instead of plumbing it through navigation params.
 *
 * The store is a simple `useSyncExternalStore` source — components that
 * need the live state subscribe via `useAiScanStore`.
 */

import { useSyncExternalStore } from 'react';
import type {
  AiScanResult,
  AiScanInputImage,
  AiScan3DProgress,
  AiScanEstimate,
} from '@/services/api/aiService';

export type Screen3DStatus = 'idle' | 'processing' | 'ready' | 'failed' | 'unavailable';

export interface AiScanStoreState {
  // Source images chosen on the entry screen
  capturedImages: AiScanInputImage[];
  vehicleId: string | null;

  // GPT-4 Vision result
  scan: AiScanResult | null;
  scanError: string | null;

  // Selected line items (for the estimate screen)
  selectedLineItemIds: string[];

  // Live estimate (recomputed on the estimate screen)
  estimate: AiScanEstimate | null;

  // Meshy 3D progress
  modelStatus: Screen3DStatus;
  modelTaskId: string | null;
  modelUrl: string | null;
  repairedModelUrl: string | null;
  modelProgress: number;
  modelMessage: string;

  // Notes for booking handoff
  notes: string;
}

const INITIAL_STATE: AiScanStoreState = {
  capturedImages: [],
  vehicleId: null,
  scan: null,
  scanError: null,
  selectedLineItemIds: [],
  estimate: null,
  modelStatus: 'idle',
  modelTaskId: null,
  modelUrl: null,
  repairedModelUrl: null,
  modelProgress: 0,
  modelMessage: '',
  notes: '',
};

let state: AiScanStoreState = { ...INITIAL_STATE };
const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((l) => l());
};

const update = (patch: Partial<AiScanStoreState>) => {
  state = { ...state, ...patch };
  emit();
};

export const aiScanStore = {
  getState: () => state,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  reset: () => {
    state = { ...INITIAL_STATE };
    emit();
  },

  setCapturedImages: (images: AiScanInputImage[], vehicleId?: string | null) => {
    update({
      capturedImages: images,
      vehicleId: vehicleId ?? state.vehicleId,
      scan: null,
      scanError: null,
      selectedLineItemIds: [],
      estimate: null,
      modelStatus: 'idle',
      modelTaskId: null,
      modelUrl: null,
      repairedModelUrl: null,
      modelProgress: 0,
      modelMessage: '',
    });
  },

  setScan: (scan: AiScanResult) => {
    update({
      scan,
      scanError: null,
      estimate: scan.estimate,
      selectedLineItemIds: scan.estimate.lineItems.map((line) => line.id),
      vehicleId: scan.vehicleId || state.vehicleId,
    });
  },

  setScanError: (message: string) => {
    update({ scanError: message });
  },

  setSelectedLineItems: (ids: string[]) => {
    update({ selectedLineItemIds: ids });
  },

  toggleLineItem: (id: string) => {
    const set = new Set(state.selectedLineItemIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    update({ selectedLineItemIds: Array.from(set) });
  },

  setEstimate: (estimate: AiScanEstimate) => {
    update({ estimate });
  },

  setModelProgress: (progress: AiScan3DProgress) => {
    update({
      modelStatus:
        progress.status === 'ar_ready'
          ? 'ready'
          : progress.status === 'failed'
            ? 'failed'
            : progress.status === 'unavailable'
              ? 'unavailable'
              : 'processing',
      modelTaskId: progress.taskId ?? state.modelTaskId,
      modelUrl: progress.modelUrl ?? state.modelUrl,
      repairedModelUrl: progress.repairedModelUrl ?? state.repairedModelUrl,
      modelProgress: progress.progress,
      modelMessage: progress.message ?? state.modelMessage,
    });
  },

  setNotes: (notes: string) => {
    update({ notes });
  },

  setVehicleId: (vehicleId: string | null) => {
    update({ vehicleId });
  },
};

export const useAiScanStore = <Selected,>(
  selector: (state: AiScanStoreState) => Selected
): Selected =>
  useSyncExternalStore(
    aiScanStore.subscribe,
    () => selector(state),
    () => selector(state)
  );
