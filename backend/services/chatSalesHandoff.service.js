import crypto from 'crypto';
import mongoose from 'mongoose';
import ChatConversation from '../models/chatConversation.model.js';
import ChatMessage from '../models/chatMessage.model.js';
import ChatSession from '../models/chatSession.model.js';
import User from '../models/user.model.js';
import Vehicle from '../models/vehicle.model.js';
import { decrypt, encrypt } from '../utils/encryption.utils.js';
import {
  validateChatRegistrationPhone,
  validateNamePart,
} from './chatRegistration.service.js';
import {
  adoptLegacySessionAsConversation,
  buildConversationPreview,
  CANONICAL_CHAT_STATUSES,
  createFreshConversation,
  findConversationForAccess,
  normalizeConversationStatus,
  serializeChatMessages,
  serializeConversation,
} from './chatConversation.service.js';

export const SALES_CHAT_ROLES = Object.freeze(['sales', 'administrator', 'office_admin']);
export const SALES_HANDOFF_ACTIVE_STATUSES = Object.freeze([
  'needs_sales',
  'in_conversation',
  'resolved',
  'converted',
]);

export const HANDOFF_SYSTEM_MESSAGE = 'Chat was escalated from AutoSPF+ AI to Sales.';
const SALES_JOINED_SYSTEM_MESSAGE = 'Sales joined the conversation.';
const ENCRYPTED_VALUE_PATTERN = /^[0-9a-f]{32}:[0-9a-f]+$/i;
const CHAT_AGENT_USER_FIELDS =
  '_id name role email avatar photoURL profileImage profilePhoto image photo';
const CHAT_AGENT_IMAGE_FIELDS = Object.freeze([
  'avatarUrl',
  'avatar',
  'profileImage',
  'photoURL',
  'profilePhoto',
  'image',
  'photo',
]);

const clean = (value = '') => String(value || '').trim();
const normalizePhone = (value = '') => clean(value).replace(/[^\d+]/g, '');
const isHttpImage = (value = '') => /^https?:\/\//i.test(clean(value));
const isInlineImage = (value = '') => /^data:image\//i.test(clean(value));

const resolveChatAgentImage = (user = {}) => {
  const candidates = CHAT_AGENT_IMAGE_FIELDS
    .map((field) => clean(user?.[field]))
    .filter((value) => value && !value.startsWith('blob:'));

  return (
    candidates.find(isHttpImage) ||
    candidates.find(isInlineImage) ||
    candidates[0] ||
    ''
  );
};

const encryptPhone = (value = '') => {
  const phone = clean(value);
  if (!phone || ENCRYPTED_VALUE_PATTERN.test(phone)) return phone;
  return encrypt(phone);
};

const decryptPhone = (value = '') => {
  const phone = clean(value);
  if (!phone) return '';
  return decrypt(phone);
};

const escapeRegex = (value = '') =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const createHttpError = (status, code, message, details) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
};

export const createSalesHandoffError = () =>
  createHttpError(
    409,
    'SALES_HANDOFF_ACTIVE',
    'This conversation is currently handled by AutoSPF+ Sales.'
  );

export const assertAiMessageAllowed = async (conversationId) => {
  const id = clean(conversationId);
  if (!id) return null;

  const conversation = await ChatConversation.findOne({ conversationId: id })
    .select('conversationId status handedOffAt')
    .lean();
  if (!conversation) return null;

  const status = normalizeConversationStatus(conversation.status);
  if (SALES_HANDOFF_ACTIVE_STATUSES.includes(status) || conversation.handedOffAt) {
    throw createSalesHandoffError();
  }
  return conversation;
};

const getCustomerSnapshot = async ({ userId, session, body = {} }) => {
  if (userId) {
    const user = await User.findById(userId).select('name email phone').exec();
    return {
      customerName: clean(user?.name) || 'Customer',
      customerEmail: clean(user?.email),
      customerPhone: clean(user?.phone),
    };
  }

  return {
    customerName: clean(body.customerName || session?.leadName),
    customerEmail: clean(body.customerEmail || session?.leadEmail),
    customerPhone: clean(body.customerPhone || session?.leadPhone),
  };
};

