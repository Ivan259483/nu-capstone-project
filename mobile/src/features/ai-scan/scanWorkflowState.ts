export const AI_SCAN_WORKFLOW_STAGES = [
  'scan',
  'detect',
  '3d',
  'ar',
  'price',
  'approve',
] as const;

export type AiScanWorkflowStage = (typeof AI_SCAN_WORKFLOW_STAGES)[number];
export type AiScanWorkflowStepState = 'inactive' | 'active' | 'complete' | 'skipped';
export type AiScanRequestStatus = 'idle' | 'pending' | 'succeeded' | 'failed';

export type AiScanWorkflowStepStates = Record<AiScanWorkflowStage, AiScanWorkflowStepState>;

export interface AiScanWorkflowState {
  sessionId: number | null;
  requestStatus: AiScanRequestStatus;
  activeStage: AiScanWorkflowStage | null;
  progress: number;
  stepStates: AiScanWorkflowStepStates;
}

const inactiveSteps = (): AiScanWorkflowStepStates => ({
  scan: 'inactive',
  detect: 'inactive',
  '3d': 'inactive',
  ar: 'inactive',
  price: 'inactive',
  approve: 'inactive',
});

export const createInitialAiScanWorkflow = (): AiScanWorkflowState => ({
  sessionId: null,
  requestStatus: 'idle',
  activeStage: null,
  progress: 0,
  stepStates: inactiveSteps(),
});

export const beginAiScanWorkflow = (sessionId: number): AiScanWorkflowState => ({
  sessionId,
  requestStatus: 'pending',
  activeStage: 'detect',
  progress: 6,
  stepStates: {
    ...inactiveSteps(),
    scan: 'complete',
    detect: 'active',
  },
});

export const updatePendingAiScanProgress = (
  workflow: AiScanWorkflowState,
  sessionId: number,
  progress: number
): AiScanWorkflowState => {
  if (workflow.sessionId !== sessionId || workflow.requestStatus !== 'pending') return workflow;
  if (!Number.isFinite(progress)) return workflow;

  return {
    ...workflow,
    progress: Math.max(workflow.progress, Math.min(PENDING_SCAN_PROGRESS_CEILING, progress)),
  };
};

export const completeAiScanWorkflow = (
  workflow: AiScanWorkflowState,
  sessionId: number
): AiScanWorkflowState => {
  if (workflow.sessionId !== sessionId || workflow.requestStatus !== 'pending') return workflow;

  return {
    ...workflow,
    requestStatus: 'succeeded',
    activeStage: 'detect',
    progress: 100,
    stepStates: {
      ...inactiveSteps(),
      scan: 'complete',
      detect: 'complete',
    },
  };
};

export const failAiScanWorkflow = (
  workflow: AiScanWorkflowState,
  sessionId: number
): AiScanWorkflowState => {
  if (workflow.sessionId !== sessionId || workflow.requestStatus !== 'pending') return workflow;

  return {
    ...workflow,
    requestStatus: 'failed',
    activeStage: 'detect',
    stepStates: {
      ...inactiveSteps(),
      scan: 'complete',
      detect: 'active',
    },
  };
};

export const activateAiScanWorkflowStage = (
  workflow: AiScanWorkflowState,
  stage: Extract<AiScanWorkflowStage, '3d' | 'ar' | 'price' | 'approve'>
): AiScanWorkflowState => {
  if (workflow.requestStatus !== 'succeeded') return workflow;

  const nextSteps: AiScanWorkflowStepStates = {
    ...inactiveSteps(),
    scan: 'complete',
    detect: 'complete',
  };

  if (stage === '3d') {
    nextSteps['3d'] = 'active';
  } else if (stage === 'ar') {
    nextSteps['3d'] = 'complete';
    nextSteps.ar = 'active';
  } else if (stage === 'price') {
    if (workflow.stepStates['3d'] === 'complete') nextSteps['3d'] = 'complete';
    nextSteps.price = 'active';
  } else {
    if (workflow.stepStates['3d'] === 'complete') nextSteps['3d'] = 'complete';
    nextSteps.price = 'complete';
    nextSteps.approve = 'active';
  }

  return {
    ...workflow,
    activeStage: stage,
    stepStates: nextSteps,
  };
};

export const PENDING_SCAN_PROGRESS_CEILING = 92;

type PendingProgressOptions = {
  intervalMs?: number;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
};

export const createPendingScanProgressController = (
  onProgress: (progress: number) => void,
  options: PendingProgressOptions = {}
) => {
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  let progress = 6;
  let stopped = false;
  let interval: ReturnType<typeof setInterval> | null = setIntervalFn(() => {
    if (stopped) return;
    progress = Math.min(PENDING_SCAN_PROGRESS_CEILING, progress + 3);
    onProgress(progress);
  }, options.intervalMs ?? 720);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (interval !== null) {
      clearIntervalFn(interval);
      interval = null;
    }
  };

  return {
    reportUpload(uploadProgress: number) {
      if (stopped || !Number.isFinite(uploadProgress)) return;
      progress = Math.max(progress, Math.min(78, Math.max(0, uploadProgress)));
      onProgress(progress);
    },
    complete() {
      if (stopped) return;
      stop();
      progress = 100;
      onProgress(progress);
    },
    stop,
    getProgress: () => progress,
  };
};

export const createSessionNavigationGuard = () => {
  const claimedSessions = new Set<number>();

  return {
    claim(sessionId: number, currentSessionId: number | null) {
      if (sessionId !== currentSessionId || claimedSessions.has(sessionId)) return false;
      claimedSessions.add(sessionId);
      return true;
    },
  };
};
