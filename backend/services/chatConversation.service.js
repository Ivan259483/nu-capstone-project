import crypto from 'crypto';
import ChatConversation from '../models/chatConversation.model.js';
import ChatMessage from '../models/chatMessage.model.js';
import ChatSession from '../models/chatSession.model.js';
import { buildPremiumConciergeWelcomeReply } from '../utils/chatConciergeRouting.utils.js';

export const NEW_THREAD_WELCOME_COPY = Object.freeze({
  english: [
    'Welcome to AutoSPF+ 👋',
    '',
    'I can help with:',
    '• bookings',
    '• coatings',
    '• account setup',
    '• pricing',
    '• recommendations',
    '',
    'How can I assist you today?',
  ].join('\n'),
  tagalog: [
    'Welcome sa AutoSPF+ 👋',
    '',
    'Makakatulong ako sa:',
    '• booking',
    '• coatings',
    '• account setup',
    '• presyo',
    '• recommendations',
    '',
    'Paano kita matutulungan ngayon?',
  ].join('\n'),
  taglish: [
    'Welcome to AutoSPF+ 👋',
    '',
    'I can help with:',
    '• bookings',
    '• coatings',
    '• account setup',
    '• pricing',
    '• recommendations',
    '',
    'How can I assist you today?',
  ].join('\n'),
});

export const buildNewThreadWelcomeReply = (language = 'english') =>
  NEW_THREAD_WELCOME_COPY[language] || NEW_THREAD_WELCOME_COPY.english;

export const createConversationId = () => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export const buildConversationPreview = (message = '') => {
  const text = String(message || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  if (text.length <= 120) return text;
  return `${text.slice(0, 117)}...`;
};

export const buildConversationTitleFromMessage = (message = '') => {
  const text = String(message || '').trim().replace(/\s+/g, ' ');
  if (!text) return 'AutoSPF+ Concierge';
  if (text.length <= 48) return text;
  return `${text.slice(0, 45)}...`;
};

export const findConversationForAccess = async ({ conversationId, userId, guestKey }) => {
  const id = String(conversationId || '').trim();
  if (!id) return null;

  if (userId) {
    return ChatConversation.findOne({
      conversationId: id,
      $or: [
        { userId },
        ...(guestKey ? [{ guestKey }] : []),
      ],
    }).lean();
  }

  if (guestKey) {
    return ChatConversation.findOne({ conversationId: id, guestKey }).lean();
  }

  return null;
};

export const listConversationsForCustomer = async ({
  userId,
  guestKey,
  limit = 30,
} = {}) => {
  const filter = userId
    ? { $or: [{ userId }, ...(guestKey ? [{ guestKey }] : [])] }
    : guestKey
      ? { guestKey }
      : null;

  if (!filter) return [];

  return ChatConversation.find(filter)
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .limit(limit)
    .lean();
};

export const adoptLegacySessionAsConversation = async ({
  legacySessionId,
  userId,
  guestKey,
  source = 'web',
} = {}) => {
  const sessionId = String(legacySessionId || '').trim();
  if (!sessionId) return null;

  const existing = await ChatConversation.findOne({ conversationId: sessionId }).lean();
  if (existing) return existing;

  const hasMessages = await ChatMessage.exists({ sessionId });
  const hasSession = await ChatSession.exists({ sessionId });
  if (!hasMessages && !hasSession) return null;

  const lastMessage = await ChatMessage.findOne({ sessionId })
    .sort({ createdAt: -1 })
    .select('message createdAt sender')
    .lean();

  const preview = buildConversationPreview(lastMessage?.message || 'Previous conversation');
  const conversation = await ChatConversation.create({
    conversationId: sessionId,
    userId: userId || undefined,
    guestKey: guestKey || undefined,
    title: 'AutoSPF+ Concierge',
    mode: 'concierge',
    status: 'open',
    source,
    lastMessagePreview: preview,
    lastMessageAt: lastMessage?.createdAt || new Date(),
  });

  await ChatMessage.updateMany(
    { sessionId, conversationId: { $exists: false } },
    { $set: { conversationId: sessionId } }
  );

  return conversation.toObject();
};

export const seedWelcomeMessage = async ({
  conversationId,
  language = 'english',
  userId,
} = {}) => {
  const welcomeText = buildNewThreadWelcomeReply(language);
  const message = await ChatMessage.create({
    sessionId: conversationId,
    conversationId,
    userId: userId || undefined,
    sender: 'assistant',
    message: welcomeText,
    metadata: { type: 'concierge_welcome', intent: 'greeting', route: 'new_thread' },
  });

  return message;
};

export const createFreshConversation = async ({
  userId,
  guestKey,
  source = 'web',
  language = 'english',
  title = 'AutoSPF+ Concierge',
  mode = 'concierge',
} = {}) => {
  const conversationId = createConversationId();
  const welcomeText = buildNewThreadWelcomeReply(language);

  const [conversation, , welcomeMessage] = await Promise.all([
    ChatConversation.create({
      conversationId,
      userId: userId || undefined,
      guestKey: guestKey || undefined,
      title,
      mode,
      status: 'open',
      source,
      lastMessagePreview: buildConversationPreview(welcomeText),
      lastMessageAt: new Date(),
    }),
    ChatSession.findOneAndUpdate(
      { sessionId: conversationId },
      {
        $setOnInsert: {
          sessionId: conversationId,
          userId: userId || undefined,
          source,
        },
      },
      { upsert: true, new: true }
    ),
    ChatMessage.create({
      sessionId: conversationId,
      conversationId,
      userId: userId || undefined,
      sender: 'assistant',
      message: welcomeText,
      metadata: { type: 'concierge_welcome', intent: 'greeting', route: 'new_thread' },
    }),
  ]);

  return {
    conversation: conversation.toObject(),
    welcomeMessage: welcomeMessage.toObject(),
  };
};

export const touchConversationActivity = async (
  conversationId,
  { preview, at, title } = {}
) => {
  const update = {
    lastMessageAt: at || new Date(),
  };
  if (preview != null) {
    update.lastMessagePreview = buildConversationPreview(preview);
  }
  if (title) {
    update.title = title;
  }

  return ChatConversation.findOneAndUpdate(
    { conversationId },
    { $set: update },
    { new: true }
  ).lean();
};

export const maybeTitleConversationFromFirstUserMessage = async (
  conversationId,
  message = ''
) => {
  const text = String(message || '').trim();
  if (!text) return;

  const conversation = await ChatConversation.findOne({ conversationId }).select('title').lean();
  if (!conversation || conversation.title !== 'AutoSPF+ Concierge') return;

  await ChatConversation.updateOne(
    { conversationId },
    { $set: { title: buildConversationTitleFromMessage(text) } }
  );
};

export const serializeConversation = (conversation = {}) => ({
  conversationId: conversation.conversationId,
  title: conversation.title || 'AutoSPF+ Concierge',
  mode: conversation.mode || 'concierge',
  status: conversation.status || 'open',
  lastMessagePreview: conversation.lastMessagePreview || '',
  lastMessageAt: conversation.lastMessageAt,
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt,
});

export const serializeChatMessages = (messages = []) =>
  messages.map((m) => ({
    id: m._id,
    conversationId: m.conversationId || m.sessionId,
    sender: m.sender,
    message: m.message,
    createdAt: m.createdAt,
    metadata: m.metadata,
  }));
