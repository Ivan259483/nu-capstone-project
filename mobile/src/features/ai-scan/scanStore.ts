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
import { normalizeAiScanResult } from './scanResultState';
import { createVehicle3DSourcePatch } from './threeDPreparation';
import {
  activateAiScanWorkflowStage,
  beginAiScanWorkflow,
  completeAiScanWorkflow,
  createInitialAiScanWorkflow,
  failAiScanWorkflow,
  updatePendingAiScanProgress,
  type AiScanWorkflowStage,
  type AiScanWorkflowState,
} from './scanWorkflowState';

export type Screen3DStatus = 'idle' | 'processing' | 'ready' | 'failed' | 'unavailable';

export interface AiScanStoreState {
  // Source images chosen on the entry screen
  capturedImages: AiScanInputImage[];
  vehicle3DSourceImage: AiScanInputImage | null;
  vehicleId: string | null;

  // Roboflow RF-DETR binary damage segmentation result
  scan: AiScanResult | null;
  scanError: string | null;
  workflow: AiScanWorkflowState;

  // Selected line items (for the estimate screen)
  selectedLineItemIds: string[];

  // Live estimate (recomputed on the estimate screen)
  estimate: AiScanEstimate | null;

  // Meshy 3D progress
  modelStatus: Screen3DStatus;
  modelTaskId: string | null;
  modelUrl: string | null;
  repairedModelUrl: string | null;
  modelUsdzUrl: string | null;
  modelProgress: number;
  modelMessage: string;

  // Notes for booking handoff
  notes: string;
}

const INITIAL_STATE: AiScanStoreState = {
  capturedImages: [],
  vehicle3DSourceImage: null,
  vehicleId: null,
  scan: null,
  scanError: null,
  workflow: createInitialAiScanWorkflow(),
  selectedLineItemIds: [],
  estimate: null,
  modelStatus: 'idle',
  modelTaskId: null,
  modelUrl: null,
  repairedModelUrl: null,
  modelUsdzUrl: null,
  modelProgress: 0,
  modelMessage: '',
  notes: '',
};

let state: AiScanStoreState = { ...INITIAL_STATE };
let nextScanSessionId = 0;
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
    state = { ...INITIAL_STATE, workflow: createInitialAiScanWorkflow() };
    emit();
  },

  setCapturedImages: (images: AiScanInputImage[], vehicleId?: string | null) => {
    update({
      capturedImages: images,
      vehicle3DSourceImage: null,
      vehicleId: vehicleId ?? state.vehicleId,
      scan: null,
      scanError: null,
      workflow: createInitialAiScanWorkflow(),
      selectedLineItemIds: [],
      estimate: null,
      modelStatus: 'idle',
      modelTaskId: null,
      modelUrl: null,
      repairedModelUrl: null,
      modelUsdzUrl: null,
      modelProgress: 0,
      modelMessage: '',
    });
  },

  setScan: (scan: AiScanResult) => {
    const normalizedScan = normalizeAiScanResult(scan);
    update({
      scan: normalizedScan,
      scanError: null,
      estimate: normalizedScan.estimate,
      selectedLineItemIds: normalizedScan.estimate.lineItems.map((line) => line.id),
      vehicleId: normalizedScan.vehicleId || state.vehicleId,
      vehicle3DSourceImage: null,
      modelStatus: 'idle',
      modelTaskId: null,
      modelUrl: null,
      repairedModelUrl: null,
      modelUsdzUrl: null,
      modelProgress: 0,
      modelMessage: '',
    });
  },

  beginScanRequest: () => {
    nextScanSessionId += 1;
    update({
      scan: null,
      scanError: null,
      workflow: beginAiScanWorkflow(nextScanSessionId),
    });
    return nextScanSessionId;
  },

  updateScanProgress: (sessionId: number, progress: number) => {
    const workflow = updatePendingAiScanProgress(state.workflow, sessionId, progress);
    if (workflow === state.workflow) return false;
    update({ workflow });
    return true;
  },

  completeScanRequest: (sessionId: number, scan: AiScanResult) => {
    const workflow = completeAiScanWorkflow(state.workflow, sessionId);
    if (workflow === state.workflow) return false;

    const normalizedScan = normalizeAiScanResult(scan);
    update({
      scan: normalizedScan,
      scanError: null,
      estimate: normalizedScan.estimate,
      selectedLineItemIds: normalizedScan.estimate.lineItems.map((line) => line.id),
      vehicleId: normalizedScan.vehicleId || state.vehicleId,
      vehicle3DSourceImage: null,
      modelStatus: 'idle',
      modelTaskId: null,
      modelUrl: null,
      repairedModelUrl: null,
      modelUsdzUrl: null,
      modelProgress: 0,
      modelMessage: '',
      workflow,
    });
    return true;
  },

  failScanRequest: (sessionId: number, message: string) => {
    const workflow = failAiScanWorkflow(state.workflow, sessionId);
    if (workflow === state.workflow) return false;
    update({ scanError: message, workflow });
    return true;
  },

  activateWorkflowStage: (
    stage: Extract<AiScanWorkflowStage, '3d' | 'ar' | 'price' | 'approve'>
  ) => {
    const workflow = activateAiScanWorkflowStage(state.workflow, stage);
    if (workflow === state.workflow) return false;
    update({ workflow });
    return true;
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

  setVehicle3DSourceImage: (image: AiScanInputImage | null) => {
    update(createVehicle3DSourcePatch(image));
  },

  setModelProgress: (progress: AiScan3DProgress) => {
    const workflow = progress.status === 'ar_ready'
      ? activateAiScanWorkflowStage(state.workflow, 'ar')
      : state.workflow;
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
      modelUsdzUrl: progress.modelUsdzUrl ?? state.modelUsdzUrl,
      modelProgress: progress.progress,
      modelMessage: progress.message ?? state.modelMessage,
      workflow,
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
