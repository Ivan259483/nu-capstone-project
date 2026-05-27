export const CHAT_LANGUAGES = Object.freeze({
  ENGLISH: 'english',
  TAGALOG: 'tagalog',
  TAGLISH: 'taglish',
});

export const SUPPORTED_CHAT_LANGUAGES = new Set(Object.values(CHAT_LANGUAGES));

const TAGALOG_MARKER_REGEX =
  /\b(ano|saan|nasaan|nyo|ninyo|natin|kami|kayo|ako|ko|mo|ka|po|opo|ba|naman|lang|paano|pwede|puwede|gusto|magkano|presyo|salamat|marunong|mag|kana|kasi|lokasyon|oras|bukas|sarado|taga|dito|dyan|iyan|yan)\b/i;

const ENGLISH_MARKER_REGEX =
  /\b(location|loc|address|price|pricing|quote|service|services|package|packages|book|booking|schedule|hours|contact|phone|open|where|how|what|you|your|can|do|does|is|are|the|my)\b/i;

const LANGUAGE_SWITCH_PATTERNS = [
  {
    language: CHAT_LANGUAGES.ENGLISH,
    pattern:
      /\b(mag[\s-]*english|english\s+(ka|kana|na|please|pls|lang)|speak\s+english|use\s+english|in\s+english|reply\s+in\s+english)\b/i,
  },
  {
    language: CHAT_LANGUAGES.TAGALOG,
    pattern:
      /\b(mag[\s-]*(tagalog|filipino)|tagalog\s+(ka|kana|na|please|pls|lang)|filipino\s+(ka|kana|na|please|pls|lang)|speak\s+(tagalog|filipino)|use\s+(tagalog|filipino)|reply\s+in\s+(tagalog|filipino))\b/i,
  },
  {
    language: CHAT_LANGUAGES.TAGLISH,
    pattern:
      /\b(taglish|tag[\s-]*lish|mag[\s-]*taglish|taglish\s+(ka|kana|na|please|pls|lang)|mix\s+(english|tagalog)|halo\s+(english|tagalog))\b/i,
  },
];

const UNSUPPORTED_LANGUAGE_ALIASES = [
  ['arabic', /\b(arabic|arabia|arabian|arabo|arab)\b/i],
  ['spanish', /\b(spanish|espanol|español)\b/i],
  ['japanese', /\b(japanese|nihongo|hapon)\b/i],
  ['korean', /\b(korean|hangul|korea)\b/i],
  ['chinese', /\b(chinese|mandarin|cantonese|intsik)\b/i],
  ['french', /\b(french|francais|français)\b/i],
  ['german', /\b(german|deutsch)\b/i],
  ['italian', /\b(italian|italiano)\b/i],
  ['thai', /\b(thai|thailand)\b/i],
  ['vietnamese', /\b(vietnamese|viet)\b/i],
];

const LANGUAGE_CAPABILITY_REGEX =
  /\b(marunong\s+ka\s+mag|can\s+you\s+(speak|use|reply\s+in)|do\s+you\s+(speak|know)|speak\s+to\s+me\s+in|reply\s+in|mag)\b/i;

