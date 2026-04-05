import {
  type AnalysisResult,
  type ConfirmationResult,
  type CostEstimate,
  type ScanWorkflowState,
  type ScanWorkflowStatus,
  type VehicleImageInput,
  type WorkflowError,
} from './types';

export const initialScanWorkflowState: ScanWorkflowState = {
  status: 'idle',
  statusMessage: '',
  uploadProgress: 0,
  images: [],

  analysis: null,
  selectedServiceIds: [],
  selectedAddOnIds: [],

  modelTaskId: null,
  modelUrl: null,
  modelStatus: 'idle',
  modelProgress: 0,

  repairPreviewUrl: null,
  repairStatus: 'idle',
  repairProgress: 0,
  repairMessage: null,

  estimate: null,
  confirmation: null,

  error: null,
  timeoutStep: null,

  showConfirmSheet: false,
};

type ScanWorkflowAction =
  | { type: 'RESET' }
  | { type: 'SET_IMAGES'; payload: VehicleImageInput[] }
  | { type: 'UPSERT_IMAGE'; payload: VehicleImageInput }
  | { type: 'REMOVE_IMAGE'; payload: { angle: VehicleImageInput['angle'] } }
  | {
      type: 'SET_STATUS';
      payload: { status: ScanWorkflowStatus; message?: string; clearError?: boolean };
    }
  | { type: 'SET_UPLOAD_PROGRESS'; payload: number }
  | { type: 'SET_ANALYSIS'; payload: AnalysisResult }
  | { type: 'SET_SELECTED_SERVICES'; payload: string[] }
  | { type: 'SET_SELECTED_ADD_ONS'; payload: string[] }
  | { type: 'TOGGLE_ADD_ON'; payload: string }
  | {
      type: 'SET_MODEL_STATE';
      payload: {
        modelStatus: ScanWorkflowState['modelStatus'];
        modelTaskId?: string | null;
        modelUrl?: string | null;
        modelProgress?: number;
      };
    }
  | {
      type: 'SET_REPAIR_STATE';
      payload: {
        repairStatus: ScanWorkflowState['repairStatus'];
        repairPreviewUrl?: string | null;
        repairProgress?: number;
        repairMessage?: string | null;
      };
    }
  | { type: 'SET_ESTIMATE'; payload: CostEstimate }
  | { type: 'SET_CONFIRMATION'; payload: ConfirmationResult }
  | { type: 'SET_ERROR'; payload: WorkflowError }
  | { type: 'SET_TIMEOUT'; payload: { step: string; message: string } }
  | { type: 'SHOW_CONFIRM_SHEET'; payload: boolean };

export const scanWorkflowReducer = (
  state: ScanWorkflowState,
  action: ScanWorkflowAction
): ScanWorkflowState => {
  switch (action.type) {
    case 'RESET':
      return {
        ...initialScanWorkflowState,
        images: state.images,
      };

    case 'SET_IMAGES':
      return {
        ...state,
        images: action.payload,
      };

    case 'UPSERT_IMAGE': {
      const next = [...state.images];
      const existingIndex = next.findIndex((img) => img.angle === action.payload.angle);
      if (existingIndex >= 0) {
        next[existingIndex] = action.payload;
      } else {
        next.push(action.payload);
      }
      return {
        ...state,
        images: next,
      };
    }

    case 'REMOVE_IMAGE':
      return {
        ...state,
        images: state.images.filter((img) => img.angle !== action.payload.angle),
      };

    case 'SET_STATUS':
      return {
        ...state,
        status: action.payload.status,
        statusMessage: action.payload.message ?? state.statusMessage,
        error: action.payload.clearError ? null : state.error,
        timeoutStep: action.payload.status !== 'timeout' ? null : state.timeoutStep,
      };

    case 'SET_UPLOAD_PROGRESS':
      return {
        ...state,
        uploadProgress: Math.max(0, Math.min(100, action.payload)),
      };

    case 'SET_ANALYSIS':
      return {
        ...state,
        analysis: action.payload,
        selectedServiceIds: action.payload.recommendations.map((r) => r.serviceId),
      };

    case 'SET_SELECTED_SERVICES':
      return {
        ...state,
        selectedServiceIds: action.payload,
      };

    case 'SET_SELECTED_ADD_ONS':
      return {
        ...state,
        selectedAddOnIds: action.payload,
      };

    case 'TOGGLE_ADD_ON': {
      const current = new Set(state.selectedAddOnIds);
      if (current.has(action.payload)) {
        current.delete(action.payload);
      } else {
        current.add(action.payload);
      }
      return {
        ...state,
        selectedAddOnIds: Array.from(current),
      };
    }

    case 'SET_MODEL_STATE':
      return {
        ...state,
        modelStatus: action.payload.modelStatus,
        modelTaskId:
          action.payload.modelTaskId !== undefined
            ? action.payload.modelTaskId
            : state.modelTaskId,
        modelUrl:
          action.payload.modelUrl !== undefined
            ? action.payload.modelUrl
            : state.modelUrl,
        modelProgress:
          action.payload.modelProgress !== undefined
            ? action.payload.modelProgress
            : state.modelProgress,
      };

    case 'SET_REPAIR_STATE':
      return {
        ...state,
        repairStatus: action.payload.repairStatus,
        repairPreviewUrl:
          action.payload.repairPreviewUrl !== undefined
            ? action.payload.repairPreviewUrl
            : state.repairPreviewUrl,
        repairProgress:
          action.payload.repairProgress !== undefined
            ? action.payload.repairProgress
            : state.repairProgress,
        repairMessage:
          action.payload.repairMessage !== undefined
            ? action.payload.repairMessage
            : state.repairMessage,
      };

    case 'SET_ESTIMATE':
      return {
        ...state,
        estimate: action.payload,
      };

    case 'SET_CONFIRMATION':
      return {
        ...state,
        confirmation: action.payload,
      };

    case 'SET_ERROR':
      return {
        ...state,
        status: 'failed',
        error: action.payload,
      };

    case 'SET_TIMEOUT':
      return {
        ...state,
        status: 'timeout',
        timeoutStep: action.payload.step,
        statusMessage: action.payload.message,
      };

    case 'SHOW_CONFIRM_SHEET':
      return {
        ...state,
        showConfirmSheet: action.payload,
      };

    default:
      return state;
  }
};
