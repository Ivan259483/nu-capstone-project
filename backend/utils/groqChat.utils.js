import axios from 'axios';
import { config } from '../config/environment.js';

export const GROQ_CHAT_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_CHAT_MODEL = (process.env.GROQ_CHAT_MODEL || 'llama-3.1-8b-instant').trim();
export const GROQ_CHAT_TIMEOUT_MS = Number(process.env.GROQ_CHAT_TIMEOUT_MS || 30000);

export const CHAT_AI_UNAVAILABLE_REPLY =
  "I'm currently experiencing a temporary connection issue. Please try again in a moment.";

export const getGroqApiKey = () => (process.env.GROQ_API_KEY || '').trim();

export const isGroqConfigured = () => Boolean(getGroqApiKey());

const maskApiKey = (key = '') => {
  const trimmed = String(key).trim();
  if (!trimmed) return '(empty)';
  if (trimmed.length <= 8) return '***';
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
};

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
  const status = error?.response?.status;
  const data = error?.response?.data;
  const apiError = data?.error || data;
  const message =
    apiError?.message ||
    data?.message ||
    error?.message ||
    'Unknown Groq API error';

  const code = apiError?.code || error?.code;
  const type = apiError?.type;
  const messageLower = String(message).toLowerCase();

  return {
    status,
    code,
    type,
    message,
    model: GROQ_CHAT_MODEL,
    endpoint: GROQ_CHAT_ENDPOINT,
    apiKeyHint: maskApiKey(getGroqApiKey()),
    isTimeout: error?.code === 'ECONNABORTED' || /timeout/i.test(messageLower),
    isNetwork: ['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error?.code),
    isNotConfigured: error?.code === 'GROQ_NOT_CONFIGURED',
    isRateLimited: status === 429,
    isInvalidModel:
      status === 404 ||
      (status === 400 && /model/i.test(messageLower)),
    isAuthError: status === 401 || status === 403,
  };
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
    apiKey: details.apiKeyHint,
    isTimeout: details.isTimeout,
    isNetwork: details.isNetwork,
    isRateLimited: details.isRateLimited,
    isInvalidModel: details.isInvalidModel,
    isAuthError: details.isAuthError,
    isNotConfigured: details.isNotConfigured,
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

export const buildChatAiFallbackReply = (error) => {
  const details = error ? formatGroqApiError(error) : null;
  let reply = CHAT_AI_UNAVAILABLE_REPLY;

  if (config.nodeEnv === 'development' && details) {
    const hint = [
      details.isNotConfigured && 'GROQ_API_KEY is not set',
      details.status && `HTTP ${details.status}`,
      details.code,
      details.type,
      details.message,
      `model=${details.model}`,
    ]
      .filter(Boolean)
      .join(' — ');
    if (hint) {
      reply = `${reply}\n\n[Dev] ${hint}`;
    }
  }

  return reply;
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
        timeout,
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
