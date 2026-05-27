import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyReplyDeduplication,
  buildBusinessScopeRedirectReply,
  buildContextualFallbackReply,
  buildUnsupportedLanguageReply,
  detectBusinessConversationIntent,
  detectDirectAnswerIntent,
  detectLanguageSwitch,
  detectMessageLanguage,
  detectPackageInterestFromMessage,
  detectProtectionGoalFromMessage,
  detectServiceInterestFromMessage,
  detectUnsupportedLanguageRequest,
  isBusinessSideQuestionForOnboarding,
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

test('detects shorthand business questions before fallback handling', () => {
  assert.equal(detectDirectAnswerIntent('loc nyo?').intent, 'location');
  assert.equal(detectDirectAnswerIntent('hm coating?').intent, 'pricing');
  assert.equal(detectDirectAnswerIntent('open kayo today?').intent, 'hours');
  assert.equal(detectDirectAnswerIntent('ano package nyo?').intent, 'services');
  assert.equal(detectDirectAnswerIntent('ppf vs ceramic').intent, 'service_comparison');
});

test('detects business taxonomy and onboarding side questions', () => {
  assert.equal(detectBusinessConversationIntent('gawa acc').intent, 'account_registration');
  assert.equal(detectDirectAnswerIntent('what package fits best?').intent, 'package_recommendation');
  assert.equal(isBusinessSideQuestionForOnboarding('how much ceramic?'), true);
  assert.equal(isBusinessSideQuestionForOnboarding('my name is kevin'), false);
  assert.equal(isBusinessSideQuestionForOnboarding('what email should I use?'), false);
  assert.equal(isBusinessSideQuestionForOnboarding('contact number nyo?'), true);
});

test('extracts service, package, and protection goal memory signals', () => {
  assert.equal(detectServiceInterestFromMessage('price ceramic?').service, 'SPF Ceramic Coating');
  assert.equal(detectPackageInterestFromMessage('SPF 101 all in').label, 'SPF 101');
  assert.equal(detectProtectionGoalFromMessage('best protection for scratches'), 'maximum protection');
});

test('fallback replies avoid the deprecated canned response', () => {
  const reply = buildContextualFallbackReply({ language: 'english' });
  assert.doesNotMatch(reply, /I am best at AutoSPF\+ services/i);
  assert.match(reply, /pricing|booking|tracker|location/i);
});

test('off-topic redirects stay business focused without answering unrelated topics', () => {
  const reply = buildBusinessScopeRedirectReply({ language: 'english' });
  assert.match(reply, /AutoSPF\+ services/i);
  assert.match(reply, /vehicle protection|package/i);
  assert.doesNotMatch(reply, /NBA|weather|recipe/i);
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
