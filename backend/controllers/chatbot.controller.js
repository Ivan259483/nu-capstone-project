import axios from 'axios';
import ChatSession from '../models/chatSession.model.js';
import ChatMessage from '../models/chatMessage.model.js';
import Service from '../models/service.model.js';
import Product from '../models/product.model.js';
import Notification from '../models/notification.model.js';
import { getIO } from '../utils/socket.utils.js';
import {
  buildOtherServicesSummary,
  buildSpfPricingKnowledge,
  buildWebsiteGuide,
  detectVehicleTypeFromMessage,
  formatCurrency,
  getVehicleLabel,
  isAutoSpfScopeMessage,
  OFF_TOPIC_REPLY,
} from '../services/chatbotKnowledge.service.js';

const GROQ_MODEL = 'llama-3.3-70b-versatile';

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
    q: 'How do I book?',
    a: 'On the website: tap Book Now (or Services → choose package). Add vehicle type and details, pick a date, then confirm. You can also log in first so your garage is saved.',
  },
  {
    q: 'How do I log in?',
    a: 'Use Login in the top navigation. New customers choose Register, then sign in to open the dashboard (bookings, tracker, garage).',
  },
  {
    q: 'Where are you located?',
    a: 'Las Piñas City, Metro Manila — Marcos Alvarez Ave. See the Contact page for map and details.',
  },
  {
    q: 'How long does coating take?',
    a: 'SPF 80 about 2–3 hours; SPF 89 about 3–4 hours; SPF 99/101 about 4–8 hours depending on vehicle and prep.',
  },
];

const buildKnowledgeBase = async (preferredVehicleKey = null) => {
  const [spfPricingSummary, otherServicesSummary, products] = await Promise.all([
    buildSpfPricingKnowledge(preferredVehicleKey),
    buildOtherServicesSummary(),
    Product.find({ isActive: true }).select('name inventory minLevel').lean(),
  ]);

  const services = await Service.find({ status: 'Active' })
    .select('name basePrice category duration')
    .lean();

  const serviceSummary = [spfPricingSummary, otherServicesSummary].filter(Boolean).join('\n\n');

  const inventorySummary = products
    .slice(0, 50)
    .map((p) => `${p.name}: ${p.inventory ?? 0} units${p.minLevel ? ` (min ${p.minLevel})` : ''}`)
    .join('\n');

  const faqSummary = FAQS.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n');

  return { services, products, serviceSummary, inventorySummary, faqSummary };
};

const resolveVehicleContext = async (sessionId, currentMessage) => {
  const fromCurrent = detectVehicleTypeFromMessage(currentMessage);
  if (fromCurrent) return fromCurrent.apiKey;

  const recentUserMessages = await ChatMessage.find({
    sessionId,
    sender: 'user',
  })
    .sort({ createdAt: -1 })
    .limit(8)
    .select('message')
    .lean();

  for (const entry of recentUserMessages) {
    const detected = detectVehicleTypeFromMessage(entry.message);
    if (detected) return detected.apiKey;
  }

  return null;
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
  const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim();
  if (!GROQ_API_KEY) {
    return 'The AI assistant is not configured yet. Please set GROQ_API_KEY on the server.';
  }

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: GROQ_MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 320,
    },
    {
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const reply = response.data?.choices?.[0]?.message?.content?.trim();
  return reply || 'I can help with services, pricing, and bookings. What would you like to know?';
};

