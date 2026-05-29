import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPremiumConciergeWelcomeReply,
  classifyConversationRoute,
  hasExplicitRegistrationIntent,
  isGreetingMessage,
} from '../utils/chatConciergeRouting.utils.js';

test('detects pure greetings without triggering registration', () => {
  for (const phrase of ['hi', 'hello', 'hey', 'good morning', 'good evening', 'kamusta', 'hi po']) {
    assert.equal(isGreetingMessage(phrase), true, phrase);
    assert.equal(hasExplicitRegistrationIntent(phrase), false, phrase);
    assert.equal(classifyConversationRoute(phrase), 'greeting', phrase);
  }
});

test('does not treat business or registration messages as greetings', () => {
  assert.equal(isGreetingMessage('create account'), false);
  assert.equal(isGreetingMessage('how much ceramic coating'), false);
  assert.equal(isGreetingMessage('book appointment'), false);
  assert.equal(classifyConversationRoute('create account'), 'registration');
});

test('detects explicit registration intent in English and Taglish', () => {
  const phrases = [
    'create account',
    'register me',
    'sign up',
    'gawa account',
    'pa register',
    'i want an account',
    'gusto ko mag register',
  ];
  for (const phrase of phrases) {
    assert.equal(hasExplicitRegistrationIntent(phrase), true, phrase);
    assert.equal(classifyConversationRoute(phrase), 'registration', phrase);
  }
});

test('premium welcome includes concierge capabilities', () => {
  const reply = buildPremiumConciergeWelcomeReply('english');
  assert.match(reply, /Welcome to AutoSPF\+/);
  assert.match(reply, /account setup/i);
  assert.match(reply, /ceramic coating/i);
  assert.match(reply, /How can I assist you today/i);
});