const requireGuestContact = (snapshot = {}) => {
  const nameResult = validateNamePart(snapshot.customerName, 'name');
  const phoneResult = validateChatRegistrationPhone(snapshot.customerPhone);
  const missingFields = [];
  if (!nameResult.ok) missingFields.push('name');
  if (!phoneResult.ok) missingFields.push('phone');

  if (missingFields.length) {
    throw createHttpError(
      422,
      'SALES_CONTACT_REQUIRED',
      'Please share your name and valid Philippine mobile number before connecting to Sales.',
      { fields: missingFields }
    );
  }

  return {
    ...snapshot,
    customerName: nameResult.value,
    customerPhone: phoneResult.value,
  };
};

const resolveOwnedVehicle = async ({ vehicleId, userId }) => {
  if (!vehicleId || !userId || !mongoose.isValidObjectId(vehicleId)) return null;
  return Vehicle.findOne({ _id: vehicleId, customer: userId }).lean();
};

const buildAiSummary = ({ session, latestCustomerMessage = '' }) => {
  const parts = [
    session?.lastVehicleLabel ? `Vehicle: ${session.lastVehicleLabel}` : '',
    session?.lastServiceInterest ? `Service: ${session.lastServiceInterest}` : '',
    session?.lastPackageInterest ? `Package: ${session.lastPackageInterest}` : '',
    session?.lastProtectionGoal ? `Goal: ${session.lastProtectionGoal}` : '',
    latestCustomerMessage ? `Latest request: ${clean(latestCustomerMessage)}` : '',
  ].filter(Boolean);
  return parts.join(' | ').slice(0, 1000);
};

