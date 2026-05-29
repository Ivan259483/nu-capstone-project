import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGreetingConversationalState,
  buildMinimalGreetingFallback,
  hasRecentFullWelcome,
  looksLikeFullWelcomeMessage,
} from '../services/chatConciergeReasoning.service.js';

test('detects prior full welcome in assistant history', () => {
  const history = [
    { role: 'assistant', content: 'Welcome to AutoSPF+. How can I assist you today?' },
    { role: 'user', content: 'hi' },
  ];

  assert.equal(hasRecentFullWelcome(history), true);
  assert.equal(looksLikeFullWelcomeMessage('Welcome to AutoSPF+. How can I assist you today?'), true);
});

test('greeting state switches to returning mode after welcome', () => {
  const base = {
    conversation_mode: 'GENERAL_CONCIERGE',
    user_message: 'hello',
    session_memory: { preferred_language: 'english' },
    recent_conversation: [],
  };
  const history = [
    { role: 'assistant', content: 'Welcome to AutoSPF+. How can I assist you today?' },
  ];

  const state = buildGreetingConversationalState(base, { recentMessages: history });
  assert.equal(state.welcome_already_sent, true);
  assert.equal(state.conversation_mode, 'IDLE_CONCIERGE_RETURNING');
  assert.equal(state.greeting_cooldown_active, true);
});

test('minimal fallback uses short follow-up when welcome already sent', () => {
  const reply = buildMinimalGreetingFallback({
    welcome_already_sent: true,
    session_memory: { preferred_language: 'english' },
  });
  assert.match(reply, /Hey/i);
  assert.doesNotMatch(reply, /Welcome to AutoSPF\+/);
});