const DIRECT_INTENT_PATTERNS = [
  {
    intent: 'location',
    topic: 'location',
    confidence: 0.98,
    pattern:
      /\b(location|loc(?:ation)?\s*(nyo|niyo|mo)?|address|where\s+(are\s+you|is\s+(the\s+)?(shop|studio|branch)|located)|saan|san\s+(kayo|shop|branch)|nasaan|lokasyon|map|directions?|marcos|las\s*pi(?:ñ|n)as)\b/i,
  },
  {
    intent: 'hours',
    topic: 'hours',
    confidence: 0.94,
    pattern:
      /\b(hours?|business\s+hours?|operating\s+hours?|opening|closing|oras|bukas|sarado|anong\s+oras|what\s+time|are\s+you\s+open|shop\s+open|open\s+(kayo|ba|today)?|bukas\s+ba|open\s+today)\b/i,
  },
  {
    intent: 'contact',
    topic: 'contact',
    confidence: 0.93,
    pattern:
      /\b(contact|phone|mobile|number|email|call|text|message|tawag|kontak|contact\s+number|cp\s+number)\b/i,
  },
  {
    intent: 'tracker',
    topic: 'tracker',
    confidence: 0.92,
    pattern:
      /\b(track|tracker|tracking|status|where\s+is\s+my\s+(car|vehicle)|live\s+tracker|order\s+status|repair\s+status|nasaan\s+(kotse|sasakyan))\b/i,
  },
  {
    intent: 'booking',
    topic: 'booking',
    confidence: 0.9,
    pattern:
      /\b(book|booking|schedule|appointment|reserve|slot|book\s+now|paano\s+mag[\s-]*book|pa[\s-]*book|mag[\s-]*book|appointment|pa\s*schedule)\b/i,
  },
  {
    intent: 'pricing',
    topic: 'pricing',
    confidence: 0.9,
    pattern:
      /\b(price|price\s*list|pricelist|rate|rates|cost|quote|quotation|estimate|pricing|magkano|presyo|how\s+much|hm\b|how\s+much\s+(is|for)?|price\s+(ceramic|coating|ppf|spf|tint|detail))\b/i,
  },
  {
    intent: 'service_comparison',
    topic: 'services',
    confidence: 0.88,
    pattern:
      /\b(ppf|paint\s+protection)\b[\s\S]{0,50}\b(ceramic|coating)\b|\b(ceramic|coating)\b[\s\S]{0,50}\b(ppf|paint\s+protection)\b|\b(compare|comparison|difference|versus|vs\.?)\b[\s\S]{0,50}\b(ppf|ceramic|coating)\b/i,
  },
  {
    intent: 'package_comparison',
    topic: 'packages',
    confidence: 0.88,
    pattern:
      /\b(compare|comparison|difference)\b[\s\S]{0,50}\b(packages?|spf\s*(80|89|99|101))\b|\b(packages?|spf\s*(80|89|99|101))\b[\s\S]{0,50}\b(compare|comparison|difference|versus|vs\.?)\b|\b(ano\s+(pinagkaiba|difference)|which\s+is\s+better|spf\s*80[\s\S]{0,40}spf\s*(89|99|101)|spf\s*(89|99)[\s\S]{0,40}spf\s*101)\b/i,
  },
  {
    intent: 'package_recommendation',
    topic: 'packages',
    confidence: 0.88,
    pattern:
      /\b(recommend|recommendation|best\s+(package|fit|option)|which\s+package|what\s+package|package\s+(fits?|bagay|recommended)|anong\s+(package|bagay|best)|ano\s+best|fit\s+best|suggest)\b/i,
  },
  {
    intent: 'maintenance',
    topic: 'maintenance',
    confidence: 0.84,
    pattern:
      /\b(maintenance|maintain|aftercare|care\s+tips|wash\s+after|car\s+wash|paano\s+alagaan|alaga|linis|cleaning|cure|curing|warranty)\b/i,
  },
  {
    intent: 'payment_issue',
    topic: 'support',
    confidence: 0.84,
    pattern:
      /\b(payment|paid|gcash|receipt|charge|deposit|down[\s-]?payment)\b[\s\S]{0,50}\b(issue|problem|wrong|failed|missing|error|not\s+(showing|received))\b/i,
  },
  {
    intent: 'vehicle_context',
    topic: 'vehicle',
    confidence: 0.82,
    pattern:
      /\b(my\s+(car|vehicle|ride|unit)\s+(is|=)|car\s+ko|kotse\s+ko|sasakyan\s+ko|i\s+have\s+(a|an)?|vehicle\s*[:=]|civic|vios|altis|fortuner|montero|terra|everest|innova|hilux|ranger|navara|brio|mirage)\b/i,
  },
  {
    intent: 'service_info',
    topic: 'services',
    confidence: 0.86,
    pattern:
      /\b(spf|ppf|paint\s+protection|ceramic|coating|detailing|detail|tint|undercoat|undercoating|graphene|sonax|protection\s+film|nano\s+ceramic)\b/i,
  },
  {
    intent: 'services',
    topic: 'services',
    confidence: 0.88,
    pattern:
      /\b(services?|packages?|menu|offer|promo|ano\s+(ang\s+)?services?|ano\s+(offer|package)|package\s+(nyo|niyo|mo)|services\s+(nyo|niyo))\b/i,
  },
];

