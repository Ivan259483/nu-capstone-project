export type VehicleAngle = 'front' | 'rear' | 'left' | 'right' | 'close_up';

export type ScanWorkflowStatus =
  | 'idle'
  | 'uploading'
  | 'analyzing'
  | 'generating_3d'
  | 'rendering_ar'
  | 'estimating_cost'
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'timeout'
  | 'failed';

export type DamageSeverity = 'minor' | 'moderate' | 'severe';
export type UrgencyLevel = 'Immediate' | 'Can Wait' | 'Optional';

export interface DamageBoundingBox {
  x: number;      // 0-1 normalized, top-left corner
  y: number;      // 0-1 normalized, top-left corner
  width: number;  // 0-1 normalized
  height: number; // 0-1 normalized
}

export interface VehicleImageInput {
  id: string;
  angle: VehicleAngle;
  selectedDamageArea: string;
  uri: string;
  fileName: string;
  mimeType: string;
  width?: number;
  height?: number;
  fileSize?: number;
}

export interface DamageIssue {
  id: string;
  damageType: string;            // Normalized professional category (e.g., "Dent", "Paint Scratch")
  originalDamageType?: string;   // Raw detector label before normalization
  affectedArea: string;          // Rule-based mapped vehicle part (e.g., "Rear Bumper")
  location: string;              // Same as affectedArea — explicit alias for clarity
  confidence: number;
  severity: DamageSeverity;
  recommendedAction: string;
  suggestedServices: string[];
  boundingBox?: DamageBoundingBox | null;
  imageIndex?: number;
  reasoning?: string;
  repairRecommendation?: string;
}

export interface ServiceRecommendation {
  serviceId: string;
  serviceName: string;
  description: string;
  urgency: UrgencyLevel;
  relatedAreas: string[];
  estimatedMin: number;
  estimatedMax: number;
  estimatedRepairTime?: string;
}

/* ── Add-On Service (toggleable extras) ── */
export interface AddOnService {
  id: string;
  name: string;
  description: string;
  category: 'protection' | 'cosmetic' | 'repair';
  price: number;
  selected: boolean;
}

export interface EstimateLineItem {
  serviceId: string;
  serviceName: string;
  labor: number;
  materials: number;
  subtotalMin: number;
  subtotalMax: number;
  affectedAreas: string[];
}

export interface CostEstimate {
  currency: 'PHP';
  min: number;
  max: number;
  recommended: number;
  formattedRange: string;
  formattedRecommended: string;
  breakdown: EstimateLineItem[];
  addOnBreakdown: AddOnService[];
  addOnTotal: number;
  assumptions: string[];
}

export interface AnalysisResult {
  status: 'damage_detected' | 'invalid';
  message?: string;
  issues: DamageIssue[];
  recommendations: ServiceRecommendation[];
  totalEstimatedCost: string;
  source: 'rule_based' | 'fallback';
  fallbackReason?: string | null;
}

export interface ModelGenerationResult {
  status: 'processing' | 'ar_ready' | 'failed' | 'unavailable';
  taskId?: string;
  modelUrl?: string;
  progress?: number;
  message?: string;
}

export interface RepairPreviewResult {
  status: 'completed' | 'failed' | 'unavailable';
  repairedImageUrl?: string;
  maskUrl?: string;
  processingTimeSeconds?: number;
  message?: string;
}

export interface ConfirmationResult {
  serviceRequestId: string;
  status: 'confirmed';
  confirmedAt: string;
}

export interface WorkflowError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ScanWorkflowState {
  status: ScanWorkflowStatus;
  statusMessage: string;
  uploadProgress: number;
  images: VehicleImageInput[];

  analysis: AnalysisResult | null;
  selectedServiceIds: string[];
  selectedAddOnIds: string[];

  modelTaskId: string | null;
  modelUrl: string | null;
  modelStatus: 'idle' | 'processing' | 'ready' | 'failed' | 'unavailable';
  modelProgress: number;

  repairPreviewUrl: string | null;
  repairStatus: 'idle' | 'processing' | 'ready' | 'failed' | 'unavailable';
  repairProgress: number;
  repairMessage: string | null;

  estimate: CostEstimate | null;
  confirmation: ConfirmationResult | null;

  error: WorkflowError | null;
  timeoutStep: string | null;

  showConfirmSheet: boolean;
}
