import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ONBOARDING_SEMANTIC_CONFIDENCE_THRESHOLD,
  analyzeOnboardingMessage,
  getMissingRequiredOnboardingFields,
  normalizeSemanticAnalysis,
} from '../services/chatOnboardingSemantic.service.js';

const mockGroq = (payload) => async () => ({
  content: JSON.stringify(payload),
});

test('Groq semantic analysis extracts corrected first name from conversational phrase', async () => {
  const analysis = await analyzeOnboardingMessage(
    {
      message: 'please change the first name ivan',
      step: 'email',
      draft: { firstName: 'Kevin', lastName: 'Reyes', email: '', phone: '' },
      preferredLanguage: 'english',
    },
    {
      groqCaller: mockGroq({
        intent: 'UPDATE_FIRST_NAME',
        field: 'first_name',
        value: 'Ivan',
        next_required_field: 'phone',
        language: 'english',
        confidence: 0.98,
        reply: 'Got it — what mobile number should we place on your account?',
      }),
    }
  );

  assert.equal(analysis.intent, 'UPDATE_FIRST_NAME');
  assert.equal(analysis.field, 'first_name');
  assert.equal(analysis.value, 'Ivan');
  assert.equal(analysis.nextRequiredField, 'phone');
  assert.match(analysis.reply, /mobile number/i);
  assert.ok(analysis.confidence >= ONBOARDING_SEMANTIC_CONFIDENCE_THRESHOLD);
});

test('Groq semantic analysis extracts missing last name and chooses phone next', async () => {
  const analysis = await analyzeOnboardingMessage(
    {
      message: 'my last name is Tadena',
      step: 'lastName',
      draft: { firstName: 'Ivan', lastName: '', email: '', phone: '' },
      preferredLanguage: 'english',
    },
    {
      groqCaller: mockGroq({
        intent: 'UPDATE_LAST_NAME',
        field: 'last_name',
        value: 'Tadena',
        next_required_field: 'phone',
        language: 'english',
        confidence: 0.98,
        reply: 'Perfect — what mobile number should we place on your account?',
      }),
    }
  );

  assert.equal(analysis.intent, 'UPDATE_LAST_NAME');
  assert.equal(analysis.field, 'last_name');
  assert.equal(analysis.value, 'Tadena');
  assert.equal(analysis.nextRequiredField, 'phone');
  assert.match(analysis.reply, /mobile number/i);
});

test('Groq semantic analysis infers bare phone number and chooses email next', async () => {
  const analysis = await analyzeOnboardingMessage(
    {
      message: '09199453262',
      step: 'phone',
      draft: { firstName: 'Ivan', lastName: 'Tadena', email: '', phone: '' },
      preferredLanguage: 'taglish',
    },
    {
      groqCaller: mockGroq({
        intent: 'UPDATE_PHONE',
        field: 'phone',
        value: '09199453262',
        next_required_field: 'email',
        language: 'taglish',
        confidence: 0.99,
        reply: 'Great — what email address should we use for your secure setup link?',
      }),
    }
  );

  assert.equal(analysis.intent, 'UPDATE_PHONE');
  assert.equal(analysis.field, 'phone');
  assert.equal(analysis.value, '09199453262');
  assert.equal(analysis.nextRequiredField, 'email');
  assert.match(analysis.reply, /secure setup link/i);
});

test('semantic normalization removes Taglish filler from name values', () => {
  const analysis = normalizeSemanticAnalysis({
    intent: 'UPDATE_FIRST_NAME',
    field: 'first_name',
    value: 'Harry nga',
    language: 'taglish',
    confidence: 0.96,
  });

  assert.equal(analysis.value, 'Harry');
});

test('semantic normalization removes conversational name wrappers defensively', () => {
  const analysis = normalizeSemanticAnalysis({
    intent: 'UPDATE_FIRST_NAME',
    field: 'first_name',
    value: 'please change the first name ivan',
    language: 'english',
    confidence: 0.96,
  });

  assert.equal(analysis.value, 'Ivan');
});

test('semantic normalization treats negative name corrections as missing values', () => {
  const analysis = normalizeSemanticAnalysis({
    intent: 'UPDATE_FIRST_NAME',
    field: 'first_name',
    value: 'not ivan',
    language: 'english',
    confidence: 0.9,
  });

  assert.equal(analysis.value, null);
});

test('semantic normalization preserves create-account intent even when Groq includes a field', () => {
  const analysis = normalizeSemanticAnalysis({
    intent: 'CREATE_ACCOUNT',
    field: 'first_name',
    value: 'Ivan',
    next_required_field: 'last_name',
    language: 'english',
    confidence: 0.95,
  });

  assert.equal(analysis.intent, 'CREATE_ACCOUNT');
  assert.equal(analysis.field, 'first_name');
  assert.equal(analysis.value, 'Ivan');
  assert.equal(analysis.nextRequiredField, 'last_name');
});

