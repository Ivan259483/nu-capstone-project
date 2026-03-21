import axios from 'axios';
import ChatSession from '../models/ChatSession.js';
import ChatMessage from '../models/ChatMessage.js';
import Service from '../models/Service.js';
import Product from '../models/Product.js';
import Notification from '../models/Notification.js';
import { getIO } from '../utils/socket.js';

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || 'gpt-5-mini').trim() || 'gpt-5-mini';

const QUOTE_INTENT_REGEX = /(quote|price|cost|how much|pricing|estimate)/i;
const BOOKING_INTENT_REGEX = /(book|schedule|appointment|reserve|book now)/i;
const HUMAN_INTENT_REGEX = /(human|agent|representative|person|someone|talk to (a )?(human|person|agent)|real person)/i;
const AVAILABILITY_MAP = [
  {
    keywords: ['ceramic', 'coating'],
    productNames: ['Ceramic Coating', 'Wax Sealant', 'Ceramic Spray'],
  },
  {
    keywords: ['ppf', 'paint protection', 'matte'],
    productNames: ['PPF Film', 'Matte PPF', 'Paint Protection Film'],
  },
  {
    keywords: ['wash', 'shampoo', 'soap'],
    productNames: ['Car Wash Shampoo', 'Premium Wash Soap', 'Wash Shampoo'],
  },
  {
    keywords: ['wax'],
    productNames: ['Wax Sealant', 'Wax'],
  },
];

const FAQS = [
  {
    q: 'What services do you offer?',
    a: 'We offer Body Wash, Waxing, Detailing, Ceramic Coating, and PPF packages.'
  },
  {
    q: 'How long does a service take?',
    a: 'Most washes take 45-90 minutes. Detailing and coatings take longer depending on package.'
  },
  {
    q: 'Do you offer packages?',
    a: 'Yes, we have Basic, Standard, and Premium tiers with bundled services.'
  }
];

const formatCurrency = (value) => `₱${Number(value || 0).toLocaleString('en-PH')}`;

const buildKnowledgeBase = async () => {
  const services = await Service.find({ status: 'Active' })
    .select('name basePrice category duration')
    .lean();
  const products = await Product.find({ isActive: true })
    .select('name inventory minLevel')
    .lean();

  const serviceSummary = services
    .map((s) => `${s.name} (${s.category || 'Standard'}) - ${formatCurrency(s.basePrice)} (${s.duration || 'Standard duration'})`)
    .join('\n');

  const inventorySummary = products
    .slice(0, 50)
    .map((p) => `${p.name}: ${p.inventory ?? 0} units${p.minLevel ? ` (min ${p.minLevel})` : ''}`)
    .join('\n');

  const faqSummary = FAQS.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n');

  return { services, products, serviceSummary, inventorySummary, faqSummary };
};

const emitAdminChatNotification = (payload) => {
  try {
    const io = getIO();
    io.to('admin:chat').emit('admin:chat', payload);
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('Socket.io not available for admin chat notification.');
    }
  }
};

