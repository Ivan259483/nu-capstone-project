import axios from 'axios';
import jwt from 'jsonwebtoken';
import ChatSession from '../models/chatSession.model.js';
import ChatMessage from '../models/chatMessage.model.js';
import Service from '../models/service.model.js';
import Product from '../models/product.model.js';
import Notification from '../models/notification.model.js';
import Order from '../models/order.model.js';
import { config } from '../config/environment.js';
import { getIO } from '../utils/socket.utils.js';
import {
  buildCompleteServicePriceListReply,
  buildOtherServicesSummary,
  buildSpfPricingKnowledge,
  buildWebsiteGuide,
  detectVehicleTypeFromMessage,
  getVehicleLabel,
  isAutoSpfScopeMessage,
  isPriceListRequest,
  OFF_TOPIC_REPLY,
} from '../services/chatbotKnowledge.service.js';
import { extractActionChipsFromReply, sanitizeChatReply } from '../utils/chatReplyFormat.utils.js';

const GROQ_MODEL = 'llama-3.3-70b-versatile';

const QUOTE_INTENT_REGEX = /(quote|price|price\s*list|pricelist|cost|how much|pricing|rate|rates|estimate|presyo|magkano)/i;
const BOOKING_INTENT_REGEX = /(book|schedule|appointment|reserve|book now)/i;
const HUMAN_INTENT_REGEX = /(human|agent|representative|person|someone|talk to (a )?(human|person|agent)|real person)/i;
const TRACKER_INTENT_REGEX = /\b(track|tracker|tracking|status|where\s+is\s+my\s+(car|vehicle)|live\s+tracker|order\s+status|repair\s+status)\b/i;
const PAYMENT_OR_COMPLAINT_REGEX = /\b(complaint|complain|bad\s+service|dissatisfied|refund|cancel\s+(my\s+)?(booking|appointment|order))\b|\b(payment|pay|paid|gcash|receipt|charge|charged|proof|deposit|down[\s-]?payment)\b[\s\S]{0,60}\b(issue|problem|wrong|failed|missing|not\s+showing|not\s+received|refund|complaint)\b|\b(issue|problem|wrong|failed|missing|refund|complaint)\b[\s\S]{0,60}\b(payment|paid|gcash|receipt|charge|proof|deposit)\b/i;
const SPECIALIST_ESCALATION_REPLY = 'Let me connect you with a specialist who can help you better! Please use Talk to a protection specialist below.';
const TRACKER_REFERENCE_PROMPT = 'Sure! Please enter your Appointment Reference Number to pull up your status.\nIt looks like this: ASPF-XXXXXX-XXXX\nYou can find it in your booking confirmation screen or email.';
const TRACKER_TOKEN_PURPOSE = 'public_tracker';
const TRACKER_TOKEN_EXPIRES_IN = '1h';

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

const TRACKER_STEPS = [
  { key: 'confirmed', label: 'Appointment Confirmed' },
  { key: 'received', label: 'Vehicle Arrived' },
  { key: 'in_progress', label: 'Service In Progress' },
  { key: 'quality_check', label: 'Quality Check' },
  { key: 'ready_pickup', label: 'Ready for Pickup' },
];