const BUSINESS_INTENT_PATTERNS = [
  {
    intent: 'account_registration',
    topic: 'account',
    confidence: 0.92,
    pattern:
      /\b(create|make|open|start|set\s*up|setup|register|sign\s*up|signup)\b[\s\S]{0,60}\b(account|acct|acc|profile)\b|\b(register\s+me|sign\s+me\s+up|signup\s+ako|pa\s*register)\b|\b(gawan|gawa|gumawa|igawa|iregister|i-register)\b[\s\S]{0,60}\b(ako|mo|account|acct|acc|profile)\b|\b(gawa|create)\s+(acc|acct|account)\b/i,
  },
  {
    intent: 'human_handoff',
    topic: 'support',
    confidence: 0.9,
    pattern:
      /\b(talk\s+to\s+(a\s+)?(human|person|agent|representative|specialist|staff)|speak\s+to\s+(a\s+)?(human|person|agent|representative)|live\s+(agent|support|person|help)|connect\s+me\s+(to|with)\s+(a\s+)?(human|agent|specialist|person|representative)|kausapin\s+ang\s+(tao|agent))\b/i,
  },
  ...DIRECT_INTENT_PATTERNS,
];

const SERVICE_INTEREST_PATTERNS = [
  { service: 'SPF Ceramic Coating', topic: 'ceramic coating', pattern: /\b(spf|ceramic|coating|graphene|sonax)\b/i },
  { service: 'Paint Protection Film (PPF)', topic: 'ppf', pattern: /\b(ppf|paint\s+protection\s+film|protection\s+film|clear\s+bra)\b/i },
  { service: 'Nano Ceramic Window Tint', topic: 'tint', pattern: /\b(tint|window\s+tint|nano\s+ceramic\s+tint)\b/i },
  { service: 'Detailing', topic: 'detailing', pattern: /\b(detailing|detail|interior\s+detailing|engine\s+(wash|detailing)|wash)\b/i },
  { service: 'Undercoating', topic: 'undercoating', pattern: /\b(undercoat|undercoating)\b/i },
  { service: 'Paintless Dent Repair', topic: 'pdr', pattern: /\b(pdr|paintless\s+dent|dent\s+repair)\b/i },
];

const PACKAGE_INTEREST_PATTERNS = [
  { packageKey: 'spf101', label: 'SPF 101', pattern: /\bspf\s*[-_ ]?101\b|\ball[\s-]?in\b|\bflagship\b/i },
  { packageKey: 'spf99', label: 'SPF 99', pattern: /\bspf\s*[-_ ]?99\b|\bpremium\b/i },
  { packageKey: 'spf89', label: 'SPF 89', pattern: /\bspf\s*[-_ ]?89\b|\badvanced\b/i },
  { packageKey: 'spf80', label: 'SPF 80', pattern: /\bspf\s*[-_ ]?80\b|\bessential\b/i },
];

const PROTECTION_GOAL_PATTERNS = [
  { goal: 'maximum protection', pattern: /\b(max(?:imum)?\s+protection|long[\s-]?term|10\s*years?|best\s+protection|ultimate|all[\s-]?in)\b/i },
  { goal: 'daily gloss and hydrophobic protection', pattern: /\b(gloss|shine|kintab|hydrophobic|daily|everyday)\b/i },
  { goal: 'scratch and chip protection', pattern: /\b(scratch|scratches|chips?|stone\s+chip|gasgas|road\s+debris)\b/i },
  { goal: 'heat and privacy tint', pattern: /\b(heat|privacy|init|tint)\b/i },
  { goal: 'interior refresh', pattern: /\b(interior|amoy|odor|linis\s+loob|seats?)\b/i },
];

