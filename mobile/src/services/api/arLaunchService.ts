import { Platform } from 'react-native';
import { apiClient, getApiErrorMessage } from './client';

export interface CreateArLaunchSessionInput {
  modelUrl: string;
  repairedModelUrl?: string | null;
  usdzUrl?: string | null;
  damages?: unknown[];
}

export interface ArLaunchSession {
  token: string;
  launchUrl: string;
  sceneViewerUrl: string;
  usdzUrl?: string;
  directLaunchUrl: string | null;
}

const toTrimmed = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export const createArLaunchSession = async (
  input: CreateArLaunchSessionInput
): Promise<ArLaunchSession> => {
  const modelUrl = toTrimmed(input.modelUrl);
  if (!modelUrl) {
    throw new Error('A valid GLB model URL is required to create an AR session.');
  }

  try {
    const response = await apiClient.post('/ai/ar-session', {
      modelUrl,
      repairedModelUrl: toTrimmed(input.repairedModelUrl) || modelUrl,
      usdzUrl: toTrimmed(input.usdzUrl) || undefined,
      damages: Array.isArray(input.damages) ? input.damages : [],
    });

    const payload = response.data || {};
    const token = toTrimmed(payload.token);
    const launchUrl = toTrimmed(payload.launchUrl);
    const sceneViewerUrl = toTrimmed(payload.sceneViewerUrl);
    const usdzUrl = toTrimmed(payload.usdzUrl);

    if (!token || !launchUrl) {
      throw new Error('AR session response is missing token or launch URL.');
    }

    const directLaunchUrl =
      Platform.OS === 'ios'
        ? (usdzUrl || null)
        : Platform.OS === 'android'
          ? (sceneViewerUrl || null)
          : launchUrl;

    return {
      token,
      launchUrl,
      sceneViewerUrl,
      usdzUrl: usdzUrl || undefined,
      directLaunchUrl,
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to create AR launch session.'));
  }
};
