import { BACKEND_API_URL, getStoredAuthToken } from './api';

export type ChatRequestStatus =
  | 'idle'
  | 'sending'
  | 'retrying'
  | 'success'
  | 'failed';

export class ChatRequestError extends Error {
  code: string;
  retryable: boolean;
  requestId?: string;
  retryAfterMs?: number;
  status?: number;

  constructor(
    message: string,
    options: {
      code: string;
      retryable: boolean;
      requestId?: string;
      retryAfterMs?: number;
      status?: number;
    },
  ) {
    super(message);
    this.name = 'ChatRequestError';
    this.code = options.code;
    this.retryable = options.retryable;
    this.requestId = options.requestId;
    this.retryAfterMs = options.retryAfterMs;
    this.status = options.status;
  }
}

interface ChatStreamCallbacks {
  onStart?: () => void;
  onDelta?: (text: string) => void;
  onReset?: () => void;
  onAttempt?: (
    status: Extract<ChatRequestStatus, 'sending' | 'retrying'>,
  ) => void;
}

interface SendChatMessageInput extends ChatStreamCallbacks {
  conversationId: string;
  message: string;
  clientMessageId: string;
  timeoutMs?: number;
  maxRetries?: number;
}

const DEFAULT_TIMEOUT_MS = 40_000;
const DEFAULT_MAX_RETRIES = 2;

const createRequestId = () => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

const parseSseBlock = (block: string): { event: string; data: any } | null => {
  let event = 'message';
  const dataLines: string[] = [];

  block.split('\n').forEach((line) => {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  });

  if (!dataLines.length) return null;
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    throw new ChatRequestError(
      'The chat server returned an invalid response.',
      {
        code: 'CHAT_INVALID_RESPONSE',
        retryable: true,
      },
    );
  }
};

const readErrorResponse = async (
  response: Response,
  fallbackRequestId: string,
) => {
  const body = await response.json().catch(() => ({}));
  const error = body?.error || {};
  const retryAfterHeader = Number(response.headers.get('retry-after'));
  const retryAfterMs =
    Number(error.retryAfterMs) ||
    (Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
      ? retryAfterHeader * 1000
      : undefined);

  return new ChatRequestError('Chat request failed.', {
    code: error.code || `CHAT_HTTP_${response.status}`,
    retryable:
      Boolean(error.retryable) ||
      [408, 429, 502, 503, 504].includes(response.status),
    requestId:
      error.requestId ||
      response.headers.get('x-request-id') ||
      fallbackRequestId,
    retryAfterMs,
    status: response.status,
  });
};

const normalizeRequestError = (
  error: unknown,
  requestId: string,
): ChatRequestError => {
  if (error instanceof ChatRequestError) return error;
  const candidate = error as { name?: string; message?: string };
  const offline =
    typeof navigator !== 'undefined' && navigator.onLine === false;
  if (offline) {
    return new ChatRequestError('The browser is offline.', {
      code: 'CHAT_OFFLINE',
      retryable: false,
      requestId,
    });
  }
  if (
    candidate?.name === 'AbortError' ||
    /timed out|timeout/i.test(candidate?.message || '')
  ) {
    return new ChatRequestError('The chat request timed out.', {
      code: 'CHAT_TIMEOUT',
      retryable: true,
      requestId,
    });
  }
  return new ChatRequestError('The chat request could not reach the server.', {
    code: 'CHAT_NETWORK_ERROR',
    retryable: true,
    requestId,
  });
};

const wait = (ms: number) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