const TRACKER_STAGE_ALIASES = {
  confirmed: 'confirmed',
  approved: 'confirmed',
  assigned: 'confirmed',
  received: 'received',
  queued: 'received',
  'in-progress': 'in_progress',
  in_progress: 'in_progress',
  detailing: 'in_progress',
  washing: 'in_progress',
  finishing: 'quality_check',
  quality_check: 'quality_check',
  completed: 'ready_pickup',
  ready: 'ready_pickup',
  ready_pickup: 'ready_pickup',
  ready_for_payment: 'ready_pickup',
  paid: 'ready_pickup',
  released: 'ready_pickup',
};

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const canonicalTrackerPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (/^09\d{9}$/.test(digits)) return `63${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `63${digits}`;
  if (/^639\d{9}$/.test(digits)) return digits;
  if (digits.startsWith('00') && digits.length > 4) return digits.slice(2);
  return digits;
};

const trackerPhoneMatches = (providedPhone, order) => {
  const provided = canonicalTrackerPhone(providedPhone);
  if (!provided) return false;

  const candidates = [
    order?.customerPhone,
    typeof order?.customer === 'object' ? order.customer?.phone : '',
  ].map(canonicalTrackerPhone).filter(Boolean);

  return candidates.some((candidate) => candidate === provided);
};

const normalizeTrackerReference = (value = '') =>
  String(value || '').trim().replace(/\s+/g, '').toUpperCase();

const buildTrackerReferenceMatchers = (reference) => {
  const normalizedReference = normalizeTrackerReference(reference);
  const compact = normalizedReference.replace(/[^A-Z0-9]/g, '');
  const matchers = [
    { bookingReference: { $regex: `^${escapeRegex(normalizedReference)}$`, $options: 'i' } },
    { orderNumber: { $regex: `^${escapeRegex(normalizedReference)}$`, $options: 'i' } },
  ];

  const aspfMatch = compact.match(/^ASPF(\d{6})([A-Z0-9]{3,8})$/i);
  if (aspfMatch) {
    matchers.push({
      bookingReference: {
        $regex: `^ASPF[-\\s]?${escapeRegex(aspfMatch[1])}[-\\s]?${escapeRegex(aspfMatch[2])}$`,
        $options: 'i',
      },
    });
  }

  const orderMatch = compact.match(/^ORD(\d{6,})$/i);
  if (orderMatch) {
    matchers.push({
      orderNumber: {
        $regex: `^ORD[-\\s]?${escapeRegex(orderMatch[1])}$`,
        $options: 'i',
      },
    });
  }

  return matchers;
};

const resolveTrackerStage = (order) => {
  const raw = String(order?.serviceTrackingStage || order?.status || order?.customerStatus || 'confirmed')
    .trim()
    .toLowerCase();
  return TRACKER_STAGE_ALIASES[raw] || 'confirmed';
};

const buildTrackerProgress = (stage) => {
  const idx = TRACKER_STEPS.findIndex((step) => step.key === stage);
  const safeIdx = idx >= 0 ? idx : 0;
  const percent = Math.round((safeIdx / (TRACKER_STEPS.length - 1)) * 100);
  return { currentStageLabel: TRACKER_STEPS[safeIdx]?.label || TRACKER_STEPS[0].label, progressPercent: percent };
};

const buildPublicTrackerSummary = (orderDoc) => {
  const order = typeof orderDoc?.toObject === 'function'
    ? orderDoc.toObject({ virtuals: true })
    : orderDoc;

  const serviceName =
    order.serviceName ||
    order.serviceType ||
    order.items?.[0]?.product?.name ||
    'AutoSPF+ service';

  const vehicleLabel = [
    order.vehicleYear,
    order.vehicleMake,
    order.vehicleModel,
  ].filter(Boolean).join(' ').trim() || 'Your vehicle';

  const vehicleMeta = [vehicleLabel, order.vehicleColor].filter(Boolean).join(' / ');
  const scheduleLabel = [order.bookingDate, order.bookingTime].filter(Boolean).join(' · ') || 'Schedule syncing';
  const stage = resolveTrackerStage(order);
  const { currentStageLabel, progressPercent } = buildTrackerProgress(stage);

  return {
    bookingReference: order.bookingReference || order.orderNumber || '',
    serviceName,
    vehicleLabel: vehicleMeta,
    scheduleLabel,
    status: order.status || '',
    serviceTrackingStage: stage,
    currentStageLabel,
    progressPercent,
    updatedAt: order.serviceTrackingUpdatedAt || order.updatedAt || order.createdAt || null,
    trackerStageMedia: Array.isArray(order.trackerStageMedia)
      ? order.trackerStageMedia.map((entry) => ({
          stage: entry.stage || '',
          slot: entry.slot || '',
          photoUrl: entry.photoUrl || '',
          description: entry.description || '',
          uploadedAt: entry.uploadedAt || null,
        }))
      : [],
    serviceStaffAssignments: Array.isArray(order.serviceStaffAssignments)
      ? order.serviceStaffAssignments
          .filter((entry) => entry?.name)
          .map((entry) => ({
            slot: entry.slot || '',
            name: entry.name || '',
            role: entry.role || '',
          }))
      : [],
  };
};

const loadPublicTrackerOrderByReference = async (reference) => {
  const normalizedReference = normalizeTrackerReference(reference);
  if (!normalizedReference) return null;

  return Order.findOne({
    $or: buildTrackerReferenceMatchers(normalizedReference),
  })
    .populate('customer', 'name phone')
    .populate('items.product', 'name')
    .select(
      '_id orderNumber bookingReference customer customerName customerPhone serviceType items.product ' +
      'status customerStatus serviceTrackingStage serviceTrackingUpdatedAt serviceStaffAssignments trackerStageMedia ' +
      'vehicleYear vehicleMake vehicleModel vehicleColor bookingDate bookingTime archived createdAt updatedAt'
    );
};

const loadPublicTrackerOrderById = async (orderId) =>
  Order.findById(orderId)
    .populate('customer', 'name phone')
    .populate('items.product', 'name')
    .select(
      '_id orderNumber bookingReference customer customerName customerPhone serviceType items.product ' +
      'status customerStatus serviceTrackingStage serviceTrackingUpdatedAt serviceStaffAssignments trackerStageMedia ' +
      'vehicleYear vehicleMake vehicleModel vehicleColor bookingDate bookingTime archived createdAt updatedAt'
    );

const signPublicTrackerToken = (order) =>
  jwt.sign(
    {
      purpose: TRACKER_TOKEN_PURPOSE,
      orderId: order._id?.toString?.() || String(order._id),
    },
    config.jwtSecret,
    { expiresIn: TRACKER_TOKEN_EXPIRES_IN }
  );

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

  const raw = response.data?.choices?.[0]?.message?.content?.trim();
  const reply = raw || 'I can help with services, pricing, and bookings. What would you like to know?';
  return sanitizeChatReply(reply);
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
  const wantsPriceList = isPriceListRequest(trimmed);

  if (HUMAN_INTENT_REGEX.test(trimmed)) {
    const reply = SPECIALIST_ESCALATION_REPLY;

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

  if (PAYMENT_OR_COMPLAINT_REGEX.test(trimmed)) {
    await ChatMessage.create({
      sessionId,
      sender: 'assistant',
      message: SPECIALIST_ESCALATION_REPLY,
      metadata: { type: 'handoff_prompt' },
    });

    return { reply: SPECIALIST_ESCALATION_REPLY, action: { type: 'handoff' }, leadRequired: false };
  }

  const recentUserLines = await ChatMessage.find({ sessionId, sender: 'user' })
    .sort({ createdAt: -1 })
    .limit(8)
    .select('message')
    .lean();
  const recentUserMessages = recentUserLines.map((row) => row.message);

  if (!isAutoSpfScopeMessage(trimmed, recentUserMessages)) {
    const offTopicReply = sanitizeChatReply(OFF_TOPIC_REPLY);
    await ChatMessage.create({
      sessionId,
      sender: 'assistant',
      message: offTopicReply,
      metadata: { type: 'off_topic' },
    });
    return { reply: offTopicReply, leadRequired: false };
  }

  if (wantsPriceList) {
    const reply = sanitizeChatReply(await buildCompleteServicePriceListReply());
    await ChatMessage.create({
      sessionId,
      sender: 'assistant',
      message: reply,
      metadata: { type: 'price_list' },
    });

    return { reply, leadRequired: false };
  }

  if (TRACKER_INTENT_REGEX.test(trimmed)) {
    const reply = TRACKER_REFERENCE_PROMPT;
    await ChatMessage.create({
      sessionId,
      sender: 'assistant',
      message: reply,
      metadata: { type: 'tracker_prompt' },
    });

    return { reply, action: { type: 'tracker_prompt' }, leadRequired: false };
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
    '- Professional business tone — calm, helpful, and confident.',
    '- NEVER use markdown: no asterisks (**), no hash headings (#), no backticks.',
    '- Max ~90 words unless listing package prices.',
    '- For lists use the bullet character • at the start of each line (not * or -).',
    '- One clear next step at the end (e.g. "Tap Book Now" or "Tell me your vehicle type").',
    '- No emojis. No long introductions.',
    '- UI labels in plain text only: Book Now, Login, Talk to a protection specialist.',
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
      reply = SPECIALIST_ESCALATION_REPLY;
    }
  }

  const { reply: cleanedReply, actionChips } = extractActionChipsFromReply(reply);
  reply = cleanedReply;

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

export const verifyPublicTracker = async (req, res, next) => {
  try {
    const { sessionId, bookingReference, phone } = req.body || {};
    const reference = normalizeTrackerReference(bookingReference);
    const providedPhone = String(phone || '').trim();

    if (!reference || !providedPhone) {
      return res.status(400).json({
        success: false,
        message: 'Please enter your booking reference and registered phone number.',
      });
    }

    const order = await loadPublicTrackerOrderByReference(reference);
    const verified = order && trackerPhoneMatches(providedPhone, order);

    if (!verified) {
      const safeReply = "We couldn't verify that booking. Please check the reference and registered phone number, or use Talk to a protection specialist below.";
      if (sessionId) {
        await ChatMessage.create({
          sessionId,
          sender: 'assistant',
          message: safeReply,
          metadata: { type: 'tracker_verification_failed' },
        }).catch(() => null);
      }

      return res.status(404).json({
        success: false,
        message: safeReply,
      });
    }

    const token = signPublicTrackerToken(order);
    const tracker = buildPublicTrackerSummary(order);
    const trackerUrl = `/track/${encodeURIComponent(token)}`;

    if (sessionId) {
      await ChatMessage.create({
        sessionId,
        sender: 'assistant',
        message: `Verified. Your AutoSPF+ tracker is currently at ${tracker.currentStageLabel}.`,
        metadata: { type: 'tracker_result' },
      }).catch(() => null);
    }

    return res.json({
      success: true,
      data: {
        token,
        trackerUrl,
        tracker,
        expiresInSeconds: 60 * 60,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getPublicTracker = async (req, res, next) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) {
      return res.status(400).json({ success: false, message: 'Tracker token is required.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'This tracker link is invalid or has expired. Please verify your booking again in chat.',
      });
    }

    if (decoded?.purpose !== TRACKER_TOKEN_PURPOSE || !decoded?.orderId) {
      return res.status(401).json({
        success: false,
        message: 'This tracker link is invalid or has expired. Please verify your booking again in chat.',
      });
    }

    const order = await loadPublicTrackerOrderById(decoded.orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Tracker not found. Please verify your booking again in chat.',
      });
    }

    return res.json({
      success: true,
      data: {
        tracker: buildPublicTrackerSummary(order),
      },
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