const ensureSystemMessage = async ({ conversationId, type, message }) => {
  const existing = await ChatMessage.findOne({
    conversationId,
    sender: 'system',
    'metadata.type': type,
  }).lean();
  if (existing) {
    if (existing.message !== message) {
      await ChatMessage.updateOne({ _id: existing._id }, { $set: { message } });
      return { ...existing, message };
    }
    return existing;
  }

  const deterministicId = new mongoose.Types.ObjectId(
    crypto
      .createHash('sha256')
      .update(`${conversationId}:${type}`)
      .digest('hex')
      .slice(0, 24)
  );
  try {
    return await ChatMessage.findOneAndUpdate(
      { _id: deterministicId },
      {
        $set: { message },
        $setOnInsert: {
          sessionId: conversationId,
          conversationId,
          sender: 'system',
          metadata: { type },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
  } catch (error) {
    if (error?.code === 11000) {
      return ChatMessage.findById(deterministicId).lean();
    }
    throw error;
  }
};

const getLatestCustomerMessage = async (conversationId) =>
  ChatMessage.findOne({
    $or: [{ conversationId }, { sessionId: conversationId }],
    sender: 'user',
  })
    .sort({ createdAt: -1 })
    .lean();

const createCustomerMessageIfMissing = async ({
  conversationId,
  message,
  userId,
  senderName,
}) => {
  const text = clean(message);
  if (!text) return null;
  const latest = await getLatestCustomerMessage(conversationId);
  if (clean(latest?.message) === text) return latest;

  return ChatMessage.create({
    sessionId: conversationId,
    conversationId,
    userId: userId || undefined,
    senderId: userId || undefined,
    senderName,
    sender: 'user',
    message: text,
    metadata: { type: 'sales_handoff_initial_message' },
  });
};

export const serializeSalesConversation = (conversation = {}) => ({
  conversationId: conversation.conversationId,
  customerId: conversation.userId || null,
  customerName: conversation.customerName || 'Guest',
  customerEmail: conversation.customerEmail || '',
  customerPhone: decryptPhone(conversation.customerPhone),
  vehicleId: conversation.vehicleId || null,
  vehicleLabel: conversation.vehicleLabel || '',
  plateNumber: conversation.plateNumber || '',
  serviceInterest: conversation.serviceInterest || '',
  source: conversation.source || 'ai_chatbot',
  status: normalizeConversationStatus(conversation.status),
  assignedSalesId: conversation.assignedSalesId || null,
  assignedSalesName: conversation.assignedSalesName || '',
  lastMessage: conversation.lastMessage || conversation.lastMessagePreview || '',
  lastMessagePreview: conversation.lastMessagePreview || '',
  lastMessageAt: conversation.lastMessageAt,
  unreadForSales: Boolean(conversation.unreadForSales),
  unreadForCustomer: Boolean(conversation.unreadForCustomer),
  aiSummary: conversation.aiSummary || '',
  handedOffAt: conversation.handedOffAt || null,
  salesJoinedAt: conversation.salesJoinedAt || null,
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt,
});

const serializeChatAgentProfile = (user, fallback = {}) => {
  const id = clean(user?._id || user?.id || fallback.id);
  const name = clean(user?.name || fallback.name) || 'Sales Team';
  const role = clean(user?.role || fallback.role) || 'sales';
  const email = clean(user?.email || fallback.email);
  const profileImage = resolveChatAgentImage(user);

  return {
    ...(id ? { _id: id, id } : {}),
    name,
    fullName: name,
    role,
    ...(email ? { email } : {}),
    ...(profileImage
      ? {
          avatar: profileImage,
          profileImage,
          avatarUrl: profileImage,
          photoURL: profileImage,
        }
      : {}),
  };
};

const getLatestSalesMessage = (messages = []) =>
  [...messages].reverse().find((message) => message?.sender === 'sales') || null;

export const serializeChatConversationPayload = async (
  conversation = {},
  messages = [],
  { conversationSerializer = serializeSalesConversation } = {}
) => {
  const latestSalesMessage = getLatestSalesMessage(messages);
  const assignedSalesId = clean(conversation.assignedSalesId);
  const lastResponderId = clean(latestSalesMessage?.senderId);
  const salesSenderIds = messages
    .filter((message) => message?.sender === 'sales')
    .map((message) => clean(message.senderId));
  const userIds = [
    ...new Set(
      [assignedSalesId, lastResponderId, ...salesSenderIds]
        .filter((id) => mongoose.isValidObjectId(id))
    ),
  ];
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } })
        .select(CHAT_AGENT_USER_FIELDS)
        .lean()
    : [];
  const usersById = new Map(users.map((user) => [String(user._id), user]));

  const assignedSalesUser =
    assignedSalesId || clean(conversation.assignedSalesName)
      ? serializeChatAgentProfile(usersById.get(assignedSalesId), {
          id: assignedSalesId,
          name: conversation.assignedSalesName,
        })
      : null;
  const lastHumanResponder = latestSalesMessage
    ? serializeChatAgentProfile(usersById.get(lastResponderId), {
        id: lastResponderId,
        name: latestSalesMessage.senderName,
      })
    : null;

  const serializedMessages = serializeChatMessages(messages).map((message) => {
    if (message.sender !== 'sales') return message;
    const senderId = clean(message.senderId);
    const senderProfile = serializeChatAgentProfile(usersById.get(senderId), {
      id: senderId,
      name: message.senderName,
    });
    return {
      ...message,
      senderName: senderProfile.name,
      senderProfile,
      ...(senderProfile.profileImage
        ? {
            senderAvatarUrl: senderProfile.profileImage,
          }
        : {}),
    };
  });

  return {
    conversation: {
      ...conversationSerializer(conversation),
      ...(assignedSalesId
        ? {
            assignedSalesId,
            assignedSalesName: assignedSalesUser?.name || '',
          }
        : {}),
      ...(assignedSalesUser
        ? {
            assignedSalesUser,
            assignedStaff: assignedSalesUser,
          }
        : {}),
      ...(lastHumanResponder ? { lastHumanResponder } : {}),
    },
    messages: serializedMessages,
  };
};

