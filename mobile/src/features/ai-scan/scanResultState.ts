import type { AiScanResult, AiScanSeverity } from '@/services/api/aiService';

export const ZERO_DETECTION_MESSAGE =
  'No confident damage detected. Try taking a closer photo of the affected area.';

export const isZeroDetectionResult = (
  scan: Pick<AiScanResult, 'noDamageDetected' | 'damages'>
) => scan.noDamageDetected || scan.damages.length === 0;

export const normalizeAiScanResult = (scan: AiScanResult): AiScanResult => {
  if (!isZeroDetectionResult(scan)) return scan;

  return {
    ...scan,
    noDamageDetected: true,
    damages: [],
    estimate: {
      ...scan.estimate,
      lineItems: [],
    },
    integration: {
      recommendation: [],
      costEstimation: [],
      visualization3d: [],
      ar: [],
    },
  };
};

export interface AiScanResultPresentation {
  noDamageDetected: boolean;
  detectedIssues: number;
  severeFindings: number;
  detectionConfidence: number;
  overallSeverity: AiScanSeverity | null;
  message: string | null;
}

export const getAiScanResultPresentation = (
  scan: Pick<AiScanResult, 'noDamageDetected' | 'damages'>
): AiScanResultPresentation => {
  const noDamageDetected = isZeroDetectionResult(scan);
  const damages = noDamageDetected ? [] : scan.damages;
  const detectionConfidence = damages.length
    ? damages.reduce((sum, damage) => sum + damage.confidence, 0) / damages.length
    : 0;

  return {
    noDamageDetected,
    detectedIssues: damages.length,
    severeFindings: damages.filter((damage) => damage.severity === 'high').length,
    detectionConfidence,
    overallSeverity: damages[0]?.severity ?? null,
    message: noDamageDetected ? ZERO_DETECTION_MESSAGE : null,
  };
};