const ONBOARDING_BUSINESS_SIDE_INTENTS = new Set([
  'location',
  'hours',
  'contact',
  'tracker',
  'booking',
  'pricing',
  'services',
  'service_info',
  'service_comparison',
  'package_recommendation',
  'package_comparison',
  'maintenance',
  'payment_issue',
]);

const ONBOARDING_ACCOUNT_FIELD_QUESTION_REGEX =
  /\b(my|ko|use|provide|enter|send|should\s+i|should\s+we|for\s+setup|setup\s+link|secure\s+link)\b[\s\S]{0,60}\b(email|e-?mail|phone|mobile|number|contact|name|pangalan)\b|\b(email|e-?mail|phone|mobile|number|contact|name|pangalan)\b[\s\S]{0,60}\b(my|ko|use|provide|enter|send|should\s+i|should\s+we|for\s+setup|setup\s+link|secure\s+link)\b/i;

const SHOP_CONTACT_QUESTION_REGEX =
  /\b(nyo|niyo|ninyo|your|shop|studio|branch|autospf|contact\s+number|phone\s+number\s+nyo|number\s+nyo)\b/i;

export const normalizeLanguagePreference = (language) => {
  const normalized = String(language || '').trim().toLowerCase();
  return SUPPORTED_CHAT_LANGUAGES.has(normalized) ? normalized : null;
};

export const detectLanguageSwitch = (message = '') => {
  const text = String(message || '').trim();
  if (!text) return null;
  const match = LANGUAGE_SWITCH_PATTERNS.find((entry) => entry.pattern.test(text));
  return match ? { language: match.language, explicit: true } : null;
};

export const detectUnsupportedLanguageRequest = (message = '') => {
  const text = String(message || '').trim();
  if (!text || !LANGUAGE_CAPABILITY_REGEX.test(text)) return null;

  for (const [language, pattern] of UNSUPPORTED_LANGUAGE_ALIASES) {
    if (pattern.test(text)) return { language };
  }

  return null;
};

export const detectMessageLanguage = (message = '') => {
  const text = String(message || '').trim();
  if (!text) return CHAT_LANGUAGES.ENGLISH;

  const hasTagalog = TAGALOG_MARKER_REGEX.test(text);
  const hasEnglish = ENGLISH_MARKER_REGEX.test(text);

  if (hasTagalog && hasEnglish) return CHAT_LANGUAGES.TAGLISH;
  if (hasTagalog) return CHAT_LANGUAGES.TAGALOG;
  return CHAT_LANGUAGES.ENGLISH;
};

export const resolveConversationLanguage = (session = {}, message = '') => {
  const explicitSwitch = detectLanguageSwitch(message);
  if (explicitSwitch) return explicitSwitch.language;

  const preferred = normalizeLanguagePreference(session?.preferredLanguage);
  if (preferred) return preferred;

  return detectMessageLanguage(message);
};

export const detectDirectAnswerIntent = (message = '') => {
  const text = String(message || '').trim();
  if (!text) return null;

  const match = DIRECT_INTENT_PATTERNS.find((entry) => entry.pattern.test(text));
  return match ? { intent: match.intent, topic: match.topic, confidence: match.confidence } : null;
};

export const detectBusinessConversationIntent = (message = '') => {
  const text = String(message || '').trim();
  if (!text) return null;

  const match = BUSINESS_INTENT_PATTERNS.find((entry) => entry.pattern.test(text));
  return match ? { intent: match.intent, topic: match.topic, confidence: match.confidence } : null;
};

export const isBusinessSideQuestionForOnboarding = (message = '') => {
  const intent = detectDirectAnswerIntent(message);
  if (intent?.intent === 'contact' && ONBOARDING_ACCOUNT_FIELD_QUESTION_REGEX.test(message) && !SHOP_CONTACT_QUESTION_REGEX.test(message)) {
    return false;
  }
  return Boolean(intent && ONBOARDING_BUSINESS_SIDE_INTENTS.has(intent.intent));
};