test('Groq semantic analysis can update first name while current step is email', async () => {
  const analysis = await analyzeOnboardingMessage(
    {
      message: 'my name is kevin',
      step: 'email',
      draft: { firstName: 'Ivan', lastName: 'Reyes', email: '', phone: '' },
      preferredLanguage: 'english',
    },
    {
      groqCaller: mockGroq({
        intent: 'UPDATE_FIRST_NAME',
        field: 'first_name',
        value: 'Kevin',
        language: 'english',
        confidence: 0.97,
      }),
    }
  );

  assert.equal(analysis.intent, 'UPDATE_FIRST_NAME');
  assert.equal(analysis.field, 'first_name');
  assert.equal(analysis.value, 'Kevin');
});

test('low-confidence correction asks clarification instead of mutating', async () => {
  const analysis = await analyzeOnboardingMessage(
    {
      message: 'mali',
      step: 'lastName',
      draft: { firstName: 'Ivan', lastName: '', email: '', phone: '' },
      preferredLanguage: 'taglish',
    },
    {
      groqCaller: mockGroq({
        intent: 'CLARIFICATION',
        field: null,
        value: null,
        language: 'taglish',
        confidence: 0.52,
        clarificationQuestion: 'What would you like me to correct?',
      }),
    }
  );

  assert.equal(analysis.intent, 'CLARIFICATION');
  assert.ok(analysis.confidence < ONBOARDING_SEMANTIC_CONFIDENCE_THRESHOLD);
  assert.match(analysis.clarificationQuestion, /correct/i);
});

test('business side question is classified without field extraction', async () => {
  const analysis = await analyzeOnboardingMessage(
    {
      message: 'location nyo?',
      step: 'email',
      draft: { firstName: 'Ivan', lastName: 'Reyes', email: '', phone: '' },
      preferredLanguage: 'taglish',
    },
    {
      groqCaller: mockGroq({
        intent: 'ASK_LOCATION',
        field: null,
        value: null,
        language: 'taglish',
        confidence: 0.96,
      }),
    }
  );

  assert.equal(analysis.intent, 'ASK_LOCATION');
  assert.equal(analysis.field, null);
});

test('phone skip request is treated as clarification because phone is required', async () => {
  const analysis = await analyzeOnboardingMessage(
    {
      message: 'skip number',
      step: 'phone',
      draft: { firstName: 'Ivan', lastName: 'Reyes', email: '', phone: '' },
      preferredLanguage: 'english',
    },
    {
      groqCaller: mockGroq({
        intent: 'CLARIFICATION',
        field: null,
        value: null,
        next_required_field: 'phone',
        language: 'english',
        confidence: 0.92,
        reply: 'I do need a mobile number before I can send your secure setup link.',
      }),
    }
  );

  assert.equal(analysis.intent, 'CLARIFICATION');
  assert.equal(analysis.field, null);
  assert.equal(analysis.nextRequiredField, 'phone');
  assert.match(analysis.reply, /mobile number/i);
});

test('Groq semantic analysis preserves duplicate retry recommendations', async () => {
  const analysis = await analyzeOnboardingMessage(
    {
      message: '09199453262',
      step: 'email',
      draft: {
        firstName: 'Ivan',
        lastName: 'Reyes',
        email: 'ivan@example.com',
        phone: '09199453262',
      },
      preferredLanguage: 'taglish',
      lastBackendError: 'Email service unavailable.',
      lastSuccessfulStep: 'phone',
      lastSubmittedField: 'phone',
      lastSubmittedValue: '09199453262',
    },
    {
      groqCaller: mockGroq({
        intent: 'CONFIRM_PREVIOUS_PHONE',
        field: 'phone',
        value: '09199453262',
        language: 'taglish',
        confidence: 0.98,
        duplicate: true,
        recommended_action: 'RETRY_BACKEND_PROCESS',
      }),
    }
  );

  assert.equal(analysis.intent, 'CONFIRM_PREVIOUS_PHONE');
  assert.equal(analysis.field, 'phone');
  assert.equal(analysis.value, '09199453262');
  assert.equal(analysis.duplicate, true);
  assert.equal(analysis.recommendedAction, 'RETRY_BACKEND_PROCESS');
});

test('Groq semantic analysis rejects password collection in chat', async () => {
  const analysis = await analyzeOnboardingMessage(
    {
      message: 'my password is AutoSPF123!',
      step: 'email',
      draft: { firstName: 'Ivan', lastName: 'Tadena', email: '', phone: '09199453262' },
      preferredLanguage: 'english',
    },
    {
      groqCaller: mockGroq({
        intent: 'PASSWORD_IN_CHAT',
        field: null,
        value: null,
        next_required_field: 'email',
        language: 'english',
        confidence: 0.99,
        recommended_action: 'REJECT_PASSWORD_IN_CHAT',
        reply: 'For your security, passwords are only set through the secure email setup link.',
      }),
    }
  );

  assert.equal(analysis.intent, 'PASSWORD_IN_CHAT');
  assert.equal(analysis.field, null);
  assert.equal(analysis.value, null);
  assert.equal(analysis.recommendedAction, 'REJECT_PASSWORD_IN_CHAT');
  assert.match(analysis.reply, /secure email setup link/i);
});