const requestStreamOnce = async (
  input: SendChatMessageInput,
  requestId: string,
) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ChatRequestError('The browser is offline.', {
      code: 'CHAT_OFFLINE',
      retryable: false,
      requestId,
    });
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () =>
      controller.abort(
        new DOMException('Chat request timed out', 'AbortError'),
      ),
    input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'X-Request-ID': requestId,
    };
    const token = getStoredAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${BACKEND_API_URL}/chat/message/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        conversationId: input.conversationId,
        sessionId: input.conversationId,
        message: input.message,
        clientMessageId: input.clientMessageId,
      }),
      signal: controller.signal,
    });

    if (!response.ok) throw await readErrorResponse(response, requestId);
    if (!response.body) {
      throw new ChatRequestError('The chat stream was unavailable.', {
        code: 'CHAT_STREAM_UNAVAILABLE',
        retryable: true,
        requestId: response.headers.get('x-request-id') || requestId,
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 2);
        const parsed = parseSseBlock(block);
        if (parsed?.event === 'start') input.onStart?.();
        if (parsed?.event === 'delta') input.onDelta?.(parsed.data?.text || '');
        if (parsed?.event === 'done') {
          const reply = String(parsed.data?.reply || '').trim();
          if (!reply) {
            throw new ChatRequestError('The AI returned an empty response.', {
              code: 'AI_BAD_RESPONSE',
              retryable: true,
              requestId: parsed.data?.requestId || requestId,
            });
          }
          return parsed.data;
        }
        if (parsed?.event === 'error') {
          throw new ChatRequestError('The AI request failed.', {
            code: parsed.data?.code || 'CHAT_SERVER_ERROR',
            retryable: parsed.data?.retryable !== false,
            requestId: parsed.data?.requestId || requestId,
            retryAfterMs: parsed.data?.retryAfterMs,
          });
        }
        boundary = buffer.indexOf('\n\n');
      }
    }

    throw new ChatRequestError('The chat stream ended before completion.', {
      code: 'CHAT_STREAM_INTERRUPTED',
      retryable: true,
      requestId,
    });
  } catch (error) {
    throw normalizeRequestError(error, requestId);
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export const sendChatMessage = async (input: SendChatMessageInput) => {
  const requestId = createRequestId();
  const maxRetries = Math.min(
    2,
    Math.max(0, input.maxRetries ?? DEFAULT_MAX_RETRIES),
  );
  let lastError: ChatRequestError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    input.onAttempt?.(attempt === 0 ? 'sending' : 'retrying');
    if (attempt > 0) input.onReset?.();
    try {
      return await requestStreamOnce(input, requestId);
        } catch (error) {
            lastError = normalizeRequestError(error, requestId);
            // AI_* responses already exhausted the backend's provider retry budget.
            // Browser retries are reserved for transport/proxy interruptions so the
            // two layers cannot multiply one customer action into many AI calls.
            const backendRetryExhausted = lastError.code.startsWith('AI_');
            if (!lastError.retryable || backendRetryExhausted || attempt >= maxRetries) {
                throw lastError;
            }
      const fallbackDelay = attempt === 0 ? 700 : 1_500;
      await wait(
        Math.min(5_000, Math.max(0, lastError.retryAfterMs ?? fallbackDelay)),
      );
    }
  }

  throw (
    lastError ||
    new ChatRequestError('The chat request failed.', {
      code: 'CHAT_UNEXPECTED_ERROR',
      retryable: false,
      requestId,
    })
  );
};

export const getChatFailureMessage = (error: ChatRequestError) => {
  if (error.code === 'CHAT_OFFLINE') {
    return "You're offline. Check your internet connection and try again.";
  }
  if (error.code === 'AI_RATE_LIMITED') {
    return 'AutoSPF+ AI is busy right now. Please try again shortly.';
  }
  if (error.code === 'AI_TIMEOUT' || error.code === 'CHAT_TIMEOUT') {
    return 'AutoSPF+ AI is taking longer than expected. Tap to try again.';
  }
  if (
    error.code === 'AI_PROVIDER_UNAVAILABLE' ||
    error.code === 'CHAT_NETWORK_ERROR' ||
    error.code === 'CHAT_STREAM_INTERRUPTED' ||
    error.code === 'CHAT_STREAM_UNAVAILABLE'
  ) {
    return 'Connection interrupted. Tap to try again.';
  }
  return 'Something went wrong while sending your message. Please try again.';
};
