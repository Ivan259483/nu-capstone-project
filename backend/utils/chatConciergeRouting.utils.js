const LANGUAGES = Object.freeze({
  ENGLISH: 'english',
  TAGALOG: 'tagalog',
  TAGLISH: 'taglish',
});

/**
 * Pure greetings and light openers — must not trigger account onboarding.
 */
export const GREETING_MESSAGE_REGEX =
  /^(?:hi|hello|hey|heya|hiya|howdy|yo|sup|what'?s\s+up|wassup|kamusta|kumusta|musta|odb|good\s+(?:morning|afternoon|evening|day)|morning|afternoon|evening)(?:\s+(?:there|po|po\s+)?)?[\s!.?,👋🙂😊]*$/iu;

export const TIME_GREETING_REGEX =
  /^(?:good\s+(?:morning|afternoon|evening)|magandang\s+(?:umaga|hapon|gabi))(?:\s+po)?[\s!.?,]*$/iu;

/**
 * Explicit registration / account-creation intent only.
 */
export const EXPLICIT_REGISTRATION_INTENT_REGEX =
  /^(?:sign\s*up|signup|register)\s*[\s!.?,]*$|\b(create|make|open|start|set\s*up|setup|register|sign\s*up|signup)\b[\s\S]{0,60}\b(account|acct|acc|profile)\b|\b(register\s+me|sign\s+me\s+up|signup\s+ako|pa\s*register|pa[\s-]*register)\b|\b(gawan|gawa|gumawa|igawa|iregister|i-register)\b[\s\S]{0,60}\b(ako|mo|account|acct|acc|profile)\b|\b(gawa|create|make)\s+(an?\s+)?(acc|acct|account)\b|\b(want|need|gusto|gusto\s+ko|i\s+want|i\s+need)\b[\s\S]{0,40}\b(an?\s+)?(account|acct|acc|profile)\b|\b(mag|gusto)\s*[\s-]*register\b/i;

export const isGreetingMessage = (message = '') => {
  const text = String(message || '').trim();
  if (!text || text.length > 80) return false;
  return GREETING_MESSAGE_REGEX.test(text) || TIME_GREETING_REGEX.test(text);
};

export const hasExplicitRegistrationIntent = (message = '') =>
  EXPLICIT_REGISTRATION_INTENT_REGEX.test(String(message || '').trim());

export const classifyConversationRoute = (message = '', { inOnboarding = false } = {}) => {
  const text = String(message || '').trim();
  if (!text) return 'empty';
  if (inOnboarding) return 'onboarding';
  if (isGreetingMessage(text)) return 'greeting';
  if (hasExplicitRegistrationIntent(text)) return 'registration';
  return 'open';
};

const WELCOME_COPY = {
  [LANGUAGES.ENGLISH]: {
    title: 'Welcome to AutoSPF+ 👋',
    lines: [
      'I can help with:',
      '• account setup',
      '• bookings',
      '• ceramic coating',
      '• SPF & PPF packages',
      '• detailing',
      '• pricing & recommendations',
      '',
      'How can I assist you today?',
    ],
  },
  [LANGUAGES.TAGALOG]: {
    title: 'Welcome sa AutoSPF+ 👋',
    lines: [
      'Makakatulong ako sa:',
      '• account setup',
      '• booking',
      '• ceramic coating',
      '• SPF at PPF packages',
      '• detailing',
      '• presyo at recommendations',
      '',
      'Paano kita matutulungan ngayon?',
    ],
  },
  [LANGUAGES.TAGLISH]: {
    title: 'Welcome to AutoSPF+ 👋',
    lines: [
      'I can help with:',
      '• account setup',
      '• bookings',
      '• ceramic coating',
      '• SPF & PPF packages',
      '• detailing',
      '• pricing & recommendations',
      '',
      'How can I assist you today?',
    ],
  },
};

export const buildPremiumConciergeWelcomeReply = (language = LANGUAGES.ENGLISH, { returning = false } = {}) => {
  const copy = WELCOME_COPY[language] || WELCOME_COPY[LANGUAGES.ENGLISH];
  if (returning) {
    const short = {
      [LANGUAGES.TAGALOG]: 'Welcome back sa AutoSPF+ 👋 Paano kita matutulungan ngayon?',
      [LANGUAGES.TAGLISH]: 'Welcome back to AutoSPF+ 👋 How can I assist you today?',
    };
    return short[language] || 'Welcome back to AutoSPF+ 👋 How can I assist you today?';
  }
  return [copy.title, '', ...copy.lines].join('\n');
};
