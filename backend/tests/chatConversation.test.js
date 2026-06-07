import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildConversationPreview,
  buildConversationTitleFromMessage,
  buildNewThreadWelcomeReply,
  createConversationId,
  normalizeConversationStatus,
  serializeConversation,
} from '../services/chatConversation.service.js';
import ChatConversation from '../models/chatConversation.model.js';
import {
  detectSalesHandoffOffer,
  shouldOfferSalesHandoff,
} from '../utils/chatSalesHandoff.utils.js';

test('builds premium new-thread welcome copy', () => {
  const reply = buildNewThreadWelcomeReply('english');
  assert.match(reply, /Welcome to AutoSPF\+/);
  assert.match(reply, /bookings/i);
  assert.match(reply, /coatings/i);
  assert.match(reply, /How can I assist you today/i);
});

test('creates unique conversation ids', () => {
  const a = createConversationId();
  const b = createConversationId();
  assert.notEqual(a, b);
  assert.ok(a.length > 8);
});

test('derives inbox preview and title from user text', () => {
  const long = 'a'.repeat(140);
  assert.equal(buildConversationPreview(long).length, 120);
  assert.equal(buildConversationTitleFromMessage('Ceramic coating quote for SUV'), 'Ceramic coating quote for SUV');
  assert.match(buildConversationTitleFromMessage('x'.repeat(80)), /\.\.\.$/);
});

test('accepts canonical and legacy conversation statuses', () => {
  for (const status of [
    'open',
    'closed',
    'ai_handling',
    'needs_sales',
    'in_conversation',
    'resolved',
    'converted',
  ]) {
    const conversation = new ChatConversation({
      conversationId: `status-${status}`,
      status,
    });
    assert.equal(conversation.validateSync(), undefined);
  }
});

test('normalizes legacy statuses during API serialization', () => {
  assert.equal(normalizeConversationStatus('open'), 'ai_handling');
  assert.equal(normalizeConversationStatus('closed'), 'resolved');
  assert.equal(serializeConversation({ conversationId: 'legacy-open', status: 'open' }).status, 'ai_handling');
  assert.equal(serializeConversation({ conversationId: 'legacy-closed', status: 'closed' }).status, 'resolved');
});

test('offers Sales handoff for supported customer intents', () => {
  const cases = [
    ['Can I talk to a human representative?', 'human_help'],
    ['Please help me book an appointment.', 'booking_assistance'],
    ['I need booking assistance.', 'booking_assistance'],
    ['Available ba kayo this Saturday?', 'schedule_availability'],
    ['What appointment slots are available?', 'schedule_availability'],
    ['Can I reschedule my booking to next week?', 'reschedule'],
    ['I need to reschedule.', 'reschedule'],
    ['My GCash payment failed and is not showing.', 'payment_concern'],
    ['Magkano ang ceramic coating for a sedan?', 'pricing'],
  ];

  for (const [message, reason] of cases) {
    assert.equal(detectSalesHandoffOffer(message)?.reason, reason);
  }
});

test('does not offer Sales handoff for ordinary AI concierge questions', () => {
  for (const message of [
    'What is ceramic coating?',
    'Where is your studio?',
    'How should I wash a newly coated car?',
    'What is the difference between PPF and ceramic coating?',
  ]) {
    assert.equal(shouldOfferSalesHandoff(message), false);
  }
});