export const serializeChatConversationList = async (
  conversations = [],
  { conversationSerializer = serializeSalesConversation } = {}
) => {
  const conversationIds = conversations
    .map((conversation) => clean(conversation.conversationId))
    .filter(Boolean);
  const latestSalesMessages = conversationIds.length
    ? await ChatMessage.aggregate([
        {
          $match: {
            sender: 'sales',
            $or: [
              { conversationId: { $in: conversationIds } },
              { sessionId: { $in: conversationIds } },
            ],
          },
        },
        {
          $addFields: {
            resolvedConversationId: { $ifNull: ['$conversationId', '$sessionId'] },
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$resolvedConversationId',
            message: { $first: '$$ROOT' },
          },
        },
        { $replaceRoot: { newRoot: '$message' } },
        {
          $project: {
            conversationId: 1,
            sessionId: 1,
            senderId: 1,
            senderName: 1,
            createdAt: 1,
          },
        },
      ])
    : [];
  const latestSalesByConversation = new Map();
  for (const message of latestSalesMessages) {
    const conversationId = clean(message.conversationId || message.sessionId);
    if (conversationId && !latestSalesByConversation.has(conversationId)) {
      latestSalesByConversation.set(conversationId, message);
    }
  }

  const userIds = [
    ...new Set(
      [
        ...conversations.map((conversation) => clean(conversation.assignedSalesId)),
        ...latestSalesMessages.map((message) => clean(message.senderId)),
      ]
        .filter((id) => mongoose.isValidObjectId(id))
    ),
  ];
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } })
        .select(CHAT_AGENT_USER_FIELDS)
        .lean()
    : [];
  const usersById = new Map(users.map((user) => [String(user._id), user]));

  return conversations.map((conversation) => {
    const assignedSalesId = clean(conversation.assignedSalesId);
    const latestSalesMessage = latestSalesByConversation.get(
      clean(conversation.conversationId)
    );
    const lastResponderId = clean(latestSalesMessage?.senderId);
    const assignedSalesUser =
      assignedSalesId || clean(conversation.assignedSalesName)
        ? serializeChatAgentProfile(usersById.get(assignedSalesId), {
            id: assignedSalesId,
            name: conversation.assignedSalesName,
          })
        : null;
    const lastHumanResponder = latestSalesMessage
      ? serializeChatAgentProfile(usersById.get(lastResponderId), {
          id: lastResponderId,
          name: latestSalesMessage.senderName,
        })
      : null;
    return {
      ...conversationSerializer(conversation),
      ...(assignedSalesId
        ? {
            assignedSalesId,
            assignedSalesName: assignedSalesUser?.name || '',
          }
        : {}),
      ...(assignedSalesUser
        ? {
            assignedSalesUser,
            assignedStaff: assignedSalesUser,
          }
        : {}),
      ...(lastHumanResponder ? { lastHumanResponder } : {}),
    };
  });
};

export const serializeCustomerChatConversationPayload = (
  conversation = {},
  messages = []
) =>
  serializeChatConversationPayload(conversation, messages, {
    conversationSerializer: serializeConversation,
  });

export const serializeCustomerChatConversationList = (conversations = []) =>
  serializeChatConversationList(conversations, {
    conversationSerializer: serializeConversation,
  });