const processMessage = async ({ sessionId, message, user, context = null, allowQuote = false, skipUserSave = false }) => {

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
      recipientRole: 'admin_family',
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
        recipientRole: 'admin_family',
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

  const recentUserLines = await ChatMessage.find({ sessionId, sender: 'user' })
    .sort({ createdAt: -1 })
    .limit(8)
    .select('message')
    .lean();
  const recentUserMessages = recentUserLines.map((row) => row.message);

  if (!isAutoSpfScopeMessage(trimmed, recentUserMessages)) {
    await ChatMessage.create({
      sessionId,
      sender: 'assistant',
      message: OFF_TOPIC_REPLY,
      metadata: { type: 'off_topic' },
    });
    return { reply: OFF_TOPIC_REPLY, leadRequired: false };
  }

  if (isGuest && !hasLead && isQuoteRequest && !allowQuote) {
    const leadPrompt = 'To send a custom quote, please share your name and mobile number.';
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

  const vehicleContextKey = await resolveVehicleContext(sessionId, trimmed);
  const { services, products, serviceSummary, inventorySummary, faqSummary } = await buildKnowledgeBase(vehicleContextKey);
  const availabilityHints = buildAvailabilityHints(trimmed, products);

  const vehicleDirective = vehicleContextKey
    ? `The customer is asking about **${getVehicleLabel(vehicleContextKey)}** pricing. Quote ONLY that vehicle type from the SPF pricing section — never reuse sedan/hatchback prices for midsized, SUV, or other types.`
    : 'If the customer asks for prices without stating vehicle type (sedan, midsized, SUV, hatchback, pick up, large SUV/van, highend sedan), ask which type before listing SPF package prices.';

  const websiteGuide = buildWebsiteGuide();

  const systemPrompt = [
    'You are the AutoSPF+ website chatbot — assistant for AutoSPF+ only.',
    '',
    '### STRICT SCOPE (HIGHEST PRIORITY)',
    'You MUST ONLY answer topics tied to AutoSPF+ and this website:',
    '- Service & SPF package prices (by vehicle type), PPF, ceramic coating, detailing, tint, add-ons',
    '- How to book, login/register, dashboard, live repair tracker, gallery, about, contact',
    '- Shop location, hours, contact, payments, warranties on our packages',
    '- Short greetings — then guide the user to prices, booking, or login',
    'If the question is general knowledge, other businesses, coding, jokes, news, weather, homework, medical, or anything NOT about AutoSPF+, reply EXACTLY with this sentence and nothing else:',
    `"${OFF_TOPIC_REPLY}"`,
    'Never guess prices. Never answer off-topic even if the user insists.',
    '',
    '### HOW TO WRITE (BE CLEAR)',
    '- Use short, direct sentences. Plain English (Taglish OK if the user writes Taglish).',
    '- Max ~90 words unless listing package prices.',
    '- Use bullet lists for 3+ prices or steps.',
    '- One clear next step at the end (e.g. "Tap Book Now" or "Tell me your vehicle type").',
    '- No emojis. No long introductions.',
    '',
    '### PRICING RULES',
    '1. SPF prices MUST come from the official matrix below (same as /services).',
    vehicleDirective,
    '2. Format money as ₱15,000 (PHP only).',
    '3. Promotional price = what the customer pays; mention regular price only if shown in the matrix.',
    '',
    websiteGuide,
    '',
    '### USER APP CONTEXT',
    context
      ? `Current app context (use only for tracker/scan/booking questions on our site):\n${JSON.stringify(context, null, 2)}`
      : 'No live app context.',
    '',
    '### ACTION CHIPS (optional, end of reply only)',
    'Valid: "Book Service", "View Estimate", "Track Repair", "Talk to Support", "View Scan Result"',
    '```json',
    '["Book Service"]',
    '```',
    '',
    '### LIVE DATA',
    '#### SERVICES & PRICING',
    serviceSummary || 'Pricing is updating — ask the user to open the Services page.',
    '',
    '#### INVENTORY (internal only — mention briefly if relevant)',
    inventorySummary || 'N/A',
    availabilityHints ? availabilityHints : '',
    '',
    '#### FAQ',
    faqSummary,
  ].join('\n');

  const history = await getRecentMessages(sessionId);

  const messages = [
    { role: 'system', content: systemPrompt },
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

  let actionChips = [];
  const chipMatch = reply.match(/```json\n?(\[.*?\])\n?```/s);
  if (chipMatch) {
    try {
      actionChips = JSON.parse(chipMatch[1]);
      reply = reply.replace(chipMatch[0], '').trim();
    } catch(e) {
      console.warn('Failed to parse action chips from AI:', e.message);
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

  return { reply, action, actionChips, leadRequired: false };
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
      recipientRole: 'admin_family',
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
    const { sessionId, message, context } = req.body || {};
    const result = await processMessage({ sessionId, message, user: req.user, context });
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
      recipientRole: 'admin_family',
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
    const { sessionId, message, context } = payload;
    const result = await processMessage({ sessionId, message, user: socket.user, context });
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
