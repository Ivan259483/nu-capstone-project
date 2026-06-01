/** Shown only for explicit human requests or strong complaint/payment disputes. */
export const SPECIALIST_ESCALATION_REPLY =
  'Let me connect you with a specialist who can help you better! Please use Talk to a protection specialist below.';

export const ESCALATION_COOLDOWN_MS = 15 * 60 * 1000;

const CASUAL_ACK_REGEX =
  /^(okay|ok|oke|k|yes|yep|yeah|yup|sure|sige|oo|thanks|thank\s+you|salamat|got\s+it|noted|alright|cool|nice)[\s!.?]*$/i;

const THINKING_PAUSE_REGEX =
  /\b(nagiisip|nag[\s-]?iisip|isip\s+pa|isip\s+muna|thinking|think\s+pa|wait|hold\s+on|sandali|antay\s+lang|let\s+me\s+think|mumuni|muna\s+lang)\b/i;

const HESITATION_REGEX = /^(hmm+|uh+|ah+|oh+|eme|eme[\s-]?lang)[\s!.?]*$/i;

const LOCATION_FRAGMENT_REGEX =
  /\b(location|address|saan|nasaan|where\s+(are\s+you|is\s+(the\s+)?(shop|studio|branch))|map|directions?|marcos|las\s*piñas|piñas)\b/i;

const SERVICES_QUESTION_REGEX =
  /\b(what\s+(are\s+)?(your\s+)?services?|services?\??|ano\s+(ang\s+)?services?|offer\s+nyo|packages?)\b/i;

const SHORT_PRICE_REGEX = /^price\??$/i;

const FRUSTRATION_SIGNAL_REGEX =
  /\b(frustrated|angry|furious|useless|terrible|worst|pathetic|scam|bullshit|panget\s+serbisyo|bwisit|nakakainis|hindi\s+marunong|waste\s+of\s+time)\b/i;

/** Explicit request for a human — avoid loose matches like bare "person" or "someone". */
export const EXPLICIT_HUMAN_HANDOFF_REGEX =
  /\b(talk\s+to\s+(a\s+)?(human|person|agent|representative|specialist|staff)|speak\s+to\s+(a\s+)?(human|person|agent|representative)|real\s+(human|person)|live\s+(agent|support|person|help)|human\s+(agent|support|help)|connect\s+me\s+(to|with)\s+(a\s+)?(human|agent|specialist|person|representative)|need\s+(a\s+)?(human|agent|person)|gusto\s+ko\s+(kausapin|makausap)\s+(ang\s+)?(tao|agent)|tawag.*\b(tao|agent)\b|kausapin\s+ang\s+(tao|agent))\b/i;

export const STRONG_COMPLAINT_ESCALATION_REGEX =
  /\b(complaint|complain|refund|chargeback|cancel\s+my\s+(booking|appointment|order)|bad\s+service|dissatisfied|terrible\s+service|scam)\b/i;