export const promoteConversationToSales = async ({
  conversationId,
  userId,
  guestKey,
  body = {},
  source = 'web',
}) => {
  let id = clean(conversationId);
  let conversation = id
    ? await findConversationForAccess({ conversationId: id, userId, guestKey })
    : null;

  if (!conversation && id) {
    await adoptLegacySessionAsConversation({
      legacySessionId: id,
      userId,
      guestKey,
      source,
    });
    conversation = await findConversationForAccess({
      conversationId: id,
      userId,
      guestKey,
    });
  }

  if (!conversation && id) {
    throw createHttpError(404, 'CHAT_CONVERSATION_NOT_FOUND', 'Conversation not found');
  }

  if (!conversation) {
    const fresh = await createFreshConversation({
      userId,
      guestKey,
      source,
      language: body.language,
    });
    conversation = fresh.conversation;
    id = conversation.conversationId;
  }

  const currentStatus = normalizeConversationStatus(conversation.status);
  if (['resolved', 'converted'].includes(currentStatus)) {
    throw createHttpError(
      409,
      'CHAT_CONVERSATION_CLOSED',
      'This conversation is closed. Start a new conversation to contact Sales.'
    );
  }

  const session = await ChatSession.findOne({ sessionId: id }).lean();
  const rawSnapshot = await getCustomerSnapshot({ userId, session, body });
  const snapshot = userId ? rawSnapshot : requireGuestContact(rawSnapshot);
  if (!userId) {
    await ChatSession.findOneAndUpdate(
      { sessionId: id },
      {
        $set: {
          leadName: snapshot.customerName,
          leadPhone: snapshot.customerPhone,
          leadCapturedAt: session?.leadCapturedAt || new Date(),
        },
        $setOnInsert: {
          sessionId: id,
          source,
        },
      },
      { upsert: true, new: true }
    );
  }
  const ownedVehicle = await resolveOwnedVehicle({
    vehicleId: body.vehicleId,
    userId,
  });
  const latestMessage = clean(body.initialMessage || body.lastMessage);
  const customerMessage = await createCustomerMessageIfMissing({
    conversationId: id,
    message: latestMessage,
    userId,
    senderName: snapshot.customerName,
  });
  const latestCustomer = customerMessage || await getLatestCustomerMessage(id);
  const handoffMessage = await ensureSystemMessage({
    conversationId: id,
    type: 'sales_handoff',
    message: HANDOFF_SYSTEM_MESSAGE,
  });
  const now = new Date();
  const lastMessage = clean(latestCustomer?.message || conversation.lastMessage || conversation.lastMessagePreview);
  const firstHandoff = !conversation.handedOffAt;

  const updated = await ChatConversation.findOneAndUpdate(
    { conversationId: id },
    {
      $set: {
        ...(userId ? { userId } : {}),
        ...(guestKey ? { guestKey } : {}),
        customerName: snapshot.customerName,
        customerEmail: snapshot.customerEmail,
        customerPhone: encryptPhone(snapshot.customerPhone),
        vehicleId: ownedVehicle?._id || conversation.vehicleId || undefined,
        vehicleLabel:
          clean(body.vehicleLabel) ||
          (ownedVehicle
            ? [ownedVehicle.year, ownedVehicle.make, ownedVehicle.model].filter(Boolean).join(' ')
            : clean(session?.lastVehicleLabel || conversation.vehicleLabel)),
        plateNumber: clean(body.plateNumber || ownedVehicle?.plateNumber || conversation.plateNumber),
        serviceInterest: clean(
          body.serviceInterest || session?.lastServiceInterest || conversation.serviceInterest
        ),
        status: 'needs_sales',
        handedOffAt: conversation.handedOffAt || now,
        unreadForSales: true,
        lastMessage,
        lastMessagePreview: buildConversationPreview(lastMessage || handoffMessage.message),
        lastMessageAt: latestCustomer?.createdAt || handoffMessage.createdAt || now,
        aiSummary: buildAiSummary({
          session,
          latestCustomerMessage: lastMessage,
        }),
      },
    },
    { new: true, runValidators: true }
  ).lean();

  const messages = await ChatMessage.find({
    $or: [{ conversationId: id }, { sessionId: id }],
  })
    .sort({ createdAt: 1 })
    .limit(200)
    .lean();
  const payload = await serializeChatConversationPayload(updated, messages);

  return {
    ...payload,
    firstHandoff,
  };
};

