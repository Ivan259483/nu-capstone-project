import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { config } from '../config/environment.js';
import {
  handleSocketMessage,
  handleSocketStreamingMessage,
} from '../controllers/chatbot.controller.js';
import errorHandler from '../middleware/errorHandler.middleware.js';
import ChatConversation from '../models/chatConversation.model.js';
import ChatMessage from '../models/chatMessage.model.js';
import ChatSession from '../models/chatSession.model.js';
import Notification from '../models/notification.model.js';
import User from '../models/user.model.js';
import chatRoutes from '../routes/chatbot.routes.js';

let mongo;
let server;
let baseUrl;

const jsonRequest = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
};

const tokenFor = (user) =>
  jwt.sign(
    {
      id: user._id.toString(),
      role: user.role,
      email: user.email,
      name: user.name,
    },
    config.jwtSecret,
    { expiresIn: '1h' }
  );

const seedGuestConversation = async ({
  conversationId = 'guest-conversation',
  guestKey = 'guest-secret',
  withContact = true,
} = {}) => {
  await ChatConversation.create({
    conversationId,
    guestKey,
    status: 'ai_handling',
    source: 'web',
    lastMessagePreview: 'Can I talk to sales?',
  });
  await ChatSession.create({
    sessionId: conversationId,
    ...(withContact
      ? {
          leadName: 'Guest Customer',
          leadPhone: '09171234567',
        }
      : {}),
    lastVehicleLabel: '2024 Toyota Fortuner',
    lastServiceInterest: 'Ceramic coating',
  });
  await ChatMessage.create({
    sessionId: conversationId,
    conversationId,
    sender: 'user',
    message: 'Can I talk to sales?',
  });
  return { conversationId, guestKey };
};

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
  });
  await mongoose.connect(mongo.getUri('autospf-chat-sales-test'));

  const app = express();
  app.use(express.json());
  app.use('/api/chat', chatRoutes);
  app.use(errorHandler);
  server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('guest handoff and messages require the exact guest key', async () => {
  const { conversationId, guestKey } = await seedGuestConversation();

  const missing = await jsonRequest(
    `/api/chat/conversations/${conversationId}/messages`
  );
  assert.equal(missing.response.status, 400);
  assert.equal(missing.body.code, 'GUEST_KEY_REQUIRED');

  const wrong = await jsonRequest(
    `/api/chat/conversations/${conversationId}/messages?guestKey=wrong-key`
  );
  assert.equal(wrong.response.status, 404);

  const handoffWrong = await jsonRequest('/api/chat/handoff', {
    method: 'POST',
    body: JSON.stringify({
      conversationId,
      guestKey: 'wrong-key',
      lastMessage: 'Can I talk to sales?',
    }),
  });
  assert.equal(handoffWrong.response.status, 404);

  const handoff = await jsonRequest('/api/chat/handoff', {
    method: 'POST',
    body: JSON.stringify({
      conversationId,
      guestKey,
      lastMessage: 'Can I talk to sales?',
    }),
  });
  assert.equal(handoff.response.status, 201);
  assert.equal(handoff.body.conversation.status, 'needs_sales');
  assert.equal(handoff.body.conversation.customerPhone, '+639171234567');
  assert.equal(
    handoff.body.messages.find((message) => message.metadata?.type === 'sales_handoff')?.message,
    'Chat was escalated from AutoSPF+ AI to Sales.'
  );

  const stored = await ChatConversation.findOne({ conversationId }).lean();
  assert.notEqual(stored.customerPhone, '09171234567');
  assert.match(stored.customerPhone, /^[0-9a-f]{32}:/i);

  const retry = await jsonRequest('/api/chat/handoff', {
    method: 'POST',
    body: JSON.stringify({
      conversationId,
      guestKey,
      lastMessage: 'Can I talk to sales?',
    }),
  });
  assert.equal(retry.response.status, 200);
  const handoffMessages = await ChatMessage.countDocuments({
    conversationId,
    'metadata.type': 'sales_handoff',
  });
  assert.equal(handoffMessages, 1);

  const spoofed = await jsonRequest(
    `/api/chat/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        guestKey,
        senderType: 'sales',
        message: 'Spoofed reply',
      }),
    }
  );
  assert.equal(spoofed.response.status, 400);
  assert.equal(spoofed.body.code, 'INVALID_CHAT_SENDER');

  const customerMessage = await jsonRequest(
    `/api/chat/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        guestKey,
        senderType: 'customer',
        message: 'My preferred date is Friday.',
      }),
    }
  );
  assert.equal(customerMessage.response.status, 201);
  assert.equal(customerMessage.body.message.senderType, 'customer');

  const wrongWrite = await jsonRequest(
    `/api/chat/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        guestKey: 'wrong-key',
        message: 'This must not be saved.',
      }),
    }
  );
  assert.equal(wrongWrite.response.status, 404);
});

test('guest handoff requires valid contact details and saves them to the session', async () => {
  const { conversationId, guestKey } = await seedGuestConversation({
    conversationId: 'guest-contact-required',
    withContact: false,
  });

  const missing = await jsonRequest('/api/chat/handoff', {
    method: 'POST',
    body: JSON.stringify({ conversationId, guestKey }),
  });
  assert.equal(missing.response.status, 422);
  assert.equal(missing.body.code, 'SALES_CONTACT_REQUIRED');
  assert.deepEqual(missing.body.details.fields, ['name', 'phone']);

  const invalid = await jsonRequest('/api/chat/handoff', {
    method: 'POST',
    body: JSON.stringify({
      conversationId,
      guestKey,
      customerName: 'Guest Customer',
      customerPhone: '123',
    }),
  });
  assert.equal(invalid.response.status, 422);
  assert.deepEqual(invalid.body.details.fields, ['phone']);

  const connected = await jsonRequest('/api/chat/handoff', {
    method: 'POST',
    body: JSON.stringify({
      conversationId,
      guestKey,
      customerName: 'Guest Customer',
      customerPhone: '09171234567',
    }),
  });
  assert.equal(connected.response.status, 201);
  assert.equal(connected.body.conversation.status, 'needs_sales');

  const session = await ChatSession.findOne({ sessionId: conversationId }).lean();
  assert.equal(session.leadName, 'Guest Customer');
  assert.equal(session.leadPhone, '+639171234567');
});

test('offering the Sales CTA does not hand off or notify staff before the click', async () => {
  const { conversationId } = await seedGuestConversation({
    conversationId: 'offer-only-conversation',
  });

  const response = await jsonRequest('/api/chat/message', {
    method: 'POST',
    body: JSON.stringify({
      sessionId: conversationId,
      message: 'Can I talk to a human representative?',
    }),
  });
  assert.equal(response.response.status, 200);
  assert.equal(response.body.handoffOffer.reason, 'human_help');

  const conversation = await ChatConversation.findOne({ conversationId }).lean();
  assert.equal(conversation.status, 'ai_handling');
  assert.equal(conversation.handedOffAt, undefined);
  assert.equal(await Notification.countDocuments({ 'metadata.sessionId': conversationId }), 0);
});

test('customer Sales messages cannot implicitly promote an AI conversation', async () => {
  const { conversationId, guestKey } = await seedGuestConversation({
    conversationId: 'explicit-click-required',
  });

  const response = await jsonRequest(
    `/api/chat/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        guestKey,
        senderType: 'customer',
        message: 'This must stay in the AI flow.',
      }),
    }
  );
  assert.equal(response.response.status, 409);
  assert.equal(response.body.code, 'SALES_HANDOFF_REQUIRED');

  const conversation = await ChatConversation.findOne({ conversationId }).lean();
  assert.equal(conversation.status, 'ai_handling');
  assert.equal(conversation.handedOffAt, undefined);
});

