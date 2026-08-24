import axios from 'axios';
import { config } from '../config/environment.js';

export const GROQ_CHAT_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_CHAT_MODEL = (process.env.GROQ_CHAT_MODEL || 'llama-3.1-8b-instant').trim();
export const GROQ_CHAT_TIMEOUT_MS = Math.max(
  10_000,
  Number(process.env.GROQ_CHAT_TIMEOUT_MS || 30_000)
);
export const GROQ_CHAT_MAX_RETRIES = Math.min(
  2,
  Math.max(0, Number(process.env.GROQ_CHAT_MAX_RETRIES || 2))
);
export const GROQ_CHAT_TOTAL_TIMEOUT_MS = Math.max(
  GROQ_CHAT_TIMEOUT_MS,
  Number(process.env.GROQ_CHAT_TOTAL_TIMEOUT_MS || 35_000)
);

export const getGroqApiKey = () => (process.env.GROQ_API_KEY || '').trim();

export const isGroqConfigured = () => Boolean(getGroqApiKey());

/**
 * @returns {{
 *   status?: number,
 *   code?: string,
 *   type?: string,
 *   message: string,
 *   model: string,
 *   endpoint: string,
 *   isTimeout: boolean,
 *   isNetwork: boolean,
 *   isNotConfigured: boolean,
 *   isRateLimited: boolean,
 *   isInvalidModel: boolean,
 *   isAuthError: boolean,
 * }}
 */
export const formatGroqApiError = (error) => {
  const status = error?.status || error?.response?.status;
  const data = error?.response?.data;
  const apiError = data?.error || data;
  const message =
    apiError?.message ||
    data?.message ||
    error?.message ||
    'Unknown Groq API error';

  const code = apiError?.code || error?.code;
  const type = apiError?.type || error?.type || error?.name;
  const messageLower = String(message).toLowerCase();
  const headers = error?.headers || error?.response?.headers;
  const retryAfterValue = headers?.get?.('retry-after') || headers?.['retry-after'];
  const retryAfterMsValue = headers?.get?.('retry-after-ms') || headers?.['retry-after-ms'];
  let retryAfterMs = Number(retryAfterMsValue);
  if (!Number.isFinite(retryAfterMs) && retryAfterValue) {
    const seconds = Number(retryAfterValue);
    retryAfterMs = Number.isFinite(seconds)
      ? seconds * 1000
      : Math.max(0, Date.parse(retryAfterValue) - Date.now());
  }
  if (!Number.isFinite(retryAfterMs)) retryAfterMs = undefined;

  const isTimeout =
    error?.code === 'ECONNABORTED' ||
    error?.name === 'APIConnectionTimeoutError' ||
    /timeout|timed out/i.test(messageLower);
  const isNetwork =
    ['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(error?.code) ||
    error?.name === 'APIConnectionError' ||
    (!status && /network|fetch failed|socket hang up/i.test(messageLower));
  const isNotConfigured = error?.code === 'GROQ_NOT_CONFIGURED';
  const isRateLimited = status === 429;
  const isInvalidModel = status === 404 || (status === 400 && /model/i.test(messageLower));
  const isAuthError = status === 401 || status === 403;
  const isBadResponse = error?.code === 'GROQ_EMPTY_RESPONSE';
  const isProviderUnavailable = status >= 500 || isNetwork;

  let publicCode = 'AI_PROVIDER_ERROR';
  let statusCode = 502;
  let retryable = false;
  if (isNotConfigured) {
    publicCode = 'AI_NOT_CONFIGURED';
    statusCode = 503;
  } else if (isAuthError || isInvalidModel) {
    publicCode = 'AI_CONFIGURATION_ERROR';
    statusCode = 503;
  } else if (isRateLimited) {
    publicCode = 'AI_RATE_LIMITED';
    statusCode = 429;
    retryable = true;
  } else if (isTimeout) {
    publicCode = 'AI_TIMEOUT';
    statusCode = 504;
    retryable = true;
  } else if (isBadResponse) {
    publicCode = 'AI_BAD_RESPONSE';
    statusCode = 502;
    retryable = true;
  } else if (isProviderUnavailable) {
    publicCode = 'AI_PROVIDER_UNAVAILABLE';
    statusCode = 503;
    retryable = true;
  }

  return {
    status,
    code,
    type,
    message,
    model: GROQ_CHAT_MODEL,
    endpoint: GROQ_CHAT_ENDPOINT,
    statusCode,
    publicCode,
    retryable,
    retryAfterMs,
    isTimeout,
    isNetwork,
    isNotConfigured,
    isRateLimited,
    isInvalidModel,
    isAuthError,
    isBadResponse,
    isProviderUnavailable,
  };
};

export const isRetryableGroqError = (error) => formatGroqApiError(error).retryable;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const runGroqWithRetry = async (operation, options = {}) => {
  const maxRetries = Math.min(
    2,
    Math.max(0, Number(options.maxRetries ?? GROQ_CHAT_MAX_RETRIES))
  );

  const startedAt = Date.now();
  const maxElapsedMs = Math.max(
    1_000,
    Number(options.maxElapsedMs || GROQ_CHAT_TOTAL_TIMEOUT_MS)
  );
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const remainingMs = Math.max(1, maxElapsedMs - (Date.now() - startedAt));
      return await operation(attempt, remainingMs);
    } catch (error) {
      lastError = error;
      const details = formatGroqApiError(error);
      if (
        !details.retryable ||
        attempt >= maxRetries ||
        options.shouldRetry?.(error, details, attempt) === false
      ) break;

      const fallbackDelay = attempt === 0 ? 700 : 1_500;
      const delayMs = Math.min(5_000, Math.max(0, details.retryAfterMs ?? fallbackDelay));
      if (Date.now() - startedAt + delayMs >= maxElapsedMs) break;
      await wait(delayMs);
    }
  }

  throw lastError;
};