export const PAYMENT_ISSUE_ESCALATION_REGEX =
  /\b(payment|paid|gcash|receipt|charge|charged|deposit|down[\s-]?payment)\b[\s\S]{0,50}\b(issue|problem|wrong|failed|missing|not\s+(showing|received)|didn'?t\s+(go\s+through|work)|error)\b/i;

export const isExplicitHumanHandoffRequest = (message = '') =>
  EXPLICIT_HUMAN_HANDOFF_REGEX.test(String(message || '').trim());

export const isStrongComplaintOrPaymentDispute = (message = '') => {
  const text = String(message || '').trim();
  if (!text) return false;
  return STRONG_COMPLAINT_ESCALATION_REGEX.test(text) || PAYMENT_ISSUE_ESCALATION_REGEX.test(text);
};

export const isCasualConversationMessage = (message = '') => {
  const text = String(message || '').trim();
  if (!text || text.length > 120) return false;

  return (
    CASUAL_ACK_REGEX.test(text) ||
    HESITATION_REGEX.test(text) ||
    THINKING_PAUSE_REGEX.test(text) ||
    SHORT_PRICE_REGEX.test(text) ||
    SERVICES_QUESTION_REGEX.test(text) ||
    (LOCATION_FRAGMENT_REGEX.test(text) && text.length <= 80)
  );
};

export const detectFrustrationSignal = (message = '') =>
  FRUSTRATION_SIGNAL_REGEX.test(String(message || '').trim());

export const canOfferSpecialistEscalation = (session = {}) => {
  const lastAt = session?.lastHandoffPromptAt;
  if (!lastAt) return true;
  const elapsed = Date.now() - new Date(lastAt).getTime();
  return elapsed >= ESCALATION_COOLDOWN_MS;
};

export const markSpecialistEscalationOffered = (session) => {
  if (!session) return;
  session.lastHandoffPromptAt = new Date();
  const count = Number(session.handoffPromptCount) || 0;
  session.handoffPromptCount = count + 1;
};

export const getSessionFrustrationScore = (session = {}) =>
  Number(session?.conversationFrustrationScore) || 0;

export const bumpSessionFrustration = (session, message = '') => {
  if (!session || !detectFrustrationSignal(message)) return 0;
  const next = getSessionFrustrationScore(session) + 1;
  session.conversationFrustrationScore = next;
  return next;
};

/**
 * Deterministic concierge replies for casual / fragment messages (no handoff).
 * @returns {string | null}
 */
export const buildCasualConciergeReply = (message = '', { session = {}, recentUserMessages = [] } = {}) => {
  const text = String(message || '').trim();
  if (!text) return null;

  const hasRecentShopContext =
    Boolean(session?.lastIntent && session.lastIntent !== 'general') ||
    Boolean(session?.lastServiceInterest) ||
    Boolean(session?.lastVehicleType) ||
    recentUserMessages.some((line) => String(line || '').length > 8);

  if (CASUAL_ACK_REGEX.test(text) || HESITATION_REGEX.test(text)) {
    if (hasRecentShopContext) {
      return 'Sure — let me know if you want pricing for another vehicle, help booking, or package recommendations.';
    }
    return 'Sure — let me know anytime if you would like pricing, booking assistance, or package recommendations.';
  }

  if (THINKING_PAUSE_REGEX.test(text)) {
    return 'No worries — take your time. I can help you explore our services whenever you are ready.';
  }

  if (LOCATION_FRAGMENT_REGEX.test(text)) {
    return 'We are along Marcos Alvarez Ave., Las Piñas City. Visit our Contact page for map details and studio hours.';
  }

  if (SHORT_PRICE_REGEX.test(text) || /\b(presyo|magkano)\b/i.test(text)) {
    return 'I can share SPF package pricing — tell me your vehicle type (sedan, SUV, hatchback, pick up, etc.) and I will quote the right package.';
  }

  if (SERVICES_QUESTION_REGEX.test(text)) {
    return 'We offer Sonax SPF 80, 89, 99, and 101 protection packages, plus ceramic coating, PPF, tint, and detailing. Tell me your vehicle type or goal and I will recommend the best fit.';
  }

  return null;
};

export const shouldEscalateToSpecialist = ({
  message = '',
  session = {},
  recentUserMessages = [],
  groqFailed = false,
} = {}) => {
  const text = String(message || '').trim();

  if (isExplicitHumanHandoffRequest(text)) {
    return { escalate: true, reason: 'explicit_human_request' };
  }

  if (isCasualConversationMessage(text)) {
    return { escalate: false, reason: 'casual_conversation' };
  }

  const frustrationScore =
    bumpSessionFrustration(session, text) || getSessionFrustrationScore(session);

  if (frustrationScore >= 2 && isStrongComplaintOrPaymentDispute(text)) {
    return { escalate: true, reason: 'repeated_frustration' };
  }

  if (groqFailed) {
    return { escalate: false, reason: 'ai_unavailable' };
  }

  const strongComplaint =
    STRONG_COMPLAINT_ESCALATION_REGEX.test(text) &&
    (frustrationScore >= 1 || /\b(refund|chargeback|scam|cancel\s+my)\b/i.test(text));

  const paymentDispute = PAYMENT_ISSUE_ESCALATION_REGEX.test(text) && frustrationScore >= 2;

  if ((strongComplaint || paymentDispute) && canOfferSpecialistEscalation(session)) {
    return { escalate: true, reason: strongComplaint ? 'complaint' : 'payment_dispute' };
  }

  if (strongComplaint || paymentDispute) {
    return { escalate: false, reason: 'escalation_cooldown' };
  }

  return { escalate: false, reason: 'none' };
};

export const buildComplaintSoftReply = () =>
  'I am sorry you are dealing with that. Share your booking reference or a few details about the payment issue, and I will help right away.';