export const detectServiceInterestFromMessage = (message = '') => {
  const text = String(message || '').trim();
  if (!text) return null;
  const match = SERVICE_INTEREST_PATTERNS.find((entry) => entry.pattern.test(text));
  return match ? { service: match.service, topic: match.topic } : null;
};

export const detectPackageInterestFromMessage = (message = '') => {
  const text = String(message || '').trim();
  if (!text) return null;
  const match = PACKAGE_INTEREST_PATTERNS.find((entry) => entry.pattern.test(text));
  return match ? { packageKey: match.packageKey, label: match.label } : null;
};

export const detectProtectionGoalFromMessage = (message = '') => {
  const text = String(message || '').trim();
  if (!text) return null;
  const match = PROTECTION_GOAL_PATTERNS.find((entry) => entry.pattern.test(text));
  return match ? match.goal : null;
};

export const isFallbackRecentlyUsed = (session = {}, cooldownMs = 2 * 60 * 1000) => {
  if (!session?.lastFallbackAt) return false;
  const lastAt = new Date(session.lastFallbackAt).getTime();
  return Number.isFinite(lastAt) && Date.now() - lastAt < cooldownMs;
};

const t = (language, variants) => variants[normalizeLanguagePreference(language) || CHAT_LANGUAGES.ENGLISH] || variants.english;

export const buildLanguageSwitchReply = (language) =>
  t(language, {
    english: "Sure, I'll continue in English. How can I help with AutoSPF+?",
    tagalog: 'Sige, magta-Tagalog ako mula rito. Paano kita matutulungan sa AutoSPF+?',
    taglish: 'Sige, Taglish tayo from here. Ano ang gusto mong malaman about AutoSPF+?',
  });

export const buildUnsupportedLanguageReply = (preferredLanguage = CHAT_LANGUAGES.ENGLISH) =>
  t(preferredLanguage, {
    english:
      'I currently support English and Tagalog best, but I can still try to assist you with AutoSPF+ services.',
    tagalog:
      'English at Tagalog ang pinaka-supported ko ngayon, pero tutulungan pa rin kita sa AutoSPF+ services.',
    taglish:
      'English and Tagalog ang best supported ko ngayon, pero I can still help you with AutoSPF+ services.',
  });

export const buildBusinessScopeRedirectReply = ({
  language = CHAT_LANGUAGES.ENGLISH,
  lastTopic = '',
  fallbackRecentlyUsed = false,
} = {}) => {
  if (fallbackRecentlyUsed) {
    return t(language, {
      english:
        'Let us keep this focused on AutoSPF+. I can help with services, pricing, bookings, packages, tracker, location, or vehicle protection.',
      tagalog:
        'I-focus natin sa AutoSPF+. Matutulungan kita sa services, pricing, booking, packages, tracker, location, o vehicle protection.',
      taglish:
        'Let us keep this focused on AutoSPF+. I can help with services, pricing, booking, packages, tracker, location, or vehicle protection.',
    });
  }

  return t(language, {
    english: `I'm focused on helping with AutoSPF+ services, bookings, coatings, detailing, pricing, and vehicle protection.${lastTopic ? ` We can continue with ${lastTopic}, or I can recommend a package for your vehicle.` : ' I can recommend the best package for your vehicle.'}`,
    tagalog: `Nakatuon ako sa AutoSPF+ services, bookings, coatings, detailing, pricing, at vehicle protection.${lastTopic ? ` Pwede nating ituloy ang ${lastTopic}, o mag-recommend ako ng package para sa vehicle mo.` : ' Pwede kitang tulungan pumili ng best package para sa vehicle mo.'}`,
    taglish: `I'm focused on AutoSPF+ services, bookings, coatings, detailing, pricing, and vehicle protection.${lastTopic ? ` We can continue with ${lastTopic}, or I can recommend a package for your vehicle.` : ' I can recommend the best package for your vehicle.'}`,
  });
};