export const getCustomerConversationMessages = async ({
  conversationId,
  userId,
  guestKey,
}) => {
  const conversation = await findConversationForAccess({
    conversationId,
    userId,
    guestKey,
  });
  if (!conversation) {
    throw createHttpError(404, 'CHAT_CONVERSATION_NOT_FOUND', 'Conversation not found');
  }

  const messages = await ChatMessage.find({
    $or: [{ conversationId }, { sessionId: conversationId }],
  })
    .sort({ createdAt: 1 })
    .limit(200)
    .lean();

  return serializeChatConversationPayload(conversation, messages);
};

export const sendCustomerConversationMessage = async ({
  conversationId,
  userId,
  guestKey,
  message,
  senderType,
}) => {
  if (senderType && senderType !== 'customer') {
    throw createHttpError(400, 'INVALID_CHAT_SENDER', 'Customer messages must use senderType customer');
  }
  const conversation = await findConversationForAccess({
    conversationId,
    userId,
    guestKey,
  });
  if (!conversation) {
    throw createHttpError(404, 'CHAT_CONVERSATION_NOT_FOUND', 'Conversation not found');
  }

  const text = clean(message);
  if (!text) throw createHttpError(400, 'CHAT_MESSAGE_REQUIRED', 'Message is required');
  const status = normalizeConversationStatus(conversation.status);
  if (['resolved', 'converted'].includes(status)) {
    throw createHttpError(409, 'CHAT_CONVERSATION_CLOSED', 'This conversation is closed');
  }
  if (!['needs_sales', 'in_conversation'].includes(status)) {
    throw createHttpError(
      409,
      'SALES_HANDOFF_REQUIRED',
      'Connect to Sales before sending a Sales conversation message.'
    );
  }

  const created = await ChatMessage.create({
    sessionId: conversationId,
    conversationId,
    userId: userId || undefined,
    senderId: userId || undefined,
    senderName: conversation.customerName || 'Customer',
    sender: 'user',
    message: text,
  });
  const now = created.createdAt || new Date();
  const updated = await ChatConversation.findOneAndUpdate(
    { conversationId },
    {
      $set: {
        status,
        unreadForSales: true,
        lastMessage: text,
        lastMessagePreview: buildConversationPreview(text),
        lastMessageAt: now,
      },
    },
    { new: true, runValidators: true }
  ).lean();

  const payload = await serializeChatConversationPayload(updated, [created.toObject()]);
  return {
    conversation: payload.conversation,
    message: payload.messages[0],
  };
};

export const markCustomerConversationRead = async ({
  conversationId,
  userId,
  guestKey,
}) => {
  const conversation = await findConversationForAccess({
    conversationId,
    userId,
    guestKey,
  });
  if (!conversation) {
    throw createHttpError(404, 'CHAT_CONVERSATION_NOT_FOUND', 'Conversation not found');
  }

  const updated = await ChatConversation.findOneAndUpdate(
    { conversationId },
    { $set: { unreadForCustomer: false } },
    { new: true, runValidators: true }
  ).lean();
  const payload = await serializeChatConversationPayload(updated);
  return payload.conversation;
};

const salesConversationFilter = () => ({
  $or: [
    { handedOffAt: { $exists: true, $ne: null } },
    { status: { $in: ['needs_sales', 'in_conversation', 'resolved', 'converted'] } },
  ],
});

