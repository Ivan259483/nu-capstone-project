export const SUGGESTED_CHAT_PROMPTS = [
  'SPF packages & pricing',
  'Book an appointment',
  'Track my vehicle',
  'Ceramic coating info',
] as const;

let localMessageSequence = 0;

type ChatStateMessage = {
  id?: string;
  sender: string;
  metadata?: Record<string, unknown>;
};

type SuggestedPromptVisibilityInput = {
  messages: readonly ChatStateMessage[];
  handoffStatus: string;
  hasError: boolean;
};

export function resolveChatSubmission(input: string, explicitMessage?: string): string {
  return (explicitMessage ?? input).trim();
}

export function createLocalChatMessageId(prefix: string): string {
  localMessageSequence += 1;
  return `${prefix}-${Date.now()}-${localMessageSequence}`;
}

export function resolveChatSendState(input: string, blocked: boolean) {
  const hasText = input.trim().length > 0;
  const disabled = blocked || !hasText;

  return {
    hasText,
    disabled,
    visuallyActive: hasText && !blocked,
  };
}

export function shouldShowSuggestedChatPrompts({
  messages,
  handoffStatus,
  hasError,
}: SuggestedPromptVisibilityInput): boolean {
  if (hasError || handoffStatus !== 'ai_handling' || messages.length !== 1) {
    return false;
  }

  const [message] = messages;
  const isWelcome =
    message.sender === 'assistant' &&
    (message.id === 'welcome' || message.metadata?.type === 'concierge_welcome');

  return isWelcome && !messages.some((item) => item.sender === 'user');
}
