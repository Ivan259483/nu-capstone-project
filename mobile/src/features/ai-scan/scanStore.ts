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
  createGuidedViewProgress,
  markGuidedViewsAnalyzing,
  markGuidedViewsFailed,
  resolveGuidedViewProgress,
  type GuidedViewProgress,
} from './guidedViews';
import {
  normalizeMultiViewInspection,
  VIEW_ANALYSIS_FAILED_MESSAGE,
  type MultiViewInspection,
} from './multiViewInspection';
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
import { deriveModel3DStatus, type Screen3DStatus } from './modelProgressState';
import type {
  RepairVisualizationProgress,
  RepairVisualizationStatus,
} from './repairVisualization';

export type { Screen3DStatus };

export interface AiScanStoreState {
  // Source images chosen on the entry screen
  capturedImages: AiScanInputImage[];
  vehicle3DSourceImage: AiScanInputImage | null;
  vehicleId: string | null;

  // Roboflow RF-DETR binary damage segmentation result
  scan: AiScanResult | null;
  scanError: string | null;
  workflow: AiScanWorkflowState;

  // Multi-view guided inspection. `guidedViewProgress` is ordered exactly like
  // `capturedImages`, so a row's position is its imageIndex.
  guidedViewProgress: GuidedViewProgress[];
  inspection: MultiViewInspection | null;

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
  // Meshy queue depth ahead of this task — only meaningful while 'queued'.
  modelPrecedingTasks: number | null;

  // Optional Meshy 2D Before/After repair visualization. Kept entirely
  // separate from the Image-to-3D / GLB / USDZ state above.
  repairVisualizationStatus: RepairVisualizationStatus;
  repairVisualizationTaskId: string | null;
  repairVisualizationBeforeUrl: string | null;
  repairVisualizationAfterUrl: string | null;
  repairVisualizationSourceView: string | null;
  repairVisualizationSourceImageIndex: number | null;
  repairVisualizationSourceDamageId: string | null;
  repairVisualizationMessage: string;
  repairVisualizationProgress: number;
  repairVisualizationPrecedingTasks: number | null;
  repairVisualizationAiModel: string | null;
  repairVisualizationConsumedCredits: number | null;

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
  guidedViewProgress: [],
  inspection: null,
  selectedLineItemIds: [],
  estimate: null,
  modelStatus: 'idle',
  modelTaskId: null,
  modelUrl: null,
  repairedModelUrl: null,
  modelUsdzUrl: null,
  modelProgress: 0,
  modelMessage: '',
  modelPrecedingTasks: null,
  repairVisualizationStatus: 'idle',
  repairVisualizationTaskId: null,
  repairVisualizationBeforeUrl: null,
  repairVisualizationAfterUrl: null,
  repairVisualizationSourceView: null,
  repairVisualizationSourceImageIndex: null,
  repairVisualizationSourceDamageId: null,
  repairVisualizationMessage: '',
  repairVisualizationProgress: 0,
  repairVisualizationPrecedingTasks: null,
  repairVisualizationAiModel: null,
  repairVisualizationConsumedCredits: null,
  notes: '',
};

const emptyRepairVisualizationPatch = {
  repairVisualizationStatus: 'idle' as const,
  repairVisualizationTaskId: null,
  repairVisualizationBeforeUrl: null,
  repairVisualizationAfterUrl: null,
  repairVisualizationSourceView: null,
  repairVisualizationSourceImageIndex: null,
  repairVisualizationSourceDamageId: null,
  repairVisualizationMessage: '',
  repairVisualizationProgress: 0,
  repairVisualizationPrecedingTasks: null,
  repairVisualizationAiModel: null,
  repairVisualizationConsumedCredits: null,
};

