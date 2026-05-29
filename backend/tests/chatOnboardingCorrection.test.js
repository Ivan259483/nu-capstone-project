import assert from 'node:assert/strict';
import test from 'node:test';

import {
  alignOnboardingAnalysisToCollectingStep,
  applyExplicitFieldCorrectionToAnalysis,
  hasCorrectionIntent,
  parseExplicitFieldCorrection,
  parseOnboardingCorrection,
} from '../utils/chatOnboardingCorrection.utils.js';

const draftAfterFirstName = {
  firstName: 'Ivan',
  lastName: '',
  email: '',
  phone: '',
};

const draftAtEmail = {
  firstName: 'Ivan',
  lastName: 'Reyes',
  email: '',
  phone: '',
};

test('mali yung name asks for the previous first name instead of extracting yung', () => {
  const correction = parseOnboardingCorrection('mali yung name', {
    step: 'lastName',
    draft: draftAfterFirstName,
  });

  assert.equal(correction.field, 'firstName');
  assert.equal(correction.needsValue, true);
  assert.equal(correction.value, undefined);
  assert.ok(correction.confidence >= 0.8);
});

test('wrong name and change my name infer first name when only first name was collected', () => {
  for (const phrase of ['wrong name', 'change my name']) {
    const correction = parseOnboardingCorrection(phrase, {
      step: 'lastName',
      draft: draftAfterFirstName,
    });

    assert.equal(correction.field, 'firstName');
    assert.equal(correction.needsValue, true);
  }
});

test('not ivan is a correction request without a replacement value', () => {
  const correction = parseOnboardingCorrection('not ivan', {
    step: 'lastName',
    draft: draftAfterFirstName,
  });

  assert.equal(correction.field, 'firstName');
  assert.equal(correction.needsValue, true);
  assert.equal(correction.value, undefined);
});

test('my name is kevin during email step updates first name, not email', () => {
  const correction = parseOnboardingCorrection('my name is kevin', {
    step: 'email',
    draft: draftAtEmail,
  });

  assert.equal(correction.field, 'firstName');
  assert.equal(correction.value, 'kevin');
  assert.equal(correction.needsValue, undefined);
});

test('taglish correction values are extracted when meaningful', () => {
  for (const phrase of ['kevin pala', 'actually kevin']) {
    const correction = parseOnboardingCorrection(phrase, {
      step: 'email',
      draft: draftAtEmail,
    });

    assert.equal(correction.field, 'firstName');
    assert.equal(correction.value, 'kevin');
  }
});

test('skip pala is not treated as a correction value', () => {
  assert.equal(hasCorrectionIntent('skip pala'), false);
  assert.equal(
    parseOnboardingCorrection('skip pala', {
      step: 'phone',
      draft: { ...draftAtEmail, email: 'ivan@example.com' },
    }),
    null
  );
});

test('correct first name to kevin is detected as explicit first-name correction', () => {
  const message = 'correct first name to kevin';
  assert.equal(hasCorrectionIntent(message), true);

  const parsed = parseExplicitFieldCorrection(message);
  assert.equal(parsed?.field, 'firstName');
  assert.equal(parsed?.value, 'Kevin');

  const aligned = applyExplicitFieldCorrectionToAnalysis(
    {
      intent: 'UPDATE_LAST_NAME',
      field: 'last_name',
      value: 'correct first to kevin',
      nextRequiredField: 'phone',
      reply: 'Great, Ivan correct first to kevin. What mobile number should we place on your account?',
      source: 'groq',
    },
    {
      message,
      draft: { firstName: 'Ivan', lastName: '', email: '', phone: '' },
    }
  );

  assert.equal(aligned.intent, 'UPDATE_FIRST_NAME');
  assert.equal(aligned.field, 'first_name');
  assert.equal(aligned.value, 'Kevin');
  assert.equal(aligned.nextRequiredField, 'last_name');
  assert.equal(aligned.source, 'explicit_field_correction');

  const stepAligned = alignOnboardingAnalysisToCollectingStep(aligned, {
    message,
    step: 'lastName',
    draft: { firstName: 'Ivan', lastName: '', email: '', phone: '' },
  });
  assert.equal(stepAligned.field, 'first_name');
  assert.equal(stepAligned.value, 'Kevin');
});

test('bare last name at lastName step aligns misclassified Groq first_name update', () => {
  const misclassified = {
    intent: 'UPDATE_FIRST_NAME',
    field: 'first_name',
    value: 'Kevin',
    nextRequiredField: 'last_name',
    reply: "Great, Kevin. What's your last name?",
    confidence: 0.97,
    source: 'groq',
  };

  const aligned = alignOnboardingAnalysisToCollectingStep(misclassified, {
    message: 'tadena',
    step: 'lastName',
    draft: { firstName: 'Kevin', lastName: '', email: '', phone: '' },
  });

  assert.equal(aligned.intent, 'UPDATE_LAST_NAME');
  assert.equal(aligned.field, 'last_name');
  assert.match(String(aligned.value), /^tadena$/i);
  assert.equal(aligned.nextRequiredField, 'phone');
  assert.equal(aligned.reply, '');
});

test('bare last name at lastName step targets lastName in correction parser', () => {
  const correction = parseOnboardingCorrection('tadena', {
    step: 'lastName',
    draft: { firstName: 'Kevin', lastName: '', email: '', phone: '' },
  });

  assert.equal(correction, null);
});

test('name correction at lastName step still targets first name when last name exists', () => {
  const correction = parseOnboardingCorrection('my name is kevin', {
    step: 'lastName',
    draft: { firstName: 'Ivan', lastName: 'Reyes', email: '', phone: '' },
  });

  assert.equal(correction.field, 'firstName');
  assert.equal(correction.value, 'kevin');
});