export const listSalesConversations = async ({ status, search } = {}) => {
  const requestedStatus = clean(status);
  if (requestedStatus && !CANONICAL_CHAT_STATUSES.includes(requestedStatus)) {
    throw createHttpError(400, 'INVALID_CHAT_STATUS', 'Invalid conversation status');
  }

  const filter = salesConversationFilter();
  if (requestedStatus) {
    const statusValues =
      requestedStatus === 'ai_handling'
        ? ['ai_handling', 'open']
        : requestedStatus === 'resolved'
          ? ['resolved', 'closed']
          : [requestedStatus];
    filter.$and = [{ status: { $in: statusValues } }];
  }

  const rows = await ChatConversation.find(filter)
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .limit(200)
    .lean();
  const query = clean(search).toLowerCase();
  if (!query) return serializeChatConversationList(rows);

  const queryVariants = new Set([query]);
  const compactPhoneQuery = query.replace(/[^\d+]/g, '');
  if (/^09\d*$/.test(compactPhoneQuery)) {
    queryVariants.add(`+63${compactPhoneQuery.slice(1)}`);
  } else if (/^\+639\d*$/.test(compactPhoneQuery)) {
    queryVariants.add(`0${compactPhoneQuery.slice(3)}`);
  }
  const matchers = [...queryVariants].map(
    (value) => new RegExp(escapeRegex(value), 'i')
  );
  const filteredRows = rows
    .filter((row) =>
      [
        row.customerName,
        row.customerEmail,
        decryptPhone(row.customerPhone),
        row.vehicleLabel,
        row.plateNumber,
        row.serviceInterest,
        row.lastMessage,
      ].some((value) =>
        matchers.some((matcher) => matcher.test(clean(value)))
      )
    );
  return serializeChatConversationList(filteredRows);
};

export const getSalesConversation = async (conversationId) => {
  const conversation = await ChatConversation.findOne({
    conversationId: clean(conversationId),
    ...salesConversationFilter(),
  }).lean();
  if (!conversation) {
    throw createHttpError(404, 'CHAT_CONVERSATION_NOT_FOUND', 'Conversation not found');
  }
  const messages = await ChatMessage.find({
    $or: [{ conversationId }, { sessionId: conversationId }],
  })
    .sort({ createdAt: 1 })
    .limit(200)
    .lean();
  return serializeChatConversationPayload(conversation, messages);
};

export const sendSalesConversationMessage = async ({
  conversationId,
  salesUser,
  message,
  senderType,
}) => {
  if (senderType && senderType !== 'sales') {
    throw createHttpError(400, 'INVALID_CHAT_SENDER', 'Sales messages must use senderType sales');
  }
  const text = clean(message);
  if (!text) throw createHttpError(400, 'CHAT_MESSAGE_REQUIRED', 'Message is required');

  const conversation = await ChatConversation.findOne({
    conversationId,
    ...salesConversationFilter(),
  }).lean();
  if (!conversation) {
    throw createHttpError(404, 'CHAT_CONVERSATION_NOT_FOUND', 'Conversation not found');
  }
  const status = normalizeConversationStatus(conversation.status);
  if (['resolved', 'converted'].includes(status)) {
    throw createHttpError(409, 'CHAT_CONVERSATION_CLOSED', 'Reopen the conversation before replying');
  }

  const joinedAt = new Date();
  const unjoinedFilter = [
    { salesJoinedAt: { $exists: false } },
    { salesJoinedAt: null },
  ];
  let joinedConversation = null;
  if (!conversation.salesJoinedAt && !conversation.assignedSalesId) {
    joinedConversation = await ChatConversation.findOneAndUpdate(
      {
        conversationId,
        ...salesConversationFilter(),
        status: { $nin: ['resolved', 'closed', 'converted'] },
        $and: [
          { $or: unjoinedFilter },
          {
            $or: [
              { assignedSalesId: { $exists: false } },
              { assignedSalesId: null },
            ],
          },
        ],
      },
      {
        $set: {
          status: 'in_conversation',
          salesJoinedAt: joinedAt,
          assignedSalesId: salesUser.id,
          assignedSalesName:
            salesUser.name || salesUser.email || 'AutoSPF+ Sales',
        },
      },
      { new: true, runValidators: true }
    ).lean();
  }
  if (!conversation.salesJoinedAt && !joinedConversation) {
    joinedConversation = await ChatConversation.findOneAndUpdate(
      {
        conversationId,
        ...salesConversationFilter(),
        status: { $nin: ['resolved', 'closed', 'converted'] },
        $or: unjoinedFilter,
      },
      {
        $set: {
          status: 'in_conversation',
          salesJoinedAt: joinedAt,
        },
      },
      { new: true, runValidators: true }
    ).lean();
  }
  const joinedNow = Boolean(joinedConversation);
  await ensureSystemMessage({
    conversationId,
    type: 'sales_joined',
    message: SALES_JOINED_SYSTEM_MESSAGE,
  });
  const created = await ChatMessage.create({
    sessionId: conversationId,
    conversationId,
    sender: 'sales',
    senderId: salesUser.id,
    senderName: salesUser.name || salesUser.email || 'AutoSPF+ Sales',
    message: text,
  });
  const now = created.createdAt || new Date();
  const updated = await ChatConversation.findOneAndUpdate(
    {
      conversationId,
      status: { $nin: ['resolved', 'closed', 'converted'] },
    },
    {
      $set: {
        status: 'in_conversation',
        unreadForCustomer: true,
        unreadForSales: false,
        lastMessage: text,
        lastMessagePreview: buildConversationPreview(text),
        lastMessageAt: now,
      },
    },
    { new: true, runValidators: true }
  ).lean();
  if (!updated) {
    await ChatMessage.deleteOne({ _id: created._id });
    throw createHttpError(409, 'CHAT_CONVERSATION_CLOSED', 'Reopen the conversation before replying');
  }

  const payload = await serializeChatConversationPayload(updated, [created.toObject()]);
  return {
    conversation: payload.conversation,
    message: payload.messages[0],
    joinedNow,
  };
};