const repairVisualizationPatch = (
  progress?: RepairVisualizationProgress | null
): Partial<AiScanStoreState> => progress ? {
  repairVisualizationStatus: progress.status,
  repairVisualizationTaskId: progress.taskId,
  repairVisualizationBeforeUrl: progress.beforeImageUrl,
  repairVisualizationAfterUrl: progress.afterImageUrl,
  repairVisualizationSourceView: progress.sourceView,
  repairVisualizationSourceImageIndex: progress.sourceImageIndex,
  repairVisualizationSourceDamageId: progress.sourceDamageId,
  repairVisualizationMessage: progress.message,
  repairVisualizationProgress: progress.progress,
  repairVisualizationPrecedingTasks: progress.precedingTasks,
  repairVisualizationAiModel: progress.aiModel,
  repairVisualizationConsumedCredits: progress.consumedCredits,
} : emptyRepairVisualizationPatch;

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
    state = {
      ...INITIAL_STATE,
      workflow: createInitialAiScanWorkflow(),
      guidedViewProgress: [],
      inspection: null,
    };
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
      // A fresh capture set never inherits the previous inspection's rows.
      guidedViewProgress: createGuidedViewProgress(images),
      inspection: null,
      selectedLineItemIds: [],
      estimate: null,
      modelStatus: 'idle',
      modelTaskId: null,
      modelUrl: null,
      repairedModelUrl: null,
      modelUsdzUrl: null,
      modelProgress: 0,
      modelMessage: '',
      modelPrecedingTasks: null,
      ...emptyRepairVisualizationPatch,
    });
  },

  setScan: (scan: AiScanResult) => {
    const normalizedScan = normalizeAiScanResult(scan);
    const inspection = normalizeMultiViewInspection(scan);
    update({
      scan: normalizedScan,
      inspection,
      guidedViewProgress: inspection
        ? resolveGuidedViewProgress(state.guidedViewProgress, inspection.views)
        : state.guidedViewProgress,
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
      modelPrecedingTasks: null,
      ...repairVisualizationPatch(normalizedScan.repairVisualization),
    });
  },

  beginScanRequest: () => {
    nextScanSessionId += 1;
    update({
      scan: null,
      scanError: null,
      inspection: null,
      // Every submitted view reads "Analyzing" until its own result arrives.
      // Nothing here claims a view is finished.
      guidedViewProgress: markGuidedViewsAnalyzing(state.guidedViewProgress),
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
    const inspection = normalizeMultiViewInspection(scan);
    update({
      scan: normalizedScan,
      // Per-view status is resolved strictly from the response.
      inspection,
      guidedViewProgress: inspection
        ? resolveGuidedViewProgress(state.guidedViewProgress, inspection.views)
        : state.guidedViewProgress,
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
      modelPrecedingTasks: null,
      ...repairVisualizationPatch(normalizedScan.repairVisualization),
      workflow,
    });
    return true;
  },

  failScanRequest: (sessionId: number, message: string) => {
    const workflow = failAiScanWorkflow(state.workflow, sessionId);
    if (workflow === state.workflow) return false;
    update({
      scanError: message,
      guidedViewProgress: markGuidedViewsFailed(state.guidedViewProgress, VIEW_ANALYSIS_FAILED_MESSAGE),
      workflow,
    });
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
    // A superseded poll loop resolves with 'cancelled' purely so the caller
    // has something to await — it must never touch the active session's state.
    if (progress.status === 'cancelled') return;

    const workflow = progress.status === 'ar_ready'
      ? activateAiScanWorkflowStage(state.workflow, 'ar')
      : state.workflow;
    update({
      modelStatus: deriveModel3DStatus(progress),
      modelTaskId: progress.taskId ?? state.modelTaskId,
      modelUrl: progress.modelUrl ?? state.modelUrl,
      repairedModelUrl: progress.repairedModelUrl ?? state.repairedModelUrl,
      modelUsdzUrl: progress.modelUsdzUrl ?? state.modelUsdzUrl,
      modelProgress: progress.progress,
      modelMessage: progress.message ?? state.modelMessage,
      modelPrecedingTasks: progress.precedingTasks ?? null,
      workflow,
    });
  },

  setRepairVisualizationSource: (source: {
    beforeImageUrl: string;
    sourceView: string;
    sourceImageIndex: number;
    sourceDamageId: string | null;
  }) => {
    update({
      repairVisualizationStatus: 'idle',
      repairVisualizationTaskId: null,
      repairVisualizationBeforeUrl: source.beforeImageUrl,
      repairVisualizationAfterUrl: null,
      repairVisualizationSourceView: source.sourceView,
      repairVisualizationSourceImageIndex: source.sourceImageIndex,
      repairVisualizationSourceDamageId: source.sourceDamageId,
      repairVisualizationMessage: '',
      repairVisualizationProgress: 0,
      repairVisualizationPrecedingTasks: null,
      repairVisualizationAiModel: null,
      repairVisualizationConsumedCredits: null,
    });
  },

  setRepairVisualizationProgress: (progress: RepairVisualizationProgress) => {
    if (progress.status === 'cancelled') return;
    update(repairVisualizationPatch(progress));
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
