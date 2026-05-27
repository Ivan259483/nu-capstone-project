import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasCorrectionIntent,
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

