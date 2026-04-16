import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient as api } from './api/client';

export interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  data?: any;
  headers?: any;
  timestamp: number;
}

const QUEUE_STORAGE_KEY = '@autospf_offline_queue';

/**
 * Push a failed or offline request into the queue to be replayed later.
 */
export const enqueueRequest = async (config: any) => {
  try {
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
 * Replay the queued requests sequentially when online.
 */
export const processQueue = async () => {
  try {
    const queueData = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    if (!queueData) return;

    let queue: QueuedRequest[] = JSON.parse(queueData);
    if (queue.length === 0) return;

    console.log(`[OfflineQueue] Processing ${queue.length} offline requests...`);

    // We process sequentially to preserve order (e.g., Last-Write-Wins works based on timestamp)
    for (let i = 0; i < queue.length; i++) {
      const req = queue[i];
      try {
        console.log(`[OfflineQueue] Replaying ${req.method.toUpperCase()} ${req.url}`);
        await api({
          url: req.url,
          method: req.method,
          data: req.data,
          headers: req.headers,
          // We attach a special flag so our interceptor doesn't re-queue it indefinitely if it fails
          _isRetry: true,
        } as any);
        
        // Remove from queue upon success
        queue = queue.filter((q) => q.id !== req.id);
        await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
      } catch (error: any) {
        if (error.response && error.response.status >= 400 && error.response.status < 500) {
          console.warn(`[OfflineQueue] Request ${req.id} rejected by server with ${error.response.status}. Discarding request.`);
          // Remove from queue since server explicitly rejected it
          queue = queue.filter((q) => q.id !== req.id);
          await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
        } else {
          console.warn(`[OfflineQueue] Request ${req.id} failed again during replay:`, error.message);
          // Break out of replay loop if we hit another network constraint
          break;
        }
      }
    }
  } catch (error) {
    console.error('[OfflineQueue] Failed to process queue:', error);
  }
};
