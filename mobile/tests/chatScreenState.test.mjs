import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveChatSendState,
  resolveChatSubmission,
  shouldShowSuggestedChatPrompts,
  SUGGESTED_CHAT_PROMPTS,
} from '../src/utils/chat-screen-state.ts';

const welcome = {
  id: 'welcome-1',
  sender: 'assistant',
  metadata: { type: 'concierge_welcome' },
};

test('empty-state suggestions expose the exact approved prompts', () => {
  assert.deepEqual([...SUGGESTED_CHAT_PROMPTS], [
    'SPF packages & pricing',
    'Book an appointment',
    'Track my vehicle',
    'Ceramic coating info',
  ]);
});

test('send button is active only for sendable non-whitespace text', () => {
  assert.deepEqual(resolveChatSendState('   ', false), {
    hasText: false,
    disabled: true,
    visuallyActive: false,
  });
  assert.deepEqual(resolveChatSendState(' Ceramic coating ', false), {
    hasText: true,
    disabled: false,
    visuallyActive: true,
  });
  assert.deepEqual(resolveChatSendState('Blocked while loading', true), {
    hasText: true,
    disabled: true,
    visuallyActive: false,
  });
});

test('an explicit suggested prompt goes directly through the send payload resolver', () => {
  assert.equal(resolveChatSubmission('draft text', SUGGESTED_CHAT_PROMPTS[0]), 'SPF packages & pricing');
  assert.equal(resolveChatSubmission('  typed message  '), 'typed message');
});

test('suggested prompts appear only for a fresh authoritative welcome', () => {
  assert.equal(shouldShowSuggestedChatPrompts({
    messages: [welcome],
    handoffStatus: 'ai_handling',
    hasError: false,
  }), true);
  assert.equal(shouldShowSuggestedChatPrompts({
    messages: [{ id: 'welcome', sender: 'assistant' }],
    handoffStatus: 'ai_handling',
    hasError: false,
  }), true);
});

test('suggested prompts hide immediately after the optimistic user message is appended', () => {
  assert.equal(shouldShowSuggestedChatPrompts({
    messages: [welcome, { id: 'user-1', sender: 'user' }],
    handoffStatus: 'ai_handling',
    hasError: false,
  }), false);
});

test('suggested prompts stay hidden for restored, error, and Sales conversations', () => {
  const restored = [
    welcome,
    { id: 'user-1', sender: 'user' },
    { id: 'assistant-2', sender: 'assistant' },
  ];

  assert.equal(shouldShowSuggestedChatPrompts({
    messages: restored,
    handoffStatus: 'ai_handling',
    hasError: false,
  }), false);
  assert.equal(shouldShowSuggestedChatPrompts({
    messages: [welcome],
    handoffStatus: 'ai_handling',
    hasError: true,
  }), false);
  assert.equal(shouldShowSuggestedChatPrompts({
    messages: [welcome],
    handoffStatus: 'needs_sales',
    hasError: false,
  }), false);
});
