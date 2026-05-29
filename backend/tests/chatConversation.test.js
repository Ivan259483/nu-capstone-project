import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildConversationPreview,
  buildConversationTitleFromMessage,
  buildNewThreadWelcomeReply,
  createConversationId,
} from '../services/chatConversation.service.js';

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
