import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyReplyDeduplication,
  buildContextualFallbackReply,
  buildUnsupportedLanguageReply,
  detectDirectAnswerIntent,
  detectLanguageSwitch,
  detectMessageLanguage,
  detectUnsupportedLanguageRequest,
  isFallbackRecentlyUsed,
  resolveConversationLanguage,
} from '../services/chatbotIntelligence.service.js';

test('detects explicit English language switches', () => {
  assert.deepEqual(detectLanguageSwitch('mag english kana'), {
    language: 'english',
    explicit: true,
  });
});

test('detects Taglish and respects persisted language preference', () => {
  assert.equal(detectMessageLanguage('ano ba location nyo?'), 'taglish');
  assert.equal(resolveConversationLanguage({ preferredLanguage: 'english' }, 'ano ba location nyo?'), 'english');
  assert.equal(resolveConversationLanguage({}, 'ano ba location nyo?'), 'taglish');
});

test('detects unsupported language capability requests without fallback', () => {
  assert.deepEqual(detectUnsupportedLanguageRequest('marunong ka mag arabia?'), {
    language: 'arabic',
  });
  assert.match(
    buildUnsupportedLanguageReply('taglish'),
    /English and Tagalog ang best supported/i
  );
});

test('ranks direct location questions before fallback handling', () => {
  const intent = detectDirectAnswerIntent('ano ba location nyo?');
  assert.equal(intent.intent, 'location');
  assert.equal(intent.topic, 'location');
  assert.ok(intent.confidence > 0.9);
});

test('fallback replies avoid the deprecated canned response', () => {
  const reply = buildContextualFallbackReply({ language: 'english' });
  assert.doesNotMatch(reply, /I am best at AutoSPF\+ services/i);
  assert.match(reply, /pricing|booking|tracker|location/i);
});

test('fallback cooldown and dedupe suppress repeated fallback loops', () => {
  const session = {
    lastFallbackAt: new Date(),
    lastAssistantReplySignature: '',
    lastTopic: 'pricing',
  };
  const first = buildContextualFallbackReply({
    language: 'english',
    lastTopic: session.lastTopic,
    fallbackRecentlyUsed: isFallbackRecentlyUsed(session),
  });
  const firstResult = applyReplyDeduplication({
    reply: first,
    session,
    language: 'english',
    dedupe: true,
  });
  session.lastAssistantReplySignature = firstResult.signature;

  const secondResult = applyReplyDeduplication({
    reply: first,
    session,
    language: 'english',
    dedupe: true,
  });

  assert.equal(secondResult.deduped, true);
  assert.notEqual(secondResult.reply, first);
  assert.doesNotMatch(secondResult.reply, /I am best at AutoSPF\+ services/i);
});