export const buildContextualFallbackReply = ({
  language = CHAT_LANGUAGES.ENGLISH,
  lastTopic = '',
  fallbackRecentlyUsed = false,
  recentUserMessages = [],
} = {}) => {
  const hasRecentContext = Boolean(lastTopic) || recentUserMessages.some((line) => String(line || '').trim().length > 8);

  if (fallbackRecentlyUsed) {
    return t(language, {
      english: 'Let me narrow it down. Do you mean pricing, booking, tracker, location, hours, or services?',
      tagalog: 'Linawin natin. Pricing, booking, tracker, location, oras, o services ba ang tinatanong mo?',
      taglish: 'Let me narrow it down. Pricing, booking, tracker, location, hours, or services ba ito?',
    });
  }

  if (hasRecentContext) {
    const topicLabel = lastTopic || 'AutoSPF+';
    return t(language, {
      english: `I may need one more detail. Are you asking about ${topicLabel}, pricing, booking, or your vehicle status?`,
      tagalog: `Kailangan ko lang ng kaunting linaw. Tungkol ba ito sa ${topicLabel}, pricing, booking, o vehicle status?`,
      taglish: `Need ko lang ng konting context. About ba ito sa ${topicLabel}, pricing, booking, or vehicle status?`,
    });
  }

  return t(language, {
    english: 'I can help with AutoSPF+ pricing, booking, tracker, location, hours, and services. Which one do you need?',
    tagalog: 'Matutulungan kita sa AutoSPF+ pricing, booking, tracker, location, oras, at services. Alin ang kailangan mo?',
    taglish: 'I can help with AutoSPF+ pricing, booking, tracker, location, hours, and services. Alin ang need mo?',
  });
};

export const normalizeReplySignature = (reply = '') =>
  String(reply || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^a-z0-9+@#₱]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);

export const buildDedupedReply = ({ language = CHAT_LANGUAGES.ENGLISH, lastTopic = '' } = {}) =>
  t(language, {
    english: `Let's keep this useful. ${lastTopic ? `For ${lastTopic}, ` : ''}send one detail like your vehicle type, booking reference, or the AutoSPF+ service you mean.`,
    tagalog: `Para mas makatulong ako, ${lastTopic ? `sa ${lastTopic}, ` : ''}send mo lang ang vehicle type, booking reference, o service na tinutukoy mo.`,
    taglish: `Let's keep it useful. ${lastTopic ? `For ${lastTopic}, ` : ''}send mo lang vehicle type, booking reference, or the service you mean.`,
  });

export const applyReplyDeduplication = ({ reply, session = {}, language, dedupe = false } = {}) => {
  const signature = normalizeReplySignature(reply);
  if (!dedupe || !signature || signature !== session?.lastAssistantReplySignature) {
    return { reply, signature, deduped: false };
  }

  const dedupedReply = buildDedupedReply({ language, lastTopic: session?.lastTopic });
  return {
    reply: dedupedReply,
    signature: normalizeReplySignature(dedupedReply),
    deduped: true,
  };
};

export const updateConversationMemoryForReply = (session, {
  reply,
  signature,
  metadata = {},
  language = CHAT_LANGUAGES.ENGLISH,
} = {}) => {
  if (!session) return;

  const isFallback = ['fallback', 'off_topic', 'low_confidence'].includes(metadata.type);
  const continuity = Number(session.conversationContinuityScore) || 0;

  session.lastAssistantReplySignature = signature || normalizeReplySignature(reply);
  session.lastAnsweredIntent = metadata.intent || metadata.type || session.lastAnsweredIntent;
  session.lastDetectedLanguage = metadata.detectedLanguage || language;
  session.preferredLanguage = normalizeLanguagePreference(language) || session.preferredLanguage;

  if (metadata.topic) session.lastTopic = metadata.topic;

  if (isFallback) {
    session.lastFallbackAt = new Date();
    session.consecutiveFallbackCount = (Number(session.consecutiveFallbackCount) || 0) + 1;
    session.conversationContinuityScore = Math.max(0, continuity - 1);
  } else {
    session.consecutiveFallbackCount = 0;
    session.conversationContinuityScore = Math.min(100, continuity + (metadata.type === 'direct_answer' ? 2 : 1));
  }

  session.memoryUpdatedAt = new Date();
};
