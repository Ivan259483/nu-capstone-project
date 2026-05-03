import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AxiosInstance } from 'axios';

export interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  data?: any;
  headers?: any;
  timestamp: number;
}

const QUEUE_STORAGE_KEY = '@autospf_offline_queue';

// Requests older than 24 hours are considered stale and discarded automatically.
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Returns true for requests that cannot be faithfully serialised to JSON and
 * replayed later. Multipart uploads carry binary blobs that are destroyed by
 * JSON.stringify, so replaying them always produces a mangled payload.
 */
const isUnserializableRequest = (config: any): boolean => {
  const contentType: string = config.headers?.['Content-Type'] || config.headers?.['content-type'] || '';
  if (contentType.includes('multipart/form-data')) return true;
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) return true;
  return false;
};

/**
 * Push a failed or offline request into the queue to be replayed later.
 *
 * Multipart/FormData requests are intentionally skipped — binary image data
 * cannot survive JSON serialisation, so any replay would reach the server
 * with a malformed payload. Callers that upload files must handle offline
 * scenarios themselves (e.g. the AI scan already falls back to the offline
 * damage engine when the API is unreachable).
 */
export const enqueueRequest = async (config: any) => {
  try {
    if (isUnserializableRequest(config)) {
      console.warn(
        `[OfflineQueue] Skipping multipart/FormData request — cannot serialise binary data: ${config.method?.toUpperCase()} ${config.url}`
      );
      return;
    }

    const queueData = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    const queue: QueuedRequest[] = queueData ? JSON.parse(queueData) : [];

    const newRequest: QueuedRequest = {
      id: Math.random().toString(36).substr(2, 9),
      url: config.url,
      method: config.method,
      data: config.data
        ? (typeof config.data === 'string' ? JSON.parse(config.data) : config.data)
        : undefined,
      headers: config.headers,
      timestamp: Date.now(),
    };

    queue.push(newRequest);
    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    console.log(`[OfflineQueue] Enqueued ${config.method.toUpperCase()} ${config.url}`);
  } catch (error) {
    console.error('[OfflineQueue] Failed to enqueue request:', error);
  }
};

/**
 * Remove requests older than STALE_THRESHOLD_MS (24h).
 * Called automatically at the start of processQueue.
 */
export const pruneStaleRequests = async () => {
  try {
    const queueData = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    if (!queueData) return;
    const queue: QueuedRequest[] = JSON.parse(queueData);
    const now = Date.now();
    const fresh = queue.filter((r) => now - r.timestamp < STALE_THRESHOLD_MS);
    const pruned = queue.length - fresh.length;
    if (pruned > 0) {
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(fresh));
      console.log(`[OfflineQueue] Pruned ${pruned} stale request(s) (>24h old)`);
    }
  } catch (error) {
    console.error('[OfflineQueue] Failed to prune stale requests:', error);
  }
};

/**
 * Completely clears the offline queue. Use this when the user logs out
 * or when you need to force-flush stuck entries.
 */
export const clearQueue = async () => {
  try {
    await AsyncStorage.removeItem(QUEUE_STORAGE_KEY);
    console.log('[OfflineQueue] Queue cleared.');
  } catch (error) {
    console.error('[OfflineQueue] Failed to clear queue:', error);
  }
};

/**
 * Replay the queued requests sequentially when online.
 *
 * The axios instance is injected by the caller to avoid a circular import
 * between this module and `api/client.ts`.
 */
export const processQueue = async (api: AxiosInstance) => {
  try {
    await pruneStaleRequests();

    const queueData = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    if (!queueData) return;

    let queue: QueuedRequest[] = JSON.parse(queueData);
    if (queue.length === 0) return;

    console.log(`[OfflineQueue] Processing ${queue.length} offline requests...`);

    // Sequential replay preserves order (Last-Write-Wins via timestamp).
    for (let i = 0; i < queue.length; i++) {
      const req = queue[i];
      try {
        console.log(`[OfflineQueue] Replaying ${req.method.toUpperCase()} ${req.url}`);
        await api({
          url: req.url,
          method: req.method,
          data: req.data,
          headers: req.headers,
          // Flag prevents the response interceptor from re-queueing on failure.
          _isRetry: true,
        } as any);
        
        // Remove from queue upon success
        queue = queue.filter((q) => q.id !== req.id);
        await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
      } catch (error: any) {
        const status: number | undefined = error.response?.status;

        if (status !== undefined) {
          // Any HTTP error response (4xx or 5xx) means the server received the
          // request and rejected it. Retrying will not help, so discard.
          // 5xx specifically covers multer-style "Unexpected field" (500) that
          // occurs when a previously-queued payload was malformed on serialisation.
          console.warn(
            `[OfflineQueue] Request ${req.id} permanently rejected by server (${status}). Discarding.`
          );
          queue = queue.filter((q) => q.id !== req.id);
          await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
        } else {
          console.warn(`[OfflineQueue] Request ${req.id} failed again during replay:`, error.message);
          // No HTTP response — device is still offline; pause the loop.
          break;
        }
      }
    }
  } catch (error) {
    console.error('[OfflineQueue] Failed to process queue:', error);
  }
};