const getRecentMessages = async (sessionId, limit = 12) => {
  const history = await ChatMessage.find({ sessionId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return history.reverse().map((m) => ({
    role: m.sender === 'user' ? 'user' : 'assistant',
    content: m.message,
  }));
};

const findServiceMatch = (services = [], message = '') => {
  const normalized = message.toLowerCase();
  let match = services.find((s) => normalized.includes(s.name.toLowerCase()));
  if (match) return match;

  if (normalized.includes('wash')) {
    match = services.find((s) => s.name.toLowerCase().includes('wash'));
  }
  if (!match && normalized.includes('detail')) {
    match = services.find((s) => s.name.toLowerCase().includes('detail'));
  }
  if (!match && normalized.includes('coating')) {
    match = services.find((s) => s.name.toLowerCase().includes('coating'));
  }
  if (!match && normalized.includes('ppf')) {
    match = services.find((s) => s.name.toLowerCase().includes('ppf'));
  }

  return match;
};

const buildAvailabilityHints = (message = '', products = []) => {
  const normalized = message.toLowerCase();
  const hints = [];

  AVAILABILITY_MAP.forEach((entry) => {
    if (!entry.keywords.some((keyword) => normalized.includes(keyword))) return;
    entry.productNames.forEach((productName) => {
      const product = products.find((p) => p.name?.toLowerCase() === productName.toLowerCase())
        || products.find((p) => p.name?.toLowerCase().includes(productName.toLowerCase()));
      if (!product) return;
      hints.push(`${product.name}: ${product.inventory ?? 0} units`);
    });
  });

  if (!hints.length) return '';
  return `Availability check (inventory): ${hints.join(' | ')}`;
};

const callOpenAI = async (messages) => {
  if (!OPENAI_API_KEY) {
    return 'The AI assistant is not configured yet. Please set OPENAI_API_KEY on the server.';
  }

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: OPENAI_MODEL,
      messages,
      temperature: 0.4,
      max_tokens: 350,
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const reply = response.data?.choices?.[0]?.message?.content?.trim();
  return reply || 'I can help with services, pricing, and bookings. What would you like to know?';
};

const processMessage = async ({ sessionId, message, user, allowQuote = false, skipUserSave = false }) => {
  console.log('API KEY LOADED:', !!OPENAI_API_KEY, '| MODEL:', OPENAI_MODEL);

  const trimmed = (message || '').trim();
  if (!sessionId || !trimmed) {
    return { reply: 'Please share a message so I can help.', leadRequired: false };
  }

  const session = await ChatSession.findOneAndUpdate(
    { sessionId },
    {
      $setOnInsert: { sessionId },
      ...(user?.id ? { $set: { userId: user.id } } : {}),
    },
    { upsert: true, new: true }
  );

  if (!skipUserSave) {
    await ChatMessage.create({
      sessionId,
      userId: user?.id,
      sender: 'user',
      message: trimmed,
    });
  }

  let createdNotification = null;
  try {
    const displayName = session.leadName || user?.email || 'Guest';
    createdNotification = await Notification.create({
      title: 'Chat Message',
      message: `${displayName}: ${trimmed}`.slice(0, 240),
      type: 'chat',
      recipientRole: 'admin',
      metadata: { sessionId },
    });
  } catch (notifyError) {
    console.error('Failed to create chat notification:', notifyError.message);
  }

  const shouldVoiceNotify = !user?.role || user?.role === 'customer';
  if (createdNotification && shouldVoiceNotify) {
    emitAdminChatNotification({
      id: createdNotification._id,
      title: createdNotification.title,
      message: createdNotification.message,
      type: createdNotification.type,
      isRead: createdNotification.isRead,
      createdAt: createdNotification.createdAt,
      metadata: createdNotification.metadata,
    });
  }

  const isGuest = !user?.id;
  const hasLead = !!session.leadName && !!session.leadPhone;
  const isQuoteRequest = QUOTE_INTENT_REGEX.test(trimmed);

  if (HUMAN_INTENT_REGEX.test(trimmed)) {
    const reply = hasLead || user?.id
      ? 'I have notified a human specialist. They will follow up shortly.'
      : 'I have notified a human specialist. Please share your name and phone number so they can reach you.';

    try {
      const handoffNotification = await Notification.create({
        title: 'Chatbot Handoff Requested',
        message: reply,
        type: 'chat',
        recipientRole: 'admin',
        metadata: { sessionId },
      });
      emitAdminChatNotification({
        id: handoffNotification._id,
        title: handoffNotification.title,
        message: handoffNotification.message,
        type: handoffNotification.type,
        isRead: handoffNotification.isRead,
        createdAt: handoffNotification.createdAt,
        metadata: handoffNotification.metadata,
      });
    } catch (handoffError) {
      console.error('Failed to create handoff notification:', handoffError.message);
    }

    await ChatMessage.create({
      sessionId,
      sender: 'assistant',
      message: reply,
      metadata: { type: 'handoff' },
    });

    return { reply, action: { type: 'handoff' }, leadRequired: isGuest && !hasLead };
  }

  if (isGuest && !hasLead && isQuoteRequest && !allowQuote) {
    const leadPrompt = 'Before I can provide a quote, please share your name and phone number.';
    session.pendingMessage = trimmed;
    session.pendingAt = new Date();
    await session.save();

    await ChatMessage.create({
      sessionId,
      sender: 'assistant',
      message: leadPrompt,
      metadata: { type: 'lead_required' },
    });

    return { reply: leadPrompt, leadRequired: true };
  }

  const { services, products, serviceSummary, inventorySummary, faqSummary } = await buildKnowledgeBase();
  const availabilityHints = buildAvailabilityHints(trimmed, products);

  const systemPrompt = [
    'You are AutoSPF+ Assistant, a professional car detailing expert.',
    'Your job is to assist customers like Laura with service inquiries, availability, and bookings.',
    'Answer questions about services, pricing, and availability.',
    'Prices are in Philippine Peso (PHP).',
    'If inventory for a required item is low or zero, mention limited availability before recommending a service.',
    'If the user asks for a quote, be clear and concise. Keep responses under 120 words.',
    'FAQs and service list below can be used as authoritative context.',
    '',
    'SERVICES:',
    serviceSummary || 'No services available.',
    '',
    'INVENTORY:',
    inventorySummary || 'No inventory data available.',
    availabilityHints ? `\n${availabilityHints}` : '',
    '',
    'FAQS:',
    faqSummary || 'No FAQs available.',
  ].join('\n');

  const history = await getRecentMessages(sessionId);

  const messages = [
    { role: 'developer', content: systemPrompt },
    ...history,
  ];

  if (skipUserSave && (!history.length || history[history.length - 1]?.content !== trimmed)) {
    messages.push({ role: 'user', content: trimmed });
  }

  let reply;
  try {
    reply = await callOpenAI(messages);
  } catch (error) {
    const status = error?.response?.status;
    if (status === 429) {
      reply = 'Hello! This is a demo mode. I will be fully active once credits are added.';
    } else {
      console.error('Chatbot OpenAI error:', error.message);
      reply = 'Sorry, I am having trouble responding right now. Please try again in a moment.';
    }
  }

  await ChatMessage.create({
    sessionId,
    sender: 'assistant',
    message: reply,
  });

  if (session.pendingMessage) {
    session.pendingMessage = undefined;
    session.pendingAt = undefined;
    await session.save();
  }

  const bookingIntent = BOOKING_INTENT_REGEX.test(trimmed);
  const matchedService = bookingIntent ? findServiceMatch(services, trimmed) : null;

  const action = bookingIntent
    ? {
        type: user?.id ? 'open_booking' : 'login_required',
        name: user?.name || session.leadName || undefined,
        serviceName: matchedService?.name,
      }
    : null;

  return { reply, action, leadRequired: false };
};

export const startSession = async (req, res, next) => {
  try {
    const { sessionId, source } = req.body || {};
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Missing sessionId' });
    }

    const session = await ChatSession.findOneAndUpdate(
      { sessionId },
      {
        $setOnInsert: { sessionId, source },
        ...(req.user?.id ? { $set: { userId: req.user.id } } : {}),
      },
      { upsert: true, new: true }
    );

    const messages = await ChatMessage.find({ sessionId })
      .sort({ createdAt: 1 })
      .limit(50)
      .lean();

    res.json({
      success: true,
      session: {
        sessionId: session.sessionId,
        leadName: session.leadName,
        leadPhone: session.leadPhone,
      },
      messages: messages.map((m) => ({
        id: m._id,
        sender: m.sender,
        message: m.message,
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const saveLead = async (req, res, next) => {
  try {
    const { sessionId, name, phone } = req.body || {};
    if (!sessionId || !name || !phone) {
      return res.status(400).json({ success: false, message: 'Missing sessionId, name, or phone' });
    }

    const session = await ChatSession.findOneAndUpdate(
      { sessionId },
      {
        $set: {
          leadName: name,
          leadPhone: phone,
          leadCapturedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ success: false, message: 'Chat session not found' });
    }

    const leadNotification = await Notification.create({
      title: 'New Lead Captured',
      message: `${name} (${phone}) requested a quote.`,
      type: 'chat',
      recipientRole: 'admin',
      metadata: { sessionId },
    });
    emitAdminChatNotification({
      id: leadNotification._id,
      title: leadNotification.title,
      message: leadNotification.message,
      type: leadNotification.type,
      isRead: leadNotification.isRead,
      createdAt: leadNotification.createdAt,
      metadata: leadNotification.metadata,
    });

    let followUp = null;
    if (session.pendingMessage) {
      followUp = await processMessage({
        sessionId,
        message: session.pendingMessage,
        user: req.user,
        allowQuote: true,
        skipUserSave: true,
      });
    }

    res.json({
      success: true,
      message: 'Lead saved',
      reply: followUp?.reply,
      action: followUp?.action || null,
    });
  } catch (error) {
    next(error);
  }
};

export const sendMessage = async (req, res, next) => {
  try {
    const { sessionId, message } = req.body || {};
    const result = await processMessage({ sessionId, message, user: req.user });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

export const requestHandoff = async (req, res, next) => {
  try {
    const { sessionId, lastMessage } = req.body || {};
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Missing sessionId' });
    }

    const session = await ChatSession.findOne({ sessionId });
    const leadName = session?.leadName || 'Guest';
    const leadPhone = session?.leadPhone || 'N/A';

    const message = `${leadName} (${leadPhone}) requested a human handoff.${lastMessage ? ` Last message: "${lastMessage}"` : ''}`;

    const handoffNotification = await Notification.create({
      title: 'Chatbot Handoff Requested',
      message,
      type: 'chat',
      recipientRole: 'admin',
      metadata: { sessionId },
    });
    emitAdminChatNotification({
      id: handoffNotification._id,
      title: handoffNotification.title,
      message: handoffNotification.message,
      type: handoffNotification.type,
      isRead: handoffNotification.isRead,
      createdAt: handoffNotification.createdAt,
      metadata: handoffNotification.metadata,
    });

    await ChatMessage.create({
      sessionId,
      sender: 'system',
      message: 'Human handoff requested.',
      metadata: { type: 'handoff' },
    });

    res.json({ success: true, message: 'Handoff request sent' });
  } catch (error) {
    next(error);
  }
};

export const handleSocketMessage = async (io, socket, payload = {}) => {
  try {
    const { sessionId, message } = payload;
    const result = await processMessage({ sessionId, message, user: socket.user });
    const room = sessionId ? `chat:${sessionId}` : socket.id;

    io.to(room).emit('chat:response', {
      message: result.reply,
      action: result.action || null,
      leadRequired: result.leadRequired || false,
    });
  } catch (error) {
    console.error('Socket chat error:', error.message);
    socket.emit('chat:error', { message: 'Failed to process message' });
  }
};
