import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildConversationalState,
  buildPostSentOnboardingReply,
  isOnboardingContext,
  mapOnboardingStateLabel,
  shouldPreferGroqReply,
} from '../services/chatConciergeReasoning.service.js';

test('maps post-sent onboarding state for account clarification questions', () => {
  const session = {
    onboarding: {
      status: 'sent',
      step: 'email',
      draft: {
        firstName: 'Ivan',
        lastName: 'Jesalva',
        email: 'ivan@example.com',
        phone: '09171234567',
      },
    },
  };

  assert.equal(isOnboardingContext(session), true);
  assert.equal(mapOnboardingStateLabel(session), 'ACCOUNT_PENDING_EMAIL_SETUP');

  const state = buildConversationalState({
    session,
    message: 'oh it mean its already create?',
    recentMessages: [
      { role: 'assistant', content: 'Secure setup email sent.' },
      { role: 'user', content: 'oh it mean its already create?' },
    ],
    language: 'english',
  });

  assert.equal(state.conversation_mode, 'ACTIVE_ONBOARDING');
  assert.equal(state.onboarding_state, 'ACCOUNT_PENDING_EMAIL_SETUP');
  assert.equal(state.customer_data.email, 'ivan@example.com');
  assert.equal(state.user_message, 'oh it mean its already create?');
});

test('prefers Groq reply when confidence is moderate but reply exists', () => {
  assert.equal(
    shouldPreferGroqReply({
      source: 'groq',
      confidence: 0.62,
      reply: 'Your account is almost ready. Check your email for the secure setup link.',
    }),
    true
  );
  assert.equal(shouldPreferGroqReply({ source: 'groq', confidence: 0.2, reply: '' }), false);
});

test('builds post-sent onboarding reassurance copy', () => {
  const reply = buildPostSentOnboardingReply({ email: 'ivan@example.com' });
  assert.match(reply, /almost ready/i);
  assert.match(reply, /ivan@example.com/);
  assert.match(reply, /secure link/i);
});
