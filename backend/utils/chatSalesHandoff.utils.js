const HUMAN_HELP_PATTERN =
  /\b(talk|speak|connect|chat)\b[\s\S]{0,40}\b(human|person|agent|representative|sales|staff|specialist)\b|\b(human\s+help|human|live\s+agent|representative|sales|sales\s+(team|rep|representative)|makausap|kausapin)\b/i;

const BOOKING_ASSISTANCE_PATTERN =
  /\b(help|assist|assistance|guide|support)\b[\s\S]{0,50}\b(book|booking|appointment|reserve|reservation|schedule)\b|\b(book|booking|appointment|reservation|schedule)\b[\s\S]{0,35}\b(help|assist|assistance|for\s+me|ako|please|po)\b|\b(pa[\s-]?(book|schedule)|tulungan[\s\S]{0,30}(mag[\s-]?book|booking))\b/i;

const SCHEDULE_AVAILABILITY_PATTERN =
  /\b(available|availability|open\s+slot|slots?|schedule)\b[\s\S]{0,50}\b(today|tomorrow|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|date|time|booking|appointment)\b|\b(slots?|schedule|booking|appointment)\b[\s\S]{0,35}\b(available|availability|open)\b|\b(available\s+ba|may\s+(available|slot)|anong\s+(available|schedule))\b/i;

const RESCHEDULE_PATTERN =
  /\b(reschedule|re[\s-]?schedule)\b|\b(move|change)\b[\s\S]{0,45}\b(booking|appointment|schedule|date|time|slot)\b|\b(pa[\s-]?reschedule|lipat(?:in)?[\s\S]{0,30}(booking|schedule|appointment))\b/i;

const PAYMENT_CONCERN_PATTERN =
  /\b(payment|paid|gcash|card|receipt|charge|charged|deposit|down[\s-]?payment|refund)\b[\s\S]{0,60}\b(concern|issue|problem|wrong|failed|missing|error|pending|not\s+(showing|received|reflected)|didn'?t\s+(work|go\s+through))\b|\b(payment\s+concern|problema[\s\S]{0,30}(bayad|payment)|bayad[\s\S]{0,30}(mali|problem|issue))\b/i;

const PRICING_PATTERN =
  /\b(exact|final|actual|confirmed|current|latest)\b[\s\S]{0,35}\b(price|pricing|cost|rate|quote|presyo)\b|\b(price|pricing|cost|rate|quote|quotation|estimate|magkano|presyo|how\s+much|hm\b)\b/i;

export const SALES_HANDOFF_OFFER_REASONS = Object.freeze({
  HUMAN_HELP: 'human_help',
  BOOKING_ASSISTANCE: 'booking_assistance',
  SCHEDULE_AVAILABILITY: 'schedule_availability',
  RESCHEDULE: 'reschedule',
  PAYMENT_CONCERN: 'payment_concern',
  PRICING: 'pricing',
});

export const detectSalesHandoffOffer = (message = '') => {
  const text = String(message || '').trim();
  if (!text) return null;

  const candidates = [
    [SALES_HANDOFF_OFFER_REASONS.HUMAN_HELP, HUMAN_HELP_PATTERN],
    [SALES_HANDOFF_OFFER_REASONS.RESCHEDULE, RESCHEDULE_PATTERN],
    [SALES_HANDOFF_OFFER_REASONS.PAYMENT_CONCERN, PAYMENT_CONCERN_PATTERN],
    [SALES_HANDOFF_OFFER_REASONS.SCHEDULE_AVAILABILITY, SCHEDULE_AVAILABILITY_PATTERN],
    [SALES_HANDOFF_OFFER_REASONS.BOOKING_ASSISTANCE, BOOKING_ASSISTANCE_PATTERN],
    [SALES_HANDOFF_OFFER_REASONS.PRICING, PRICING_PATTERN],
  ];

  const match = candidates.find(([, pattern]) => pattern.test(text));
  return match
    ? {
        eligible: true,
        reason: match[0],
      }
    : null;
};

export const shouldOfferSalesHandoff = (message = '') =>
  Boolean(detectSalesHandoffOffer(message));