test('logged-in customer handoff uses account identity without contact capture', async () => {
  const customer = await User.create({
    name: 'Account Customer',
    email: 'account-customer@example.com',
    role: 'customer',
    status: 'active',
    isActive: true,
  });
  await ChatConversation.create({
    conversationId: 'account-customer-conversation',
    userId: customer._id,
    status: 'ai_handling',
    source: 'web',
  });
  await ChatSession.create({
    sessionId: 'account-customer-conversation',
    userId: customer._id,
  });

  const response = await jsonRequest('/api/chat/handoff', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenFor(customer)}` },
    body: JSON.stringify({ conversationId: 'account-customer-conversation' }),
  });
  assert.equal(response.response.status, 201);
  assert.equal(response.body.conversation.customerName, 'Account Customer');
  assert.equal(response.body.conversation.customerEmail, 'account-customer@example.com');
  assert.equal(response.body.conversation.status, 'needs_sales');
});

test('Sales routes require a live allowed role and persist replies, assignment, unread, and status', async () => {
  const { conversationId, guestKey } = await seedGuestConversation();
  await jsonRequest('/api/chat/handoff', {
    method: 'POST',
    body: JSON.stringify({ conversationId, guestKey }),
  });

  const customer = await User.create({
    name: 'Customer One',
    email: 'customer-one@example.com',
    role: 'customer',
    status: 'active',
    isActive: true,
  });
  const sales = await User.create({
    name: 'Sales One',
    email: 'sales-one@example.com',
    role: 'sales',
    avatar: 'https://cdn.example.com/sales-one-avatar.jpg',
    status: 'active',
    isActive: true,
  });
  const customerToken = tokenFor(customer);
  const salesToken = tokenFor(sales);

  const denied = await jsonRequest('/api/chat/sales/conversations', {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  assert.equal(denied.response.status, 403);

  const list = await jsonRequest('/api/chat/sales/conversations?search=0917', {
    headers: { Authorization: `Bearer ${salesToken}` },
  });
  assert.equal(list.response.status, 200);
  assert.equal(list.body.conversations.length, 1);

  const reply = await jsonRequest(
    `/api/chat/sales/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${salesToken}` },
      body: JSON.stringify({
        senderType: 'sales',
        message: 'A Sales adviser is now reviewing your request.',
      }),
    }
  );
  assert.equal(reply.response.status, 201);
  assert.equal(reply.body.conversation.status, 'in_conversation');
  assert.equal(reply.body.conversation.unreadForCustomer, true);
  assert.equal(reply.body.conversation.assignedSalesName, 'Sales One');
  assert.equal(reply.body.conversation.assignedSalesUser.name, 'Sales One');
  assert.equal(
    reply.body.conversation.assignedSalesUser.profileImage,
    'https://cdn.example.com/sales-one-avatar.jpg'
  );
  assert.equal(
    reply.body.conversation.assignedSalesUser.avatarUrl,
    'https://cdn.example.com/sales-one-avatar.jpg'
  );
  assert.equal(
    reply.body.conversation.assignedSalesUser.avatar,
    'https://cdn.example.com/sales-one-avatar.jpg'
  );
  assert.equal('password' in reply.body.conversation.assignedSalesUser, false);
  assert.equal(reply.body.message.senderType, 'sales');
  assert.equal(
    reply.body.message.senderAvatarUrl,
    'https://cdn.example.com/sales-one-avatar.jpg'
  );

  const customerMessages = await jsonRequest(
    `/api/chat/conversations/${conversationId}/messages?guestKey=${guestKey}`
  );
  assert.equal(customerMessages.response.status, 200);
  assert.equal(
    customerMessages.body.conversation.lastHumanResponder.profileImage,
    'https://cdn.example.com/sales-one-avatar.jpg'
  );
  assert.equal(
    customerMessages.body.messages.find((message) => message.sender === 'sales')
      .senderAvatarUrl,
    'https://cdn.example.com/sales-one-avatar.jpg'
  );

  const customerDetail = await jsonRequest(
    `/api/chat/conversations/${conversationId}?guestKey=${guestKey}`
  );
  assert.equal(customerDetail.response.status, 200);
  assert.equal(
    customerDetail.body.conversation.assignedSalesUser.profileImage,
    'https://cdn.example.com/sales-one-avatar.jpg'
  );

  const customerList = await jsonRequest(
    `/api/chat/conversations?guestKey=${guestKey}`
  );
  assert.equal(customerList.response.status, 200);
  assert.equal(
    customerList.body.conversations[0].assignedSalesUser.profileImage,
    'https://cdn.example.com/sales-one-avatar.jpg'
  );
  assert.equal(
    customerList.body.conversations[0].lastHumanResponder.avatarUrl,
    'https://cdn.example.com/sales-one-avatar.jpg'
  );

  const joinedCount = await ChatMessage.countDocuments({
    conversationId,
    'metadata.type': 'sales_joined',
  });
  assert.equal(joinedCount, 1);
  const joinedMessage = await ChatMessage.findOne({
    conversationId,
    'metadata.type': 'sales_joined',
  }).lean();
  assert.equal(joinedMessage.message, 'Sales joined the conversation.');

  const assign = await jsonRequest(
    `/api/chat/sales/conversations/${conversationId}/assign`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${salesToken}` },
      body: '{}',
    }
  );
  assert.equal(assign.response.status, 200);
  assert.equal(assign.body.conversation.assignedSalesName, 'Sales One');

  const resolve = await jsonRequest(
    `/api/chat/sales/conversations/${conversationId}/status`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${salesToken}` },
      body: JSON.stringify({ status: 'resolved' }),
    }
  );
  assert.equal(resolve.response.status, 200);
  assert.equal(resolve.body.conversation.status, 'resolved');

  const closedCustomerWrite = await jsonRequest(
    `/api/chat/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        guestKey,
        senderType: 'customer',
        message: 'This must be rejected while resolved.',
      }),
    }
  );
  assert.equal(closedCustomerWrite.response.status, 409);
  assert.equal(closedCustomerWrite.body.code, 'CHAT_CONVERSATION_CLOSED');

  const reopen = await jsonRequest(
    `/api/chat/sales/conversations/${conversationId}/status`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${salesToken}` },
      body: JSON.stringify({ status: 'in_conversation' }),
    }
  );
  assert.equal(reopen.response.status, 200);
  assert.equal(reopen.body.conversation.status, 'in_conversation');

  const reopenedCustomerWrite = await jsonRequest(
    `/api/chat/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        guestKey,
        senderType: 'customer',
        message: 'Thanks for reopening this conversation.',
      }),
    }
  );
  assert.equal(reopenedCustomerWrite.response.status, 201);

  const invalidLegacyWrite = await jsonRequest(
    `/api/chat/sales/conversations/${conversationId}/status`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${salesToken}` },
      body: JSON.stringify({ status: 'closed' }),
    }
  );
  assert.equal(invalidLegacyWrite.response.status, 400);
});

test('simultaneous first Sales replies join and assign the conversation exactly once', async () => {
  const { conversationId, guestKey } = await seedGuestConversation({
    conversationId: 'concurrent-sales-join',
  });
  await jsonRequest('/api/chat/handoff', {
    method: 'POST',
    body: JSON.stringify({ conversationId, guestKey }),
  });

  const sales = await User.create({
    name: 'Concurrent Sales',
    email: 'concurrent-sales@example.com',
    role: 'sales',
    status: 'active',
    isActive: true,
  });
  const salesToken = tokenFor(sales);
  const replies = await Promise.all(
    ['First concurrent reply', 'Second concurrent reply'].map((message) =>
      jsonRequest(`/api/chat/sales/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${salesToken}` },
        body: JSON.stringify({ senderType: 'sales', message }),
      })
    )
  );

  assert.deepEqual(
    replies.map(({ response }) => response.status),
    [201, 201]
  );
  assert.deepEqual(
    replies.map(({ body }) => Boolean(body.joinedNow)).sort(),
    [false, true]
  );
  assert.equal(
    await ChatMessage.countDocuments({
      conversationId,
      'metadata.type': 'sales_joined',
    }),
    1
  );
  assert.equal(
    await ChatMessage.countDocuments({ conversationId, sender: 'sales' }),
    2
  );

  const conversation = await ChatConversation.findOne({ conversationId }).lean();
  assert.equal(conversation.status, 'in_conversation');
  assert.equal(conversation.assignedSalesId.toString(), sales._id.toString());
  assert.equal(conversation.assignedSalesName, 'Concurrent Sales');
});

test('logged-in customers cannot read another customer conversation', async () => {
  const owner = await User.create({
    name: 'Owner',
    email: 'owner@example.com',
    role: 'customer',
    status: 'active',
    isActive: true,
  });
  const other = await User.create({
    name: 'Other',
    email: 'other@example.com',
    role: 'customer',
    status: 'active',
    isActive: true,
  });
  await ChatConversation.create({
    conversationId: 'owned-conversation',
    userId: owner._id,
    guestKey: 'owner-guest-key',
    status: 'needs_sales',
    handedOffAt: new Date(),
  });

  const response = await jsonRequest(
    '/api/chat/conversations/owned-conversation/messages?guestKey=owner-guest-key',
    {
      headers: { Authorization: `Bearer ${tokenFor(other)}` },
    }
  );
  assert.equal(response.response.status, 404);
});

test('AI HTTP, SSE, and existing Socket.IO paths are blocked during Sales handoff', async () => {
  const { conversationId, guestKey } = await seedGuestConversation({
    conversationId: 'blocked-ai-conversation',
  });
  await jsonRequest('/api/chat/handoff', {
    method: 'POST',
    body: JSON.stringify({ conversationId, guestKey }),
  });

  const http = await jsonRequest('/api/chat/message', {
    method: 'POST',
    body: JSON.stringify({ sessionId: conversationId, message: 'AI reply please' }),
  });
  assert.equal(http.response.status, 409);
  assert.equal(http.body.code, 'SALES_HANDOFF_ACTIVE');

  const sse = await jsonRequest('/api/chat/message/stream', {
    method: 'POST',
    body: JSON.stringify({ sessionId: conversationId, message: 'AI stream please' }),
  });
  assert.equal(sse.response.status, 409);
  assert.equal(sse.body.code, 'SALES_HANDOFF_ACTIVE');

  const socketEvents = [];
  const socket = {
    id: 'socket-test',
    user: null,
    join() {},
    emit(event, payload) {
      socketEvents.push({ event, payload });
    },
  };
  const io = {
    to() {
      return {
        emit(event, payload) {
          socketEvents.push({ event, payload });
        },
      };
    },
  };

  await handleSocketMessage(io, socket, {
    sessionId: conversationId,
    message: 'Socket AI please',
  });
  assert.equal(
    socketEvents.find((entry) => entry.event === 'chat:error')?.payload?.code,
    'SALES_HANDOFF_ACTIVE'
  );

  socketEvents.length = 0;
  await handleSocketStreamingMessage(io, socket, {
    sessionId: conversationId,
    message: 'Socket stream AI please',
    clientMessageId: 'client-message',
  });
  assert.equal(
    socketEvents.find((entry) => entry.event === 'chat:stream:error')?.payload?.code,
    'SALES_HANDOFF_ACTIVE'
  );
});