export const logGroqApiError = (context, error) => {
  const details = formatGroqApiError(error);

  const logPayload = {
    context,
    status: details.status,
    code: details.code,
    type: details.type,
    message: details.message,
    model: details.model,
    endpoint: details.endpoint,
    isTimeout: details.isTimeout,
    isNetwork: details.isNetwork,
    isRateLimited: details.isRateLimited,
    isInvalidModel: details.isInvalidModel,
    isAuthError: details.isAuthError,
    isNotConfigured: details.isNotConfigured,
    publicCode: details.publicCode,
    retryable: details.retryable,
    retryAfterMs: details.retryAfterMs,
  };

  if (details.isRateLimited) {
    console.warn('[Chatbot][Groq] Rate limit reached', logPayload);
  } else if (details.isNotConfigured) {
    console.error('[Chatbot][Groq] API key missing', logPayload);
  } else {
    console.error('[Chatbot][Groq] Request failed', logPayload);
  }

  if (config.nodeEnv === 'development' && error?.response?.data) {
    console.error('[Chatbot][Groq] Response body:', JSON.stringify(error.response.data, null, 2));
  }

  return details;
};

/**
 * @param {object} payload - OpenAI-compatible chat completion body (model added automatically)
 * @param {{ context?: string, timeout?: number }} [options]
 */
export const callGroqChatCompletions = async (payload, options = {}) => {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    const err = new Error('GROQ_API_KEY is not configured');
    err.code = 'GROQ_NOT_CONFIGURED';
    throw err;
  }

  const context = options.context || 'chat';
  const timeout = options.timeout ?? GROQ_CHAT_TIMEOUT_MS;

  try {
    return await runGroqWithRetry(async (_attempt, remainingMs) => {
      const response = await axios.post(
        GROQ_CHAT_ENDPOINT,
        {
          model: GROQ_CHAT_MODEL,
          ...payload,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: Math.min(timeout, remainingMs),
        }
      );

      const content = response.data?.choices?.[0]?.message?.content?.trim();
      if (!content) {
        const err = new Error('Groq returned an empty completion');
        err.code = 'GROQ_EMPTY_RESPONSE';
        err.response = response;
        throw err;
      }

      return { content, raw: response.data };
    }, {
      maxRetries: options.maxRetries,
      maxElapsedMs: options.maxElapsedMs,
    });
  } catch (error) {
    logGroqApiError(context, error);
    throw error;
  }
};

if (!isGroqConfigured() && config.nodeEnv !== 'test') {
  console.warn(
    '[Chatbot][Groq] GROQ_API_KEY is not set — chat AI replies will return a temporary unavailable message until configured.'
  );
}