test('Groq semantic analysis receives recovery context and recent history', async () => {
  let capturedRequest;
  const analysis = await analyzeOnboardingMessage(
    {
      message: 'try again',
      step: 'email',
      draft: {
        firstName: 'Ivan',
        lastName: 'Reyes',
        email: 'ivan@example.com',
        phone: '09199453262',
      },
      preferredLanguage: 'english',
      onboardingStatus: 'failed',
      lastBackendError: 'Account setup failed.',
      lastSuccessfulStep: 'phone',
      lastSubmittedField: 'phone',
      lastSubmittedValue: '09199453262',
      recentMessages: [
        { role: 'assistant', content: 'I could not complete the account setup yet.' },
        { role: 'user', content: '09199453262' },
      ],
    },
    {
      groqCaller: async (request) => {
        capturedRequest = request;
        return {
          content: JSON.stringify({
            intent: 'RETRY_ONBOARDING_SUBMISSION',
            field: null,
            value: null,
            language: 'english',
            confidence: 0.91,
            duplicate: false,
            recommended_action: 'RETRY_BACKEND_PROCESS',
          }),
        };
      },
    }
  );

  const userPayload = JSON.parse(capturedRequest.messages[1].content);
  assert.equal(userPayload.currentStepCompatibilityHint, 'email');
  assert.deepEqual(userPayload.requiredFields, ['first_name', 'last_name', 'phone', 'email']);
  assert.deepEqual(userPayload.collectedFields, {
    first_name: 'Ivan',
    last_name: 'Reyes',
    phone: '09199453262',
    email: 'ivan@example.com',
  });
  assert.deepEqual(userPayload.missingRequiredFields, []);
  assert.equal(userPayload.onboardingStatus, 'failed');
  assert.equal(userPayload.lastBackendError, 'Account setup failed.');
  assert.equal(userPayload.lastSuccessfulStep, 'phone');
  assert.equal(userPayload.lastSubmitted.value, '09199453262');
  assert.equal(userPayload.recentMessages.length, 2);
  assert.equal(analysis.intent, 'RETRY_ONBOARDING_SUBMISSION');
  assert.equal(analysis.recommendedAction, 'RETRY_BACKEND_PROCESS');
});

test('malformed Groq JSON falls back safely without trusting the model output', async () => {
  const analysis = await analyzeOnboardingMessage(
    {
      message: 'mali',
      step: 'lastName',
      draft: { firstName: 'Ivan', lastName: '', email: '', phone: '' },
      preferredLanguage: 'english',
    },
    {
      groqCaller: async () => ({ content: 'not json' }),
    }
  );

  assert.equal(analysis.source, 'fallback');
  assert.equal(analysis.intent, 'CLARIFICATION');
  assert.ok(analysis.confidence < ONBOARDING_SEMANTIC_CONFIDENCE_THRESHOLD);
});

test('Groq unavailable pauses safely without duplicate phone mutation fallback', async () => {
  const analysis = await analyzeOnboardingMessage(
    {
      message: '09199453262',
      step: 'email',
      draft: {
        firstName: 'Ivan',
        lastName: 'Reyes',
        email: 'ivan@example.com',
        phone: '09199453262',
      },
      preferredLanguage: 'taglish',
      lastBackendError: 'Email service unavailable.',
      lastSubmittedField: 'phone',
      lastSubmittedValue: '09199453262',
    },
    {
      groqCaller: async () => {
        throw new Error('network down');
      },
    }
  );

  assert.equal(analysis.source, 'fallback');
  assert.equal(analysis.intent, 'CLARIFICATION');
  assert.equal(analysis.field, null);
  assert.equal(analysis.value, null);
  assert.equal(analysis.duplicate, false);
  assert.ok(analysis.confidence < ONBOARDING_SEMANTIC_CONFIDENCE_THRESHOLD);
  assert.match(analysis.reply, /trouble reading/i);
});

test('Groq unavailable falls back safely without throwing to onboarding flow', async () => {
  const analysis = await analyzeOnboardingMessage(
    {
      message: 'location nyo?',
      step: 'email',
      draft: { firstName: 'Ivan', lastName: 'Reyes', email: '', phone: '' },
      preferredLanguage: 'taglish',
    },
    {
      groqCaller: async () => {
        const error = new Error('network down');
        error.code = 'ETIMEDOUT';
        throw error;
      },
    }
  );

  assert.equal(analysis.source, 'fallback');
  assert.equal(analysis.intent, 'CLARIFICATION');
  assert.equal(analysis.field, null);
  assert.ok(analysis.confidence < ONBOARDING_SEMANTIC_CONFIDENCE_THRESHOLD);
  assert.match(analysis.reply, /send your last onboarding detail/i);
});

test('missing required fields treat phone as mandatory', () => {
  assert.deepEqual(
    getMissingRequiredOnboardingFields({
      firstName: 'Ivan',
      lastName: 'Tadena',
      email: 'ivan@example.com',
      phone: '',
    }),
    ['phone']
  );
});