export const updateSalesConversationStatus = async ({ conversationId, status }) => {
  const nextStatus = clean(status);
  if (!['needs_sales', 'in_conversation', 'resolved', 'converted'].includes(nextStatus)) {
    throw createHttpError(400, 'INVALID_CHAT_STATUS', 'Invalid Sales conversation status');
  }
  const updated = await ChatConversation.findOneAndUpdate(
    { conversationId, ...salesConversationFilter() },
    {
      $set: {
        status: nextStatus,
        ...(nextStatus === 'resolved' || nextStatus === 'converted'
          ? { unreadForSales: false, unreadForCustomer: true }
          : {}),
      },
    },
    { new: true, runValidators: true }
  ).lean();
  if (!updated) {
    throw createHttpError(404, 'CHAT_CONVERSATION_NOT_FOUND', 'Conversation not found');
  }
  const payload = await serializeChatConversationPayload(updated);
  return payload.conversation;
};

export const assignSalesConversation = async ({ conversationId, salesUser }) => {
  const updated = await ChatConversation.findOneAndUpdate(
    { conversationId, ...salesConversationFilter() },
    {
      $set: {
        assignedSalesId: salesUser.id,
        assignedSalesName: salesUser.name || salesUser.email || 'AutoSPF+ Sales',
      },
    },
    { new: true, runValidators: true }
  ).lean();
  if (!updated) {
    throw createHttpError(404, 'CHAT_CONVERSATION_NOT_FOUND', 'Conversation not found');
  }
  const payload = await serializeChatConversationPayload(updated);
  return payload.conversation;
};

export const markSalesConversationRead = async (conversationId) => {
  const updated = await ChatConversation.findOneAndUpdate(
    { conversationId, ...salesConversationFilter() },
    { $set: { unreadForSales: false } },
    { new: true, runValidators: true }
  ).lean();
  if (!updated) {
    throw createHttpError(404, 'CHAT_CONVERSATION_NOT_FOUND', 'Conversation not found');
  }
  const payload = await serializeChatConversationPayload(updated);
  return payload.conversation;
};
